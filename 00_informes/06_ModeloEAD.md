# Informe · 06 · Modelo de EAD (exposición en el impago)

**Notebook:** `03_notebooks/es/06_ModeloEAD.ipynb` · **Fecha del informe:** 13/10/2026

## Resumen

Este notebook busca el mejor modelo para estimar la EAD, la fracción del importe que quedaba por devolver cuando el cliente dejó de pagar (media 0,5929). Se entrena con los 65.838 préstamos impagados y compara predicciones sin modelo, Ridge y *gradient boosting*. Se elige Ridge con `alpha` 100: RMSE 0,2352, MAE 0,1963, sin sesgo y R² 0,046. Mejora solo un 2,3 % el RMSE de predecir siempre la media, porque las variables de la solicitud dicen poco de la deuda que quedará pendiente. Aun así ordena bien y sin sesgo. El modelo se guarda en `05_modelos/modelo_ead.pkl`.

## Entradas y salidas

| Tipo | Archivo | Contenido |
|---|---|---|
| Entrada | `train.pkl` (leído con `preparar_conjunto()` de `04_scripts/preparacion.py`) | Conjunto de entrenamiento; se quedan solo los 65.838 impagados, con 19 columnas originales |
| Entrada | `04_scripts/preparacion.py` | Clase `PreparacionScoring`, que va dentro del *pipeline* |
| Salida | `05_modelos/modelo_ead.pkl` | Paquete con el *pipeline* Ridge (`alpha` 100), sus metadatos y las métricas, guardado con `cloudpickle` |

## Qué se hace

1. **Importar librerías.** Igual que en el notebook 05; se muestra la versión de `scikit-learn` (1.9.1), que se guarda con el modelo.
2. **Cargar los datos.** 65.838 impagados y 16 variables tras la preparación (4 categóricas y 12 numéricas): las 15 de la PD más el importe del préstamo (`principal`). La EAD tiene media 0,5929, mediana 0,6236 y desviación típica 0,2408.
3. **Listón: predicciones sin modelo (D1).** Se comparan media y mediana, globales y por plazo. La mediana gana en MAE y la media gana en RMSE. El listón es la media de cada plazo: RMSE 0,2377, sin sesgo.
4. **Métrica: ¿media o mediana? (D2).** La pérdida de la cartera exige acertar la EAD en media, así que se elige por RMSE y se vigilan el MAE y el sesgo.
5. **Pipeline y validación cruzada.** El mismo *pipeline* y las mismas particiones (3, semilla 42) que en el notebook 05, con caché.
6. **Búsqueda del mejor modelo (D3).** 31 combinaciones × 3 particiones = 93 entrenamientos.
   - 6.1: los 11 primeros son *gradient boosting* con pérdida cuadrática (RMSE 0,2347–0,2351); Ridge queda justo detrás (0,2352); los de pérdida absoluta tienen peor RMSE (≈ 0,237) pero el mejor MAE (0,1945).
   - 6.2: en el gráfico RMSE frente a MAE hay dos grupos y ningún modelo gana en los dos.
7. **Elección del modelo (D4).** Con la regla de un error estándar el umbral es 0,2352 y hay 15 empatados (11 *gradient boosting* y 4 Ridge). Se elige Ridge con `alpha` 100.
8. **Análisis del modelo elegido.** Con predicciones fuera de partición:
   - 8.1: el elegido baja el RMSE de 0,2377 a 0,2352 sin sesgo, pero explica solo el 4,6 % de la variación.
   - 8.2: el mejor de la búsqueda ordena bien por deciles (de 0,51 a 0,71 de EAD real).
   - 8.3: el plazo es con diferencia la variable más importante.
9. **Entrenar y guardar el modelo final (D5).** Se entrena con todos los préstamos y se guarda con `cloudpickle`.
10. **Resumen y próximos pasos.** Recoge los hallazgos y enlaza con LGD y la validación final.

## Decisiones

| # | Decisión | Por qué | Alternativa descartada |
|---|---|---|---|
| D1 | El listón es la media de cada plazo (RMSE 0,2377, sesgo 0). | Es la predicción sin modelo más exigente y no tiene sesgo; un modelo con 16 variables tiene que mejorarla. | La mediana: gana en MAE (0,198 la de cada plazo) pero tiene sesgo de +0,03; el MAE se sigue mostrando como referencia. |
| D2 | Elegir por RMSE; vigilar MAE y sesgo. | La pérdida esperada necesita la EAD media, y el RMSE premia acertar la media. | Elegir por MAE: llevaría a modelos que predicen la mediana, como el *boosting* con pérdida absoluta. |
| D3 | Una búsqueda con 2 modelos sin variables, 5 Ridge y 24 *gradient boosting*. | Ridge evita coeficientes inestables con tantas columnas *one-hot*; los modelos sin variables compiten con las mismas reglas. | Regresión beta o logística fraccional (`scikit-learn` no las incluye) y modelo en dos etapas (en la EAD casi no hace falta: 311 préstamos en 1 y 14 en 0 de 65.838). |
| D4 | Elegir Ridge con `alpha` 100. | Su RMSE está dentro del error estándar del mejor *boosting* y es el más sencillo de los empatados; es lineal y pesa menos en la API. | El *gradient boosting* cuadrático de 15 hojas (el mejor de la búsqueda) y el de pérdida absoluta, que predice la mediana y sobreestimaría la EAD de la cartera. |
| D5 | Guardar `05_modelos/modelo_ead.pkl` con `cloudpickle` y el mismo formato de paquete que la PD. | La validación final y la API cargan los tres modelos de la misma forma, sin casos especiales. | No se menciona ninguna. |

## Resultados clave

| Predicción | MAE | RMSE | Sesgo | R² |
|---|---|---|---|---|
| Elegido (Ridge, `alpha` 100) | 0,1963 | 0,2352 | 0,0000 | 0,0459 |
| Mejor de la búsqueda (*gradient boosting*) | 0,1960 | 0,2347 | 0,0005 | 0,0497 |
| Media de cada plazo (listón) | 0,1990 | 0,2377 | 0,0000 | 0,0256 |

Otras cifras de la búsqueda y del análisis:

- **Mejora frente a predecir siempre la media:** 2,5 % el mejor *gradient boosting* y 2,3 % Ridge (RMSE de la media: 0,2408).
- **Sin modelo:** la media global tiene RMSE 0,2408 y MAE 0,2023; la mediana de cada plazo, MAE 0,1976 y sesgo +0,0294.
- **Ordenación por deciles:** la EAD real sube de 0,51 (decil 1) a 0,71 (decil 10) y la predicha coincide en cada decil (diferencias menores de 0,01).
- **Rango de predicciones:** el mejor de la búsqueda predice entre 0,451 y 0,812; las reales van de 0 a 1.
- **Importancia (aumento de RMSE al desordenar):** `num_cuotas` 0,0053, `num_consultas_6meses` 0,0018, `finalidad` 0,0010; el resto, 0,0006 o menos.
- **Sobreajuste:** pequeño en árboles prudentes (0,2322 en entrenamiento frente a 0,2347), mayor con 63 hojas y hoja ≥ 100 (0,2255 frente a 0,2353).
- **Plazo y EAD:** con 60 cuotas queda más deuda pendiente al impagar que con 36.
- **Predicciones del elegido:** Ridge predice solo entre 0,43 y 0,84.
- **Tiempo de la búsqueda:** 4,2 minutos en tu equipo; el texto del notebook dice unos 2 porque se escribió con la ejecución en otra máquina.
- **Métricas del modelo guardado:** MAE 0,1963, RMSE 0,2352, sesgo 0 y R² 0,0459.

## Limitaciones y puntos a vigilar

- La EAD casi no se puede predecir con los datos de la solicitud: depende sobre todo de cuándo se deja de pagar, y eso no se sabe al conceder el préstamo.
- Las predicciones se quedan cerca de la media (Ridge predice entre 0,43 y 0,84): para un préstamo concreto el error es grande, aunque son fiables en media por grupo.
- Ridge entra en el empate por una cienmilésima (0,23520 frente a un umbral de 0,23521). En la ejecución anterior se quedó fuera por la misma distancia y ganó el *gradient boosting*; en la práctica los dos son equivalentes (el *boosting* tiene un 0,2 % menos de RMSE).
- La elección depende de usar RMSE: con MAE ganaría un modelo que predice la mediana y sesgaría la pérdida esperada.
- La media (0,593) es menor que la mediana (0,624) por una cola de préstamos que impagan cerca del final, con poca deuda pendiente.
- Los hiperparámetros apenas importan: `alpha` entre 0,1 y 100 da lo mismo y 1000 empeora un poco.
- Explicación del papel del plazo: con 60 cuotas el principal se amortiza más despacio y queda más deuda pendiente.

## Relación con el resto del proyecto

- **Viene de:** el notebook 04, que definió la EAD (D3), el listón por plazo (D6) y el importe `principal` como variable (D12), y del notebook 05, del que copia el *pipeline*, las particiones y la regla de elección.
- **Lo usan:** el notebook 08 (validación final) y la nueva API, que cargan `modelo_ead.pkl`. Los notebooks 05, 06 y 07 se construyen igual para que los tres modelos sean compatibles.
- **Conjunto de validación:** este notebook no lo toca. Se confirma en el notebook 08, donde la EAD obtiene RMSE 0,2352, el mismo valor de la validación cruzada. Resultados de los tres modelos allí: PD AUC 0,6782, EAD RMSE 0,2352 y LGD RMSE 0,1470.
