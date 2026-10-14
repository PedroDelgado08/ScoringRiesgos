"""
API de ScoringRiesgos (FastAPI), preparada para ejecutarse en AWS Lambda.

Piezas:
  - FastAPI  : define las rutas (endpoints) y valida las peticiones con los esquemas de schemas.py.
  - CORS     : permite que la web (otro dominio, scoring.drm-data.com) llame a la API desde el navegador.
  - Mangum   : "adaptador" que traduce los eventos de API Gateway/Lambda a peticiones HTTP normales
               que FastAPI entiende, y la respuesta de FastAPI de vuelta al formato de Lambda.

Rutas:
  GET  /health   -> comprueba que la API responde
  GET  /clientes -> muestra de clientes de validación para rellenar el formulario
  POST /predict  -> PD, EAD, LGD y pérdida esperada de uno o varios clientes
"""

import os
from pathlib import Path

import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from mangum import Mangum

from .schemas import Cliente, LoteEntrada, ScoringSalida
from .scoring import PD_POR_SUBNOTA, scoring_df

# =============================================================================
# Clientes de demostración (muestra de validación, generada por preparar_datos_demo.py)
# =============================================================================

RUTA_CLIENTES = Path(__file__).resolve().parent / 'data' / 'clientes_demo.csv'

# Se lee una vez al arrancar. Las fechas se leen como fechas y los opcionales vacíos quedan como NaN
df_clientes = pd.read_csv(RUTA_CLIENTES, parse_dates=['fecha_primer_credito', 'fecha_concesion'])

# Lo que hizo Lending Club con cada cliente, indexado por id para buscarlo rápido en /predict
COLUMNAS_LC = ['nota_lc', 'tipo_interes_lc', 'impago_real']
lc_por_cliente = df_clientes.set_index('id_cliente')[COLUMNAS_LC]


# =============================================================================
# Aplicación
# =============================================================================

app = FastAPI(title='API Scoring Riesgos', version='2.0')

# CORS: ALLOWED_ORIGINS la define template.yaml (variable de entorno de la Lambda).
# En local, si no existe, se permite cualquier origen ('*')
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv('ALLOWED_ORIGINS', '*').split(','),
    allow_methods=['GET', 'POST'],
    allow_headers=['content-type'],
)


@app.get('/health')
def health():
    """Comprobación rápida de que la Lambda está viva (no usa los modelos)."""
    return {'status': 'ok'}


@app.get('/clientes', response_model=list[Cliente])
def get_clientes():
    """Devuelve la muestra de clientes. Para pasar de pandas a JSON:
    NaN -> None (JSON no tiene NaN) y fechas -> 'aaaa-mm-dd'."""
    clientes = df_clientes.copy()
    for v in ['fecha_primer_credito', 'fecha_concesion']:
        clientes[v] = clientes[v].dt.date
    clientes = clientes.astype(object).where(clientes.notna(), None)
    return clientes.to_dict(orient='records')


@app.post('/predict', response_model=list[ScoringSalida])
def predict(lote: LoteEntrada):
    """Puntúa una lista de solicitudes. Para los clientes de la muestra añade la comparación con Lending Club."""
    if not lote.root:
        raise HTTPException(status_code=422, detail='El lote está vacío')

    # --- Scoring con los tres modelos
    resultados = scoring_df(lote.to_df())

    # --- Comparación con Lending Club: solo si el id es de la muestra.
    #     Se usa el id y no los datos enviados: aunque se cambie algún campo en el formulario,
    #     la nota de LC es la que Lending Club le dio al cliente original
    lc = lc_por_cliente.reindex(resultados['id_cliente'])          # NaN si el id no existe o no viene
    resultados['nota_lc'] = lc['nota_lc'].to_numpy()
    resultados['tipo_interes_lc'] = lc['tipo_interes_lc'].to_numpy()
    resultados['impago_real'] = lc['impago_real'].to_numpy()
    resultados['pd_implicita_lc'] = resultados['nota_lc'].map(PD_POR_SUBNOTA)

    # NaN -> None para que en el JSON aparezcan como null
    resultados = resultados.astype(object).where(resultados.notna(), None)
    return resultados.to_dict(orient='records')


# Punto de entrada de la Lambda (CMD del Dockerfile: app.main.handler).
# lifespan='off': FastAPI no necesita eventos de arranque/parada dentro de Lambda
handler = Mangum(app, lifespan='off')
