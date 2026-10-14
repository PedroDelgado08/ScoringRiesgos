# Informe · 03 · Análisis exploratorio (EDA)

**Notebook:** `03_notebooks/es/03_EDA.ipynb` · **Fecha del informe:** 13/10/2026

## Resumen
El notebook estudia, solo con el conjunto de entrenamiento (443.405 préstamos), cómo se relaciona cada variable con el impago (14,8 %). Decide qué variables entran en los modelos, cuáles se agrupan o transforman y cuáles se descartan. De 23 candidatas iniciales quedan 15 para el notebook 04, y ninguna interacción mejora el AUC. Una regresión logística sencilla con esas 15 obtiene un AUC de 0,670, frente a 0,669 del subrating de Lending Club. Se guardan `train_eda.pkl` (25 columnas) y `parametros_eda.pkl`.

## Entradas y salidas
| Tipo | Archivo | Contenido |
|---|---|---|
| Entrada | `train_calidad.pkl` | Entrenamiento tras el notebook 02: 443.405 préstamos y 33 columnas |
| Salida | `02_datos/03_Entrenamiento/train_eda.pkl` | 443.405 filas y 25 columnas; `antigüedad_empleo` agrupada y sin las 8 variables eliminadas |
| Salida | `02_datos/03_Entrenamiento/parametros_eda.pkl` | 7 elementos: mapa de agrupación de `antigüedad_empleo` y listas de variables por papel |

`train_calidad.pkl` no se sobrescribe.

## Qué se hace
1. **Importar librerías:** las mismas que en el notebook 02.
2. **Cargar los datos:** 443.405 préstamos y 33 columnas; 23 candidatas, 4 de benchmark, 3 para objetivos y 2 fechas.
3. **Variable objetivo:** 65.838 impagos (14,8 %) frente a 377.567 devueltos; problema desbalanceado, por eso se usa el AUC. Los préstamos a 60 cuotas (solo 2012 y 2013) impagan 25–27 % frente a 12–14 % a 36 cuotas.
4. **Herramientas:** se definen `tabla_riesgo` y `grafico_riesgo`; se explican WoE e IV (4.1, con `vivienda`: IV ≈ 0,032) y PSI (4.2).
5. **Poder predictivo:** el benchmark es el más fuerte (`subrating` 0,390); entre las candidatas solo `fico` tiene poder medio (0,128), 11 son débiles y el resto no tienen poder por sí solas.
6. **Categóricas:** se agrupa `antigüedad_empleo`, `ingresos_verificados` pasa a benchmark, se mantienen `vivienda`, `finalidad`, `sector_empleo` y `num_cuotas`, y se descarta `tramo_ult_retraso`.
7. **Numéricas:** `ingresos`, `dti`, `fico`, `num_hipotecas`, `num_consultas_6meses` tienen relación monótona con el impago. `principal` es plana, pero su ratio con los ingresos separa bien. Se descartan líneas totales, dos porcentajes de uso e incidencias; se propone `antiguedad_historial`.
8. **Redundancia:** ningún par de candidatas numéricas supera ρ = 0,7; el único par por encima de 0,4 es ingresos con saldo revolving (≈ 0,42). `antigüedad_empleo` y `sector_empleo` comparten `sin_empleo_declarado`.
9. **Estabilidad:** PSI < 0,1 en casi todas. Excepciones explicadas: `num_cuotas` (PSI 1,890) y `sector_empleo` (PSI 0,988, cambio en cómo se recogía el empleo a finales de 2013).
10. **Primer vistazo a EAD y LGD:** EAD media 0,593 y LGD media 0,869; ninguna variable se relaciona con fuerza con ellas. Los impagados sin recuperación pasan del 2,2 % (2012) al 27,9 % (2015).
11. **Selección:** 15 candidatas. Añadir todas las descartadas apenas mejora el AUC (0,670 a 0,672).
12. **Interacciones:** ninguna mejora el AUC (< 0,001); un modelo de árboles gana solo +0,0059.
13. **Guardar:** se eliminan las 8 variables descartadas y se guardan los dos archivos.
14. **Resumen y próximos pasos:** tabla de bloques y hallazgos principales.

## Decisiones
| # | Decisión | Por qué | Alternativa descartada |
|---|---|---|---|
| D1 | Agrupar `antigüedad_empleo` en 4 grupos: `sin_empleo_declarado`, `≤1`, `2-9`, `10+` | De 2 a 9 años el impago es plano (14,6–15,0 %); los extremos sí difieren | 3 grupos (mezcla el primer año con el resto); 5 grupos (tasas iguales, 14,8 % y 14,9 %) |
| D2 | `ingresos_verificados` pasa a benchmark | Es una decisión de Lending Club, no un dato del cliente; los verificados impagan más (17,8 % frente a 11,7 %) y no se puede pedir en la demo | Mantenerla fijada en `Not Verified` en la demo |
| D3 | `vivienda` sin cambios (3 categorías) | MORTGAGE < OWN < RENT se mantiene con los mismos ingresos y FICO | Ninguna indicada |
| D4 | `finalidad` sin cambios (11 categorías) | Riesgos distintos con sentido de negocio y casos suficientes | Agrupar en unos 6 bloques por riesgo (el IV queda igual, ≈ 0,024) |
| D5 | `sector_empleo` candidata, con vigilancia ética | Separa el riesgo con los mismos ingresos; riesgo de actuar como proxy de características protegidas | Descartarla (se decidirá en el notebook 05 comparando con y sin ella) |
| D6 | Descartar `tramo_ult_retraso` | IV ≈ 0,001; no separa ni con el mismo FICO | Ninguna indicada |
| D7 | `num_cuotas` sin cambios | Las de 60 cuotas impagan casi el doble; el IV es débil solo porque el 93 % es a 36 | Ninguna indicada |
| D8 | `ingresos` candidata, logaritmo en el notebook 04 | Relación decreciente y ordenada; el logaritmo comprime extremos (máximo 8,9 millones) | Ninguna indicada |
| D9 | `dti` candidata sin cambios | IV ≈ 0,051, relación creciente y sin extremos | Ninguna indicada |
| D10 | Sacar `principal` del modelo de PD y usar `ratio_principal_ingresos` (a crear en el 04) | El importe solo es plano; en relación con los ingresos el impago sube del 11,4 % al 21,3 % | Mantener `principal` solo |
| D11 | `fico` candidata sin cambios | La más fuerte (IV ≈ 0,128), relación perfectamente ordenada | Ninguna indicada |
| D12 | Mantener `num_lineas_credito`; descartar `num_lineas_credito_total` | La primera aporta en combinación; la segunda es redundante (correlación ≈ 0,68) y no aporta | Mantener las dos |
| D13 | `num_hipotecas` candidata, recorte al percentil 99 (8) en el 04 | IV ≈ 0,031; señal propia incluso dentro de cada tipo de vivienda | Ninguna indicada |
| D14 | `saldo_revolving` candidata, logaritmo en el 04 | IV bajo (≈ 0,013) pero aporta en conjunto; fuerte asimetría | Descartarla por su IV bajo |
| D15 | Solo `porc_uso_tarjetas`; descartar `porc_uso_revolving` y `porc_tarjetas_75p` | Las tres miden lo mismo (ρ 0,71–0,86); es la más fácil de preguntar en la demo | Mantener las tres (coeficientes inestables) |
| D16 | `num_consultas_6meses` candidata, recortada en 4 en el 04 | IV ≈ 0,038, relación creciente; desde 3–4 consultas la tasa no sube y hay pocos casos | Ninguna indicada |
| D17 | Descartar retrasos, derogatorios, quiebras y cancelaciones | No separan ni solas ni en combinación; derogatorios y quiebras casi coinciden (ρ ≈ 0,83) | Ninguna indicada |
| D18 | Crear `antiguedad_historial` en el 04 como candidata | La duración del historial tiene relación ordenada (17,8 % a 12,4–12,6 %); una fecha no sirve | Usar las fechas directamente |
| D19 | No eliminar más variables por redundancia | Ningún otro par de candidatas supera ρ = 0,7 | Quitar ya `antigüedad_empleo` (lo decidirá la regularización L1 en el 05) |
| D20 | Mantener las candidatas; `sector_empleo` con cautela | Todas estables salvo `num_cuotas` y `sector_empleo` (cambio de campo a finales de 2013) | Descartar `sector_empleo` (los datos recientes se parecen más a la demo) |
| D21 | Mismas candidatas para EAD y LGD (más `principal`); revisar recuperaciones en el 04 | Ninguna variable se relaciona con fuerza (correlaciones < 0,2); recuperaciones recientes parecen incompletas | Otra selección distinta |
| D22 | Pasar 15 candidatas al notebook 04 | Las descartadas juntas apenas mejoran el AUC; un corte automático por IV descartaría variables que aportan en combinación | Corte automático por IV |
| D23 | No añadir interacciones | Los efectos se suman y ninguna mejora el AUC (< 0,001) | Añadir productos de variables |
| D24 | Guardar `train_eda.pkl` y `parametros_eda.pkl` | Aplicar el mismo tratamiento en validación y en la API | Sobrescribir `train_calidad.pkl` |

## Resultados clave
- Impago global: 65.838 de 443.405 préstamos (14,8 %).
- Plazo: 60 cuotas impagan 25,7 % y 36 cuotas 14,0 % (IV 0,045, débil porque solo el 7 % es a 60 cuotas).
- IV del benchmark: `subrating` 0,390, `rating` 0,355, `tipo_interes` 0,350. La mejor candidata es `fico` (0,128).
- `fico`: impago del 19,9 % (≤ 667) al 6,4 % (> 737); el mínimo del FICO es 662.
- `ingresos`: del 20,3 % (≤ 32.000 $) al 10,0 % (> 120.000 $). `dti`: del 11,1 % al 20,2 %.
- `principal` es plano (14,2–15,7 %, IV ≈ 0,001); `ratio_principal_ingresos` va del 11,4 % al 21,3 % (IV ≈ 0,055).
- `sector_empleo`: tecnología 9,6 % frente a hostelería 20,0 %; el sector `otros` pasa del 59 % al 14 % desde el cuarto trimestre de 2013.
- Con `ingresos_verificados`, los verificados impagan más (17,8 %) que los no verificados (11,7 %).
- AUC con validación cruzada:

| Conjunto | AUC |
|---|---|
| Selección (15 variables) | 0,670 |
| Selección + todas las descartadas | 0,672 |
| Solo subrating de Lending Club | 0,669 |
| Regresión logística (comparación de interacciones) | 0,6699 |
| Modelo de árboles | 0,6759 |

- Mayor aportación al AUC al quitar una variable: `fico` 0,015, `num_cuotas` 0,008, `num_consultas_6meses` 0,006, `ratio_principal_ingresos` 0,006, `dti` 0,005. `antigüedad_empleo` e `ingresos` aportan 0,000.
- EAD media 0,593 (mediana 0,624) y LGD media 0,869; la correlación más alta es `num_cuotas` con EAD (0,167).
- Impagados sin recuperación: 2,2 % (2012), 8,4 % (2013), 24,5 % (2014), 27,9 % (2015).

## Limitaciones y puntos a vigilar
- **Solo FICO desde 662:** el modelo no sabe nada de clientes con FICO más bajo; en la demo conviene limitar el formulario a 662–850.
- **`num_cuotas`:** el efecto de las 60 cuotas se aprende solo con 2012–2013; en la demo conviene advertirlo.
- **`sector_empleo`:** cambio de definición a finales de 2013 (antes, nombre de empresa); el modelo aprenderá su efecto sobre todo de 2014–2015. Además hay riesgo ético de proxy de sexo u origen, que el dataset no permite comprobar directamente.
- **Recuperaciones de LGD:** probablemente incompletas en 2014–2015, lo que sobrestimaría la LGD. Se espera poco poder predictivo en EAD y LGD.
- **IV es univariante:** no ve redundancias ni interacciones; `antigüedad_empleo` queda pendiente para que la regularización L1 del notebook 05 decida si sobra.

## Relación con el resto del proyecto
- **Viene de:** el notebook 02 (`train_calidad.pkl`, decisiones D1–D24 de calidad) y el 01 (los 60 meses solo en 2012–2013).
- **Lo usa el notebook 04 (transformación):** crea `ratio_principal_ingresos` y `antiguedad_historial`, aplica logaritmo a `ingresos` y `saldo_revolving`, recortes, codificación de categóricas, y construye los objetivos de PD, EAD y LGD.
- **Después:** el notebook 05 (PD) compara regresión logística y *gradient boosting*, con y sin `sector_empleo` (gana el *gradient boosting* y se mantiene `sector_empleo`); los notebooks 06 y 07 usan la media por plazo como listón de EAD y LGD; el 08 es la validación final con el conjunto de validación.
- **Revisiones posteriores en el 04:** dos decisiones de este notebook se corrigieron allí. Sobre D21, el 04 comprobó que la LGD media es estable entre años (0,87–0,89) y usa todos los años. Sobre D14, el logaritmo empeoraba el ajuste de `saldo_revolving` y no se aplica.
- **Agrupación D1:** la agrupación de antigüedad de empleo está ahora también en `04_scripts/preparacion.py`.
