from pydantic import BaseModel, Field, RootModel
from typing import List


class RegistroEntrada(BaseModel):
    id_cliente: int = Field(..., description="Identificador único del cliente")
    principal: float = Field(..., description="Importe principal del préstamo")
    tipo_interes: float = Field(..., description="Tipo de interés aplicado")
    num_cuotas: int = Field(..., description="Número de cuotas del préstamo")
    finalidad: str = Field(..., description="Finalidad del préstamo")
    vivienda: str = Field(..., description="Tipo de vivienda asociada")


class ScoringSalida(BaseModel):
    id_cliente: int
    score_pd: float
    score_ead: float
    score_lgd: float
    perdida_esperada: float


class LoteEntrada(RootModel[List[RegistroEntrada]]):
    def to_df(self):
        import pandas as pd

        return pd.DataFrame([r.model_dump() for r in self.root])
