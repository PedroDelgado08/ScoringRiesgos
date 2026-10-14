"""
Lógica de scoring: carga los tres modelos y calcula PD, EAD, LGD y pérdida esperada.

Los modelos se guardaron en los notebooks 05–07 como "paquetes" (diccionarios) con:
  - 'modelo'           : el Pipeline completo (PreparacionScoring -> ColumnTransformer -> modelo).
                         La preparación de los datos va DENTRO, así que aquí no hay que
                         limpiar, imputar ni transformar nada a mano,
  - 'columnas_entrada' : columnas originales que espera el pipeline,
  - 'recortar_0_1'     : si la predicción hay que limitarla a [0, 1] (EAD y LGD),
  - metadatos          : familia, hiperparámetros, métricas, versiones...

Todo lo que se carga en este módulo se carga UNA vez, cuando arranca la Lambda
("arranque en frío"). Las peticiones siguientes reutilizan los modelos ya en memoria.
"""

import json
from datetime import date
from pathlib import Path

import cloudpickle
import numpy as np
import pandas as pd

# =============================================================================
# Rutas de los archivos que van dentro de la imagen Docker
# =============================================================================

CARPETA_APP = Path(__file__).resolve().parent
CARPETA_MODELOS = CARPETA_APP / 'modelos'                        # modelo_pd.pkl, modelo_ead.pkl, modelo_lgd.pkl
RUTA_REFERENCIA = CARPETA_APP / 'data' / 'referencia_lc.json'    # generado por preparar_datos_demo.py


# =============================================================================
# Carga de modelos y tablas de referencia (al arrancar)
# =============================================================================

def cargar_paquete(nombre: str) -> dict:
    """Abre modelos/modelo_{nombre}.pkl y devuelve el paquete (diccionario con el modelo y sus metadatos)."""
    with open(CARPETA_MODELOS / f'modelo_{nombre}.pkl', 'rb') as archivo:
        return cloudpickle.load(archivo)


PAQUETES = {nombre: cargar_paquete(nombre) for nombre in ['pd', 'ead', 'lgd']}

# Tabla de referencia de Lending Club, calculada con entrenamiento y validación (preparar_datos_demo.py):
#   - 'pd_por_subnota'     : tasa de impago real de cada subnota (A1...G5) en entrenamiento,
#   - 'limites_deciles_pd' : los 9 cortes que dividen la PD de validación en 10 deciles
with open(RUTA_REFERENCIA, encoding='utf-8') as archivo:
    REFERENCIA = json.load(archivo)

PD_POR_SUBNOTA = pd.Series(REFERENCIA['pd_por_subnota'], dtype=float)   # índice: subnota, valor: tasa de impago
LIMITES_DECILES = np.asarray(REFERENCIA['limites_deciles_pd'], dtype=float)


# =============================================================================
# Funciones auxiliares
# =============================================================================

def predecir(nombre: str, X: pd.DataFrame) -> np.ndarray:
    """Predicción de uno de los tres modelos.
    PD: probabilidad de la clase 1 (impago). EAD y LGD: valor predicho, limitado a [0, 1] si el paquete lo pide."""
    paquete = PAQUETES[nombre]
    if nombre == 'pd':
        return paquete['modelo'].predict_proba(X)[:, 1]
    prediccion = paquete['modelo'].predict(X)
    if paquete.get('recortar_0_1', False):
        prediccion = np.clip(prediccion, 0, 1)
    return prediccion


def decil_de_riesgo(prob_impago: np.ndarray) -> np.ndarray:
    """Decil (1–10) en que cae cada PD dentro de la cartera de validación.
    searchsorted cuenta cuántos cortes quedan por debajo de la PD: 0 cortes -> decil 1, 9 cortes -> decil 10."""
    return np.searchsorted(LIMITES_DECILES, prob_impago, side='right') + 1


def nota_equivalente(prob_impago: np.ndarray) -> list:
    """Subnota de Lending Club cuya tasa de impago real está más cerca de la PD del modelo.
    Sirve para "traducir" la PD a la escala de notas que usaba Lending Club."""
    tasas = PD_POR_SUBNOTA.to_numpy()
    # Matriz (clientes × subnotas) de distancias; para cada cliente, la subnota con distancia mínima
    posicion = np.abs(prob_impago[:, None] - tasas[None, :]).argmin(axis=1)
    return PD_POR_SUBNOTA.index[posicion].tolist()


# =============================================================================
# Scoring
# =============================================================================

def scoring_df(df: pd.DataFrame) -> pd.DataFrame:
    """Recibe las solicitudes en formato API (schemas.SolicitudEntrada) y devuelve una fila
    de resultados por solicitud (schemas.ScoringSalida, sin la comparación con LC, que añade main.py)."""
    X = df.copy()

    # --- Fecha de concesión: si no viene (cliente inventado), hoy (ver schemas.py)
    X['fecha_concesion'] = pd.to_datetime(X['fecha_concesion'].fillna(date.today()))
    X['fecha_primer_credito'] = pd.to_datetime(X['fecha_primer_credito'])

    # --- Opcionales vacíos: None -> NaN numérico, que es lo que el pipeline sabe imputar
    for v in ['num_hipotecas', 'porc_uso_revolving', 'porc_uso_tarjetas', 'porc_tarjetas_75p']:
        X[v] = pd.to_numeric(X[v], errors='coerce').astype(float)

    # --- Los tres modelos. Cada pipeline prepara él mismo los datos con lo aprendido en entrenamiento
    prob_impago = predecir('pd', X)
    ead = predecir('ead', X)
    lgd = predecir('lgd', X)

    # --- Pérdida esperada (notebook 08, D3): en tanto por uno del importe y en $
    perdida = prob_impago * ead * lgd

    return pd.DataFrame({
        'id_cliente': X['id_cliente'].astype(object).where(X['id_cliente'].notna(), None).values,
        'score_pd': prob_impago,
        'score_ead': ead,
        'score_lgd': lgd,
        'perdida_esperada': perdida,
        'perdida_esperada_importe': perdida * X['principal'].to_numpy(),
        'decil_riesgo': decil_de_riesgo(prob_impago),
        'nota_equivalente_modelo': nota_equivalente(prob_impago),
    })
