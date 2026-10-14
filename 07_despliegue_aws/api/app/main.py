import os
from pathlib import Path

import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from mangum import Mangum

from .schemas import Cliente, LoteEntrada, ScoringSalida
from .scoring import scoring_df

DATA_PATH = Path(__file__).resolve().parent / "data" / "clientes.csv"
df_clientes = pd.read_csv(DATA_PATH)

app = FastAPI(title="API Scoring Riesgos")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("ALLOWED_ORIGINS", "*").split(","),
    allow_methods=["GET", "POST"],
    allow_headers=["content-type"],
)

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/clientes", response_model=list[Cliente])
def get_clientes():
    return df_clientes.to_dict(orient="records")

@app.post("/predict", response_model=list[ScoringSalida])
def predict(lote: LoteEntrada):
    if not lote.root:
        raise HTTPException(status_code=422, detail="El lote está vacío")

    df = lote.to_df()

    desconocidos = set(df["id_cliente"]) - set(df_clientes["id_cliente"])
    if desconocidos:
        raise HTTPException(
            status_code=404,
            detail=f"Clientes no encontrados: {sorted(int(i) for i in desconocidos)}",
        )

    df = df.merge(df_clientes, on="id_cliente", how="left")
    return scoring_df(df).to_dict(orient="records")

handler = Mangum(app, lifespan='off')