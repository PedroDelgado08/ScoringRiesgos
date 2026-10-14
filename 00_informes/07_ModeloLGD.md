# Informe · 07 · Modelo de LGD (pérdida en caso de impago)

**Notebook:** `03_notebooks/es/07_ModeloLGD.ipynb` · **Fecha del informe:** 13/10/2026

## Resumen

Este notebook busca el mejor modelo para estimar la LGD, la fracción de la deuda pendiente que no se recupera (media 0,8691), con los 65.836 impagados con deuda pendiente. Compara predicciones sin modelo, Ridge y *gradient boosting*. Ningún modelo con variables mejora a la media más que el azar de las particiones: el mejor baja el RMSE un 0,4 % (0,1472 frente a 0,1478). Por la regla de un error estándar se elige la opción más sencilla, estimar la LGD con la media de entrenamiento (0,869) para todos los préstamos. Se guarda como un *pipeline* más en `05_modelos/modelo_lgd.pkl`.

## Entradas y salidas

| Tipo | Archivo | Contenido |
|---|---|---|
| Entrada | `train.pkl` (leído con `preparar_conjunto()` de `04_scripts/preparacion.py`) | Conjunto de entrenamiento; se quedan los 65.836 impagados con deuda pendiente (LGD no nula), con 19 columnas originales |
| Entrada | `04_scripts/preparacion.py` | Clase `PreparacionScoring`, que va dentro del *pipeline* |
| Salida | `05_modelos/modelo_lgd.pkl` | Paquete con un *pipeline* que devuelve siempre 0,869, sus metadatos y métricas, guardado con `cloudpickle` |

## Qué se hace

1. **Importar librerías.** Igual que en el notebook 05; versión de `scikit-learn` 1.9.1, que se guarda con el modelo.
2. **Cargar los datos.** 65.836 impagados y 16 variables tras la preparación (4 categóricas y 12 numéricas, con `principal`). La LGD tiene media 0,8691, mediana 0,8945 y desviación típica 0,1478: casi todos los impagos pierden entre el 80 % y el 100 % de la deuda.
3. **Listón: predicciones sin modelo (D1).** La media global y la de cada plazo dan lo mismo (RMSE 0,1478), porque la LGD media es 0,869 con 36 cuotas y 0,868 con 60. La mediana gana en MAE pero tiene sesgo de +0,02 a +0,03.
4. **Métrica: ¿media o mediana? (D2).** Igual que en la EAD: se elige por RMSE para acertar la media y no sesgar la pérdida de la cartera.
5. **Pipeline y validación cruzada.** El mismo *pipeline* y las mismas particiones (3, semilla 42) que en el notebook 05.
6. **Búsqueda del mejor modelo (D3).** 31 combinaciones × 3 particiones = 93 entrenamientos.
   - 6.1: los 17 primeros (Ridge y *boosting* cuadrático) están empatados entre 0,1472 y 0,1474; predecir la media da 0,1478.
   - 6.2: todos los puntos de RMSE frente a MAE están muy juntos.
7. **Elección del modelo (D4).** Umbral 0,1481 y 18 empatados con el mejor, entre ellos la media. La regla elige "sin variables".
8. **Análisis del modelo elegido.**
   - 8.1: el mejor de la búsqueda explica solo el 0,8 % de la variación (R² 0,008).
   - 8.2: por deciles, la LGD real solo va de 0,84 a 0,89.
   - 8.3: ninguna variable importa; la mayor, `ingresos`, sube el RMSE 0,0006.
9. **Entrenar y guardar el modelo final (D5).** Se guarda la media como un *pipeline* más.
10. **Resumen y próximos pasos.** Concluye que la LGD no se puede predecir con los datos de la solicitud.

## Decisiones

| # | Decisión | Por qué | Alternativa descartada |
|---|---|---|---|
| D1 | El listón es la media global (RMSE 0,1478, sesgo 0). | Sin sesgo; el plazo no cambia la LGD (0,869 con 36 cuotas y 0,868 con 60), así que la global es más sencilla. | La media de cada plazo (da lo mismo) y la mediana (mejor MAE, pero sesgo positivo); el MAE de 0,092 se sigue mostrando como referencia. |
| D2 | Elegir por RMSE; vigilar MAE y sesgo. | La pérdida esperada necesita la LGD media, y el RMSE premia acertar la media. | Elegir por MAE: llevaría a modelos que predicen la mediana. |
| D3 | Una búsqueda con 2 modelos sin variables, 5 Ridge y 24 *gradient boosting*. | Ridge evita coeficientes inestables; los modelos sin variables compiten con las mismas particiones y reglas. | Regresión beta o logística fraccional (no están en `scikit-learn`) y modelo en dos etapas (queda como mejora futura, aunque se espera poco cambio). |
| D4 | Estimar la LGD con la media de entrenamiento (0,869) para todos los préstamos. | El mejor modelo mejora el RMSE un 0,4 %, menos que la variación entre particiones; añadiría complejidad y variables que pedir en la API sin mejorar la pérdida esperada. Es práctica habitual usar una LGD fija por segmento. | Ridge con `alpha` 1000 (opción si se quiere un modelo que responda a lo que escribe el usuario en la demo) y modelo en dos etapas. |
| D5 | Guardar `05_modelos/modelo_lgd.pkl` con `cloudpickle` y el mismo formato de paquete que la PD. | La validación final y la API cargan los tres modelos igual; si luego se sustituye la media por un modelo con variables, nada más cambia. | No se menciona ninguna. |

## Resultados clave

| Predicción | MAE | RMSE | Sesgo | R² |
|---|---|---|---|---|
| Elegido (media) | 0,0940 | 0,1478 | 0,0000 | 0,0000 |
| Mejor de la búsqueda (*gradient boosting*) | 0,0941 | 0,1472 | 0,0000 | 0,0075 |
| Media de cada plazo | 0,0940 | 0,1478 | 0,0000 | 0,0000 |

Cifras de la búsqueda y del análisis:

- **Mejora frente a la media:** 0,38 % el mejor *gradient boosting* y 0,37 % el mejor Ridge (`alpha` 1000), ambos con RMSE 0,1472.
- **Ruido de las particiones:** la desviación típica entre particiones (0,0014) es más del doble de la mejora de los modelos sobre la media (0,0006).
- **Sin modelo:** la mediana de cada plazo tiene MAE 0,0922, RMSE 0,1499 y sesgo +0,0219.
- **Rango de predicciones del mejor de la búsqueda:** entre 0,808 y 0,926; el elegido predice 0,869 para todos.
- **Deciles del mejor de la búsqueda:** la LGD real va de 0,8447 a 0,8898, unos 5 puntos sobre una media de 87.
- **Importancia (aumento de RMSE):** `ingresos` 0,0006, `sector_empleo` 0,0002 y el resto 0,0001 o menos.
- **Concentración de la LGD:** desviación típica de solo 0,1478; casi todos los impagos pierden entre el 80 % y el 100 %.
- **Valor guardado:** el *pipeline* devuelve siempre 0,869, la media de entrenamiento.
- **Sobre el listón del notebook 04:** el MAE de 0,092 (mediana de cada plazo) se sigue mostrando pero no decide.
- **Tiempo de la búsqueda:** 4,3 minutos en tu equipo; el texto del notebook dice unos 2 porque se escribió con la ejecución en otra máquina.
- **Modelo guardado:** MAE 0,094, RMSE 0,1478 y sesgo 0.

## Limitaciones y puntos a vigilar

- La LGD no se puede predecir con los datos de la solicitud: depende de la gestión de cobro, la venta de la deuda y la situación del cliente al impagar, que no se conocen al conceder el préstamo.
- El "modelo" no responde a ninguna variable. Si la demo debe reaccionar a lo que escribe el usuario, habría que usar Ridge (`alpha` 1000), con una diferencia mínima en pérdida esperada.
- Uno de cada cinco impagos tiene LGD = 1 y 413 la tienen en 0. Un modelo en dos etapas es la mejora futura más prometedora, aunque el propio notebook cree poco probable que cambie mucho el resultado.
- Los modelos de pérdida absoluta tienen el mejor MAE (≈ 0,092) pero peor RMSE (≈ 0,149); la mediana queda la última.
- La LGD es alta y estable: de media se pierde el 87 % de la deuda pendiente, sin diferencias por plazo ni por año.
- Los 18 empatados con el mejor hacen que la elección dependa de la regla de un error estándar; los modelos con variables no son peores, solo no ganan con claridad.

## Relación con el resto del proyecto

- **Viene de:** el notebook 04, que definió la LGD (D4) y el listón por MAE (D6) y observó que la pérdida es estable por año (D5), y del notebook 05, del que copia el *pipeline*, las particiones y la regla de elección.
- **Lo usan:** el notebook 08 (validación final) y la nueva API, que cargan `modelo_lgd.pkl` igual que los otros dos modelos.
- **Conjunto de validación:** este notebook no lo toca. Se confirma en el notebook 08, donde la LGD obtiene RMSE 0,1470. Resultados de los tres modelos allí: PD AUC 0,6782, EAD RMSE 0,2352 y LGD RMSE 0,1470.
