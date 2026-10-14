# Informe · 02 · Calidad de datos

**Notebook:** `03_notebooks/es/02_CalidadDatos.ipynb` · **Fecha del informe:** 13/10/2026

## Resumen
Este notebook revisa la calidad del conjunto de entrenamiento del notebook 01 (443.469 préstamos, 34 columnas) en tres bloques: nulos, categorías y textos, y valores atípicos. Cada problema se trata en tres pasos: observación, decisión y corrección. Todo lo que se aprende de los datos se calcula solo con entrenamiento, para aplicarlo igual a validación y a la API. Se toman 25 decisiones (D1–D25). El resultado es un conjunto de 443.405 préstamos (64 menos), 33 columnas y 0 nulos. Se reconstruyen 165 préstamos cuyo interés y cuota se modificaron después de la concesión. La tasa de impago global es del 14,8 %.

## Entradas y salidas
| Tipo | Archivo | Contenido |
|---|---|---|
| Entrada | `train.pkl` (notebook 01) | Conjunto de entrenamiento original: 443.469 préstamos, 34 columnas |
| Entrada | CSV original de Lending Club (1,7 GB) | Solo en 6.3.7, para diagnosticar: `total_rec_int` y `last_pymnt_d`. Nunca como variables del modelo |
| Salida | `02_datos/03_Entrenamiento/train_calidad.pkl` | Entrenamiento corregido (D1–D24): 443.405 filas, 33 columnas. No sobrescribe `train.pkl` |
| Salida | `02_datos/03_Entrenamiento/parametros_calidad.pkl` | 15 parámetros aprendidos del entrenamiento (medianas, deciles, tablas, categorías, reglas) |

## Qué se hace
1. **Importar librerías.** Se configuran librerías, tablas y gráficos.
2. **Cargar los datos.** 443.469 préstamos y 34 columnas; tasa de impago global del 14,8 %. La validación no se mira.
3. **Visión general.** 22 columnas numéricas, 9 de texto y 2 fechas; 7 variables con nulos; sin identificadores duplicados. Incluye el diccionario de las 34 columnas (3.1).
4. **Nulos.** Se mide qué significa cada nulo y si se relaciona con el impago (4.1–4.3). Variable a variable se aplican D1–D6 (4.4). Tras ellas, 0 nulos.
   - Los nulos de `empleo` y `antigüedad_empleo` impagan unos 6 puntos más. Los de tarjetas e hipotecas se concentran en enero–marzo de 2012 (el dato no se recogía).
5. **Categorías y textos.** Se revisan las 10 columnas de texto o categóricas y el FICO (D7–D15). Plazo a número, orden fijo en categorías, vivienda limitada a 3 valores (−64 préstamos), finalidades reagrupadas y una sola variable `fico`. Quedan 443.405 préstamos y 33 columnas.
6. **Valores atípicos.** No hay errores evidentes salvo los de interés y cuota (D16–D24). Los extremos reales se conservan. Se descubren 165 préstamos con interés y cuota sobrescritos tras una renegociación y se reconstruyen.
7. **Guardar el conjunto corregido.** Se guardan `train_calidad.pkl` y `parametros_calidad.pkl` y se comprueba al releerlos que son idénticos.
8. **Resumen y próximos pasos.** Resume los tres bloques y deja las tareas pendientes para los notebooks 03 (EDA) y 04 (transformación).

## Decisiones
| # | Decisión | Por qué | Alternativa descartada |
|---|---|---|---|
| D1 | `num_meses_desde_ult_retraso` a 4 tramos: `sin_retraso`, `0-24`, `25-48`, `>48` | El nulo significa "sin retraso registrado" (más del 99 % de los nulos tiene 0 retrasos en 2 años) y ningún número lo representa | Imputar 0 (diría que hubo un retraso este mes) o un valor extremo como 999 |
| D2 | Nulo de `antigüedad_empleo` a la categoría `sin_empleo_declarado` | Es un perfil propio con el mayor impago (20,6 %) | Imputar con la moda `10+ years` (la categoría de menos riesgo para el grupo de más riesgo); número 0–10 más indicador de nulo |
| D3 | Sustituir `empleo` por `sector_empleo` (13 sectores, `otros`, `sin_empleo_declarado`) con reglas de palabras clave | El texto libre es inutilizable, pero el sector aporta señal incluso dentro del mismo rating (impago del 9,6 % al 20,3 %) | Sectores propios para servicios sociales o marketing; asignar las empresas a su sector (se quedan en `otros`) |
| D4 | Nulos de `porc_uso_revolving` (221) a la mediana de entrenamiento (55,2 %) | El uso no se puede calcular y la mediana no inventa un riesgo bajo ni extremo | Saldo 0 a 0 %; 100 %; imputar con indicador; eliminar los 221 préstamos (sesgo de selección) |
| D5 | `porc_uso_tarjetas` y `porc_tarjetas_75p`: reglas lógicas y mediana de su decil de `porc_uso_revolving`. Sin indicador de nulo | Correlación 0,82 y 0,71 con el revolving; el error baja a la mitad; tabla de 10 filas en la API | Más tramos, regresión o gradient boosting (mejora mínima); empezar en abril de 2012 (se pierde el 1,3 % de datos) |
| D6 | `num_hipotecas` a la mediana de entrenamiento por `vivienda` (reserva: mediana global, 1). Sin indicador | El nulo depende de la fecha (ene–abr 2012), no del cliente; los aciertos exactos pasan del 16 % al 48 % | Mediana o media global; vivienda × líneas × ingresos; gradient boosting; eliminar ene–mar 2012 |
| D7 | `num_cuotas` de texto a número (36 / 60) | Es un plazo numérico con mucha señal (14,0 % frente a 25,7 % de impago) | Dejarlo como texto con espacio delante |
| D8 | `antigüedad_empleo` como categoría con orden fijo (12 valores) | Tablas y gráficos legibles; el orden alfabético confunde | Número 0–10 (habría que inventar un valor para `sin_empleo_declarado`) |
| D9 | `ingresos_verificados` sin cambios | Está limpia y las 3 categorías tienen riesgos distintos | Agruparlas (perdería información) |
| D10 | Eliminar `NONE`, `OTHER` y `ANY` de `vivienda` (64 préstamos) | Opciones que Lending Club retiró, con muy pocos casos; es regla de alcance | Agruparlas con `RENT` o en `OTRA` (meterían ruido) |
| D11 | `wedding` a `major_purchase`; `renewable_energy` y `educational` a `other` (11 finalidades) | Categorías residuales o retiradas, agrupadas según riesgo y significado | Mandar todas a `other` (el impago de `wedding` es 13,6 % frente al 17,2 % de `other`) |
| D12 | `rating` y `subrating` ordenados; ni ellos ni `tipo_interes` ni `imp_cuota` serán entrada del modelo principal | Son la evaluación de Lending Club (correlación 0,98 con el interés) y un cliente nuevo no los tiene; sirven de comparación | Usarlos como entrada (solo suman ~0,015 de AUC) |
| D13 | `fico_min` y `fico_max` a una sola variable `fico` (punto medio) | Redundantes al 100 % (correlación 1,0000) | Quedarse solo con `fico_min` (equivalente) |
| D14 | `estado` sin cambios | Es la variable objetivo; se transforma en el notebook 04 | Ninguna |
| D15 | Fechas sin cambios | Son correctas y coherentes; la antigüedad del historial se calcula en el notebook 04 | Ninguna |
| D16 | Solo se corrigen errores; los extremos reales se conservan | Los extremos son información y su transformación depende del modelo (notebook 04) | Recortarlos aquí (se borraría la señal para todos los modelos) |
| D17 | `ingresos` sin cambios | Extremos verificados (96 % del 0,1 % superior) y con señal ordenada | Recortar o eliminar los extremos |
| D18 | `saldo_revolving` sin cambios | Extremos coherentes con los ingresos; saldo 0 posible | Recortar o eliminar los extremos |
| D19 | Porcentajes de uso sin cambios | Superar el 100 % es real y marca riesgo (impago del 19–22 %) | Recortar ya (se hará en el 04 si el modelo es lineal) |
| D20 | `dti` sin cambios | Entre 0 y 39,99, dentro del límite de Lending Club (40) | Ninguna |
| D21 | `principal` y `fico` sin cambios | Dentro de los límites de Lending Club | Ninguna |
| D22 | Recuentos del historial sin cambios | Coherentes entre sí y con señal | Recortar o agrupar ya (queda para el 04) |
| D23 | Reconstruir `tipo_interes` e `imp_cuota` de 165 préstamos | Valores sobrescritos tras una renegociación (*leakage*); su resultado es real y la reconstrucción acierta el 95,1 % | Dejarlos tal cual (valores falsos) o eliminarlos (se pierden resultados reales y se sesga la PD) |
| D24 | `imp_amortizado` e `imp_recuperado` sin cambios | Son coherentes; la LGD se limita a 0–1 en el notebook 04 | Corregir ya los ~390 impagos con pérdida negativa |
| D25 | Guardar en `train_calidad.pkl` y `parametros_calidad.pkl` | Reproducibilidad (no se pisa `train.pkl`) y mismo tratamiento en validación y API | Sobrescribir `train.pkl`; recalcular los parámetros con validación (filtraría información) |

## Resultados clave
- **Tamaño final:** 443.405 préstamos (de 443.469), 33 columnas, 0 nulos; impago global del 14,8 %.
- **Nulos:** 7 variables. `num_meses_desde_ult_retraso` tiene el 51,1 %; `empleo`, el 6,5 %; `antigüedad_empleo`, el 5,7 %.
- **Sin empleo declarado:** 25.320 préstamos con impago del 20,6 %. Ingresos medianos de 42.000 $ frente a 63.000 $.
- **Sector de empleo:** impago del 9,6 % (tecnología) al 20,3 % (sin empleo declarado). La cobertura de las reglas sube del 73,3 % al 74,0 % en la segunda versión.
- **Tarjetas:** 9.864 y 9.848 nulos, concentrados en enero–marzo de 2012. La mediana por decil reduce el error de 22,7 a 10,5 pp y de 30,4 a 18,8 pp.
- **Hipotecas:** 5.328 nulos (5.286 en ene–mar 2012 y 42 en abril). El impago baja del 17,4 % (0 hipotecas) al 11,2 % (5 o más).
- **Plazo:** impago del 14,0 % a 36 meses y del 25,7 % a 60 meses; el 93 % de los préstamos es a 36.
- **Finalidad:** el impago va del 12,2 % (`credit_card`) al 24,1 % (`small_business`).
- **Rating:** el impago sube del 5,4 % (A) al 38,8 % (G).
- **AUC (modelo rápido de gradient boosting):** subrating de Lending Club 0,669; datos del cliente y del préstamo 0,680; con interés y cuota 0,692; con subrating también 0,694.
- **AUC (logística con subrating):** 0,6691; con vivienda e hipotecas 0,6727; las variables de uso del crédito apenas añaden (0,6695 a 0,6699).
- **FICO:** del 19,1 % de impago (660–679) al 5,3 % (760 o más).
- **Ingresos:** el impago baja del 20,8 % al 9,9 % al subir los ingresos.
- **DTI:** el impago sube del 10,9 % (DTI menor de 5) al 22,6 % (DTI de 35 a 40).
- **Uso por encima del 100 %:** 1.560 préstamos en revolving (impago del 19,2 %) y 8.007 en tarjetas (22,2 %).
- **Préstamos modificados:** 165 (113 al 6,00 % con impago del 3,5 %, y 52 con cuota incoherente). Pagaron más intereses de los que permiten el tipo y la cuota publicados (mediana de la ratio 1,28 en los del 6 %).
- **Reconstrucción del interés:** acierta el 95,1 % en préstamos coherentes, con un error medio de 0,021 puntos.
- **LGD:** de 65.838 impagos, 13.411 no recuperaron nada y unos 390 recuperaron más que el principal.

## Limitaciones y puntos a vigilar
- **Reconstrucción de interés y cuota (D23):** que fueron renegociados es una deducción a partir de los datos; Lending Club no documentó estas modificaciones.
- **Nulos con pocos casos (D4):** los 221 nulos de `porc_uso_revolving` tienen intervalos de confianza muy anchos, así que no se puede afirmar que impaguen más. Se imputa con la mediana por coherencia.
- **Sector de empleo (D3):** alrededor del 25 % de quienes declaran empleo queda en `otros`. La profesión puede estar correlacionada con características protegidas, y hay que vigilar que no actúe como su sustituto.
- **Pendiente para el EDA (03):**
  - `tramo_ult_retraso` parece poco predictiva (impago del 14,5 % al 15,5 %).
  - Agrupar de 1 a 9 años en `antigüedad_empleo`.
  - Las tres variables de uso del crédito son casi redundantes.
  - Valorar `ingresos_verificados`: refleja una decisión de Lending Club (verificaba más a los ratings peores).
  - Decidir si el modelo usa el rating de Lending Club.
- **Pendiente para la transformación (04):** logaritmo de `ingresos` y `saldo_revolving`; recorte al percentil 99,9 de porcentajes y recuentos si el modelo es lineal; LGD limitada a 0–1. Hay valores de hasta 892 % de uso y 47 hipotecas.
- **Cifras que el propio notebook da con pequeñas diferencias:** impagos con pérdida negativa, 391 (6.2) frente a 392 (6.3.8); y mínimo del conjunto cargado frente al final (443.469 frente a 443.405, por D10).

## Relación con el resto del proyecto
- **Viene de:** el notebook 01, que generó `train.pkl`. D6 y D8 del 01 (columnas posteriores a la concesión; solo solicitudes individuales) justifican parte del trabajo aquí.
- **Lo usa:** el notebook 03 (EDA) parte de `train_calidad.pkl` y de las decisiones pendientes. En él, `ingresos_verificados` pasa al grupo *benchmark* (D2 del 03). El notebook 04 construye la antigüedad del historial, las transformaciones y los objetivos PD, EAD y LGD. Los notebooks 05–07 modelan con el rating de Lending Club solo como comparación.
- **Validación y API:** deben recibir las mismas correcciones en el mismo orden (D1–D6, después D7–D24) con los parámetros de `parametros_calidad.pkl`, sin recalcular nada.
- **Actualización (13/10/2026):** desde esta fecha las correcciones de este notebook (imputaciones, sector de empleo a partir del título, agrupación de finalidades, plazo como número, FICO como punto medio, población de viviendas) están también en `04_scripts/preparacion.py`. Ese script las aplica dentro del pipeline de los modelos, con las medianas aprendidas en `fit()`, para usarlas igual en entrenamiento, validación y la API.
