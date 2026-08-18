# Resumen FASE 0 — Mapeo del proyecto

## Estructura de carpetas detectada

- 01_Documentos/
- 02_datos/
  - 01_Originales/
    - prestamos.csv
  - 02_Validacion/
  - 03_Entrenamiento/
  - 04_Caches/
- 03_notebooks/
  - 01_ImportacionDatos.ipynb
  - 02_Calidad de Datos.ipynb
  - 03_EDA.ipynb
  - 04_Transformacion de datos.ipynb
  - 05_Modelizacion Clasificacion PD.ipynb
  - 06_Modelizacion Regresion EAD.ipynb
  - 07_Modelizacion Regresion LGD.ipynb
- 04_scripts/
- 05_modelos/
- 06_resultados/
- 07_despliegue/
- 99_otros/

## Archivo CSV original detectado

- Ruta: 02_datos/01_Originales/prestamos.csv
- Detectado en: 03_notebooks/01_ImportacionDatos.ipynb
- Línea relevante:
  ```python
  datos = pd.read_csv('../02_datos/01_Originales/prestamos.csv')
  ```

## Observaciones
- Estructura de carpetas conforme a lo esperado.
- El archivo de datos principal es 'prestamos.csv'.
- No se detectan rutas alternativas de carga en A_01.

---

## FASE 1: INTEGRACIÓN LINEAL — Completada

**Notebook finalista**: `03_notebooks/08_Preproduccion.ipynb`

### Celdas integradas: 8 celdas de código + 1 celda markdown

| Celda | Origen | Contenido |
|-------|--------|-----------|
| 0 | Agente (título) | Markdown con título del notebook |
| 1 | Agente (infraestructura) | Imports + rutas robustas con `Path.cwd()` |
| 2 | A_01 | `pd.read_csv` + split 70/30 + guardado pickles |
| 3 | A_02 | Calidad de datos: drops, imputaciones, filtro outliers ingresos |
| 4 | A_03 | EDA transformatorio: clips DTI, num_hipotecas, porc_uso_revolving |
| 5 | A_04 | Ingeniería de variables completa: targets, OHE, OE, Binarizer, MMS, tablones |
| 6 | A_05 | GridSearch + modelo PD (LogisticRegression saga C=1 l1_ratio=1) |
| 7 | A_06 | GridSearch + modelo EAD (HistGradientBoostingRegressor lr=0.1) |
| 8 | A_07 | GridSearch + modelo LGD (HistGradientBoostingRegressor lr=0.01) |

### Transformaciones por notebook

#### A_01 — Lectura y partición
- `datos = pd.read_csv('../02_datos/01_Originales/prestamos.csv')`
- Split 70/30: `val = datos.sample(frac=0.3)`
- Guarda: `validacion.pkl`, `train.pkl`

#### A_02 — Calidad de datos
- Lee `train.pkl`, reset de índice
- Drop `id_prestamo`, `descripcion`, `empleo`
- Split cat/num: `select_dtypes`
- Imputación `antigüedad_empleo` → `'desconocido'`
- Imputación numéricas → `0`, cast `astype(int)` para 5 columnas
- **Filtro de filas (outliers)**: drop registros con `ingresos > 400000`
- Guarda: `cat_calidad.pkl`, `num_calidad.pkl`, `train_calidad.pkl`

#### A_03 — EDA (⚠️ contiene transformaciones reales)
- Lee `cat_calidad.pkl`, `num_calidad.pkl`
- `num['DTI'] = np.clip(num['dti'], 0, 100)` — nueva columna auxiliar
- `num['num_hipotecas'] = np.clip(num['num_hipotecas'], 0, 7)` — cap a 7
- `num['porc_uso_revolving'] = np.clip(num['porc_uso_revolving'], 0, 100)` — cap a 100
- Guarda: `cat_eda.pkl`, `num_eda.pkl`
- **Nota**: `pd.cut(temp['num_meses_desde_ult_retraso'], 20)` → solo EDA temporal, no persiste

#### A_04 — Ingeniería de variables
- Lee `cat_eda.pkl`, `num_eda.pkl`
- Targets: `target_pd` (binario default), `target_ead` (pendiente/principal), `target_lgd` (1-recup/pendiente)
- Clampeo de targets EAD y LGD a [0,1]
- Drop `num_meses_desde_ult_retraso`
- Limpieza: vivienda `['ANY','NONE','OTHER'] → 'MORTGAGE'`, finalidad `['wedding','educational','renewable_energy'] → 'other'`
- `var_ohe = ['ingresos_verificados','vivienda','finalidad','num_cuotas']` → `OneHotEncoder`
- `var_oe = ['antigüedad_empleo','rating']` → `OrdinalEncoder` (orden explícito)
- `var_bin = ['num_derogatorios']` → `Binarizer(threshold=0)`
- `num_escalar = ['ingresos','dti','num_lineas_credito','porc_uso_revolving','principal','tipo_interes','imp_cuota']` → `MinMaxScaler`
- Constructión tablones PD, EAD y LGD (EAD/LGD filtrados a `target_pd == 1`)
- Guarda: `df_tablon_pd.pkl`, `df_tablon_ead.pkl`, `df_tablon_lgd.pkl`

#### A_05 — Modelo PD
- Modelo ganador: `LogisticRegression(solver='saga', C=1, l1_ratio=1)`
- GridSearch: `scoring='roc_auc'`, `cv=5`, `n_jobs=-1`
- Param grid: `l1_ratio ∈ [0, 0.5, 1]`, `C ∈ [0.01, 0.25, 0.5, 0.75, 1]`
- Métrica validación: `roc_auc_score`

#### A_06 — Modelo EAD
- Modelo ganador: `HistGradientBoostingRegressor(learning_rate=0.1, max_iter=100, max_depth=5, min_samples_leaf=50, l2_regularization=1, scoring='neg_mean_absolute_percentage_error')`
- GridSearch: `scoring='neg_mean_absolute_error'`, `cv=3`, `n_jobs=-1`
- Param grid: Ridge, Lasso y HistGBR con learning_rate, max_iter, max_depth, l2_regularization
- Métrica validación: `mean_absolute_error`

#### A_07 — Modelo LGD
- Modelo ganador: `HistGradientBoostingRegressor(learning_rate=0.01, max_iter=100, max_depth=5, min_samples_leaf=50, l2_regularization=0.5, scoring='neg_mean_absolute_percentage_error')`
- GridSearch: igual que A_06
- Métrica validación: `mean_absolute_error`

### Observaciones y decisiones de integración

1. **Pickles intermedios**: Se conservan en FASE 1 para fidelidad. FASE 2 puede eliminar reloads redundantes.
2. **Columna 'DTI' (A_03)**: Creada como copia clipeada de `dti` pero no usada en modelos.
3. **`id_cliente`**: Columna numérica usada como índice en tablones; no es feature del modelo.
4. **Filtro `target_pd == 1` en EAD/LGD**: Transformación de fila crítica en A_04 — los modelos EAD y LGD solo se entrenan con préstamos en default.
5. **Features finalistas (todas idénticas excepto target)**:
   - OHE: `ingresos_verificados_*`, `vivienda_*`, `finalidad_*`, `num_cuotas_*`
   - MMS: `antigüedad_empleo_oe_mms`, `rating_oe_mms`, `ingresos_mms`, `dti_mms`, `num_lineas_credito_mms`, `porc_uso_revolving_mms`, `principal_mms`, `tipo_interes_mms`, `imp_cuota_mms`
   - BIN: `num_derogatorios_bin`

---

## FASE 2: LIMPIEZA — Pendiente (awaiting GATE 1 approval)

## FASE 3: MANIFIESTO — Pendiente
