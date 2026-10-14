# Informe · 08 · Validación final de los modelos

**Notebook:** `03_notebooks/es/08_ValidacionFinal.ipynb` · **Fecha del informe:** 13/10/2026

## Resumen

Este notebook comprueba, con el 30 % de validación apartado en el notebook 01 y no usado hasta ahora, que los tres modelos guardados (PD, EAD y LGD) funcionan con préstamos que nunca han visto. La PD alcanza un AUC de 0,6782 en validación, frente a 0,6767 en validación cruzada, y supera al subrating de Lending Club (0,6701). La EAD y la LGD dan un RMSE de 0,2352 y 0,1470, iguales o mejores que en validación cruzada. Juntos, los tres modelos calculan una pérdida esperada del 7,75 % de lo prestado frente a una pérdida real del 7,87 %, un error del 1,5 %. Se aceptan los tres modelos para la API sin cambios.

## Entradas y salidas

| Tipo | Archivo | Contenido |
|---|---|---|
| Entrada | `02_datos/02_Validacion/validacion.pkl` | 190.059 préstamos originales, el 30 % apartado y no usado hasta ahora |
| Entrada | `05_modelos/modelo_pd.pkl`, `modelo_ead.pkl`, `modelo_lgd.pkl` | Un paquete por modelo, con la preparación dentro; se cargan sin `preparacion.py` |
| Entrada | `02_datos/03_Entrenamiento/train.pkl` | Solo para los listones: media de la EAD por plazo y media de la LGD en entrenamiento |
| Salida | Ninguno | El notebook no entrena ni guarda nada: solo evalúa |

## Qué se hace

1. **Importar librerías:** se usan `cloudpickle`, las métricas de los notebooks 05–07 y `preparar_conjunto()`. Versiones: scikit-learn 1.9.1, pandas 3.0.6.
2. **Cargar la validación (D1):** de 190.059 préstamos quedan 190.033 tras quitar 26 con vivienda fuera de la población. La tasa de impago es del 14,85 %, con 28.218 impagados, todos con EAD y LGD.
3. **Cargar los modelos:** los tres se guardaron con scikit-learn 1.9.1, la misma versión actual. La PD es un *gradient boosting* de 63 hojas con 15 variables, la EAD es Ridge (`alpha` 100) con 16 y la LGD es la media de entrenamiento. La PD predicha media es 14,85 %.
4. **PD: discriminación y calibración (D2):**
   - 4.1: AUC 0,6782 en validación frente a 0,6767 en validación cruzada (+0,0015). No hay sobreajuste.
   - 4.2: la PD predicha coincide con la tasa real en los 10 deciles, con diferencia máxima de 0,5 puntos.
   - 4.3: por año, el AUC va de 0,670 (2014) a 0,692 (2012). No se ve salto por el cambio de `sector_empleo` a finales de 2013.
5. **EAD y LGD:** el RMSE de la EAD en validación (0,2352) es idéntico al de validación cruzada y gana a la media de cada plazo (0,2377). El de la LGD (0,1470) es un 0,5 % mejor que en validación cruzada. La EAD predicha coincide con la real en todos los deciles.
6. **Pérdida esperada frente a real (D3):** PE = PD × EAD × LGD × importe. En la cartera, 194,6 millones esperados frente a 197,7 millones reales. Por deciles de PD, el cociente esperada / real queda entre 0,95 y 1,06.
7. **Comparación con Lending Club:**
   - 7.1: la PD sube con la nota (7,9 % en A, 32 % en G) pero menos que la tasa real (5,5 % a 38 %). Sobreestima A y B y subestima D a G.
   - 7.2: dentro de cada nota, el AUC del modelo (0,56 a 0,65) supera siempre a 0,5 y al de los subniveles de la nota (0,47 a 0,60).
8. **Conclusión (D4):** los tres modelos cumplen el criterio de D2 y se aceptan para la API.
9. **Resumen y próximos pasos:** nueva API con los tres `.pkl`, frontend con la comparación con Lending Club y decidir qué se publica en GitHub.

## Decisiones

| # | Decisión | Por qué | Alternativa descartada |
|---|---|---|---|
| D1 | La validación se usa una sola vez y no se ajusta nada con ella. | Es la única estimación que no ha influido en ninguna decisión; usarla para corregir la convertiría en entrenamiento. | Ajustar modelos mirando la validación; si algo falla, se vuelve a los notebooks 05–07 con validación cruzada. |
| D2 | Se aceptan los modelos si quedan a menos de 0,01 de AUC (PD) o a menos de un 2 % de RMSE (EAD y LGD) de la validación cruzada. | Los umbrales son unas 5–10 veces el error estándar de la validación cruzada (0,001 de AUC), así que una diferencia mayor no sería azar. | Un contraste estadístico formal (DeLong): con 190.000 préstamos cualquier diferencia mínima sería "significativa". Tampoco se exige ganar al subrating. |
| D3 | La pérdida real es (principal − amortizado − recuperado) de los impagados, con mínimo 0. | Es exactamente principal × EAD × LGD con las definiciones de los notebooks 04–07, así que se compara lo mismo que se modeliza. | Incluir intereses no cobrados, comisiones de cobro y valor temporal del dinero, como haría un banco. |
| D4 | Aceptar los tres modelos para la API, sin cambios. | Rinden igual o mejor con préstamos nuevos, siguen calibrados y la pérdida esperada se desvía solo un 1,5 % de la real. | Corregir ahora la PD por nota o por año: sería mirar la validación (D1). Si se quisiera, iría en el notebook 05 con validación cruzada. |

## Resultados clave

Discriminación y error frente a validación cruzada:

| Modelo | Métrica | Validación cruzada | Validación | Diferencia |
|---|---|---|---|---|
| PD | AUC | 0,6767 | 0,6782 | +0,0015 |
| EAD | RMSE | 0,2352 | 0,2352 | 0,0000 |
| LGD | RMSE | 0,1478 | 0,1470 | −0,0008 |

- **PD:** Gini 0,3564, KS 0,2573, *log-loss* 0,3942 y Brier 0,1199. El subrating de Lending Club tiene AUC 0,6701, Gini 0,3401 y KS 0,2487; la ventaja del modelo es +0,0081.
- **Calibración de la PD:** el riesgo real va del 3,8 % en el decil 1 al 31,3 % en el decil 10.
- **Estabilidad por año:** el modelo supera al subrating en 2012, 2013 y 2014 y queda casi empatado en 2015 (0,6756 frente a 0,6775). El error de calibración por año es siempre menor de 1,1 puntos.
- **EAD:** MAE 0,1968 y sesgo −0,0007. La EAD real sube de 0,52 en el decil 1 a 0,70 en el decil 10.
- **LGD:** MAE 0,0935 y sesgo −0,0015. Coincide con la media global porque el modelo es la media (0,869).
- **Pérdida de la cartera:** sobre 2.510 millones de $ prestados, esperada 194,6 millones (7,75 %) y real 197,7 millones (7,87 %); cociente 0,985.
- **Pérdida por deciles:** la esperada sube del 1,8 % al 18,3 % de lo prestado (real: del 1,7 % al 18,6 %). Sobreestima algo los dos tramos más seguros (+5 % y +6 %) y subestima algo los centrales (hasta −5 %).
- **Por nota de Lending Club:** en A se espera una pérdida del 3,6 % frente al 2,4 % real; en G, 20,7 % frente a 24,7 %.
- **AUC dentro de cada nota:** de 0,5608 (G) a 0,6515 (A), siempre mayor que el de los subniveles de la nota.

## Limitaciones y puntos a vigilar

- **La PD es más plana que la nota de Lending Club:** sobreestima A y B y subestima D a G. Para un cliente de nota extrema, la PD puede quedar lejos de la tasa real de su nota. La nota usa información que el formulario no tiene (historial completo del buró, entrevistas, verificación de ingresos).
- **El modelo no sabe en qué año está:** sobreestima 2013 (16,5 % frente a 15,5 %) y subestima 2015 (14,2 % frente a 14,9 %). En producción habría que medir el PSI de la PD y la tasa real cada cierto tiempo, y recalibrar si se separan.
- **La partición es aleatoria (notebook 01, D12):** mismos años (2012–2015) y misma tasa de impago que entrenamiento. Mide si los modelos generalizan a clientes parecidos, no si aguantan un cambio de época.
- **La pérdida real no incluye** intereses no cobrados, comisiones de cobro ni valor temporal del dinero.
- **La pérdida esperada solo cuadra sumando:** por préstamo la pérdida real es 0 o un importe grande. Por nota, los errores de A y G se compensan en la cartera completa.

## Relación con el resto del proyecto

- **Viene de:** los notebooks 05 (PD), 06 (EAD) y 07 (LGD), que guardan los tres modelos validados aquí. También del notebook 01, que apartó el 30 % de validación, y del notebook 03 (D20), cuyo cambio de definición de `sector_empleo` se revisa en 4.3.
- **No modifica nada:** si algo hubiera fallado, se habría vuelto a los notebooks 05–07.
- **Siguiente paso:** el despliegue de la nueva API en AWS (`07_despliegue_aws`), que cargará esos mismos tres `.pkl`.
- **Tareas que apunta el propio notebook:** actualizar el formulario a las nuevas variables (sector en un desplegable, campos opcionales), subir scikit-learn a 1.9.1 y construir un frontend que muestre, para cada cliente, la PD del modelo junto a la tasa real de impago de su nota de Lending Club. Antes de subir a GitHub, decidir qué se publica (los `.pkl` y los datos, no).
