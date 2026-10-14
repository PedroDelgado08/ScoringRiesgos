"""
Preparación de datos de ScoringRiesgos.

Reúne en un solo sitio las transformaciones decididas en los notebooks 02 (calidad),
03 (EDA) y 04 (transformación), para aplicarlas exactamente igual a:
  - el conjunto de entrenamiento (notebooks 05–07),
  - el conjunto de validación (validación final),
  - los datos de un cliente nuevo (API).

Contenido:
  - PreparacionScoring : transformador de scikit-learn que va DENTRO del pipeline de cada modelo.
                         Aprende sus valores (medianas, deciles, límites de recorte) en fit()
                         y los aplica en transform(). Al guardar el modelo, se guardan con él.
  - preparar_conjunto  : solo para entrenamiento y validación. Quita los préstamos que no
                         forman parte de la población del modelo y calcula los objetivos
                         (impago, EAD y LGD). No se usa en la API.
"""

import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin


# =============================================================================
# Valores fijos (decididos en los notebooks, no se aprenden de los datos)
# =============================================================================

# Categoría para los clientes que no declaran empleo (notebook 02, D2)
CATEGORIA_SIN_EMPLEO = 'sin_empleo_declarado'

# Agrupación de la antigüedad de empleo en 4 grupos (notebook 03, D1)
AGRUPAR_ANTIGUEDAD = {
    '< 1 year': '≤1', '1 year': '≤1',
    '2 years': '2-9', '3 years': '2-9', '4 years': '2-9', '5 years': '2-9',
    '6 years': '2-9', '7 years': '2-9', '8 years': '2-9', '9 years': '2-9',
    '10+ years': '10+',
    CATEGORIA_SIN_EMPLEO: CATEGORIA_SIN_EMPLEO,
}
GRUPOS_ANTIGUEDAD = ['sin_empleo_declarado', '≤1', '2-9', '10+']

# Reglas para pasar el título de empleo a un sector (notebook 02, D3, versión definitiva):
# se aplican en orden y gana la PRIMERA que coincide; si ninguna coincide, el sector es 'otros'
REGLAS_SECTOR = [
    ('salud',                r'nurse|\brn\b|\blpn\b|\bcna\b|doctor|physician|medical|dental|dentist|pharm|therap|hospital|health|clinic|surgeon|paramedic|\bemt\b|radiolog|caregiver|patient|optometr|veterinar|\blvn\b|phlebotom'),
    ('educacion',            r'teacher|professor|school|educat|instructor|tutor|principal|faculty|universit|college|librar'),
    ('legal',                r'attorney|lawyer|paralegal|legal|\bcounsel\b|law clerk|judge'),
    ('seguridad_publica',    r'police|sheriff|deputy|correction|firefight|military|\barmy\b|\bnavy\b|air force|marine|usps|postal|letter carrier|mail carrier|federal|government|state of|county|city of|security guard|security officer|soldier|sergeant|trooper|\busaf\b|department of defense|detective'),
    ('transporte',           r'driver|truck|transport|pilot|logistic|courier|delivery|\bbus\b|dispatch|flight attendant|airline|railroad|conductor'),
    ('hosteleria',           r'^server$|waiter|waitress|bartender|\bcook\b|\bchef\b|restaurant|hotel|barista|food service|dishwasher|housekeep|casino|hospitality'),
    ('finanzas',             r'accountant|accounting|bookkeep|\bbank|financ|teller|\bloan|underwrit|audit|\btax\b|insurance|controller|\bcpa\b|payroll|actuar|credit analyst|accounts payable|accounts receivable|mortgage|investment|adjuster'),
    ('tecnologia',           r'engineer|developer|software|programmer|\bit\b|network|systems|database|\bdata (?!entry)|\bweb\b|technology|computer|devops|architect'),
    ('comercio',             r'sales|retail|cashier|store|merchand|customer service|account manager|account executive|realtor|real estate|\bbuyer\b|\bcsr\b|walmart|target|costco|home depot|lowe'),
    ('oficios_industria',    r'mechanic|electrician|plumb|carpenter|welder|construction|machinist|maintenance|operator|laborer|warehouse|technician|\btech\b|installer|hvac|painter|foreman|custodian|janitor|landscap|assembl|production|forklift|material handler|lineman|superintendent|inspector|\blabor\b|\bforman\b|estimator'),
    ('autonomo_propietario', r'owner|self employed|selfemployed|proprietor|founder|\bpartner\b|entrepreneur'),
    ('administrativo',       r'admin|assistant(?!.*manager)|secretary|clerk|receptionist|office|coordinator|data entry|specialist|analyst|representative|associate|processor|recruit|human resources|\bhr\b|clerical'),
    ('direccion_gestion',    r'manager|director|supervisor|president|\bceo\b|\bcfo\b|\bcoo\b|\bvp\b|executive|chief|management|team lead|consultant'),
]
# Sectores válidos: los de las reglas, 'otros' y el de los que no declaran empleo (lista para el formulario de la API)
SECTORES = [s for s, _ in REGLAS_SECTOR] + ['otros', CATEGORIA_SIN_EMPLEO]

# Agrupación de finalidades residuales (notebook 02, D11)
AGRUPAR_FINALIDAD = {'wedding': 'major_purchase', 'renewable_energy': 'other', 'educational': 'other'}

# Viviendas que forman parte de la población del modelo (notebook 02, D10)
VIVIENDAS_VALIDAS = ['RENT', 'MORTGAGE', 'OWN']

# Orden del subrating de Lending Club (notebook 02, D12): solo para comparar, no es entrada del modelo
ORDEN_SUBRATING = [f'{letra}{numero}' for letra in 'ABCDEFG' for numero in range(1, 6)]

# Recortes y logaritmos (notebook 04, D7 y D8)
VARIABLES_RECORTE = ['ingresos', 'num_lineas_credito', 'num_hipotecas', 'saldo_revolving',
                     'porc_uso_tarjetas', 'ratio_principal_ingresos', 'antiguedad_historial']
PERCENTIL_RECORTE = 0.999
TOPE_CONSULTAS = 4.0
VARIABLES_LOG = ['ingresos', 'num_hipotecas', 'antiguedad_historial']

# Variables que salen de la preparación (notebook 04, D12): las 15 de la PD más el importe
CATEGORICAS = ['antigüedad_empleo', 'vivienda', 'finalidad', 'sector_empleo']
NUMERICAS = ['num_cuotas', 'ingresos', 'dti', 'fico', 'num_lineas_credito', 'num_hipotecas',
             'saldo_revolving', 'porc_uso_tarjetas', 'num_consultas_6meses',
             'ratio_principal_ingresos', 'antiguedad_historial']
VARIABLES_PD = CATEGORICAS + NUMERICAS
VARIABLES_EAD_LGD = VARIABLES_PD + ['principal']

# Columnas originales de Lending Club que necesita PreparacionScoring (las que se le pasan al pipeline).
# El resto de columnas del conjunto (objetivos, tipo de interés, subrating...) no entran en el modelo.
COLUMNAS_ENTRADA = ['empleo', 'antigüedad_empleo', 'vivienda', 'finalidad', 'num_cuotas', 'fico_min', 'fico_max',
                    'ingresos', 'dti', 'principal', 'num_lineas_credito', 'num_hipotecas', 'saldo_revolving',
                    'num_consultas_6meses', 'porc_uso_revolving', 'porc_uso_tarjetas', 'porc_tarjetas_75p',
                    'fecha_primer_credito', 'fecha_concesion']


# =============================================================================
# Funciones de limpieza sin parámetros aprendidos (notebook 02)
# =============================================================================

def normalizar_empleo(empleo):
    """Minúsculas, signos de puntuación -> espacios y sin espacios sobrantes ('R.N.' = 'rn')."""
    return (empleo.astype('string').str.lower()
                  .str.replace(r'[^a-z0-9]+', ' ', regex=True)
                  .str.strip())


def sector_desde_texto(empleo):
    """Asigna un sector a cada título de empleo con REGLAS_SECTOR (notebook 02, D3).
    Los nulos (empleo no declarado) van a CATEGORIA_SIN_EMPLEO."""
    texto = normalizar_empleo(empleo).fillna('')
    # Las reglas se aplican solo a los títulos distintos (muchos se repiten) y después se reparten:
    # el resultado es el mismo y es varias veces más rápido
    unicos = pd.Series(texto.unique())
    condiciones = [unicos.str.contains(patron, regex=True).to_numpy(dtype=bool) for _, patron in REGLAS_SECTOR]
    sectores = [sector for sector, _ in REGLAS_SECTOR]
    sector_unico = dict(zip(unicos, np.select(condiciones, sectores, default='otros')))  # la primera regla que coincide
    resultado = texto.map(sector_unico).to_numpy(dtype=object)
    resultado = np.where(empleo.isna(), CATEGORIA_SIN_EMPLEO, resultado)
    return pd.Series(resultado, index=empleo.index)


def plazo_en_meses(num_cuotas):
    """Plazo de texto (' 36 months') a número entero de cuotas (notebook 02, D7). Si ya es número, lo deja igual."""
    return pd.to_numeric(num_cuotas.astype(str).str.extract(r'(\d+)', expand=False)).astype(int)


def columna(datos, nombre):
    """Devuelve la columna si existe y, si no, una columna vacía (NaN).
    Permite que la API no envíe los campos opcionales."""
    return datos[nombre] if nombre in datos.columns else pd.Series(np.nan, index=datos.index)


def limpiar(datos):
    """Limpieza que no aprende nada de los datos (notebooks 02 y 03).
    Acepta tanto el formato original de Lending Club (validación) como el del formulario de la API."""
    X = pd.DataFrame(index=datos.index)

    # --- Antigüedad de empleo: nulo -> sin empleo declarado (02, D2) y agrupación en 4 grupos (03, D1).
    #     Si ya llega agrupada (API), se deja como está.
    antiguedad = columna(datos, 'antigüedad_empleo').astype(object).fillna(CATEGORIA_SIN_EMPLEO)
    X['antigüedad_empleo'] = antiguedad.map(lambda v: AGRUPAR_ANTIGUEDAD.get(v, v))

    # --- Sector de empleo: si llega elegido (API) se usa; si no, se calcula desde el texto (02, D3)
    if 'sector_empleo' in datos.columns:
        X['sector_empleo'] = datos['sector_empleo'].astype(object).fillna(CATEGORIA_SIN_EMPLEO)
    else:
        X['sector_empleo'] = sector_desde_texto(columna(datos, 'empleo'))

    # --- Categóricas: vivienda tal cual (la población se filtra en preparar_conjunto) y finalidad agrupada (02, D11)
    X['vivienda'] = datos['vivienda'].astype(str)
    X['finalidad'] = datos['finalidad'].astype(str).replace(AGRUPAR_FINALIDAD)

    # --- Plazo como número (02, D7), con decimales como el resto de numéricas
    #     (las versiones recientes de sklearn no admiten enteros en algunas herramientas, como la dependencia parcial)
    X['num_cuotas'] = plazo_en_meses(datos['num_cuotas']).astype(float)

    # --- FICO: si llega un único valor (API) se usa; si no, punto medio del tramo (02, D13)
    if 'fico' in datos.columns:
        X['fico'] = datos['fico'].astype(float)
    else:
        X['fico'] = (datos['fico_min'] + datos['fico_max']) / 2

    # --- Numéricas que pasan sin cambios en este paso
    for v in ['ingresos', 'dti', 'principal', 'num_lineas_credito', 'num_hipotecas',
              'saldo_revolving', 'num_consultas_6meses']:
        X[v] = columna(datos, v).astype(float)

    # --- Columnas auxiliares para imputar y crear variables (no son entrada del modelo)
    for v in ['porc_uso_revolving', 'porc_uso_tarjetas', 'porc_tarjetas_75p']:
        X[v] = columna(datos, v).astype(float)
    X['fecha_primer_credito'] = pd.to_datetime(datos['fecha_primer_credito'])
    # Fecha de concesión: en la API no existe, se usa la fecha de hoy
    if 'fecha_concesion' in datos.columns:
        X['fecha_concesion'] = pd.to_datetime(datos['fecha_concesion'])
    else:
        X['fecha_concesion'] = pd.Timestamp.today().normalize()
    return X


# =============================================================================
# Transformador para el pipeline
# =============================================================================

class PreparacionScoring(BaseEstimator, TransformerMixin):
    """Primer paso del pipeline de los modelos de PD, EAD y LGD.

    fit()       aprende, SOLO con los datos de entrenamiento que recibe:
                  - la mediana de porc_uso_revolving (02, D4),
                  - los deciles de porc_uso_revolving y la mediana de porc_uso_tarjetas en cada uno (02, D5),
                  - la mediana de num_hipotecas por vivienda y la global (02, D6),
                  - los límites de recorte al percentil 99,9 (04, D7).
    transform() limpia, imputa, crea las variables nuevas (04, D1), recorta (04, D7) y aplica
                logaritmos (04, D8). Devuelve las 15 variables de la PD más 'principal'.
    """

    def __init__(self, percentil_recorte=PERCENTIL_RECORTE, tope_consultas=TOPE_CONSULTAS):
        self.percentil_recorte = percentil_recorte   # percentil del recorte por arriba
        self.tope_consultas = tope_consultas         # límite fijo de num_consultas_6meses

    # --- Imputaciones (usan los valores aprendidos) --------------------------------------
    def _imputar(self, X):
        X = X.copy()
        # 02, D4: uso revolving nulo -> mediana (solo se usa para elegir el decil)
        uso_revolving = X['porc_uso_revolving'].fillna(self.mediana_uso_revolving_)

        # 02, D5: uso de tarjetas nulo -> mediana de su decil de uso revolving
        decil = pd.cut(uso_revolving, bins=self.limites_deciles_revolving_, labels=False)
        mediana_decil = decil.map(self.medianas_tarjetas_por_decil_).astype(float)
        nulo = X['porc_uso_tarjetas'].isna()
        X.loc[nulo, 'porc_uso_tarjetas'] = mediana_decil[nulo]
        # Cotas lógicas cuando se conoce el % de tarjetas por encima del 75 %
        cota_min = nulo & X['porc_tarjetas_75p'].eq(100)       # todas las tarjetas > 75 % -> uso >= 75
        X.loc[cota_min, 'porc_uso_tarjetas'] = X.loc[cota_min, 'porc_uso_tarjetas'].clip(lower=75)
        cota_max = nulo & X['porc_tarjetas_75p'].eq(0)         # ninguna tarjeta > 75 % -> uso <= 75
        X.loc[cota_max, 'porc_uso_tarjetas'] = X.loc[cota_max, 'porc_uso_tarjetas'].clip(upper=75)

        # 02, D6: hipotecas nulas -> mediana de su tipo de vivienda (o la global si la vivienda no se conoce)
        valor = X['vivienda'].map(self.medianas_hipotecas_por_vivienda_).astype(float).fillna(self.mediana_hipotecas_global_)
        X['num_hipotecas'] = X['num_hipotecas'].fillna(valor)
        return X

    @staticmethod
    def _variables_nuevas(X):
        """04, D1: ratio importe / ingresos y años de historial de crédito."""
        X = X.copy()
        X['ratio_principal_ingresos'] = X['principal'] / X['ingresos']
        X['antiguedad_historial'] = (X['fecha_concesion'] - X['fecha_primer_credito']).dt.days / 365.25
        return X

    # --- fit / transform -----------------------------------------------------------------
    def fit(self, datos, y=None):
        X = limpiar(datos)

        # 02, D4: mediana del uso revolving
        self.mediana_uso_revolving_ = float(X['porc_uso_revolving'].median())
        uso_revolving = X['porc_uso_revolving'].fillna(self.mediana_uso_revolving_)

        # 02, D5: deciles del uso revolving (extremos abiertos) y mediana del uso de tarjetas en cada uno
        _, limites = pd.qcut(uso_revolving, q=10, retbins=True)
        limites[0], limites[-1] = -np.inf, np.inf
        self.limites_deciles_revolving_ = limites
        decil = pd.cut(uso_revolving, bins=limites, labels=False)
        # Se guardan como diccionarios y no como Series de pandas: así el modelo guardado
        # no depende de la versión de pandas (un pickle de pandas 3 no se abre con pandas 2)
        self.medianas_tarjetas_por_decil_ = X['porc_uso_tarjetas'].groupby(decil).median().to_dict()

        # 02, D6: medianas de hipotecas por vivienda y global
        self.medianas_hipotecas_por_vivienda_ = X.groupby('vivienda')['num_hipotecas'].median().to_dict()
        self.mediana_hipotecas_global_ = float(X['num_hipotecas'].median())

        # 04, D7: límites de recorte, calculados tras imputar y crear las variables nuevas
        X = self._variables_nuevas(self._imputar(X))
        self.topes_ = {v: float(X[v].quantile(self.percentil_recorte)) for v in VARIABLES_RECORTE}
        self.topes_['num_consultas_6meses'] = float(self.tope_consultas)
        return self

    def transform(self, datos):
        X = self._variables_nuevas(self._imputar(limpiar(datos)))

        # 04, D7: recorte por arriba; 04, D8: logaritmos
        for v, tope in self.topes_.items():
            X[v] = X[v].clip(upper=tope)
        for v in VARIABLES_LOG:
            X[v] = np.log1p(X[v])

        # Categóricas como texto (así las recibe el OneHotEncoder) y solo las columnas del modelo
        X[CATEGORICAS] = X[CATEGORICAS].astype(str)
        return X[VARIABLES_EAD_LGD]

    def get_feature_names_out(self, input_features=None):
        return np.array(VARIABLES_EAD_LGD, dtype=object)


# =============================================================================
# Población y objetivos (solo entrenamiento y validación, no la API)
# =============================================================================

def preparar_conjunto(datos):
    """Aplica a un conjunto con resultado conocido (entrenamiento o validación):
      - 02, D10: se quitan las viviendas fuera de la población del modelo (NONE, OTHER, ANY),
      - 04, D2: impago = 1 si 'Charged Off',
      - 04, D3: EAD = (principal - amortizado) / principal, solo impagados,
      - 04, D4: LGD = 1 - recuperado / pendiente, limitada a 0–1 (nula si no hay deuda pendiente),
      - 02, D12: subrating como categoría ordenada (para comparar con Lending Club).
    Las variables de entrada se dejan en su formato original: las transforma PreparacionScoring."""
    df = datos[datos['vivienda'].isin(VIVIENDAS_VALIDAS)].copy()

    df['impago'] = df['estado'].eq('Charged Off').astype(int)

    pendiente = (df['principal'] - df['imp_amortizado']).where(df['impago'] == 1)
    df['ead'] = pendiente / df['principal']
    tasa_recuperacion = (df['imp_recuperado'] / pendiente).where(pendiente > 0)
    df['lgd'] = (1 - tasa_recuperacion).clip(0, 1)

    df['subrating'] = pd.Categorical(df['subrating'], categories=ORDEN_SUBRATING, ordered=True)
    return df
