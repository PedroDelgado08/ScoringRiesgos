# -*- coding: utf-8 -*-
import numpy as np
import pandas as pd
from pathlib import Path
from sklearn.base import clone
from sklearn.compose import make_column_transformer
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.linear_model import Lasso, LogisticRegression, Ridge
from sklearn.model_selection import GridSearchCV
from sklearn.pipeline import Pipeline, make_pipeline
from sklearn.preprocessing import Binarizer, MinMaxScaler, OneHotEncoder, OrdinalEncoder
import cloudpickle

# ── Constantes ───────────────────────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = PROJECT_ROOT / "02_datos" / "01_Originales" / "prestamos.csv"
ARTEFACTO_PATH = PROJECT_ROOT / "07_despliegue" / "artefacto_pipeline.pkl"
SEED = 42

OHE_COLS = ["ingresos_verificados", "vivienda", "finalidad", "num_cuotas"]
OE_COLS = ["antigüedad_empleo", "rating"]
MMS_COLS = [
    "ingresos",
    "dti",
    "num_lineas_credito",
    "porc_uso_revolving",
    "principal",
    "tipo_interes",
    "imp_cuota",
]
BIN_COLS = ["num_derogatorios"]
FEATURE_COLS = OHE_COLS + OE_COLS + MMS_COLS + BIN_COLS

INT_COLS = [
    "num_hipotecas",
    "num_lineas_credito",
    "num_cancelaciones_12meses",
    "num_derogatorios",
    "num_meses_desde_ult_retraso",
]

ESTADOS_DEFAULT = [
    "Charged Off",
    "Does not meet the credit policy. Status:Charged Off",
    "Default",
]

ORDEN_ANTIGUEDAD = [
    "desconocido",
    "< 1 year",
    "1 year",
    "2 years",
    "3 years",
    "4 years",
    "5 years",
    "6 years",
    "7 years",
    "8 years",
    "9 years",
    "10+ years",
]
ORDEN_RATING = ["A", "B", "C", "D", "E", "F", "G"]


# ── Función de preparación de datos (transformaciones de fila) ───────────────
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


# ── Preprocesador base (ColumnTransformer + make_pipeline interno) ────────────
# OrdinalEncoder + MinMaxScaler encadenados para las columnas ordinales
oe_then_mms = make_pipeline(
    OrdinalEncoder(
        categories=[ORDEN_ANTIGUEDAD, ORDEN_RATING],
        handle_unknown="use_encoded_value",
        unknown_value=-1,
    ),
    MinMaxScaler(),
)

preprocesador_base = make_column_transformer(
    (
        OneHotEncoder(handle_unknown="ignore", drop="first", sparse_output=False),
        OHE_COLS,
    ),
    (oe_then_mms, OE_COLS),
    (MinMaxScaler(), MMS_COLS),
    (Binarizer(threshold=0), BIN_COLS),
    remainder="drop",
)


# ── Lectura y preparación del CSV ────────────────────────────────────────────
df_raw = pd.read_csv(CSV_PATH)
df = prepara_datos(df_raw)

# Creación de targets
df["target_pd"] = np.where(df["estado"].isin(ESTADOS_DEFAULT), 1, 0)
df["pendiente"] = df["principal"] - df["imp_amortizado"]
df["target_ead"] = (df["pendiente"] / df["principal"]).fillna(0).clip(0, 1)
df["target_lgd"] = (1 - df["imp_recuperado"] / df["pendiente"]).fillna(0).clip(0, 1)

# Tablones por modelo
df_pd = df[FEATURE_COLS + ["target_pd"]].copy()
df_ead = df.loc[df["target_pd"] == 1, FEATURE_COLS + ["target_ead"]].copy()
df_lgd = df.loc[df["target_pd"] == 1, FEATURE_COLS + ["target_lgd"]].copy()


# ── Modelo PD — Probabilidad de Default ─────────────────────────────────────
X_pd = df_pd.drop(columns="target_pd")
y_pd = df_pd["target_pd"]

pipe_pd = Pipeline(
    [
        ("preprocesador", clone(preprocesador_base)),
        (
            "estimador",
            LogisticRegression(
                solver="saga", penalty="elasticnet", max_iter=1000, random_state=SEED
            ),
        ),
    ]
)

param_grid_pd = [
    {
        "estimador": [
            LogisticRegression(
                solver="saga", penalty="elasticnet", max_iter=1000, random_state=SEED
            )
        ],
        "estimador__C": [0.01, 0.25, 0.5, 0.75, 1],
        "estimador__l1_ratio": [0.0, 0.5, 1.0],
    },
]

search_pd = GridSearchCV(
    estimator=pipe_pd,
    param_grid=param_grid_pd,
    scoring="roc_auc",
    cv=5,
    n_jobs=-1,
    refit=True,
    verbose=1,
)
search_pd.fit(X_pd, y_pd)
print(f"PD — Mejores hiperparámetros : {search_pd.best_params_}")
print(f"PD — Mejor ROC-AUC (CV)      : {search_pd.best_score_:.4f}")


# ── Modelo EAD — Exposure at Default ────────────────────────────────────────
X_ead = df_ead.drop(columns="target_ead")
y_ead = df_ead["target_ead"]

pipe_ead = Pipeline(
    [
        ("preprocesador", clone(preprocesador_base)),
        ("estimador", HistGradientBoostingRegressor(random_state=SEED)),
    ]
)

param_grid_ead = [
    {
        "estimador": [Ridge()],
        "estimador__alpha": list(np.round(np.arange(0.1, 1.1, 0.1), 1)),
    },
    {
        "estimador": [Lasso()],
        "estimador__alpha": list(np.round(np.arange(0.1, 1.1, 0.1), 1)),
    },
    {
        "estimador": [
            HistGradientBoostingRegressor(min_samples_leaf=50, random_state=SEED)
        ],
        "estimador__learning_rate": [0.01, 0.025, 0.05, 0.1],
        "estimador__max_iter": [50, 100, 200],
        "estimador__max_depth": [5, 10, 20],
        "estimador__l2_regularization": [0, 0.25, 0.5, 0.75, 1],
    },
]

search_ead = GridSearchCV(
    estimator=pipe_ead,
    param_grid=param_grid_ead,
    scoring="neg_mean_absolute_error",
    cv=3,
    n_jobs=-1,
    refit=True,
    verbose=1,
)
search_ead.fit(X_ead, y_ead)
print(f"EAD — Mejores hiperparámetros : {search_ead.best_params_}")
print(f"EAD — Mejor MAE negativo (CV) : {search_ead.best_score_:.4f}")


# ── Modelo LGD — Loss Given Default ─────────────────────────────────────────
X_lgd = df_lgd.drop(columns="target_lgd")
y_lgd = df_lgd["target_lgd"]

pipe_lgd = Pipeline(
    [
        ("preprocesador", clone(preprocesador_base)),
        ("estimador", HistGradientBoostingRegressor(random_state=SEED)),
    ]
)

param_grid_lgd = [
    {
        "estimador": [Ridge()],
        "estimador__alpha": list(np.round(np.arange(0.1, 1.1, 0.1), 1)),
    },
    {
        "estimador": [Lasso()],
        "estimador__alpha": list(np.round(np.arange(0.1, 1.1, 0.1), 1)),
    },
    {
        "estimador": [
            HistGradientBoostingRegressor(min_samples_leaf=50, random_state=SEED)
        ],
        "estimador__learning_rate": [0.01, 0.025, 0.05, 0.1],
        "estimador__max_iter": [50, 100, 200],
        "estimador__max_depth": [5, 10, 20],
        "estimador__l2_regularization": [0, 0.25, 0.5, 0.75, 1],
    },
]

search_lgd = GridSearchCV(
    estimator=pipe_lgd,
    param_grid=param_grid_lgd,
    scoring="neg_mean_absolute_error",
    cv=3,
    n_jobs=-1,
    refit=True,
    verbose=1,
)
search_lgd.fit(X_lgd, y_lgd)
print(f"LGD — Mejores hiperparámetros : {search_lgd.best_params_}")
print(f"LGD — Mejor MAE negativo (CV) : {search_lgd.best_score_:.4f}")


# ── Serialización del artefacto ──────────────────────────────────────────────
artefacto = {
    "pipe_pd": search_pd.best_estimator_,
    "pipe_ead": search_ead.best_estimator_,
    "pipe_lgd": search_lgd.best_estimator_,
}

ARTEFACTO_PATH.parent.mkdir(parents=True, exist_ok=True)
with open(ARTEFACTO_PATH, "wb") as f:
    cloudpickle.dump(artefacto, f)

print(f"\nArtefacto guardado en: {ARTEFACTO_PATH.resolve()}")
