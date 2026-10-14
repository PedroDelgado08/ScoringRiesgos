from pathlib import Path

import cloudpickle 
import numpy as np
import pandas as pd

ARTEFACTO_PATH = Path(__file__).resolve().parent / "artefacto_pipeline.pkl"

with open(ARTEFACTO_PATH, "rb") as f:
    artefacto = cloudpickle.load(f)


pipe_pd = artefacto["pipe_pd"]
pipe_ead = artefacto["pipe_ead"]
pipe_lgd = artefacto["pipe_lgd"]

INT_COLS = ['num_lineas_credito', 'num_derogatorios']

def cuota_francesa(principal, num_cuotas, tipo_interes):
    i = tipo_interes / 12/ 100
    return principal * (i * (1 + i) ** num_cuotas) / ((1 + i) ** num_cuotas - 1)

def prepara_datos(df: pd.DataFrame) -> pd.DataFrame:
    df =df.copy()

        # Derived variable: monthly installment (before converting num_cuotas to text)
    df["imp_cuota"] = cuota_francesa(df["principal"], df["num_cuotas"], df["tipo_interes"])

    # Imputations (same as in training)
    df["antigüedad_empleo"] = df["antigüedad_empleo"].fillna("desconocido")
    num_cols = df.select_dtypes(include="number").columns
    df[num_cols] = df[num_cols].fillna(0)
    df[INT_COLS] = df[INT_COLS].astype(int)

    # Clipping of extreme values
    df["dti"] = np.clip(df["dti"], 0, 100)
    df["porc_uso_revolving"] = np.clip(df["porc_uso_revolving"], 0, 100)

    # Category cleanup
    df["vivienda"] = df["vivienda"].replace(["ANY", "NONE", "OTHER"], "MORTGAGE")
    df["finalidad"] = df["finalidad"].replace(
        ["wedding", "educational", "renewable_energy"], "other"
    )

    # The model was trained with the term formatted as " 36 months"
    df["num_cuotas"] = " " + df["num_cuotas"].astype(str) + " months"

    return df


def scoring_df(df: pd.DataFrame) -> pd.DataFrame:
    df = prepara_datos(df)
    X = df[pipe_pd.feature_names_in_]

    prob_default = pipe_pd.predict_proba(X)[:, 1]
    ead = np.clip(pipe_ead.predict(X), 0, 1)
    lgd = np.clip(pipe_lgd.predict(X), 0, 1)

    return pd.DataFrame({
        "id_cliente": df["id_cliente"].values,
        "score_pd": prob_default,
        "score_ead": ead,
        "score_lgd": lgd,
        "perdida_esperada": prob_default * ead * lgd,
    })