"""
Esquemas de la API (qué datos entran y qué datos salen).

Pydantic comprueba cada petición ANTES de que llegue al modelo:
  - si falta un campo obligatorio o tiene un valor imposible (FICO de 2000, plazo de 48 meses...),
    FastAPI responde automáticamente con un error 422 que explica qué campo está mal,
  - si todo es correcto, convierte el JSON recibido en objetos de Python con el tipo adecuado.

Los nombres de los campos son los que entiende preparacion.limpiar() en "formato API":
  - sector_empleo en lugar del título de empleo en texto libre,
  - fico (un único valor) en lugar del tramo fico_min / fico_max,
  - antigüedad_empleo ya agrupada en 4 grupos.
"""

from datetime import date
from typing import List, Literal, Optional

import pandas as pd
from pydantic import BaseModel, Field, RootModel, model_validator

# =============================================================================
# Valores permitidos en las variables categóricas
# (los mismos que vio el modelo al entrenar; un valor nuevo no tendría sentido para él)
# =============================================================================

# Situación de la vivienda: población del modelo (notebook 02, D10)
Vivienda = Literal['RENT', 'MORTGAGE', 'OWN']

# Antigüedad en el empleo agrupada en 4 grupos (notebook 03, D1)
Antiguedad = Literal['sin_empleo_declarado', '≤1', '2-9', '10+']

# Finalidad del préstamo, ya agrupada (notebook 02, D11: wedding -> major_purchase;
# renewable_energy y educational -> other)
Finalidad = Literal['debt_consolidation', 'credit_card', 'home_improvement', 'other', 'major_purchase',
                    'small_business', 'medical', 'car', 'vacation', 'moving', 'house']

# Sector de empleo: lista SECTORES de 04_scripts/preparacion.py (notebook 02, D3)
Sector = Literal['salud', 'educacion', 'legal', 'seguridad_publica', 'transporte', 'hosteleria',
                 'finanzas', 'tecnologia', 'comercio', 'oficios_industria', 'autonomo_propietario',
                 'administrativo', 'direccion_gestion', 'otros', 'sin_empleo_declarado']


# =============================================================================
# Entrada: una solicitud de préstamo
# =============================================================================

class SolicitudEntrada(BaseModel):
    # --- Identificador: solo lo tienen los clientes de la muestra de validación.
    #     Si viene, la respuesta añade la comparación con la nota de Lending Club
    id_cliente: Optional[int] = Field(None, description="Identificador del cliente de la muestra (opcional)")

    # --- Datos del préstamo
    principal: float = Field(..., gt=0, le=40000, description="Importe solicitado ($); LC prestaba hasta 35.000")
    num_cuotas: Literal[36, 60] = Field(..., description="Plazo en meses: 36 o 60")
    finalidad: Finalidad = Field(..., description="Finalidad del préstamo")

    # --- Datos personales y laborales
    vivienda: Vivienda = Field(..., description="Situación de la vivienda")
    sector_empleo: Sector = Field(..., description="Sector de empleo")
    antigüedad_empleo: Antiguedad = Field(..., description="Años en el empleo actual, agrupados")
    ingresos: float = Field(..., gt=0, le=10_000_000, description="Ingresos anuales ($)")
    dti: float = Field(..., ge=0, le=100, description="Deudas mensuales / ingresos mensuales (%)")

    # --- Historial de crédito
    fico: float = Field(..., ge=300, le=850, description="Puntuación FICO")
    num_lineas_credito: int = Field(..., ge=0, le=100, description="Líneas de crédito abiertas")
    saldo_revolving: float = Field(..., ge=0, description="Saldo pendiente en crédito revolving ($)")
    num_consultas_6meses: int = Field(..., ge=0, le=50, description="Consultas de crédito en los últimos 6 meses")
    fecha_primer_credito: date = Field(..., description="Fecha del primer crédito")

    # --- Opcionales: si faltan, el pipeline los imputa igual que en el entrenamiento (notebook 02, D4–D6)
    num_hipotecas: Optional[int] = Field(None, ge=0, le=50, description="Número de hipotecas")
    porc_uso_revolving: Optional[float] = Field(None, ge=0, le=200, description="Uso del crédito revolving (%)")
    porc_uso_tarjetas: Optional[float] = Field(None, ge=0, le=400, description="Uso de las tarjetas (%)")
    porc_tarjetas_75p: Optional[float] = Field(None, ge=0, le=100, description="% de tarjetas con uso > 75 %")

    # --- Fecha de concesión: los clientes de la muestra envían la real (2012–2015).
    #     Si falta (cliente inventado), se usa la de hoy. Importa porque el modelo usa
    #     los años de historial de crédito = concesión − primer crédito
    fecha_concesion: Optional[date] = Field(None, description="Fecha de concesión (por defecto, hoy)")

    @model_validator(mode='after')
    def comprobar_fechas(self):
        """El primer crédito no puede ser posterior a la concesión del préstamo."""
        concesion = self.fecha_concesion or date.today()
        if self.fecha_primer_credito > concesion:
            raise ValueError('fecha_primer_credito no puede ser posterior a fecha_concesion')
        return self


class LoteEntrada(RootModel[List[SolicitudEntrada]]):
    """Lista de solicitudes: permite puntuar uno o varios clientes en una sola petición."""

    def to_df(self) -> pd.DataFrame:
        """Convierte la lista de solicitudes en un DataFrame (una fila por solicitud)."""
        return pd.DataFrame([solicitud.model_dump() for solicitud in self.root])


# =============================================================================
# Salida: resultado del scoring de una solicitud
# =============================================================================

class ScoringSalida(BaseModel):
    id_cliente: Optional[int] = None

    # --- Resultado de los tres modelos (mismos nombres que la API anterior, que ya usa app.js)
    score_pd: float = Field(..., description="Probabilidad de impago (0–1)")
    score_ead: float = Field(..., description="Parte del importe pendiente si impaga (0–1)")
    score_lgd: float = Field(..., description="Parte de lo pendiente que se pierde si impaga (0–1)")
    perdida_esperada: float = Field(..., description="PD × EAD × LGD: pérdida esperada en tanto por uno del importe")
    perdida_esperada_importe: float = Field(..., description="Pérdida esperada en $ (perdida_esperada × principal)")

    # --- Posición del cliente frente a la cartera de validación
    decil_riesgo: int = Field(..., ge=1, le=10, description="Decil de PD en validación (1 = menos riesgo)")
    nota_equivalente_modelo: str = Field(..., description="Subnota de LC cuya tasa de impago real se parece más a la PD")

    # --- Comparación con Lending Club (solo clientes de la muestra; en el resto, None)
    nota_lc: Optional[str] = Field(None, description="Subnota que le dio Lending Club (A1–G5)")
    pd_implicita_lc: Optional[float] = Field(None, description="Tasa de impago real de esa subnota en entrenamiento")
    tipo_interes_lc: Optional[float] = Field(None, description="Tipo de interés que le puso Lending Club (%)")
    impago_real: Optional[bool] = Field(None, description="Si el préstamo acabó impagado")


class Cliente(SolicitudEntrada):
    """Cliente de la muestra de validación (GET /clientes): sus datos para rellenar el
    formulario y lo que hizo Lending Club con él."""
    id_cliente: int
    nota_lc: str
    tipo_interes_lc: float
    impago_real: bool
