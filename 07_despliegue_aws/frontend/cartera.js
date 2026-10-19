// =====================================================================
// cartera.js · Pestaña Cartera: cuadro de mando con 20.000 préstamos
// ---------------------------------------------------------------------
// Funciona como Power BI en modo "importación": los datos se descargan
// UNA vez (data/cartera.json, generado por preparar_datos_demo.py) y todos
// los filtros, indicadores y gráficos se calculan en el navegador.
// La API (Lambda) no interviene: no hay arranques en frío ni coste por clic.
//
// Los gráficos los dibuja Apache ECharts, una librería de JavaScript que se
// descarga la primera vez que se abre la pestaña: del CDN cdnjs o, si falla,
// de la copia que va con la web (vendor/echarts-5.5.1.min.js).
//
// DEPENDE DE (cargados antes, ver el <head> del HTML):
//   · i18n.js → t(), locale()
//   · app.js  → $(), formatoDolares(), formatoPct(), formatoNumero()
//               y los eventos "pestana-cambiada" y "tema-cambiado"
//
// MAPA
//   A. Configuración: URLs, columnas, colores de las series
//   B. Estado del cuadro de mando
//   C. Carga perezosa: ECharts y cartera.json la primera vez
//   D. Preparar los datos (deciles y orden de las subnotas)
//   E. Filtros
//   F. Cálculos: resúmenes, AUC y curva ROC
//   G. Indicadores (KPI)
//   H. Gráficos (opciones de ECharts)
//   I. Eventos
// =====================================================================


// ---------------------------------------------------------------------
// A. CONFIGURACIÓN
// ---------------------------------------------------------------------

// ECharts con la versión FIJADA: una versión nueva no cambiará los
// gráficos sin avisar. Es la misma librería que se instala con npm.
// Se intenta primero el CDN; si no se puede descargar (bloqueador de
// anuncios, red de empresa, CDN caído…), se usa la COPIA que va en la propia
// web (vendor/), idéntica (paquete npm echarts@5.5.1, licencia Apache 2.0).
const URLS_ECHARTS = [
  "https://cdnjs.cloudflare.com/ajax/libs/echarts/5.5.1/echarts.min.js",
  "vendor/echarts-5.5.1.min.js",
];

// Datos de la cartera (en S3 junto con la web; no están en GitHub, ver .gitignore)
const URL_CARTERA = "data/cartera.json";

// Columnas por las que se puede filtrar (coinciden con data-filtro del HTML)
const COLUMNAS_FILTRO = ["año", "plazo", "nota", "finalidad", "vivienda", "sector"];

// Notas y subnotas de Lending Club, de menos a más riesgo: A1, A2 … G5
const NOTAS_LC = ["A", "B", "C", "D", "E", "F", "G"];
const SUBNOTAS_LC = NOTAS_LC.flatMap((nota) => [1, 2, 3, 4, 5].map((i) => nota + i));

// Colores de las dos series de los gráficos: el MODELO en cian (dato) y lo
// REAL / Lending Club en ámbar, los dos colores de la marca. Son algo más
// saturados u oscuros que los del CSS para que, como trazos finos, se
// distingan también con daltonismo; comprobado con un validador de paletas
// (separación entre colores, contraste con el fondo) en los dos temas.
const COLORES_SERIES = {
  light: { modelo: "#007f9e", real: "#c47a08" },
  dark:  { modelo: "#2aa3c0", real: "#c98016" },
};

// Para el gráfico de distribución: tramos de PD de 2 puntos, de 0 % a 60 %
const ANCHO_TRAMO = 0.02;
const NUM_TRAMOS = 30;

// Mapa de calor: mínimo de préstamos para pintar una celda
const MIN_CELDA = 20;


// ---------------------------------------------------------------------
// B. ESTADO DEL CUADRO DE MANDO
// ---------------------------------------------------------------------
let estadoCarga = "pendiente"; // pendiente → cargando → listo (o vuelve a pendiente si falla)
let datos = null;              // columnas de cartera.json: { año: [...], pd: [...], ... }
let numFilas = 0;              // número de préstamos (20.000)
let decilFila = null;          // decil de PD (1-10) de cada préstamo
let rangoSubnota = null;       // posición de la subnota de cada préstamo (A1 = 0 … G5 = 34)
let filtros = {};              // valor elegido en cada filtro ("" = todos)
let graficos = {};             // los 6 gráficos de ECharts, por nombre


// ---------------------------------------------------------------------
// C. CARGA PEREZOSA
// ---------------------------------------------------------------------
// "Perezosa" = solo cuando hace falta. Quien solo usa el simulador no
// descarga ni ECharts (~1 MB) ni cartera.json (~1,9 MB; CloudFront lo
// envía comprimido, unos 300 KB).

// Añade un <script src="…"> a la página y espera a que termine de cargar.
// Una Promise es "un resultado que llegará más tarde": await la espera.
function cargarScript(url) {
  return new Promise((resolver, rechazar) => {
    const script = document.createElement("script");
    script.src = url;
    script.onload = resolver;
    script.onerror = () => rechazar(new Error(`no se pudo descargar ${url}`));
    document.head.appendChild(script);
  });
}

// Prueba cada URL por orden y se queda con la primera que funcione
async function cargarEcharts() {
  for (const url of URLS_ECHARTS) {
    try { await cargarScript(url); return; }
    catch { /* esta URL ha fallado: se prueba la siguiente */ }
  }
  throw new Error("no se pudo descargar ECharts");
}

async function abrirCartera() {
  // Las siguientes veces solo se reajusta el tamaño de los gráficos:
  // mientras la pestaña estaba oculta, su ancho era 0
  if (estadoCarga === "listo") { redimensionar(); return; }
  if (estadoCarga === "cargando") return;
  estadoCarga = "cargando";

  try {
    // Las dos descargas a la vez (Promise.all espera a ambas)
    const [, respuesta] = await Promise.all([cargarEcharts(), fetch(URL_CARTERA)]);
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    prepararDatos((await respuesta.json()).datos);
    pintarOpcionesFiltros();

    // Primero se muestra el contenido y DESPUÉS se crean los gráficos:
    // ECharts mide el tamaño de su caja al crearse, y oculta mide 0
    $("cartera-cargando").hidden = true;
    $("cartera-contenido").hidden = false;
    for (const [nombre, id] of Object.entries({
      roc: "g-roc", calibracion: "g-calibracion", notas: "g-notas",
      perdida: "g-perdida", mapa: "g-mapa", distribucion: "g-distribucion",
    })) {
      graficos[nombre] = echarts.init($(id));
    }
    // Filtrado cruzado: clic en una barra de los gráficos por nota
    graficos.notas.on("click", (p) => alternarNota(NOTAS_LC[p.dataIndex]));
    graficos.perdida.on("click", (p) => alternarNota(NOTAS_LC[p.dataIndex]));

    estadoCarga = "listo";
    actualizar();

  } catch (error) {
    estadoCarga = "pendiente";   // al volver a abrir la pestaña se reintenta
    $("cartera-cargando").textContent = t("car.error", { detalle: error.message });
  }
}


// ---------------------------------------------------------------------
// D. PREPARAR LOS DATOS
// ---------------------------------------------------------------------
// cartera.json viene "por columnas" ({ pd: [0.05, 0.11, …], impago: [0, 1, …] }),
// como un DataFrame: ocupa menos que una lista de objetos y es rápido de recorrer.
function prepararDatos(columnas) {
  datos = columnas;
  numFilas = datos.pd.length;

  // D.1 Deciles de PD calculados UNA vez con los 20.000 préstamos (sin filtros),
  //     como hace la API con la validación: así el decil de un préstamo no
  //     cambia al filtrar. limites = los 9 cortes (percentiles 10, 20 … 90).
  const ordenadas = Float64Array.from(datos.pd).sort();
  const limites = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => ordenadas[Math.floor((k * numFilas) / 10)]);
  // Decil = 1 + nº de cortes que la PD supera (como np.searchsorted en Python)
  decilFila = Uint8Array.from(datos.pd, (pd) => 1 + limites.filter((l) => pd >= l).length);

  // D.2 La subnota como número (A1 = 0 … G5 = 34): es la "puntuación" de
  //     Lending Club para calcular su AUC y su curva ROC
  rangoSubnota = Uint8Array.from(datos.subnota, (s) => SUBNOTAS_LC.indexOf(s));
}


// ---------------------------------------------------------------------
// E. FILTROS
// ---------------------------------------------------------------------

// Texto visible de cada valor según la columna (los valores no se traducen:
// son los de los datos; solo se traduce lo que se ve)
function etiquetaValor(columna, valor) {
  if (columna === "finalidad") return t(`fin.${valor}`);
  if (columna === "vivienda") return t(`viv.${valor}`);
  if (columna === "sector") return t(`sec.${valor}`);
  if (columna === "plazo") return t(`form.meses${valor}`);
  return String(valor);   // año y nota, tal cual
}

// Rellena cada desplegable con "Todos" + los valores distintos de su columna
function pintarOpcionesFiltros() {
  if (!datos) return;
  for (const select of document.querySelectorAll("[data-filtro]")) {
    const columna = select.dataset.filtro;
    // new Set() = valores únicos (como set() en Python); sort() los ordena
    const valores = [...new Set(datos[columna])].sort((a, b) =>
      typeof a === "number" ? a - b : etiquetaValor(columna, a).localeCompare(etiquetaValor(columna, b), locale()));
    select.replaceChildren(
      new Option(t("car.todos"), ""),
      ...valores.map((v) => new Option(etiquetaValor(columna, v), String(v))),
    );
    select.value = filtros[columna] ?? "";   // mantener la elección al cambiar de idioma
  }
}

// Índices de los préstamos que pasan los filtros (como df[mascara].index).
// ignorar: columna cuyo filtro no se aplica. Los gráficos por nota ignoran
// el filtro de nota para seguir mostrando todas las barras y RESALTAR la
// elegida, como hace Power BI con el filtrado cruzado.
function filasFiltradas(ignorar = null) {
  const activos = Object.entries(filtros).filter(([col, valor]) => valor !== "" && col !== ignorar);
  const filas = [];
  for (let i = 0; i < numFilas; i++) {
    // String(…): el valor del desplegable es texto; en los datos, año y plazo son números
    if (activos.every(([col, valor]) => String(datos[col][i]) === valor)) filas.push(i);
  }
  return filas;
}

// Filtrado cruzado: clic en la barra de una nota = filtrar por ella; otro clic la quita
function alternarNota(nota) {
  filtros.nota = filtros.nota === nota ? "" : nota;
  document.querySelector('[data-filtro="nota"]').value = filtros.nota;
  actualizar();
}

function alCambiarFiltro(evento) {
  const select = evento.target.closest("[data-filtro]");
  if (!select) return;
  filtros[select.dataset.filtro] = select.value;
  actualizar();
}

function quitarFiltros() {
  filtros = {};
  document.querySelectorAll("[data-filtro]").forEach((select) => { select.value = ""; });
  actualizar();
}


// ---------------------------------------------------------------------
// F. CÁLCULOS
// ---------------------------------------------------------------------

// F.1 Resumen de un grupo de préstamos (lista de índices):
//     - pd: PD media del modelo        - impago: tasa de impago real
//     - pe: pérdida esperada en % del importe = Σ(PD × EAD × LGD × importe) / Σ importe
//     - perdidaReal: pérdida real en % del importe = Σ pérdida real / Σ importe
function resumir(filas) {
  let sumaPd = 0, impagos = 0, importe = 0, perdidaEsperada = 0, perdidaReal = 0;
  for (const i of filas) {
    sumaPd += datos.pd[i];
    impagos += datos.impago[i];
    importe += datos.principal[i];
    perdidaEsperada += datos.pd[i] * datos.ead[i] * datos.lgd[i] * datos.principal[i];
    perdidaReal += datos.perdida_real[i];
  }
  const n = filas.length;
  return {
    n, importe,
    pd: n ? sumaPd / n : null,
    impago: n ? impagos / n : null,
    pe: importe ? perdidaEsperada / importe : null,
    perdidaReal: importe ? perdidaReal / importe : null,
  };
}

// F.2 Curva ROC y AUC de una puntuación (más alta = más riesgo).
// Se ordenan los préstamos de más a menos riesgo y se recorre la lista:
// cada impagado sube la curva (verdadero positivo), cada pagado la mueve a
// la derecha (falso positivo). Los empates (p. ej., todos los "C3" de LC)
// se tratan juntos: dan un tramo recto en diagonal.
// El AUC es el área bajo esa curva (regla del trapecio), lo mismo que
// sklearn.metrics.roc_auc_score.
function curvaRoc(filas, puntuacion) {
  const positivos = filas.reduce((s, i) => s + datos.impago[i], 0);
  const negativos = filas.length - positivos;
  if (positivos === 0 || negativos === 0) return { auc: null, puntos: [] }; // sin los dos grupos no hay ROC

  const orden = [...filas].sort((a, b) => puntuacion[b] - puntuacion[a]); // de más a menos riesgo
  const puntos = [[0, 0]];
  let vp = 0, fp = 0, auc = 0;
  for (let k = 0; k < orden.length; ) {
    // Avanzar por todo el grupo de empates con la misma puntuación
    const valor = puntuacion[orden[k]];
    let vpGrupo = 0, fpGrupo = 0;
    while (k < orden.length && puntuacion[orden[k]] === valor) {
      if (datos.impago[orden[k]]) vpGrupo++; else fpGrupo++;
      k++;
    }
    const [x0, y0] = [fp / negativos, vp / positivos];
    vp += vpGrupo; fp += fpGrupo;
    const [x1, y1] = [fp / negativos, vp / positivos];
    auc += (x1 - x0) * (y0 + y1) / 2;   // trapecio entre el punto anterior y este
    puntos.push([x1, y1]);
  }
  // Con miles de puntos el gráfico va lento: se dejan unos 300 (sin cambiar la forma)
  const paso = Math.max(1, Math.floor(puntos.length / 300));
  const reducidos = puntos.filter((_, j) => j % paso === 0 || j === puntos.length - 1);
  return { auc, puntos: reducidos };
}

// F.3 Agrupar préstamos por una clave (como df.groupby(clave)) y resumir cada grupo
function resumirPor(filas, clave, valores) {
  const grupos = new Map(valores.map((v) => [v, []]));
  for (const i of filas) grupos.get(clave(i))?.push(i);
  return valores.map((v) => resumir(grupos.get(v)));
}


// ---------------------------------------------------------------------
// G. INDICADORES (KPI)
// ---------------------------------------------------------------------
function pintarIndicadores(filas, resumen) {
  // Recuento junto a "Quitar filtros"
  $("cartera-recuento").textContent = filas.length === numFilas
    ? t("car.recuento", { n: formatoNumero(numFilas, 0) })
    : t("car.recuentoFiltro", { n: formatoNumero(filas.length, 0), total: formatoNumero(numFilas, 0) });

  const pct = (v, dec = 1) => (v == null ? "–" : formatoPct(v, dec));
  const { auc: aucModelo } = curvaRoc(filas, datos.pd);
  const { auc: aucLc } = curvaRoc(filas, rangoSubnota);

  $("kpi-n").textContent = formatoNumero(resumen.n, 0);
  $("kpi-pd").textContent = pct(resumen.pd);
  $("kpi-pe").textContent = pct(resumen.pe, 2);
  $("kpi-auc").textContent = aucModelo == null ? "–" : formatoNumero(aucModelo, 3);

  // Los subtítulos llevan <b>…</b>: innerHTML, solo con textos de i18n.js y
  // cifras calculadas aquí (nunca texto que venga de fuera)
  // notation "compact": 289.512.000 $ → "290 M$"
  const importe = resumen.importe.toLocaleString(locale(), {
    style: "currency", currency: "USD", currencyDisplay: "narrowSymbol", notation: "compact", maximumFractionDigits: 1,
  });
  $("kpi-n-sub").innerHTML = t("kpi.subImporte", { importe });
  $("kpi-pd-sub").innerHTML = t("kpi.subPd", { pct: pct(resumen.impago) });
  $("kpi-pe-sub").innerHTML = t("kpi.subPe", { pct: pct(resumen.perdidaReal, 2) });
  $("kpi-auc-sub").innerHTML = t("kpi.subAuc", { auc: aucLc == null ? "–" : formatoNumero(aucLc, 3) });
}


// ---------------------------------------------------------------------
// H. GRÁFICOS
// ---------------------------------------------------------------------

// H.1 Estilo común, leído de las variables CSS (styles.css, sección A).
// ECharts dibuja en un <canvas> y no entiende var(--fg): hay que pasarle
// los colores ya resueltos. Se leen cada vez, así siguen al tema activo.
function estilo() {
  const css = getComputedStyle(document.documentElement);
  const v = (nombre) => css.getPropertyValue(nombre).trim();
  const tema = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
  return {
    ...COLORES_SERIES[tema],
    texto: v("--fg"), suave: v("--muted"), linea: v("--line"), panel: v("--panel"),
    fondoSuave: v("--bg-alt"), malo: v("--bad"),
    fuente: "IBM Plex Sans, Segoe UI, system-ui, sans-serif",
  };
}

// Piezas repetidas en todos los gráficos: márgenes, leyenda, ejes y tooltip
function base(e) {
  return {
    backgroundColor: "transparent",
    textStyle: { fontFamily: e.fuente, color: e.suave },
    // Hueco para ejes y leyenda. En el móvil la leyenda ocupa dos líneas: más hueco arriba
    grid: { left: 52, right: 16, top: window.innerWidth < 560 ? 60 : 36, bottom: 48 },
    legend: { top: 0, left: 0, icon: "roundRect", itemWidth: 14, itemHeight: 4, textStyle: { color: e.suave } },
    tooltip: {
      backgroundColor: e.panel, borderColor: e.linea, textStyle: { color: e.texto, fontSize: 12 },
    },
  };
}

// Eje con el estilo de la web: líneas finas y recesivas, texto suave
function eje(e, extra = {}) {
  return {
    axisLine: { lineStyle: { color: e.linea } },
    axisTick: { show: false },
    splitLine: { lineStyle: { color: e.linea, opacity: 0.6 } },
    axisLabel: { color: e.suave, fontSize: 11 },
    nameTextStyle: { color: e.suave, fontSize: 11 },
    nameLocation: "middle",
    ...extra,
  };
}

// Formatos para ejes y tooltips
const fPct = (dec = 0) => (v) => (v == null ? "–" : formatoPct(v, dec));

// H.2 Curva ROC: modelo frente a subnota de LC, con la diagonal del azar
function opcionesRoc(e, filas) {
  const modelo = curvaRoc(filas, datos.pd);
  const lc = curvaRoc(filas, rangoSubnota);
  const auc = (r) => (r.auc == null ? "" : ` (AUC ${formatoNumero(r.auc, 3)})`);
  return {
    ...base(e),
    // trigger "axis": una línea vertical sigue al ratón y muestra las dos curvas a la vez
    tooltip: { ...base(e).tooltip, trigger: "axis", valueFormatter: fPct(1) },
    xAxis: eje(e, { type: "value", min: 0, max: 1, name: t("eje.fpr"), nameGap: 28, axisLabel: { ...eje(e).axisLabel, formatter: fPct() } }),
    yAxis: eje(e, { type: "value", min: 0, max: 1, name: t("eje.tpr"), nameGap: 40, axisLabel: { ...eje(e).axisLabel, formatter: fPct() } }),
    series: [
      { name: t("ser.modelo") + auc(modelo), type: "line", data: modelo.puntos, showSymbol: false, lineStyle: { width: 2 }, color: e.modelo },
      { name: t("ser.lc") + auc(lc), type: "line", data: lc.puntos, showSymbol: false, lineStyle: { width: 2 }, color: e.real },
      { name: t("ser.azar"), type: "line", data: [[0, 0], [1, 1]], showSymbol: false, silent: true,
        lineStyle: { width: 1, type: "dashed" }, color: e.suave },
    ],
  };
}

// H.3 Calibración por deciles: barras = PD media del modelo, línea = impago real
function opcionesCalibracion(e, filas) {
  const deciles = Array.from({ length: 10 }, (_, k) => k + 1);   // [1 … 10]
  const grupos = resumirPor(filas, (i) => decilFila[i], deciles);
  return {
    ...base(e),
    tooltip: { ...base(e).tooltip, trigger: "axis", valueFormatter: fPct(1) },
    xAxis: eje(e, { type: "category", data: deciles, name: t("eje.decil"), nameGap: 28, splitLine: { show: false } }),
    yAxis: eje(e, { type: "value", axisLabel: { ...eje(e).axisLabel, formatter: fPct() } }),
    series: [
      { name: t("ser.pdModelo"), type: "bar", data: grupos.map((g) => g.pd), color: e.modelo,
        barMaxWidth: 22, itemStyle: { borderRadius: [4, 4, 0, 0] } },
      { name: t("ser.impagoReal"), type: "line", data: grupos.map((g) => g.impago), color: e.real,
        lineStyle: { width: 2 }, symbolSize: 8 },
    ],
  };
}

// H.4 / H.5 Gráficos por nota LC (con resaltado de la nota elegida).
// Ignoran el filtro de nota (ver filasFiltradas) y atenúan las demás barras.
function barrasPorNota(e, valores, color) {
  return valores.map((valor, k) => ({
    value: valor,
    itemStyle: {
      color, borderRadius: [4, 4, 0, 0],
      opacity: !filtros.nota || filtros.nota === NOTAS_LC[k] ? 1 : 0.25,
    },
  }));
}

function opcionesPorNota(e, filas, serieModelo, serieReal, clave1, clave2, decimales) {
  const grupos = resumirPor(filas, (i) => datos.nota[i], NOTAS_LC);
  return {
    ...base(e),
    tooltip: { ...base(e).tooltip, trigger: "axis", valueFormatter: fPct(decimales) },
    xAxis: eje(e, { type: "category", data: NOTAS_LC, name: t("eje.nota"), nameGap: 28, splitLine: { show: false } }),
    yAxis: eje(e, { type: "value", axisLabel: { ...eje(e).axisLabel, formatter: fPct() } }),
    series: [
      { name: serieModelo, type: "bar", data: barrasPorNota(e, grupos.map((g) => g[clave1]), e.modelo),
        color: e.modelo, barMaxWidth: 18, barGap: "15%", cursor: "pointer" },
      { name: serieReal, type: "bar", data: barrasPorNota(e, grupos.map((g) => g[clave2]), e.real),
        color: e.real, barMaxWidth: 18, cursor: "pointer" },
    ],
  };
}

// H.6 Mapa de calor nota LC × decil del modelo: color = % de impago real.
// Escala de un solo tono (del fondo al cian): más oscuro = más impago.
function opcionesMapa(e, filas) {
  const celdas = new Map();   // "C-7" → { n, impagos }
  for (const i of filas) {
    const clave = `${datos.nota[i]}-${decilFila[i]}`;
    const celda = celdas.get(clave) ?? { n: 0, impagos: 0 };
    celda.n++; celda.impagos += datos.impago[i];
    celdas.set(clave, celda);
  }
  // Formato de ECharts para heatmap: [x, y, valor, nº de préstamos]
  const valores = [];
  NOTAS_LC.forEach((nota, y) => {
    for (let d = 1; d <= 10; d++) {
      const celda = celdas.get(`${nota}-${d}`);
      // Con menos de MIN_CELDA préstamos el % de impago es puro ruido: la celda se deja en blanco
      if (celda && celda.n >= MIN_CELDA) valores.push([d - 1, y, celda.impagos / celda.n, celda.n]);
    }
  });
  return {
    ...base(e),
    grid: { left: 40, right: 16, top: 12, bottom: 78 },
    tooltip: {
      ...base(e).tooltip, trigger: "item",
      // El tooltip se construye con textos nuestros y cifras: no hay datos externos
      formatter: (p) => `${t("tip.celda", { nota: NOTAS_LC[p.value[1]], decil: p.value[0] + 1 })}<br>`
        + `<b>${formatoPct(p.value[2], 1)}</b> ${t("ser.impagoReal").toLowerCase()} · ${t("tip.prestamos", { n: formatoNumero(p.value[3], 0) })}`,
    },
    xAxis: eje(e, { type: "category", data: Array.from({ length: 10 }, (_, k) => k + 1), name: t("eje.decil"), nameGap: 26, splitLine: { show: false } }),
    yAxis: eje(e, { type: "category", data: NOTAS_LC, inverse: true, splitLine: { show: false } }),  // A arriba, G abajo
    visualMap: {
      dimension: 2,                      // color según el 3.er valor de cada celda (% de impago), no el nº de préstamos
      min: 0, max: 0.5, calculable: false, orient: "horizontal", left: "center", bottom: 0,
      itemWidth: 10, itemHeight: 140, text: ["50 %", "0 %"], textStyle: { color: e.suave, fontSize: 11 },
      inRange: { color: [e.fondoSuave, e.modelo] },
    },
    series: [{
      type: "heatmap", data: valores,
      itemStyle: { borderColor: e.panel, borderWidth: 2, borderRadius: 3 },   // separación de 2px entre celdas
      emphasis: { itemStyle: { borderColor: e.texto } },
    }],
  };
}

// H.7 Distribución de la PD: % de préstamos de cada grupo en cada tramo de PD
function opcionesDistribucion(e, filas) {
  const pagados = new Array(NUM_TRAMOS).fill(0);
  const impagados = new Array(NUM_TRAMOS).fill(0);
  for (const i of filas) {
    const tramo = Math.min(NUM_TRAMOS - 1, Math.floor(datos.pd[i] / ANCHO_TRAMO)); // PD ≥ 58 % va al último
    (datos.impago[i] ? impagados : pagados)[tramo]++;
  }
  // En % de cada grupo, para comparar formas aunque haya muchos más pagados
  const enPct = (lista) => { const total = lista.reduce((a, b) => a + b, 0) || 1; return lista.map((v) => v / total); };
  const etiquetas = pagados.map((_, k) => formatoPct(k * ANCHO_TRAMO, 0));
  return {
    ...base(e),
    tooltip: { ...base(e).tooltip, trigger: "axis", valueFormatter: fPct(1) },
    xAxis: eje(e, { type: "category", data: etiquetas, name: t("eje.pd"), nameGap: 28, splitLine: { show: false }, boundaryGap: false }),
    yAxis: eje(e, { type: "value", name: t("eje.pctGrupo"), nameGap: 40, axisLabel: { ...eje(e).axisLabel, formatter: fPct() } }),
    series: [
      { name: t("ser.pagados"), type: "line", data: enPct(pagados), color: e.suave, showSymbol: false,
        lineStyle: { width: 2 }, areaStyle: { opacity: 0.12 } },
      { name: t("ser.impagados"), type: "line", data: enPct(impagados), color: e.malo, showSymbol: false,
        lineStyle: { width: 2 }, areaStyle: { opacity: 0.12 } },
    ],
  };
}

// H.8 Recalcular todo con los filtros actuales y repintar
function actualizar() {
  if (estadoCarga !== "listo") return;
  const e = estilo();
  const filas = filasFiltradas();
  const filasSinNota = filasFiltradas("nota");   // para los gráficos por nota

  pintarIndicadores(filas, resumir(filas));
  // notMerge: true = sustituir las opciones anteriores en lugar de mezclarlas
  const poner = (nombre, opciones) => graficos[nombre].setOption(opciones, { notMerge: true });
  poner("roc", opcionesRoc(e, filas));
  poner("calibracion", opcionesCalibracion(e, filas));
  poner("notas", opcionesPorNota(e, filasSinNota, t("ser.pdModelo"), t("ser.impagoReal"), "pd", "impago", 1));
  poner("perdida", opcionesPorNota(e, filasSinNota, t("ser.peModelo"), t("ser.peReal"), "pe", "perdidaReal", 2));
  poner("mapa", opcionesMapa(e, filas));
  poner("distribucion", opcionesDistribucion(e, filas));
}

// Ajustar los gráficos al tamaño de su caja (al mostrar la pestaña o al girar el móvil)
function redimensionar() {
  Object.values(graficos).forEach((grafico) => grafico.resize());
}


// ---------------------------------------------------------------------
// I. EVENTOS
// ---------------------------------------------------------------------
// app.js avisa al cambiar de pestaña; la primera vez que se abre Cartera se cargan los datos
document.addEventListener("pestana-cambiada", (evento) => {
  if (evento.detail.pestana === "cartera") abrirCartera();
});
// Al cambiar de idioma: textos de los desplegables, indicadores y gráficos
document.addEventListener("idioma-cambiado", () => { pintarOpcionesFiltros(); actualizar(); });
// Al cambiar de tema: los gráficos se repintan con los colores nuevos
document.addEventListener("tema-cambiado", actualizar);
$("filtros").addEventListener("change", alCambiarFiltro);
$("quitar-filtros").addEventListener("click", quitarFiltros);
window.addEventListener("resize", redimensionar);

// Si app.js abrió la pestaña Cartera al arrancar (dirección con #cartera) ANTES
// de que este archivo existiera, el aviso se perdió: se comprueba aquí
if (!$("panel-cartera").hidden) abrirCartera();
