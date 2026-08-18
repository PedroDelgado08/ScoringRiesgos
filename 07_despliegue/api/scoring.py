# Motor de scoring extraído de 02_produccion_scoring.py
import numpy as np
import pandas as pd
import cloudpickle
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
ARTEFACTO_PATH = BASE_DIR / "artefacto_pipeline.pkl"

with open(ARTEFACTO_PATH, "rb") as f:
    artefacto = cloudpickle.load(f)

pipe_pd = artefacto["pipe_pd"]
pipe_ead = artefacto["pipe_ead"]
pipe_lgd = artefacto["pipe_lgd"]

INT_COLS = ["num_lineas_credito", "num_derogatorios"]


def normaliza_num_cuotas(valor):
    if pd.isna(valor):
        return valor
    if isinstance(valor, str):
        texto = valor.strip()
        if texto.endswith("months"):
            return f" {texto}"
        return texto
    try:
        return f" {int(valor)} months"
    except (TypeError, ValueError):
        return valor


# --- Preprocesado y armonización ---
def prepara_datos(df: pd.DataFrame) -> pd.DataFrame:
    cols_to_drop = [
        c for c in ["id_prestamo", "descripcion", "empleo"] if c in df.columns
    ]
    if cols_to_drop:
        df = df.drop(columns=cols_to_drop)
    if "antigüedad_empleo" in df.columns:
        df["antigüedad_empleo"] = df["antigüedad_empleo"].fillna("desconocido")

    num_cols_df = df.select_dtypes(include="number").columns.tolist()
    if num_cols_df:
        df[num_cols_df] = df[num_cols_df].fillna(0)

    int_cols_present = [c for c in INT_COLS if c in df.columns]
    if int_cols_present:
        df[int_cols_present] = (
            df[int_cols_present]
            .apply(pd.to_numeric, errors="coerce")
            .fillna(0)
            .astype(int)
        )

    if "num_cuotas" in df.columns:
        df["num_cuotas"] = df["num_cuotas"].apply(normaliza_num_cuotas).astype(str)

    for col in [
        "ingresos_verificados",
        "vivienda",
        "finalidad",
        "rating",
        "antigüedad_empleo",
    ]:
        if col in df.columns:
            df[col] = df[col].astype(str)

    if "vivienda" in df.columns:
        df["vivienda"] = df["vivienda"].replace(["ANY", "NONE", "OTHER"], "MORTGAGE")
    if "finalidad" in df.columns:
        df["finalidad"] = df["finalidad"].replace(
            {
                "debt_consolidation": "debt_consolidation",
                "credit_card": "credit_card",
                "home_improvement": "home_improvement",
                "major_purchase": "major_purchase",
                "small_business": "small_business",
                "car": "other",
                "moving": "other",
                "vacation": "other",
                "medical": "other",
                "wedding": "other",
                "renewable_energy": "other",
                "house": "other",
                "educational": "other",
                "other": "other",
            }
        )

    df = df.infer_objects(copy=False)

    # Clips
    if "dti" in df.columns:
        df["dti"] = np.clip(df["dti"], 0, 100)
    if "num_hipotecas" in df.columns:
        df["num_hipotecas"] = np.clip(df["num_hipotecas"], 0, 7)
    if "porc_uso_revolving" in df.columns:
        df["porc_uso_revolving"] = np.clip(df["porc_uso_revolving"], 0, 100)
    return df


# --- Motor de scoring ---
def scoring_df(df: pd.DataFrame) -> pd.DataFrame:
    df = prepara_datos(df.copy())
    ids = df["id_cliente"].values if "id_cliente" in df.columns else df.index.values
    score_pd = pipe_pd.predict_proba(df)[:, 1]
    score_ead = np.clip(pipe_ead.predict(df), 0, 1)
    score_lgd = np.clip(pipe_lgd.predict(df), 0, 1)
    df_resultado = pd.DataFrame(
        {
            "id_cliente": ids,
            "score_pd": score_pd,
            "score_ead": score_ead,
            "score_lgd": score_lgd,
            "perdida_esperada": score_pd * score_ead * score_lgd,
        }
    )
    return df_resultado
