"""
Prepara los archivos que necesitan la API y la web para la demo (sustituye a preparar_clientes.py).

Se ejecuta UNA vez en el equipo, desde la carpeta 07_despliegue_aws y con el entorno scoring-aws:
    conda activate scoring-aws
    python preparar_datos_demo.py

Genera:
  api/app/modelos/modelo_{pd,ead,lgd}.pkl  copia de los modelos de 05_modelos (van dentro de la imagen Docker)
  api/app/data/clientes_demo.csv           muestra de clientes de validación para el formulario de la web
  api/app/data/referencia_lc.json          impago real por subnota de LC y cortes de los deciles de PD
  frontend/data/cartera.json               muestra de préstamos de validación ya puntuados (cuadro de mando)

Ninguno se sube a GitHub (decisión del despliegue): .gitignore ya excluye *.pkl y *.csv,
y la carpeta frontend/data/ se añade también.
"""

import json
import shutil
import sys
from pathlib import Path

import cloudpickle
import numpy as np
import pandas as pd

# =============================================================================
# Rutas
# =============================================================================

AQUI = Path(__file__).resolve().parent                 # 07_despliegue_aws
RAIZ = AQUI.parent                                       # carpeta del proyecto
RUTA_MODELOS = RAIZ / '05_modelos'
RUTA_ENTRENAMIENTO = RAIZ / '02_datos' / '03_Entrenamiento' / 'train.pkl'
RUTA_VALIDACION = RAIZ / '02_datos' / '02_Validacion' / 'validacion.pkl'

DESTINO_MODELOS = AQUI / 'api' / 'app' / 'modelos'
DESTINO_DATOS_API = AQUI / 'api' / 'app' / 'data'
DESTINO_DATOS_WEB = AQUI / 'frontend' / 'data'

# Módulo de preparación del proyecto (04_scripts/preparacion.py): aquí solo se usan sus
# funciones de limpieza para pasar los clientes al formato del formulario
sys.path.insert(0, str(RAIZ / '04_scripts'))
import preparacion as prep  # noqa: E402  (se importa después de añadir la ruta)

# =============================================================================
# Parámetros
# =============================================================================

SEMILLA = 42                  # misma semilla que en el resto del proyecto, para que la muestra sea reproducible
CLIENTES_POR_NOTA = 45        # clientes de la demo por cada nota de LC (A–G): unos 300 en total
TAMANO_CARTERA = 20_000       # préstamos de la muestra del cuadro de mando


# =============================================================================
# 1. Copiar los modelos a la carpeta de la API
# =============================================================================
# Docker solo puede copiar a la imagen archivos que estén dentro de la carpeta api/,
# por eso los .pkl se copian aquí desde 05_modelos

DESTINO_MODELOS.mkdir(parents=True, exist_ok=True)
paquetes = {}
for nombre in ['pd', 'ead', 'lgd']:
    origen = RUTA_MODELOS / f'modelo_{nombre}.pkl'
    shutil.copy2(origen, DESTINO_MODELOS / origen.name)          # copy2 conserva también la fecha del archivo
    with open(origen, 'rb') as archivo:
        paquetes[nombre] = cloudpickle.load(archivo)
print(f'1. Modelos copiados a {DESTINO_MODELOS}')


# =============================================================================
# 2. Cargar entrenamiento y validación y puntuar la validación
# =============================================================================
# preparar_conjunto() quita las viviendas fuera de la población y calcula impago, EAD y LGD reales

entrenamiento = prep.preparar_conjunto(pd.read_pickle(RUTA_ENTRENAMIENTO))
validacion = prep.preparar_conjunto(pd.read_pickle(RUTA_VALIDACION))

# Cada pipeline prepara él mismo los datos (igual que en el notebook 08)
X_val = validacion[paquetes['pd']['columnas_entrada']]
validacion['pd_predicha'] = paquetes['pd']['modelo'].predict_proba(X_val)[:, 1]
validacion['ead_predicha'] = paquetes['ead']['modelo'].predict(X_val).clip(0, 1)
validacion['lgd_predicha'] = paquetes['lgd']['modelo'].predict(X_val).clip(0, 1)

# Subnota como texto ('A1'...) y nota (su letra)
validacion['subnota'] = validacion['subrating'].astype(str)
validacion['nota'] = validacion['subnota'].str[0]
print(f'2. Validación puntuada: {len(validacion):,} préstamos')


# =============================================================================
# 3. Tabla de referencia de Lending Club
# =============================================================================
#   - pd_por_subnota: tasa de impago REAL de cada subnota en ENTRENAMIENTO (no en validación,
#     para no usar la validación como información del modelo; notebook 08, D1)
#   - limites_deciles_pd: los 9 cortes que dividen la PD predicha de validación en 10 deciles

pd_por_subnota = entrenamiento.groupby('subrating', observed=True)['impago'].mean()
referencia = {
    'pd_por_subnota': {str(subnota): round(float(tasa), 6) for subnota, tasa in pd_por_subnota.items()},
    'limites_deciles_pd': np.quantile(validacion['pd_predicha'], np.linspace(0.1, 0.9, 9)).round(6).tolist(),
}
DESTINO_DATOS_API.mkdir(parents=True, exist_ok=True)
with open(DESTINO_DATOS_API / 'referencia_lc.json', 'w', encoding='utf-8') as archivo:
    json.dump(referencia, archivo, ensure_ascii=False, indent=2)
print(f'3. Referencia de LC guardada ({len(pd_por_subnota)} subnotas)')


# =============================================================================
# 4. Clientes de la demo (formulario de la web)
# =============================================================================
# Muestra estratificada: el mismo número de clientes de cada nota, para que en la demo
# haya clientes de todos los niveles de riesgo (si una nota tiene menos, se cogen todos)

muestra = (validacion.groupby('nota', group_keys=False)
                     .apply(lambda g: g.sample(n=min(CLIENTES_POR_NOTA, len(g)), random_state=SEMILLA)))

# Paso al formato del formulario (el mismo que schemas.SolicitudEntrada)
clientes = pd.DataFrame({
    'id_cliente': muestra['id_cliente'],
    'principal': muestra['principal'],
    'num_cuotas': prep.plazo_en_meses(muestra['num_cuotas']),                       # ' 36 months' -> 36
    'finalidad': muestra['finalidad'].replace(prep.AGRUPAR_FINALIDAD),               # agrupación 02, D11
    'vivienda': muestra['vivienda'],
    'sector_empleo': prep.sector_desde_texto(muestra['empleo']),                    # título de empleo -> sector (02, D3)
    'antigüedad_empleo': (muestra['antigüedad_empleo'].fillna(prep.CATEGORIA_SIN_EMPLEO)
                                                     .map(prep.AGRUPAR_ANTIGUEDAD)),  # 4 grupos (03, D1)
    'ingresos': muestra['ingresos'],
    'dti': muestra['dti'],
    'fico': (muestra['fico_min'] + muestra['fico_max']) / 2,                         # punto medio del tramo (02, D13)
    'num_lineas_credito': muestra['num_lineas_credito'].astype(int),
    'saldo_revolving': muestra['saldo_revolving'],
    'num_consultas_6meses': muestra['num_consultas_6meses'].astype(int),
    'fecha_primer_credito': muestra['fecha_primer_credito'].dt.date,
    'num_hipotecas': muestra['num_hipotecas'].astype('Int64'),                       # Int64 admite nulos
    'porc_uso_revolving': muestra['porc_uso_revolving'],
    'porc_uso_tarjetas': muestra['porc_uso_tarjetas'],
    'porc_tarjetas_75p': muestra['porc_tarjetas_75p'],
    'fecha_concesion': muestra['fecha_concesion'].dt.date,                           # fecha real (ver schemas.py)
    # --- Lo que hizo Lending Club con el cliente (para la comparación)
    'nota_lc': muestra['subnota'],
    'tipo_interes_lc': muestra['tipo_interes'],
    'impago_real': muestra['impago'].astype(bool),
})
clientes.to_csv(DESTINO_DATOS_API / 'clientes_demo.csv', index=False)
print(f'4. Clientes de la demo guardados: {len(clientes)} '
      f'({clientes["nota_lc"].str[0].value_counts().sort_index().to_dict()})')


# =============================================================================
# 5. Cartera para el cuadro de mando
# =============================================================================
# Muestra aleatoria de la validación con la predicción de los tres modelos y el resultado real.
# Se guarda "por columnas" ({columna: [valores]}) porque ocupa mucho menos que una lista de objetos

cartera = validacion.sample(n=min(TAMANO_CARTERA, len(validacion)), random_state=SEMILLA)

# Pérdida real (notebook 08, D3): lo que no se amortizó ni se recuperó, solo en impagados y con mínimo 0
perdida_real = ((cartera['principal'] - cartera['imp_amortizado'] - cartera['imp_recuperado'])
                .clip(lower=0).where(cartera['impago'] == 1, 0))

columnas = {
    'año': cartera['fecha_concesion'].dt.year,
    'plazo': prep.plazo_en_meses(cartera['num_cuotas']),
    'nota': cartera['nota'],
    'subnota': cartera['subnota'],
    'finalidad': cartera['finalidad'].replace(prep.AGRUPAR_FINALIDAD),
    'vivienda': cartera['vivienda'],
    'sector': prep.sector_desde_texto(cartera['empleo']),
    'principal': cartera['principal'].round(0),
    'pd': cartera['pd_predicha'].round(4),
    'ead': cartera['ead_predicha'].round(4),
    'lgd': cartera['lgd_predicha'].round(4),
    'impago': cartera['impago'],
    'perdida_real': perdida_real.round(0),
}
datos_web = {
    'descripcion': f'Muestra aleatoria de {len(cartera):,} préstamos de validación (semilla {SEMILLA})',
    'datos': {nombre: serie.tolist() for nombre, serie in columnas.items()},
}
DESTINO_DATOS_WEB.mkdir(parents=True, exist_ok=True)
ruta_cartera = DESTINO_DATOS_WEB / 'cartera.json'
with open(ruta_cartera, 'w', encoding='utf-8') as archivo:
    json.dump(datos_web, archivo, ensure_ascii=False, separators=(',', ':'))   # sin espacios: archivo más pequeño
print(f'5. Cartera del cuadro de mando: {len(cartera):,} préstamos, {ruta_cartera.stat().st_size / 1e6:.1f} MB')

# --- Comprobación rápida: la muestra debe parecerse a la validación completa (notebook 08)
from sklearn.metrics import roc_auc_score  # noqa: E402
print(f'   AUC de la PD en la muestra: {roc_auc_score(cartera["impago"], cartera["pd_predicha"]):.4f} '
      f'(validación completa: {roc_auc_score(validacion["impago"], validacion["pd_predicha"]):.4f})')
