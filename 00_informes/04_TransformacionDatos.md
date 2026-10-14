# Informe · 04 · Transformación de datos

**Notebook:** `03_notebooks/es/04_TransformacionDatos.ipynb` · **Fecha del informe:** 13/10/2026

## Resumen
Este notebook deja los datos listos para entrenar los tres modelos. Crea dos variables nuevas, construye los objetivos de PD, EAD y LGD, decide los recortes y logaritmos de las variables numéricas y fija cómo se codifican y escalan. Parte de 443.405 préstamos de entrenamiento con una tasa de impago del 14,8 %. De los 65.838 impagados salen una EAD media de 0,59 y una LGD media de 0,87. Sin modelo, el error de referencia (MAE) es 0,198 para la EAD y 0,092 para la LGD. Todo se reúne en la función `transformar()` y en tres tablones, uno por modelo.

## Entradas y salidas
| Tipo | Archivo | Contenido |
|---|---|---|
| Entrada | `train_eda.pkl` (carpeta `02_datos/03_Entrenamiento/`) | Conjunto de entrenamiento que guardó el notebook 03: 443.405 préstamos y 25 columnas. No se modifica. |
| Entrada | Parámetros del notebook 03 | Listas de variables por papel: candidatas categóricas, numéricas, nuevas y de *benchmark*. |
| Salida | `tablon_pd.pkl` | Tablón de PD: 443.405 filas y 19 columnas. |
| Salida | `tablon_ead.pkl` | Tablón de EAD: 65.838 filas y 19 columnas. |
| Salida | `tablon_lgd.pkl` | Tablón de LGD: 65.836 filas y 19 columnas. |
| Salida | `parametros_transformacion.pkl` | 6 elementos: límites de recorte, variables con logaritmo y listas de variables de cada modelo. |

## Qué se hace
1. **Importar librerías:** se importan sin errores.
2. **Cargar los datos:** 443.405 préstamos y 25 columnas. Hay 15 variables candidatas (4 categóricas, 9 numéricas y 2 nuevas) y 5 de *benchmark*.
3. **Variables nuevas (D1):** se crean `ratio_principal_ingresos` (mediana 19 % de los ingresos anuales, máximo 71 %) y `antiguedad_historial` (mediana 15 años, de 3 a 71). No hay nulos, infinitos ni negativos.
4. **Objetivos:**
   - **4.1 PD (D2):** 65.838 impagos (14,8 %) frente a 377.567 devueltos.
   - **4.2 EAD (D3):** todas las EAD están entre 0 y 1. Media 0,59 y mediana 0,62. Con 60 cuotas queda más deuda pendiente (mediana 0,75 frente a 0,61 con 36).
   - **4.3 LGD (D4):** 395 préstamos recuperaron más de lo debido y 2 no tienen deuda pendiente. En unos 13.400 impagos no se recuperó nada. LGD media 0,87.
   - **4.4 Recuperaciones por año (D5):** los impagados sin recuperación pasan del 2 % al 28 %, pero la LGD media se mantiene en 0,87–0,89. La hipótesis de recuperaciones incompletas no se confirma.
   - **4.5 Referencias de EAD y LGD (D6):** MAE de predecir siempre la media, la mediana o la mediana de cada plazo.
5. **Transformaciones numéricas:**
   - **5.1 Recortes (D7):** se calcula el límite de cada variable con cola larga y se recortan unos 400–450 préstamos por variable (57 en el ratio, 2.338 en consultas).
   - **5.2 Logaritmos (D8):** se compara la linealidad y el *log-loss* con y sin `log1p`. Mejora ingresos, hipotecas y antigüedad del historial, y empeora el saldo revolving y el uso de tarjetas.
6. **Codificación de las categóricas (D9):** *one-hot* da AUC 0,6685 frente a 0,6666 del WoE. Las 4 variables suman 33 categorías y 29 columnas.
7. **Escalado (D10):** se decide estandarizar dentro del *pipeline*, porque la regularización L1 lo necesita.
8. **Función reutilizable (D11):** `transformar(datos, parametros)` reúne D1, D7 y D8 y se comprueba que reproduce exactamente los pasos anteriores.
9. **Tablones de modelización (D12):** se construyen los tres tablones sin nulos y con los objetivos en su rango.
10. **Guardar (D13):** se guardan los tres tablones y los parámetros, y se comprueba que al releerlos se obtiene lo mismo.
11. **Resumen y próximos pasos:** balance de decisiones, hallazgos y siguientes notebooks.

## Decisiones
| # | Decisión | Por qué | Alternativa descartada |
|---|---|---|---|
| D1 | Crear `ratio_principal_ingresos` y `antiguedad_historial` antes de recortes y logaritmos. | Se decidió en el EDA (D10 y D18 del 03); se calculan con los valores reales de importe, ingresos y fechas. | No se menciona ninguna. |
| D2 | `impago` = 1 si `Charged Off` y 0 si `Fully Paid`. | Solo quedan préstamos terminados, sin estados intermedios que obliguen a elegir una definición. | No se menciona ninguna. |
| D3 | EAD = (principal − amortizado) / principal, solo para impagados; se conservan los 2 casos con EAD = 0. | Como fracción no depende del tamaño del préstamo y se combina directamente en PD × EAD × LGD × importe. | EAD en dólares. |
| D4 | LGD = 1 − recuperado / pendiente, limitada a 0–1; se excluyen los 2 préstamos sin deuda pendiente. | Una pérdida negativa no tiene sentido como objetivo y los extremos (hasta 35 veces la deuda) distorsionarían el modelo. Con 0 de deuda la LGD no está definida. | Eliminar los 395 casos con recuperación mayor que la deuda: sesgaría la LGD al alza. |
| D5 | Usar los impagados de todos los años (2012–2015) para la LGD. | La LGD media es estable entre años y quedarse con 2012–2013 reduciría los datos a un tercio. | Usar solo 2012–2013. |
| D6 | Usar la mediana de cada plazo como *benchmark* de EAD (MAE ≈ 0,198) y LGD (MAE ≈ 0,092). | Es la predicción más sencilla que usa algo de información y el listón que deben superar los modelos. | Predecir siempre la media o la mediana global (MAE 0,202 y 0,201 en EAD; 0,094 y 0,093 en LGD). |
| D7 | Recortar por arriba al percentil 99,9 de entrenamiento siete variables; `num_consultas_6meses` en 4. | Los extremos son clientes reales y recortados siguen como "muy alto" sin dominar la regresión logística. | Eliminar los extremos; recortar al percentil 99. |
| D8 | `log1p` en `ingresos`, `num_hipotecas` y `antiguedad_historial`; el resto en escala original recortada. | Solo en esas tres mejora la linealidad y el ajuste; en el saldo revolving lo empeora. | Aplicar el logaritmo a todas las variables asimétricas sin comprobarlo. |
| D9 | Codificar las categóricas con *one-hot* dentro del *pipeline* de los notebooks 05–07. | Mejor AUC (0,6685 frente a 0,6666) y un coeficiente interpretable por categoría. Con `handle_unknown='ignore'` una categoría nueva no rompe la API. | WoE: exige guardar tablas aparte y calcularlas dentro de cada partición. |
| D10 | Estandarizar dentro del *pipeline* de los notebooks 05–07 (`StandardScaler`). | La L1 lo necesita; la media y la desviación se aprenden solo con el entrenamiento de cada partición para no filtrar información. | Estandarizar en este notebook con todo el entrenamiento. |
| D11 | Reunir D1, D7 y D8 en `transformar(datos, parametros)`. | Un único código para entrenamiento, validación y API evita pequeñas diferencias que cambien las predicciones. | Copiar el código en cada sitio. |
| D12 | Un tablón por modelo: PD (todos), EAD (impagados) y LGD (impagados con deuda pendiente). | Cada modelo tiene población y objetivo distintos; así no se filtra en cada notebook. | No se menciona ninguna. |
| D13 | Guardar los tres tablones y `parametros_transformacion.pkl`. | Reproducibilidad y mismo tratamiento en validación y en la API. | No se menciona ninguna. |

## Resultados clave
| Objetivo | Población | Media | Referencia sin modelo (MAE) |
|---|---|---|---|
| PD | 443.405 préstamos | 14,8 % de impago | no aplica |
| EAD | 65.838 impagados | 0,593 | 0,198 |
| LGD | 65.836 impagados | 0,869 | 0,092 |

- **PD:** 65.838 impagos frente a 377.567 devueltos.
- **EAD:** solo 2 casos con EAD = 0. Mediana 0,75 con 60 cuotas y 0,61 con 36.
- **LGD:** 395 préstamos (0,6 %) con recuperación mayor que la deuda y unos 13.400 sin ninguna recuperación. Mediana 0,90.
- **Recuperaciones por año:** % sin recuperación 2,2 % (2012), 8,4 % (2013), 24,5 % (2014) y 27,9 % (2015); LGD media 0,886, 0,867, 0,865 y 0,869.
- **Recortes:** por ejemplo, ingresos con máximo de 8.900.060 y límite de 550.000; saldo revolving con máximo de 2.904.836 y límite de unos 258.000.
- **Codificación:** AUC 0,6685 (*one-hot*) frente a 0,6666 (WoE).
- **Versión anterior del proyecto (otros datos):** MAE de 0,160 (EAD) y 0,089 (LGD).

## Limitaciones y puntos a vigilar
- **LGD difícil de justificar:** casi todas las LGD están entre 0,8 y 1 y sin modelo el error ya es 0,092. Si el modelo no mejora claramente, bastaría una LGD fija por plazo.
- **Dos "modos" en la LGD:** recuperar 0 o recuperar algo. Un modelo de regresión normal predecirá valores cercanos a la media, así que hay que evaluarlo con cuidado en el notebook 07.
- **Explicación inferida:** que cambió la forma de recuperar (por ejemplo, vendiendo deudas a agencias de cobro) es una inferencia; el dataset no lo documenta. Tampoco se sabe por qué hay recuperaciones mayores que la deuda (¿intereses y comisiones o errores de registro?).
- **Hallazgos que corrigen al EDA:** D5 corrige la hipótesis de D21 del notebook 03, y D7 y D8 cambian D13 y D14 del 03 (límite de hipotecas y logaritmo del saldo revolving).
- **Aprendizaje solo con entrenamiento:** los límites y parámetros se calculan solo con entrenamiento y se aplican sin recalcular. Un valor fuera de rango en la API se recorta con esos mismos límites.

## Relación con el resto del proyecto
**De dónde viene:** del conjunto de entrenamiento y los parámetros guardados por el notebook 03 (que a su vez usa las correcciones del 02). Tiene 443.405 préstamos, frente a los 443.469 de entrenamiento que dejó el notebook 01: los 64 de diferencia son los préstamos con vivienda NONE, OTHER o ANY que el notebook 02 deja fuera de la población (D10).

**Qué usa el siguiente:** el notebook 05 (PD) usa un *pipeline* con `OneHotEncoder`, `StandardScaler` y regresión logística L1, y se compara con un modelo de árboles y con y sin `sector_empleo`. Su *benchmark* es el subrating de Lending Club (AUC ≈ 0,669). Al final ganó el *gradient boosting* (AUC 0,6767), no la logística (0,6685). Los notebooks 06 y 07 (EAD y LGD) deben superar a la mediana por plazo (MAE 0,198 y 0,092).

**Nota de actualización (13/10/2026):** desde esta fecha los notebooks 05–07 ya no leen los tablones que guarda este notebook. Las mismas transformaciones (y las correcciones del 02 y la agrupación del 03) están en `04_scripts/preparacion.py`, en la clase `PreparacionScoring`, que aprende las medianas y los límites de recorte en `fit()`. Se aplican dentro del pipeline de cada modelo. Se comprobó que da 0 diferencias con `tablon_pd.pkl`. Los tablones quedan como referencia. Esto sustituye lo que dice D13 (los notebooks 05–07 leen su tablón) y el "próximo paso" de D11 (pasar la función a un módulo de `04_scripts/`).
