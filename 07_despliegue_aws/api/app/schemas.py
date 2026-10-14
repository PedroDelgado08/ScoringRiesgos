from typing import List

import pandas as pd
from pydantic import BaseModel, Field, RootModel

class RegistroEntrada(BaseModel):
    id_cliente: int = Field(..., description="Identificador del cliente")
    principal: float = Field(..., gt=0, le=1000000, description="Importe del préstamo")
    tipo_interes: float = Field(..., ge=0, le=100, description="Tipo de interés nominal anual (%)")
    num_cuotas: int = Field(..., gt=0, le=600, description="Número de cuotas mensuales")
    finalidad: str = Field(..., description="Finalidad del préstamo")
    vivienda: str = Field(..., description="Situación de la vivienda")

class LoteEntrada(RootModel[List[RegistroEntrada]]):
    def to_df(self) -> pd.DataFrame:
        return pd.DataFrame([registro.model_dump() for registro in self.root])

class ScoringSalida(BaseModel):
    id_cliente: int 
    score_pd: float
    score_ead: float
    score_lgd: float
    perdida_esperada: float

class Cliente(BaseModel):
    id_cliente: int
    ingresos: float | None = None
    rating: str | None = None
    dti: float | None = None
    antigüedad_empleo: str | None = None
    