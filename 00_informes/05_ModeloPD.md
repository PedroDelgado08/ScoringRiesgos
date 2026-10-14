# Informe · 05 · Modelo de PD (probabilidad de impago)

**Notebook:** `03_notebooks/es/05_ModeloPD.ipynb` · **Fecha del informe:** 13/10/2026

## Resumen

Este notebook busca el mejor modelo para estimar la probabilidad de que un préstamo acabe en impago (PD) y lo entrena con todo el conjunto de entrenamiento. Compara regresión logística y *gradient boosting* con una búsqueda en rejilla y validación cruzada. Gana un *gradient boosting* (`learning_rate` 0,05, 63 hojas, hoja ≥ 500) con AUC 0,6767, por encima del subrating de Lending Club (0,6687). Está bien calibrado: la PD media predicha es 14,84 % frente a una tasa real de 14,85 %. El modelo se guarda en `05_modelos/modelo_pd.pkl`.

## Entradas y salidas

| Tipo | Archivo | Contenido |
|---|---|---|
| Entrada | `train.pkl` (leído con `preparar_conjunto()` de `04_scripts/preparacion.py`) | 443.405 préstamos de entrenamiento, 19 columnas originales, tasa de impago 14,85 % |
| Entrada | `04_scripts/preparacion.py` | Clase `PreparacionScoring`: limpieza, agrupaciones, imputaciones, variables nuevas, recortes y logaritmos |
| Salida | `05_modelos/modelo_pd.pkl` | Paquete con el *pipeline* completo, las variables, los hiperparámetros, las métricas y las versiones de `scikit-learn` y `pandas` (1,5 MB, guardado con `cloudpickle`) |

## Qué se hace

1. **Importar librerías.** Se cargan las herramientas y se muestra la versión de `scikit-learn` (1.9.1), que se guarda con el modelo porque un modelo guardado con una versión puede no cargarse con otra.
2. **Cargar los datos.** 443.405 préstamos y 14,85 % de impagos. Las 19 columnas originales se convierten dentro del *pipeline* en 15 variables (4 categóricas y 11 numéricas).
3. **Listón: el subrating (D1).** Usado como puntuación, el subrating de Lending Club da AUC 0,6687 y Gini 0,3373. Es la marca que hay que igualar.
4. **Pipeline de preprocesado y modelo (D2).** Tres pasos en un objeto: `PreparacionScoring`, `ColumnTransformer` (*one-hot* para categóricas, estandarización para numéricas) y modelo. Una caché evita repetir la preparación en cada combinación.
5. **Validación cruzada y métricas (D3, D4).** Tres particiones estratificadas con semilla 42. Un modelo sin información (siempre 14,8 %) da *log-loss* 0,4201 y Brier 0,1264.
6. **Búsqueda del mejor modelo (D5).** 20 combinaciones × 3 particiones = 60 entrenamientos.
   - 6.1: los 12 *gradient boosting* ocupan los 12 primeros puestos (AUC 0,6748–0,6767) y las 8 logísticas van detrás (0,6586–0,6685).
   - 6.2: la logística se estabiliza desde `C` = 0,01 (L2) o 0,1 (L1); en *gradient boosting* ganan los árboles prudentes (`learning_rate` 0,05, hoja ≥ 500).
7. **Elección del modelo (D6).** Con la regla de un error estándar el umbral es 0,6757; hay 9 combinaciones empatadas, todas *gradient boosting*, y se elige la de 63 hojas.
8. **¿Hace falta `sector_empleo`? (D7).** Quitarla baja el AUC de 0,6767 a 0,6735, así que se mantiene.
9. **Análisis del modelo elegido.** Con predicciones fuera de partición:
   - 9.1: el modelo supera al subrating en AUC, Gini y KS.
   - 9.2: la PD predicha coincide con la tasa real en todos los deciles (D8).
   - 9.3: el FICO es la variable más importante, seguida del ratio importe / ingresos y del plazo.
   - 9.4: las cuatro variables numéricas principales tienen sentido de negocio.
10. **Entrenar y guardar el modelo final (D9).** Se entrena con los 443.405 préstamos y se guarda con `cloudpickle`.
11. **Resumen y próximos pasos.** Cierra el notebook con el registro de resultados y los pasos siguientes (EAD, LGD, validación final, API).

## Decisiones

| # | Decisión | Por qué | Alternativa descartada |
|---|---|---|---|
| D1 | El listón es el AUC del subrating de Lending Club. | Es una evaluación profesional hecha con más información que la nuestra; igualarla con 15 variables ya sería buen resultado. | Usar el subrating como variable: un cliente nuevo de la API no lo tiene y el tipo de interés sale de él, sería copiar a Lending Club. |
| D2 | Preparación, preprocesado y modelo en un único *pipeline*. | Medianas, recortes, *one-hot* y estandarización se aprenden solo con la parte de entrenamiento de cada partición, sin filtrar información. | Preparar antes en un tablón (como en el notebook 04): es más simple de ver, pero los valores se calculan con todo el entrenamiento y hay que aplicarlos aparte en la API. |
| D3 | Validación cruzada estratificada de 3 particiones, semilla 42. | Con 443.000 préstamos cada trozo (unos 148.000) da una estimación estable; son las mismas particiones de los notebooks 03 y 04. | 5 o 10 particiones: multiplican el tiempo sin cambiar la elección. |
| D4 | El AUC decide; *log-loss* y Brier vigilan la calibración. | El AUC es estándar en *scoring* y no depende de un umbral; la pérdida esperada necesita probabilidades correctas, no solo orden. | No se menciona ninguna. |
| D5 | Una búsqueda en rejilla con 8 logísticas y 12 *gradient boosting*. | La logística es el estándar interpretable; el *boosting* suele ser lo mejor en datos tabulares. Con 20 combinaciones se pueden probar todas. | `RandomizedSearchCV`, *random forest* (muy lento), XGBoost / LightGBM (añaden dependencias) y redes neuronales (difíciles de explicar). |
| D6 | Elegir con la regla de un error estándar. | Evita elegir un modelo más complejo por una diferencia que puede ser azar. Gana el *boosting* porque su ventaja (+0,008 de AUC) es clara. | Quedarse con la logística: iguala al subrating y se explica mejor, a cambio de 0,008 de AUC. |
| D7 | Mantener `sector_empleo`. | Aporta 0,003 de AUC, más que el azar de las particiones; en la API llegará con la definición actual, la de 2014–2015. | Quitarla: modelo más estable y sin duda ética, pero con 0,003 menos de AUC. |
| D8 | No recalibrar las probabilidades. | El *boosting* minimiza el *log-loss* y la tabla de deciles confirma la calibración (diferencia ≤ 0,007). | `CalibratedClassifierCV` (isotónica o Platt): añade un paso sin mejora visible. |
| D9 | Guardar `05_modelos/modelo_pd.pkl` con `cloudpickle`, como paquete con metadatos. | `cloudpickle` mete dentro el código de `PreparacionScoring`, así que la API solo necesita el `.pkl`; los metadatos dicen qué variables espera y con qué versión se entrenó. | `joblib` y `pickle`: guardan la clase solo por su nombre y la API necesitaría una copia de `preparacion.py`. |

## Resultados clave

Búsqueda (AUC medio en validación cruzada):

| Modelo | AUC | Frente al subrating | *Log-loss* | Brier |
|---|---|---|---|---|
| Mejor *gradient boosting* (0,05 · 63 hojas · hoja ≥ 500) | 0,6767 | +0,0080 | 0,3947 | 0,1200 |
| Mejor logística (`C` = 0,1, L2) | 0,6685 | −0,0002 | 0,3972 | 0,1207 |
| Subrating de Lending Club | 0,6687 | 0 | no se calcula | no se calcula |

Modelo elegido, con predicciones fuera de partición:

- **Discriminación:** AUC 0,6767, Gini 0,3533, KS 0,2563 (subrating: 0,6687, 0,3373 y 0,2484).
- **Sesgo global:** PD media predicha 14,84 % frente a 14,85 % real.
- **Calibración por deciles:** la tasa real va del 3,7 % (decil 1) al 31,0 % (decil 10), unas 8 veces más; la mayor diferencia es 0,6 puntos (decil 7: 16,8 % frente a 17,5 %).
- **Sobreajuste:** la logística casi no tiene (0,6690 en entrenamiento frente a 0,6685); el *boosting* crece con el tamaño del árbol y llega a 0,039 con 63 hojas y hoja ≥ 100.
- **Importancia por permutación (caída de AUC):** `fico` 0,0456, `ratio_principal_ingresos` 0,0221, `num_cuotas` 0,0157, `dti` 0,0124, `saldo_revolving` 0,0123, `num_consultas_6meses` 0,0107. La menor es `antigüedad_empleo` (0,0021).
- **Sentido de las variables:** con FICO 660 la PD es del 19 % y con 760 del 7 %; con 60 cuotas sube del 14 % al 22 %; el ratio importe / ingresos la sube del 12 % al 21 %; el DTI del 12,5 % al 18 %.
- **Tiempo de la búsqueda:** entre 6 y 16 minutos según el equipo (unos 6 minutos en el equipo de Pedro).
- **Archivo guardado:** `modelo_pd.pkl`, 1,5 MB.

## Limitaciones y puntos a vigilar

- La discriminación es moderada (AUC 0,6767, Gini 0,353), típica de modelos de admisión con pocos datos del cliente.
- `sector_empleo` es inestable: hasta finales de 2013 el campo original era el nombre de la empresa y el 59 % de esos préstamos acabó en "otros" (PSI 0,988 entre 2012 y 2015). Además tiene carga ética: hay que vigilar que no actúe como sustituto de una característica protegida, como el sexo.
- El *gradient boosting* tiene más sobreajuste que la logística, aunque generaliza mejor.
- La versión de `scikit-learn` debe ser la misma al guardar y al cargar el modelo; por eso se guarda en el paquete.
- Hay que comprobar en el conjunto de validación que la calibración se mantiene.
- La versión con 31 hojas (AUC 0,6766), elegida en una ejecución anterior, está prácticamente empatada con la de 63: la regla solo ordena por familia, no por tamaño del árbol.

## Relación con el resto del proyecto

- **Viene de:** los notebooks 02–04, cuya preparación ya está en `04_scripts/preparacion.py` y va dentro del *pipeline*. El notebook 03 aportó el listón del subrating (0,669) y la comprobación rápida de importancia (FICO y plazo); el 04 decidió *one-hot* y estandarización.
- **Lo usan:** el notebook 06 (EAD) y el 07 (LGD), que repiten el mismo *pipeline*, las mismas particiones y la misma regla de elección. Después, la validación final (08) y la nueva API, que cargan `modelo_pd.pkl`.
- **Conjunto de validación:** este notebook no lo toca. Se confirma en el notebook 08, donde la PD obtiene AUC 0,6782 (frente a 0,6767 en validación cruzada). Los tres modelos juntos se evalúan allí: PD AUC 0,6782, EAD RMSE 0,2352 y LGD RMSE 0,1470.
