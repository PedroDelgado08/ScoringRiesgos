// =====================================================================
// i18n.js · Traducción de la página (español / inglés)
// ---------------------------------------------------------------------
// i18n = "internationalization" (i + 18 letras + n).
//
// CÓMO FUNCIONA
//   1. TEXTOS: un diccionario por idioma (como un dict de Python):
//      clave → texto. Las claves son las de los atributos data-i18n del
//      HTML, más las de los textos que generan app.js y cartera.js.
//   2. aplicarIdioma(): recorre el HTML y sustituye cada texto marcado.
//   3. Al terminar, lanza el evento "idioma-cambiado" para que app.js y
//      cartera.js repinten lo que generan ellos (estado, cifras, gráficos).
//
// MAPA
//   A. Configuración de idiomas
//   B. Diccionario de textos
//   C. Funciones públicas: t() y locale() (las usan app.js y cartera.js)
//   D. Aplicar un idioma a la página
//   E. Idioma inicial y botón EN/ES
// =====================================================================


// ---------------------------------------------------------------------
// A. CONFIGURACIÓN DE IDIOMAS
// ---------------------------------------------------------------------
// "Locale" = idioma + país. Fija el formato de números y moneda:
//   es-ES → 35.000 $   0,25      en-US → $35,000   0.25
// Para inglés se usa en-US (y no en-GB como en la v1) porque los importes
// son en dólares: así se escriben como en Estados Unidos.
const LOCALES = { es: "es-ES", en: "en-US" };

// Clave con la que se guarda la elección en el navegador del visitante
// (la misma que usa drm-data.com, aunque al ser otro dominio no se comparte)
const CLAVE_IDIOMA = "drm-lang";

// Idioma activo (se fija en la sección E al cargar la página)
let idiomaActual = "es";


// ---------------------------------------------------------------------
// B. DICCIONARIO DE TEXTOS
// ---------------------------------------------------------------------
// Las claves llevan un prefijo con la parte de la página a la que pertenecen
// (cab = cabecera, form = formulario, res = resultado, car = cartera…),
// lo que facilita encontrar cada texto.
// {nombre} = hueco que se rellena al usarlo, p. ej. t("estado.okArranque", { s: "4,3" })
// Los textos marcados con (app.js) o (cartera.js) no están en el HTML:
// los escriben esos archivos.
const TEXTOS = {

  // ============================ ESPAÑOL ============================
  es: {
    // --- Cabecera y portada
    "meta.titulo": "Scoring de Riesgos · DRMdata",
    "skip": "Saltar al contenido",
    "cab.producto": "Scoring de Riesgos",
    "tab.simulador": "Simulador",
    "tab.cartera": "Cartera",
    "estado.cargando": "Iniciando el modelo…",               // (app.js)
    "estado.ok": "Modelo listo",                              // (app.js)
    "estado.okArranque": "Modelo listo (arranque: {s} s)",    // (app.js)
    "estado.error": "Servicio no disponible",                 // (app.js)
    "idioma.boton": "EN",                                     // botón: idioma al que se cambia
    "idioma.aria": "Switch to English",                       // escrito en el idioma de destino
    "aria.temaOscuro": "Cambiar a tema oscuro",               // (app.js)
    "aria.temaClaro": "Cambiar a tema claro",                 // (app.js)
    "hero.eyebrow": "Machine learning · AWS Lambda · Lending Club",
    "hero.titulo": "¿Cuánto se puede perder con un préstamo? <em>Tres modelos lo estiman al momento.</em>",
    "hero.entradilla": "Elige un cliente real de la muestra de validación, cambia sus datos si quieres y compara la estimación del modelo con la nota que le puso Lending Club y con lo que pasó de verdad.",
    "hero.v1": "0,678",
    "hero.m1": "AUC del modelo (LC: 0,670)",
    "hero.v2": "1,5 %",
    "hero.m2": "Error de la pérdida esperada",
    "hero.v3": "20.000",
    "hero.m3": "Préstamos de validación",

    // --- 2. Formulario
    "form.bloqueCliente": "Cliente de la muestra",
    "form.cliente": "Cliente",
    "form.cargandoClientes": "Cargando clientes…",
    "form.todas": "Todas",                                    // (app.js) chip sin filtro
    "form.opcionCliente": "{id} · nota {nota} · {importe}",   // (app.js) opción del desplegable
    "form.opcionNuevo": "Cliente nuevo (datos propios)",      // (app.js)
    "form.azar": "Al azar",
    "form.restablecer": "Restablecer",
    "form.nuevo": "Cliente nuevo",
    "ficha.nota": "Nota LC",
    "ficha.interes": "Interés LC",
    "ficha.concesion": "Concedido",
    "ficha.editado": "● datos modificados",
    "form.bloquePrestamo": "Préstamo",
    "form.importe": "Importe",
    "form.plazo": "Plazo",
    "form.meses36": "36 meses",
    "form.meses60": "60 meses",
    "form.finalidad": "Finalidad",
    "fin.debt_consolidation": "Reunificación de deudas",
    "fin.credit_card": "Tarjeta de crédito",
    "fin.home_improvement": "Reformas del hogar",
    "fin.major_purchase": "Compra importante",
    "fin.car": "Vehículo",
    "fin.small_business": "Pequeño negocio",
    "fin.medical": "Gastos médicos",
    "fin.moving": "Mudanza",
    "fin.house": "Compra de vivienda",
    "fin.vacation": "Viajes",
    "fin.other": "Otros",
    "form.bloquePerfil": "Perfil",
    "form.vivienda": "Vivienda",
    "viv.RENT": "En alquiler",
    "viv.MORTGAGE": "Con hipoteca",
    "viv.OWN": "En propiedad",
    "form.sector": "Sector de empleo",
    "sec.salud": "Salud",
    "sec.educacion": "Educación",
    "sec.legal": "Legal",
    "sec.seguridad_publica": "Seguridad pública",
    "sec.transporte": "Transporte",
    "sec.hosteleria": "Hostelería",
    "sec.finanzas": "Finanzas",
    "sec.tecnologia": "Tecnología",
    "sec.comercio": "Comercio",
    "sec.oficios_industria": "Oficios e industria",
    "sec.autonomo_propietario": "Autónomo o propietario",
    "sec.administrativo": "Administrativo",
    "sec.direccion_gestion": "Dirección y gestión",
    "sec.otros": "Otros",
    "sec.sin_empleo_declarado": "Sin empleo declarado",
    "form.antiguedad": "Antigüedad en el empleo",
    "ant.hasta1": "1 año o menos",
    "ant.2a9": "De 2 a 9 años",
    "ant.10mas": "10 años o más",
    "ant.sin": "Sin empleo declarado",
    "form.ingresos": "Ingresos anuales ($)",
    "form.dti": "DTI: deudas / ingresos (%)",
    "form.bloqueHistorial": "Historial de crédito",
    "form.fico": "Puntuación FICO",
    "form.primerCredito": "Primer crédito",
    "form.lineas": "Líneas de crédito abiertas",
    "form.consultas": "Consultas en 6 meses",
    "form.revolving": "Saldo revolving ($)",
    "form.opcionales": "Más datos (opcionales)",
    "form.hipotecas": "Nº de hipotecas",
    "form.usoRevolving": "Uso del revolving (%)",
    "form.usoTarjetas": "Uso de las tarjetas (%)",
    "form.tarjetas75": "Tarjetas con uso > 75 % (%)",
    "form.opcionalesNota": "Si los dejas vacíos, el modelo los rellena igual que hizo en el entrenamiento.",
    "form.boton": "Calcular riesgo",                          // (app.js)
    "form.botonEvaluando": "Calculando…",                     // (app.js)

    // --- 3. Resultado
    "res.vacio": "Elige un cliente y pulsa <b>Calcular riesgo</b>.",
    "res.pe": "Pérdida esperada",
    "res.pePie": "{pct} del importe de {importe}",            // (app.js)
    "res.pd": "<b>PD</b> · Probabilidad de impago",
    "res.ead": "<b>EAD</b> · Exposición en el impago",
    "res.lgd": "<b>LGD</b> · Severidad de la pérdida",
    "res.lgdNota": "Fija para todos los préstamos: la media histórica, porque ningún modelo la mejoraba.",
    "res.decil": "Decil de riesgo",
    "res.decilValor": "{d} de 10",                            // (app.js)
    "res.decilMenos": "Menos riesgo",
    "res.decilMas": "Más riesgo",
    "res.decilNota": "Posición de su PD entre los préstamos de validación: en cada decil hay un 10 % de ellos.",
    "res.lcTitulo": "Frente a Lending Club",
    "res.modelo": "Modelo",
    "res.lcNota": "Nota",
    "res.lcPd": "Probabilidad de impago",
    "res.lcInteres": "Tipo de interés",
    "res.real": "Resultado real del préstamo",
    "real.pago": "Pagó",                                      // (app.js)
    "real.impago": "Impagó",                                  // (app.js)
    "res.lcEditado": "Has cambiado datos del cliente: la nota de LC y el resultado real son los del cliente original.",
    "res.nuevoTitulo": "Cliente nuevo",
    "res.nuevoTexto": "No tiene nota de Lending Club ni resultado real con los que comparar. Se ha puntuado con la fecha de hoy como fecha de concesión.",

    // --- Errores (app.js)
    "error.timeout": "La API no ha respondido a tiempo.",
    "error.clientes": "No se han podido cargar los clientes ({detalle}). Recarga la página en unos segundos.",
    "error.evaluar": "No se ha podido calcular el riesgo: {detalle}",

    // --- 4. Cartera
    "car.anio": "Año",
    "car.plazo": "Plazo",
    "car.nota": "Nota LC",
    "car.finalidad": "Finalidad",
    "car.vivienda": "Vivienda",
    "car.sector": "Sector",
    "car.quitar": "Quitar filtros",
    "car.cargando": "Cargando la cartera…",
    "car.todos": "Todos",                                     // (cartera.js) opción sin filtro
    "car.error": "No se ha podido cargar la cartera ({detalle}). Recarga la página.", // (cartera.js)
    "car.recuento": "{n} préstamos de validación",            // (cartera.js)
    "car.recuentoFiltro": "{n} de {total} préstamos con los filtros elegidos", // (cartera.js)
    "kpi.subImporte": "{importe} prestados",                  // (cartera.js)
    "kpi.subPd": "Impago real: <b>{pct}</b>",                 // (cartera.js)
    "kpi.subPe": "Pérdida real: <b>{pct}</b> del importe",    // (cartera.js)
    "kpi.subAuc": "Subnota de LC: <b>{auc}</b>",              // (cartera.js)
    "ser.modelo": "Modelo",                                   // (cartera.js) nombres de las series
    "ser.lc": "Subnota de LC",
    "ser.azar": "Azar",
    "ser.pdModelo": "PD del modelo",
    "ser.impagoReal": "Impago real",
    "ser.peModelo": "Pérdida esperada",
    "ser.peReal": "Pérdida real",
    "ser.pagados": "Pagados",
    "ser.impagados": "Impagados",
    "eje.fpr": "Tasa de falsos positivos",                    // (cartera.js) títulos de los ejes
    "eje.tpr": "Tasa de verdaderos positivos",
    "eje.decil": "Decil de PD del modelo",
    "eje.nota": "Nota de LC",
    "eje.pd": "PD del modelo",
    "eje.pctGrupo": "% de cada grupo",
    "tip.celda": "Nota {nota} · decil {decil}",               // (cartera.js) tooltip del mapa de calor
    "tip.prestamos": "{n} préstamos",
    "kpi.prestamos": "Préstamos",
    "kpi.pd": "PD media",
    "kpi.pe": "Pérdida esperada",
    "kpi.auc": "AUC del modelo",
    "g1.titulo": "Curva ROC: modelo frente a la subnota de LC",
    "g1.texto": "¿Quién ordena mejor el riesgo con los filtros elegidos?",
    "g2.titulo": "Calibración por deciles de PD",
    "g2.texto": "Barras: PD media del modelo. Línea: impago real. Si coinciden, las probabilidades son creíbles.",
    "g3.titulo": "Por nota de LC: PD del modelo frente a impago real",
    "g3.texto": "Haz clic en una barra para filtrar todo por esa nota.",
    "g4.titulo": "Pérdida esperada frente a real, por nota",
    "g4.texto": "En % del importe prestado.",
    "g5.titulo": "Nota de LC × decil del modelo",
    "g5.texto": "Color: % de impago real. Dónde discrepan el modelo y LC, y quién acierta. En blanco, las celdas con menos de 20 préstamos.",
    "g6.titulo": "Distribución de la PD",
    "g6.texto": "Préstamos pagados frente a impagados: cuánto se solapan.",

    // --- 5. Metodología y pie
    "met.eyebrow": "Metodología",
    "met.titulo": "Pérdida esperada = PD × EAD × LGD",
    "met.formula": "Pérdida esperada ($) = <b>PD</b> × <b>EAD</b> × <b>LGD</b> × Importe",
    "met.pd": "Probabilidad de que el cliente no pague. Modelo de clasificación entrenado con préstamos de Lending Club de 2007 a 2015.",
    "met.ead": "Parte del importe que sigue pendiente cuando llega el impago. Modelo de regresión.",
    "met.lgd": "Parte de lo pendiente que no se recupera. Se usa la media histórica (0,869), porque ningún modelo la mejoraba.",
    "pie.texto": "Proyecto demostrativo de data science con datos públicos de Lending Club. No es una decisión de crédito real.",
  },

  // ============================ INGLÉS ============================
  en: {
    // --- Header and hero
    "meta.titulo": "Credit Risk Scoring · DRMdata",
    "skip": "Skip to content",
    "cab.producto": "Credit Risk Scoring",
    "tab.simulador": "Simulator",
    "tab.cartera": "Portfolio",
    "estado.cargando": "Starting the model…",
    "estado.ok": "Model ready",
    "estado.okArranque": "Model ready (cold start: {s} s)",
    "estado.error": "Service unavailable",
    "idioma.boton": "ES",
    "idioma.aria": "Cambiar a español",
    "aria.temaOscuro": "Switch to dark theme",
    "aria.temaClaro": "Switch to light theme",
    "hero.eyebrow": "Machine learning · AWS Lambda · Lending Club",
    "hero.titulo": "How much could a loan lose? <em>Three models estimate it instantly.</em>",
    "hero.entradilla": "Pick a real client from the validation sample, change their details if you like, and compare the model's estimate with the grade Lending Club gave them and with what actually happened.",
    "hero.v1": "0.678",
    "hero.m1": "Model AUC (LC: 0.670)",
    "hero.v2": "1.5%",
    "hero.m2": "Expected loss error",
    "hero.v3": "20,000",
    "hero.m3": "Validation loans",

    // --- 2. Form
    "form.bloqueCliente": "Sample client",
    "form.cliente": "Client",
    "form.cargandoClientes": "Loading clients…",
    "form.todas": "All",
    "form.opcionCliente": "{id} · grade {nota} · {importe}",
    "form.opcionNuevo": "New client (your own data)",
    "form.azar": "Random",
    "form.restablecer": "Reset",
    "form.nuevo": "New client",
    "ficha.nota": "LC grade",
    "ficha.interes": "LC rate",
    "ficha.concesion": "Issued",
    "ficha.editado": "● details changed",
    "form.bloquePrestamo": "Loan",
    "form.importe": "Amount",
    "form.plazo": "Term",
    "form.meses36": "36 months",
    "form.meses60": "60 months",
    "form.finalidad": "Purpose",
    "fin.debt_consolidation": "Debt consolidation",
    "fin.credit_card": "Credit card",
    "fin.home_improvement": "Home improvement",
    "fin.major_purchase": "Major purchase",
    "fin.car": "Car",
    "fin.small_business": "Small business",
    "fin.medical": "Medical expenses",
    "fin.moving": "Moving",
    "fin.house": "House purchase",
    "fin.vacation": "Vacation",
    "fin.other": "Other",
    "form.bloquePerfil": "Profile",
    "form.vivienda": "Housing",
    "viv.RENT": "Renting",
    "viv.MORTGAGE": "Mortgage",
    "viv.OWN": "Owner",
    "form.sector": "Employment sector",
    "sec.salud": "Healthcare",
    "sec.educacion": "Education",
    "sec.legal": "Legal",
    "sec.seguridad_publica": "Public safety",
    "sec.transporte": "Transport",
    "sec.hosteleria": "Hospitality",
    "sec.finanzas": "Finance",
    "sec.tecnologia": "Technology",
    "sec.comercio": "Retail and sales",
    "sec.oficios_industria": "Trades and industry",
    "sec.autonomo_propietario": "Self-employed or owner",
    "sec.administrativo": "Administrative",
    "sec.direccion_gestion": "Management",
    "sec.otros": "Other",
    "sec.sin_empleo_declarado": "No employment stated",
    "form.antiguedad": "Years in current job",
    "ant.hasta1": "1 year or less",
    "ant.2a9": "2 to 9 years",
    "ant.10mas": "10 years or more",
    "ant.sin": "No employment stated",
    "form.ingresos": "Annual income ($)",
    "form.dti": "DTI: debt / income (%)",
    "form.bloqueHistorial": "Credit history",
    "form.fico": "FICO score",
    "form.primerCredito": "First credit line",
    "form.lineas": "Open credit lines",
    "form.consultas": "Inquiries in 6 months",
    "form.revolving": "Revolving balance ($)",
    "form.opcionales": "More details (optional)",
    "form.hipotecas": "Number of mortgages",
    "form.usoRevolving": "Revolving utilization (%)",
    "form.usoTarjetas": "Card utilization (%)",
    "form.tarjetas75": "Cards above 75% use (%)",
    "form.opcionalesNota": "If you leave them empty, the model fills them in the same way it did during training.",
    "form.boton": "Calculate risk",
    "form.botonEvaluando": "Calculating…",

    // --- 3. Result
    "res.vacio": "Pick a client and press <b>Calculate risk</b>.",
    "res.pe": "Expected loss",
    "res.pePie": "{pct} of the {importe} loan",
    "res.pd": "<b>PD</b> · Probability of default",
    "res.ead": "<b>EAD</b> · Exposure at default",
    "res.lgd": "<b>LGD</b> · Loss given default",
    "res.lgdNota": "Fixed for every loan: the historical average, because no model improved on it.",
    "res.decil": "Risk decile",
    "res.decilValor": "{d} of 10",
    "res.decilMenos": "Lower risk",
    "res.decilMas": "Higher risk",
    "res.decilNota": "Where their PD sits among the validation loans: each decile holds 10% of them.",
    "res.lcTitulo": "Versus Lending Club",
    "res.modelo": "Model",
    "res.lcNota": "Grade",
    "res.lcPd": "Probability of default",
    "res.lcInteres": "Interest rate",
    "res.real": "Actual loan outcome",
    "real.pago": "Repaid",
    "real.impago": "Defaulted",
    "res.lcEditado": "You changed the client's details: the LC grade and the actual outcome belong to the original client.",
    "res.nuevoTitulo": "New client",
    "res.nuevoTexto": "There is no Lending Club grade or actual outcome to compare with. Scored with today's date as the issue date.",

    // --- Errors
    "error.timeout": "The API did not respond in time.",
    "error.clientes": "The clients could not be loaded ({detalle}). Reload the page in a few seconds.",
    "error.evaluar": "The risk could not be calculated: {detalle}",

    // --- 4. Portfolio
    "car.anio": "Year",
    "car.plazo": "Term",
    "car.nota": "LC grade",
    "car.finalidad": "Purpose",
    "car.vivienda": "Housing",
    "car.sector": "Sector",
    "car.quitar": "Clear filters",
    "car.cargando": "Loading the portfolio…",
    "car.todos": "All",
    "car.error": "The portfolio could not be loaded ({detalle}). Reload the page.",
    "car.recuento": "{n} validation loans",
    "car.recuentoFiltro": "{n} of {total} loans with the chosen filters",
    "kpi.subImporte": "{importe} lent",
    "kpi.subPd": "Actual default: <b>{pct}</b>",
    "kpi.subPe": "Actual loss: <b>{pct}</b> of the amount",
    "kpi.subAuc": "LC sub-grade: <b>{auc}</b>",
    "ser.modelo": "Model",
    "ser.lc": "LC sub-grade",
    "ser.azar": "Random",
    "ser.pdModelo": "Model PD",
    "ser.impagoReal": "Actual default",
    "ser.peModelo": "Expected loss",
    "ser.peReal": "Actual loss",
    "ser.pagados": "Repaid",
    "ser.impagados": "Defaulted",
    "eje.fpr": "False positive rate",
    "eje.tpr": "True positive rate",
    "eje.decil": "Model PD decile",
    "eje.nota": "LC grade",
    "eje.pd": "Model PD",
    "eje.pctGrupo": "% of each group",
    "tip.celda": "Grade {nota} · decile {decil}",
    "tip.prestamos": "{n} loans",
    "kpi.prestamos": "Loans",
    "kpi.pd": "Average PD",
    "kpi.pe": "Expected loss",
    "kpi.auc": "Model AUC",
    "g1.titulo": "ROC curve: model versus LC sub-grade",
    "g1.texto": "Which one ranks risk better with the chosen filters?",
    "g2.titulo": "Calibration by PD decile",
    "g2.texto": "Bars: model's average PD. Line: actual default rate. If they match, the probabilities are credible.",
    "g3.titulo": "By LC grade: model PD versus actual default",
    "g3.texto": "Click a bar to filter everything by that grade.",
    "g4.titulo": "Expected versus actual loss, by grade",
    "g4.texto": "As a % of the amount lent.",
    "g5.titulo": "LC grade × model decile",
    "g5.texto": "Colour: actual default rate. Where the model and LC disagree, and who is right. Cells with fewer than 20 loans are left blank.",
    "g6.titulo": "PD distribution",
    "g6.texto": "Repaid versus defaulted loans: how much they overlap.",

    // --- 5. Methodology and footer
    "met.eyebrow": "Methodology",
    "met.titulo": "Expected loss = PD × EAD × LGD",
    "met.formula": "Expected loss ($) = <b>PD</b> × <b>EAD</b> × <b>LGD</b> × Amount",
    "met.pd": "Probability that the client does not repay. Classification model trained on Lending Club loans from 2007 to 2015.",
    "met.ead": "Share of the amount still outstanding when the default happens. Regression model.",
    "met.lgd": "Share of the outstanding amount that is not recovered. The historical average (0.869) is used, because no model improved on it.",
    "pie.texto": "Data science demo project using public Lending Club data. Not a real credit decision.",
  },
};


// ---------------------------------------------------------------------
// C. FUNCIONES PÚBLICAS
// ---------------------------------------------------------------------
/**
 * t("clave", {huecos}) → texto en el idioma activo.
 * Si falta la traducción, se usa el español; si también falta,
 * se devuelve la propia clave (así un olvido se ve en pantalla en lugar de romper nada).
 */
function t(clave, huecos = {}) {
  let texto = TEXTOS[idiomaActual][clave] ?? TEXTOS.es[clave] ?? clave;
  // Sustituye cada {nombre} por su valor, como un f-string de Python
  for (const [nombre, valor] of Object.entries(huecos)) {
    texto = texto.replaceAll(`{${nombre}}`, valor);
  }
  return texto;
}

/** locale() → "es-ES" o "en-US", para dar formato a los números en app.js y cartera.js */
function locale() {
  return LOCALES[idiomaActual];
}

/** idioma() → "es" o "en" (cartera.js lo usa para los textos de ECharts) */
function idioma() {
  return idiomaActual;
}


// ---------------------------------------------------------------------
// D. APLICAR UN IDIOMA A LA PÁGINA
// ---------------------------------------------------------------------
function aplicarIdioma(nuevo) {
  // Si llega un idioma desconocido, español por defecto
  if (!TEXTOS[nuevo]) nuevo = "es";
  idiomaActual = nuevo;

  // D.1 Atributo lang de <html>: lo usan los lectores de pantalla
  //     (pronunciación) y los traductores automáticos del navegador
  document.documentElement.lang = nuevo;

  // D.2 Textos simples: textContent sustituye solo el texto
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });

  // D.3 Textos con formato (<b>…</b>, <em>…</em>): innerHTML interpreta las etiquetas.
  //     SEGURIDAD: innerHTML solo con NUESTROS textos (este diccionario).
  //     Nunca con datos que lleguen de la API o del usuario: podrían
  //     inyectar código en la página (ataque XSS).
  //     data-i18n-html en el HTML → dataset.i18nHtml en JS (camelCase).
  document.querySelectorAll("[data-i18n-html]").forEach((el) => {
    el.innerHTML = t(el.dataset.i18nHtml);
  });

  // D.4 Botón de idioma: muestra el idioma AL QUE se cambiaría (como en drm-data.com)
  const boton = document.getElementById("boton-idioma");
  boton.textContent = t("idioma.boton");
  boton.setAttribute("aria-label", t("idioma.aria"));

  // D.5 Recordar la elección en el navegador del visitante.
  //     try/catch: en modo privado o con el almacenamiento bloqueado,
  //     localStorage puede dar error; entonces no se recuerda, pero la web sigue funcionando.
  try { localStorage.setItem(CLAVE_IDIOMA, nuevo); } catch { /* sin memoria, sin problema */ }

  // D.6 Avisar a app.js y cartera.js para que repinten sus textos y cifras
  document.dispatchEvent(new CustomEvent("idioma-cambiado", { detail: { idioma: nuevo } }));
}


// ---------------------------------------------------------------------
// E. IDIOMA INICIAL Y BOTÓN EN/ES
// ---------------------------------------------------------------------
// Prioridad: 1) lo que eligió el visitante la última vez
//            2) el idioma de su navegador (español → es; cualquier otro → en)
function idiomaInicial() {
  try {
    const guardado = localStorage.getItem(CLAVE_IDIOMA);
    if (TEXTOS[guardado]) return guardado;
  } catch { /* almacenamiento no disponible */ }
  return (navigator.language || "es").toLowerCase().startsWith("es") ? "es" : "en";
}

// Al pulsar el botón se cambia al otro idioma
document.getElementById("boton-idioma").addEventListener("click", () => {
  aplicarIdioma(idiomaActual === "es" ? "en" : "es");
});

// Arranque: NO se aplica aquí, sino desde app.js (iniciar), cuando app.js ya
// está escuchando el evento "idioma-cambiado". Si se aplicara aquí, el evento
// se lanzaría antes de que app.js existiera y nadie pintaría sus textos.
