# Informe · 01 · Importación de datos

**Notebook:** `03_notebooks/es/01_ImportacionDatos.ipynb` · **Fecha del informe:** 13/10/2026

## Resumen
Este notebook carga los préstamos de Lending Club, se queda solo con los que sirven para modelizar el riesgo de crédito (PD, EAD y LGD) y los divide en entrenamiento (70 %) y validación (30 %). El archivo original tiene 2.260.701 filas y 151 columnas (1,68 GB). Tras aplicar 12 decisiones quedan 633.528 préstamos (el 28 % del original) y 34 columnas. De ellos, 443.469 son de entrenamiento y 190.059 de validación, con la misma tasa de impago (14,8 %) en ambos.

## Entradas y salidas
| Tipo | Archivo | Contenido |
|---|---|---|
| Entrada | `02_datos/00_Originales/accepted_2007_to_2018Q4.csv` | Préstamos concedidos de 2007 a 2018: 2.260.701 filas, 151 columnas, 1,68 GB. |
| Salida | `02_datos/03_Entrenamiento/train.pkl` | Conjunto de entrenamiento: 443.469 filas. |
| Salida | `02_datos/02_Validacion/validacion.pkl` | Conjunto de validación: 190.059 filas. |

## Qué se hace
1. **Librerías y configuración:** se importan las librerías y se definen rutas y parámetros de todas las decisiones en un único sitio.
2. **Fuente de datos (D1):** se comprueba el archivo y se lee solo la cabecera. Pesa 1,68 GB y tiene 151 columnas.
3. **Lectura por bloques (D2):** se define una función que lee el CSV en bloques de 200.000 filas. La primera lectura carga 4 columnas de las 2.260.701 filas.
4. **Filas de totales (D3):** hay 33 filas sin estado que no son préstamos (textos "Total amount funded in policy code…"). Se eliminan y quedan 2.260.668.
5. **Estado del préstamo (D4):** Fully Paid 47,6 %, Current 38,9 %, Charged Off 11,9 %; los retrasos suman en torno al 1,5 %. Se conservan solo los terminados: 1.348.059 (59,6 %).
6. **Cohortes (D5):** se calcula el % de terminados por plazo y año. A 36 meses están completas hasta 2015 y a 60 meses hasta 2013. Quedan 13 cohortes válidas y 676.302 préstamos.
7. **Selección de columnas (D6):** se clasifican las 151 columnas por su papel y se eligen 37. Se descartan 36 por *leakage*, 53 por parsimonia, 16 del segundo solicitante, 5 redundantes y 4 de texto o geografía.
8. **Año de inicio (D7):** `mort_acc`, `bc_util` y `percent_bc_gt_75` están vacías al 100 % de 2007 a 2011. Se pierden 42.535 préstamos (6,3 %) y quedan 633.767.
9. **Tipo de solicitud (D8):** 633.528 son individuales y solo 239 conjuntas. Se conservan las individuales.
10. **Columnas casi vacías (D9):** `member_id` (100 % de nulos) y `desc` (85 %) se eliminan; no hay identificadores duplicados.
11. **Nombres en español (D10):** se renombran y ordenan las columnas por su papel. Quedan 34 columnas.
12. **Tipos de datos (D11):** solo se convierten las dos fechas. Variables como `num_cuotas` o `antigüedad_empleo` siguen siendo texto.
13. **Partición (D12):** 70/30 estratificada por impago y con `random_state=42`. Salen 443.469 y 190.059 préstamos, ambos con 14,8 % de impago.
14. **Guardar los conjuntos:** se guardan `train.pkl` y `validacion.pkl` en formato *pickle*, que conserva los tipos de pandas.
15. **Embudo de filas:** resumen de las filas que quedan tras cada decisión, con su % sobre el original.
16. **Próximos pasos:** se anuncian los notebooks 02 a 08.

## Decisiones
| # | Decisión | Por qué | Alternativa descartada |
|---|---|---|---|
| D1 | Usar el dataset público de Lending Club (Kaggle, CC0) sin versionarlo en Git. | Licencia libre y datos reales, pero 1,7 GB no caben en un repositorio. | Usar el archivo de solicitudes rechazadas: no tiene resultado de pago y no sirve para PD, EAD ni LGD. |
| D2 | Leer el CSV por bloques de 200.000 filas, con solo las columnas necesarias y filtrando cada bloque. | El archivo completo ocupa varios GB de RAM y no cabe en un equipo normal. | Cargarlo entero (falla por memoria) o convertirlo antes a Parquet (requiere librerías extra). |
| D3 | Eliminar las filas sin `loan_status`. | Son líneas de totales que quedaron al unir los CSV trimestrales, no préstamos. | No se menciona ninguna. |
| D4 | Conservar solo los préstamos terminados (Fully Paid, Charged Off y sus variantes). | Un préstamo en curso puede acabar de cualquier forma y etiquetarlo como "no impago" daría etiquetas erróneas. | Contar `Late (31-120 days)` y `Default` como impago, que mezclaría préstamos sin resultado final conocido. |
| D5 | Usar solo cohortes con al menos un 95 % de préstamos terminados. | En cohortes recientes un impago llega antes que el último pago normal, lo que sesga la tasa de impago al alza. | Usar todos los terminados (sesgo de selección) o modelos de supervivencia (más complejos y fuera de alcance). |
| D6 | Conservar 37 columnas: 2 identificadores, 30 de originación, 3 de objetivo y 2 auxiliares. | Solo pueden entrar variables conocidas al conceder el préstamo; se busca un conjunto pequeño e interpretable que se pueda pedir en la demo. | Incluir geografía (`addr_state`, `zip_code`), que añade muchas categorías y puede sustituir a características protegidas. |
| D7 | Conservar solo los préstamos concedidos desde 2012. | Hay nulos estructurales en tres variables hasta 2011; imputarlos sería inventar valores. | Conservar 2007–2011 y eliminar esas tres variables, que perdería variables útiles para el resto de años. |
| D8 | Conservar solo las solicitudes individuales. | En las conjuntas, ingresos y DTI relevantes son los combinados, que no se usan; son solo 239. | No se menciona ninguna. |
| D9 | Eliminar las columnas con más de un 80 % de nulos (`member_id` y `desc`). | No aportan información fiable. `mths_since_last_delinq` (51 % de nulos) se conserva porque el nulo tiene significado. | No se menciona ninguna. |
| D10 | Renombrar las columnas al español. | Coherencia con los notebooks 02–08 y con la API de AWS, que recibe esos nombres del formulario. | Mantener los nombres en inglés, que obligaría a traducirlos en cada paso hasta la API. |
| D11 | No limpiar valores aquí; solo convertir las dos fechas. | Cada notebook tiene una única responsabilidad y la calidad de datos se trata en el 02. | No se menciona ninguna. |
| D12 | Partición 70/30 estratificada por impago con `random_state=42`. | La estratificación da la misma tasa de impago en ambos conjuntos y la semilla hace la partición reproducible. | Validación *out-of-time*: los préstamos a 60 meses solo llegan hasta 2013 y la validación no sería comparable. Puede plantearse como análisis adicional. |

## Resultados clave
| Paso | Filas | % sobre el original |
|---|---|---|
| Archivo original | 2.260.701 | 100 % |
| Sin filas de totales (D3) | 2.260.668 | 99,999 % |
| Solo terminados (D4) | 1.348.059 | 59,630 % |
| Cohortes con ≥ 95 % terminados (D5) | 676.302 | 29,916 % |
| Desde 2012 (D7) | 633.767 | 28,034 % |
| Solo individuales (D8) | 633.528 | 28,024 % |
| Entrenamiento (70 %) | 443.469 | 19,616 % |
| Validación (30 %) | 190.059 | 8,407 % |

- Las mayores pérdidas vienen de D4 (préstamos en curso) y D5 (cohortes incompletas).
- Cohortes válidas: 13 (36 meses de 2007 a 2015 y 60 meses de 2010 a 2013).
- Sesgo de las cohortes recientes: a 60 meses, la cohorte de 2015 tiene un 67 % de terminados y una tasa de impago aparente del 36 %, frente al 25 % de la de 2013.
- Columnas finales: 34 (identificador, 29 de originación, 3 de objetivo y la fecha de concesión). Con 37 columnas y 676.302 préstamos la tabla ocupaba unos 721 MB.
- Tasa de impago: 14,8 % en entrenamiento y en validación.

## Limitaciones y puntos a vigilar
- **Leakage:** las 36 columnas posteriores a la concesión se descartan y las 3 de objetivo nunca se usarán como entrada. Conviene revisar la clasificación completa para comprobar que no se cuela ninguna.
- **Sin validación temporal:** la partición es aleatoria. La validación *out-of-time* no es comparable porque los préstamos a 60 meses solo llegan hasta 2013.
- **Cobertura temporal:** al empezar en 2012 (D7) y usar solo cohortes completas (D5), los préstamos concedidos en 2016–2018 quedan fuera. Solo se conserva el 28 % del archivo original.
- **Calidad sin tratar:** textos como `" 36 months"` o `"10+ years"`, los nulos y los valores anómalos se dejan para el notebook 02. `mths_since_last_delinq` tiene alrededor del 51 % de nulos con significado propio.
- **Nombre engañoso:** `id_cliente` identifica el préstamo, no al cliente.

## Relación con el resto del proyecto
Es el primer notebook: parte del CSV original de Lending Club y no depende de ningún otro. Entrega `train.pkl` y `validacion.pkl`.

- **02 · Calidad de datos:** convertirá a número los textos, tratará los nulos con significado y revisará valores anómalos.
- **03 · EDA:** relación de cada variable con el impago.
- **04 · Transformación:** calculará la antigüedad del historial (`fecha_concesion` − `fecha_primer_credito`) y construirá los tres objetivos a partir de `estado`, `imp_amortizado` e `imp_recuperado`.
- **05–07 · Modelos:** PD (clasificación), EAD y LGD (regresión).
- **08 · Validación final:** evalúa los tres modelos con `validacion.pkl`, que no se toca hasta entonces. Las variables del modelo final son las que se pedirán en el formulario de la demo.
