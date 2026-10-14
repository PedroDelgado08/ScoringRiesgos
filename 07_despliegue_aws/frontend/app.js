// =====================================================================
// app.js · Page behavior
// ---------------------------------------------------------------------
// Connects the HTML with the API: requests data, reacts to what the
// user does and paints the results. Same numbering as index.html and
// styles.css.
//
// DEPENDS ON (loaded before, see the HTML <head>):
//   · config.js → window.APP_CONFIG.API_URL
//   · i18n.js   → t("key", {placeholders}) and locale()
//   NOTE: regular scripts share the global scope. If t, locale or
//   TEXTOS were declared again here, the browser would throw an error.
//
// MAP
//   A. Configuration and utilities (number formatting)
//   B. API calls
//   C. Page state (the data that gets painted)
//   1. Header: API status indicator
//   2. Form: clients, profile, values, installment, button
//   3. Results: evaluation, error and painting
//   D. Repainting on language change
//   E. Events and startup
// =====================================================================


// ---------------------------------------------------------------------
// A. CONFIGURATION AND UTILITIES
// ---------------------------------------------------------------------

// API URL without trailing slash (to avoid generating "…com//health")
const API_URL = window.APP_CONFIG.API_URL.replace(/\/$/, "");

// Maximum wait time per request. API Gateway cuts off at 30 s
// and the Lambda has Timeout: 29 (template.yaml), so waiting longer
// would make no sense. The cold start (~6 s) fits easily.
const TIEMPO_MAXIMO_MS = 30000;

// Shortcut: $("id") instead of document.getElementById("id")
const $ = (id) => document.getElementById(id);

// --- Number formatting for the active language (locale() from i18n.js) ---
//   formatoEuros(20000, 0)  → es: "20.000 €"   en: "€20,000"
//   formatoPct(0.3644)      → es: "36,4 %"     en: "36.4%"
//   formatoNumero(5.87, 1)  → es: "5,9"        en: "5.9"
// toLocaleString is the equivalent of formatting with f"{x:,.2f}" in
// Python, but aware of each country's conventions.
function formatoEuros(valor, decimales = 2) {
  return valor.toLocaleString(locale(), {
    style: "currency", currency: "EUR",
    minimumFractionDigits: decimales, maximumFractionDigits: decimales,
  });
}

function formatoPct(fraccion, decimales = 1) {
  return fraccion.toLocaleString(locale(), {
    style: "percent",
    minimumFractionDigits: decimales, maximumFractionDigits: decimales,
  });
}

function formatoNumero(valor, decimales = 1) {
  return valor.toLocaleString(locale(), {
    minimumFractionDigits: decimales, maximumFractionDigits: decimales,
  });
}


// ---------------------------------------------------------------------
// B. API CALLS
// ---------------------------------------------------------------------
/**
 * pedirApi("/path", options) → response data (JSON already parsed).
 * If the API responds with an error (404, 422, 500…) or does not respond in time,
 * it throws an Error with a readable message, caught by the caller.
 *
 * async/await: "await" waits for the response WITHOUT freezing the page;
 * meanwhile the user can keep using the form.
 */
async function pedirApi(ruta, opciones = {}) {
  // AbortController: allows cancelling fetch if it takes too long
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), TIEMPO_MAXIMO_MS);

  try {
    const respuesta = await fetch(API_URL + ruta, { ...opciones, signal: controlador.signal });

    // Read the body as JSON (if it is not JSON, null instead of breaking)
    const datos = await respuesta.json().catch(() => null);

    // respuesta.ok = status 200-299. Otherwise, an error with FastAPI's
    // "detail" (e.g. "Clientes no encontrados: [1]") or the HTTP status
    if (!respuesta.ok) {
      const detalle = typeof datos?.detail === "string" ? datos.detail : `HTTP ${respuesta.status}`;
      throw new Error(detalle);
    }
    return datos;

  } catch (error) {
    if (error.name === "AbortError") throw new Error(t("error.timeout"));
    throw error; // the remaining errors (network, CORS, HTTP) propagate upwards
  } finally {
    clearTimeout(temporizador); // always runs: do not leave the timer alive
  }
}


// ---------------------------------------------------------------------
// C. PAGE STATE
// ---------------------------------------------------------------------
// "Raw" data (no format or language). The painting functions
// turn it into text; that way, on a language change, the page is
// repainted without calling the API again.
let estadoApi = { clase: "cargando", clave: "estado.cargando", segundos: null }; // section 1
let clientes = [];          // response of GET /clientes (section 2)
let evaluando = false;      // is a request to /predict in progress? (section 2.8)
let ultimoError = null;     // { clave, detalle } of the last error (section 3.2)
let ultimoResultado = null; // { resultado, datos } of the last evaluation (section 3.3)


// ---------------------------------------------------------------------
// 1. HEADER · API status indicator
// ---------------------------------------------------------------------
function cambiarEstado(clase, clave, segundos = null) {
  estadoApi = { clase, clave, segundos };
  pintarEstado();
}

function pintarEstado() {
  // The class sets the dot's color (see styles.css, section 1.2)
  $("estado").className = `estado ${estadoApi.clase}`;
  const huecos = estadoApi.segundos != null ? { s: formatoNumero(estadoApi.segundos, 1) } : {};
  $("estado-texto").textContent = t(estadoApi.clave, huecos);
}


// ---------------------------------------------------------------------
// 2. FORM
// ---------------------------------------------------------------------

// 2.1 Clients: request them from the API and fill the dropdown
async function cargarClientes() {
  try {
    clientes = await pedirApi("/clientes");
  } catch {
    clientes = [];
    mostrarError("error.clientes");
  }
  pintarClientes();
  // Without clients nothing can be evaluated: the button stays disabled
  $("boton").disabled = clientes.length === 0;
}

function pintarClientes() {
  if (clientes.length === 0) return; // the "Loading…" option stays

  const desplegable = $("id_cliente");
  const elegido = desplegable.value; // keep the selection when repainting

  // new Option(visible text, value) creates an <option>.
  // replaceChildren replaces all the options at once.
  desplegable.replaceChildren(
    ...clientes.map((c) =>
      new Option(t("form.opcionCliente", { id: c.id_cliente, rating: c.rating ?? "–" }), c.id_cliente)
    )
  );
  if (elegido) desplegable.value = elegido;

  pintarPerfil();
}

// 2.2 Profile of the selected client
function pintarPerfil() {
  // Find the chosen client in the list (like df[df.id_cliente == x])
  const cliente = clientes.find((c) => String(c.id_cliente) === $("id_cliente").value);
  $("perfil").hidden = !cliente;
  if (!cliente) return;

  $("perfil-rating").textContent = cliente.rating ?? "–";
  $("perfil-ingresos").textContent = cliente.ingresos != null ? formatoEuros(cliente.ingresos, 0) : "–";
  // dti comes in percentage points (27.93 = 27.93 %): divided by 100
  $("perfil-dti").textContent = cliente.dti != null ? formatoPct(cliente.dti / 100, 2) : "–";
  // The field name contains «ü»: this file must be saved as UTF-8
  $("perfil-antiguedad").textContent = traducirAntiguedad(cliente["antigüedad_empleo"]);
}

// "4 years" → "4 años", "< 1 year" → "< 1 año", "10+ years" → "10+ años"
function traducirAntiguedad(texto) {
  if (!texto) return "–";
  return texto
    .replace(/years/, t("perfil.anios"))
    .replace(/\byear\b/, t("perfil.anio")); // \b = word boundary
}

// 2.3 - 2.6 Read the form in the format the API expects.
// Each field maps to one in RegistroEntrada (schemas.py).
// Number(…): HTML values are always text; the API expects numbers.
function leerFormulario() {
  return {
    id_cliente: Number($("id_cliente").value),
    principal: Number($("principal").value),
    tipo_interes: Number($("tipo_interes").value),
    num_cuotas: Number(document.querySelector('input[name="num_cuotas"]:checked').value),
    finalidad: $("finalidad").value,
    vivienda: $("vivienda").value,
  };
}

// How each slider is displayed (for its <output> and its legend).
// tipo_interes comes in percentage points (12 = 12 %): / 100.
const FORMATO_DESLIZADOR = {
  principal: (v, dec = 0) => formatoEuros(v, dec),
  tipo_interes: (v, dec = 1) => formatoPct(v / 100, dec),
};

// 2.7 Monthly installment: same formula as cuota_francesa() in scoring.py
function cuotaFrancesa(principal, numCuotas, tipoInteres) {
  const i = tipoInteres / 12 / 100;                 // monthly interest
  return (principal * i * (1 + i) ** numCuotas) / ((1 + i) ** numCuotas - 1);
}

// Runs on every form change: updates the displayed values,
// the legends and the installment (all in the browser, no API)
function pintarResumen() {
  const datos = leerFormulario();

  // 2.3 / 2.4 Chosen value and min/max legend of each slider
  for (const [id, formatear] of Object.entries(FORMATO_DESLIZADOR)) {
    const deslizador = $(id);
    $(id === "principal" ? "principal-valor" : "tipo-valor").textContent = formatear(datos[id]);

    // The legend is the element right after the slider (see HTML)
    const [textoMin, textoMax] = deslizador.nextElementSibling.children;
    textoMin.textContent = formatear(Number(deslizador.min), 0);
    textoMax.textContent = formatear(Number(deslizador.max), 0);
  }

  // 2.7 Monthly installment
  const cuota = cuotaFrancesa(datos.principal, datos.num_cuotas, datos.tipo_interes);
  $("cuota").textContent = t("form.cuotaValor", { importe: formatoEuros(cuota) });
}

// 2.8 Button text depending on whether an evaluation is running
function pintarBoton() {
  $("boton").textContent = t(evaluando ? "form.botonEvaluando" : "form.boton");
}


// ---------------------------------------------------------------------
// 3. RESULTS
// ---------------------------------------------------------------------

// 3.0 Evaluate: runs when the form is submitted (button 2.8)
async function evaluar(evento) {
  // By default, submitting a form RELOADS the page. We prevent that:
  // we make the request ourselves with fetch.
  evento.preventDefault();

  const datos = leerFormulario();
  evaluando = true;
  $("boton").disabled = true;   // prevents double clicks = double requests
  pintarBoton();
  ocultarError();

  try {
    // The API receives and returns a LIST (LoteEntrada): [datos] is sent
    // and the first element of the response ([resultado]) is taken.
    // content-type: application/json → tells FastAPI that the body
    // is JSON. Only on the POST: on a GET it would force the browser to
    // make an unnecessary CORS preflight request.
    const [resultado] = await pedirApi("/predict", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify([datos]),   // JS object → JSON text (like json.dumps)
    });
    ultimoResultado = { resultado, datos };
    pintarResultado();
    cambiarEstado("ok", "estado.ok"); // if it responded, the model is ready

  } catch (error) {
    mostrarError("error.evaluar", error.message);
  } finally {
    evaluando = false;
    $("boton").disabled = false;
    pintarBoton();
  }
}

// 3.2 Error message
function mostrarError(clave, detalle = "") {
  ultimoError = { clave, detalle };
  pintarError();
}

function ocultarError() {
  ultimoError = null;
  pintarError();
}

function pintarError() {
  $("error").hidden = !ultimoError;
  if (!ultimoError) return;
  // SECURITY: textContent, never innerHTML. The detail comes from the API
  // and is treated as plain text, without interpreting HTML tags.
  $("error").textContent = t(ultimoError.clave, { detalle: ultimoError.detalle });
}

// 3.3 Paint the result (ScoringSalida)
function pintarResultado() {
  if (!ultimoResultado) return;
  const { resultado, datos } = ultimoResultado;

  // 3.1 → 3.3: hide the empty state and show the result
  $("vacio").hidden = true;
  $("resultado").hidden = false;

  // 3.3.1 Expected loss. perdida_esperada = PD × EAD × LGD (fraction
  // of the amount); in euros it is multiplied by the requested amount.
  $("pe-euros").textContent = formatoEuros(resultado.perdida_esperada * datos.principal);
  $("pe-porcentaje").textContent = t("res.pePie", { pct: formatoPct(resultado.perdida_esperada, 2) });

  // 3.3.2 Parameters: value in % and bar width (0-100 %)
  const parametros = [
    ["pd", resultado.score_pd],
    ["ead", resultado.score_ead],
    ["lgd", resultado.score_lgd],
  ];
  for (const [nombre, valor] of parametros) {
    $(`${nombre}-valor`).textContent = formatoPct(valor);
  }
  // The bars are set an instant AFTER showing the block:
  // if done at the same time as removing "hidden", the browser would not
  // see the change from 0 to the value and would not animate the CSS transition.
  // requestAnimationFrame = "on the next screen frame".
  requestAnimationFrame(() => requestAnimationFrame(() => {
    for (const [nombre, valor] of parametros) {
      $(`${nombre}-barra`).style.width = `${valor * 100}%`;
    }
  }));

  // On mobile (one column) the results sit below the
  // form: scroll down to them. 859px = breakpoint in styles.css (D.1)
  if (window.matchMedia("(max-width: 859px)").matches) {
    $("resultado").scrollIntoView({ behavior: "smooth", block: "start" });
  }
}


// ---------------------------------------------------------------------
// D. REPAINTING ON LANGUAGE CHANGE
// ---------------------------------------------------------------------
// i18n.js translates the fixed texts (data-i18n) and then fires the
// "idioma-cambiado" event. Here, what app.js generates is repainted with
// the same data saved in section C: no API calls at all.
function repintarTodo() {
  pintarEstado();
  pintarClientes();   // includes the profile (2.2)
  pintarResumen();
  pintarBoton();
  pintarError();
  // The result without scrolling the page: only the texts are repainted
  if (ultimoResultado) {
    const { resultado, datos } = ultimoResultado;
    $("pe-euros").textContent = formatoEuros(resultado.perdida_esperada * datos.principal);
    $("pe-porcentaje").textContent = t("res.pePie", { pct: formatoPct(resultado.perdida_esperada, 2) });
    $("pd-valor").textContent = formatoPct(resultado.score_pd);
    $("ead-valor").textContent = formatoPct(resultado.score_ead);
    $("lgd-valor").textContent = formatoPct(resultado.score_lgd);
  }
}


// ---------------------------------------------------------------------
// E. EVENTS AND STARTUP
// ---------------------------------------------------------------------

// E.1 Wire events to functions
//   "submit": the button is pressed (or Enter inside the form)
//   "input":  any control changes (sliders, radios, dropdowns);
//             the event "bubbles up" from the control to the <form>, so
//             a single listener covers them all
//   "change": another client is selected
$("formulario").addEventListener("submit", evaluar);
$("formulario").addEventListener("input", pintarResumen);
$("id_cliente").addEventListener("change", pintarPerfil);
document.addEventListener("idioma-cambiado", repintarTodo);

// E.2 Page startup
async function iniciar() {
  pintarResumen();
  pintarBoton();
  cambiarEstado("cargando", "estado.cargando");

  // PREWARMING: /health wakes up the Lambda while the visitor reads
  // the page. The time it takes is measured to show the cold start.
  // performance.now() = stopwatch in milliseconds (like time.perf_counter).
  const inicio = performance.now();
  try {
    await pedirApi("/health");
    const segundos = (performance.now() - inicio) / 1000;
    // More than 2 s = there was a cold start: its duration is shown
    if (segundos > 2) cambiarEstado("ok", "estado.okArranque", segundos);
    else cambiarEstado("ok", "estado.ok");
  } catch {
    cambiarEstado("error", "estado.error");
  }

  // /clientes goes AFTER /health, not at the same time, on purpose: a
  // Lambda container handles one request at a time. Two simultaneous
  // requests while cold would start TWO containers (two starts of
  // ~5 s). In sequence, /clientes reaches an already warm container (~7 ms).
  await cargarClientes();
}

iniciar();