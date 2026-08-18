# -*- coding: utf-8 -*-
import argparse
import numpy as np
import pandas as pd
from pathlib import Path
import cloudpickle

# ── Constantes ───────────────────────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parent.parent
ARTEFACTO_PATH = PROJECT_ROOT / "07_despliegue" / "artefacto_pipeline.pkl"

INT_COLS = [
    "num_hipotecas",
    "num_lineas_credito",
    "num_cancelaciones_12meses",
    "num_derogatorios",
    "num_meses_desde_ult_retraso",
]


# ── Función de preparación de datos (idéntica a reentrenamiento) ─────────────
def prepara_datos(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

    # Drop columnas irrelevantes si existen
    cols_to_drop = [
        c for c in ["id_prestamo", "descripcion", "empleo"] if c in df.columns
    ]
    if cols_to_drop:
        df.drop(columns=cols_to_drop, inplace=True)

    # Imputaciones
    if "antigüedad_empleo" in df.columns:
        df["antigüedad_empleo"] = df["antigüedad_empleo"].fillna("desconocido")
    num_cols_df = df.select_dtypes(include="number").columns.tolist()
    df[num_cols_df] = df[num_cols_df].fillna(0)
    int_cols_present = [c for c in INT_COLS if c in df.columns]
    if int_cols_present:
        df[int_cols_present] = df[int_cols_present].astype(int)

    # Filtro de outliers (transformación de fila)
    df = df[df["ingresos"] <= 400000].copy()

    # Clips
    df["dti"] = np.clip(df["dti"], 0, 100)
    if "num_hipotecas" in df.columns:
        df["num_hipotecas"] = np.clip(df["num_hipotecas"], 0, 7)
    df["porc_uso_revolving"] = np.clip(df["porc_uso_revolving"], 0, 100)

    # Limpieza de categorías
    df["vivienda"] = df["vivienda"].replace(["ANY", "NONE", "OTHER"], "MORTGAGE")
    df["finalidad"] = df["finalidad"].replace(
        ["wedding", "educational", "renewable_energy"], "other"
    )

    return df


# ── Argumentos de línea de comandos ─────────────────────────────────────────
parser = argparse.ArgumentParser(
    description="Scoring de riesgo de crédito (PD, EAD, LGD) para nuevas operaciones."
)
parser.add_argument(
    "--input",
    required=True,
    help="Ruta al CSV de entrada con las columnas de features del préstamo.",
)
parser.add_argument(
    "--output",
    required=True,
    help="Ruta al CSV de salida con las predicciones (id_cliente, score_pd, score_ead, score_lgd, perdida_esperada).",
)
args = parser.parse_args()


# ── Carga y preparación de datos ─────────────────────────────────────────────
df = pd.read_csv(args.input)
df = prepara_datos(df)

# Preservar id_cliente (no es feature, se excluye del pipeline)
ids = df["id_cliente"].values if "id_cliente" in df.columns else df.index.values


# ── Carga del artefacto ──────────────────────────────────────────────────────
with open(ARTEFACTO_PATH, "rb") as f:
    artefacto = cloudpickle.load(f)

pipe_pd = artefacto["pipe_pd"]
pipe_ead = artefacto["pipe_ead"]
pipe_lgd = artefacto["pipe_lgd"]


# ── Scoring ──────────────────────────────────────────────────────────────────
score_pd = pipe_pd.predict_proba(df)[:, 1]
score_ead = np.clip(pipe_ead.predict(df), 0, 1)
score_lgd = np.clip(pipe_lgd.predict(df), 0, 1)


# ── Construcción del DataFrame de resultados ─────────────────────────────────
df_resultado = pd.DataFrame(
    {
        "id_cliente": ids,
        "score_pd": score_pd,
        "score_ead": score_ead,
        "score_lgd": score_lgd,
        "perdida_esperada": score_pd * score_ead * score_lgd,
    }
)


# ── Guardado ─────────────────────────────────────────────────────────────────
output_path = Path(args.output)
output_path.parent.mkdir(parents=True, exist_ok=True)
df_resultado.to_csv(output_path, index=False)

print(f"Scoring completado: {len(df_resultado)} registros → {output_path.resolve()}")
