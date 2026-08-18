from fastapi import FastAPI, HTTPException
from .schemas import LoteEntrada, ScoringSalida
from .scoring import scoring_df
import pandas as pd
from pathlib import Path

app = FastAPI(title="API Scoring Riesgos")

# Ruta al historial de clientes
DATA_PATH = Path(__file__).parent / "data" / "demo_03_riesgos.csv"


def calcular_cuota_francesa(principal, num_cuotas, tipo_interes):
    """Calcula la cuota usando el sistema francés."""
    if tipo_interes == 0:
        return principal / num_cuotas
    i = tipo_interes / 12 / 100
    cuota = principal * (i * (1 + i) ** num_cuotas) / ((1 + i) ** num_cuotas - 1)
    return cuota


def formatea_num_cuotas(valor):
    return f" {int(valor)} months"


@app.post("/predict", response_model=list[ScoringSalida])
def predict(lote: LoteEntrada):
    # Convertir entrada a DataFrame
    df_entrada = lote.to_df()

    # Leer historial de clientes
    try:
        df_hist = pd.read_csv(DATA_PATH)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error leyendo historial: {e}")

    # Calcular imp_cuota para cada registro
    df_entrada["imp_cuota"] = df_entrada.apply(
        lambda row: calcular_cuota_francesa(
            row["principal"], row["num_cuotas"], row["tipo_interes"]
        ),
        axis=1,
    )

    # Unir con historial por id_cliente (añade columnas necesarias para el modelo)
    df_merged = df_entrada.merge(
        df_hist, on="id_cliente", how="left", suffixes=("", "_hist")
    )

    # Si alguna columna crítica falta tras el merge, lanzar error claro
    columnas_necesarias = [
        "porc_uso_revolving",
        "ingresos_verificados",
        "antigüedad_empleo",
        "num_derogatorios",
        "dti",
        "ingresos",
        "rating",
        "num_lineas_credito",
    ]
    faltantes = [col for col in columnas_necesarias if col not in df_merged.columns]
    if faltantes:
        raise HTTPException(
            status_code=500, detail=f"Faltan columnas tras el merge: {faltantes}"
        )

    # Rellenar nulos y asegurar tipos
    for col in columnas_necesarias:
        if df_merged[col].dtype.kind in "biufc":
            df_merged[col] = pd.to_numeric(df_merged[col], errors="coerce").fillna(0)
        else:
            df_merged[col] = df_merged[col].fillna("desconocido")

    df_merged["principal"] = pd.to_numeric(
        df_merged["principal"], errors="coerce"
    ).fillna(0)
    df_merged["tipo_interes"] = pd.to_numeric(
        df_merged["tipo_interes"], errors="coerce"
    ).fillna(0)
    df_merged["num_cuotas"] = (
        pd.to_numeric(df_merged["num_cuotas"], errors="coerce").fillna(0).astype(int)
    )
    df_merged["num_cuotas"] = df_merged["num_cuotas"].apply(formatea_num_cuotas)

    for col in [
        "ingresos_verificados",
        "vivienda",
        "finalidad",
        "rating",
        "antigüedad_empleo",
    ]:
        if col in df_merged.columns:
            df_merged[col] = df_merged[col].fillna("desconocido").astype(str)

    df_merged = df_merged.infer_objects(copy=False)

    # Scoring
    df_resultado = scoring_df(df_merged)
    return df_resultado.to_dict(orient="records")


@app.get("/health")
def health():
    return {"status": "ok"}
