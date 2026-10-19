// =====================================================================
// app.js · Comportamiento de la página (simulador, pestañas y tema)
// ---------------------------------------------------------------------
// Conecta el HTML con la API: pide datos, reacciona a lo que hace el
// usuario y pinta los resultados. Misma numeración que index.html y
// styles.css. El cuadro de mando de la pestaña Cartera está en cartera.js.
//
// DEPENDE DE (cargados antes, ver el <head> del HTML):
//   · config.js → window.APP_CONFIG.API_URL
//   · i18n.js   → t("clave", {huecos}), locale(), aplicarIdioma(), idiomaInicial()
//   NOTA: los scripts normales comparten el ámbito global. Si aquí se
//   volvieran a declarar t, locale o TEXTOS, el navegador daría un error.
//
// MAPA
//   A. Configuración y utilidades (formato de números y fechas)
//   B. Llamadas a la API
//   C. Estado de la página (los datos que se pintan)
//   1. Cabecera: estado de la API, tema y pestañas
//   2. Formulario: clientes, cliente nuevo, leer y rellenar campos
//   3. Resultado: evaluar, errores y pintado
//   D. Repintar al cambiar de idioma
//   E. Eventos y arranque
// =====================================================================


// ---------------------------------------------------------------------
// A. CONFIGURACIÓN Y UTILIDADES
// ---------------------------------------------------------------------

// URL de la API sin barra final (para no generar "…com//health")
const API_URL = window.APP_CONFIG.API_URL.replace(/\/$/, "");

// Tiempo máximo de espera por petición. API Gateway corta a los 30 s
// y la Lambda tiene Timeout: 29 (template.yaml), así que esperar más
// no tendría sentido. El arranque en frío (~5 s) cabe de sobra.
const TIEMPO_MAXIMO_MS = 30000;

// Atajo: $("id") en lugar de document.getElementById("id")
const $ = (id) => document.getElementById(id);

// --- Formato de números para el idioma activo (locale() de i18n.js) ---
//   formatoDolares(35000)   → es: "35.000 $"   en: "$35,000"
//   formatoPct(0.0752)      → es: "7,5 %"      en: "7.5%"
//   formatoNumero(4.27, 1)  → es: "4,3"        en: "4.3"
// toLocaleString equivale a formatear con f"{x:,.2f}" en Python, pero
// conoce las costumbres de cada país.
// currencyDisplay "narrowSymbol": escribe "$" y no "US$" (lo que haría es-ES).
// useGrouping "always": en español, por norma, los números de 4 cifras no
// llevan punto de miles ("1757 $"); así se escribe "1.757 $", como drm-data.com.
function formatoDolares(valor, decimales = 0) {
  return valor.toLocaleString(locale(), {
    style: "currency", currency: "USD", currencyDisplay: "narrowSymbol", useGrouping: "always",
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
    useGrouping: "always",   // "1.397" y no "1397" (ver formatoDolares)
    minimumFractionDigits: decimales, maximumFractionDigits: decimales,
  });
}

// "2015-09-01" → es: "sept 2015"   en: "Sep 2015"
// Se construye la fecha con año y mes por separado: new Date("2015-09-01")
// la interpretaría en hora UTC y en algunos husos daría el 31 de agosto.
function formatoMes(textoFecha) {
  const [anio, mes] = textoFecha.split("-").map(Number);
  return new Date(anio, mes - 1, 1).toLocaleDateString(locale(), { month: "short", year: "numeric" });
}

// Fecha de hoy en formato "aaaa-mm-dd" (el que usan los <input type="date"> y la API)
function hoy() {
  const d = new Date();
  const dosCifras = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${dosCifras(d.getMonth() + 1)}-${dosCifras(d.getDate())}`;
}


// ---------------------------------------------------------------------
// B. LLAMADAS A LA API
// ---------------------------------------------------------------------
/**
 * pedirApi("/ruta", opciones, reintentos) → datos de la respuesta (JSON ya leído).
 * Si la API responde con error (404, 422, 500…) o no responde a tiempo,
 * lanza un Error con un mensaje legible, que recoge quien la llama.
 *
 * reintentos: cuántas veces repetir si la API responde 503. Tras un
 * despliegue, la primera petición puede dar 503 porque la Lambda tarda en
 * arrancar más de lo que espera API Gateway; la segunda ya funciona.
 *
 * async/await: "await" espera la respuesta SIN congelar la página;
 * mientras tanto el usuario puede seguir usando el formulario.
 */
async function pedirApi(ruta, opciones = {}, reintentos = 0) {
  // AbortController: permite cancelar fetch si tarda demasiado
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), TIEMPO_MAXIMO_MS);

  try {
    const respuesta = await fetch(API_URL + ruta, { ...opciones, signal: controlador.signal });

    // 503 con reintentos pendientes: espera 2 s y lo vuelve a intentar
    if (respuesta.status === 503 && reintentos > 0) {
      await new Promise((resolver) => setTimeout(resolver, 2000));
      return pedirApi(ruta, opciones, reintentos - 1);
    }

    // Leer el cuerpo como JSON (si no es JSON, null en lugar de romper)
    const datos = await respuesta.json().catch(() => null);

    // respuesta.ok = estado 200-299. Si no, error con el detalle de FastAPI
    if (!respuesta.ok) throw new Error(detalleError(datos, respuesta.status));
    return datos;

  } catch (error) {
    if (error.name === "AbortError") throw new Error(t("error.timeout"));
    throw error; // el resto de errores (red, CORS, HTTP) siguen hacia arriba
  } finally {
    clearTimeout(temporizador); // se ejecuta siempre: no dejar el temporizador vivo
  }
}

// Convierte el "detail" de FastAPI en un texto legible:
//   · un texto ("El lote está vacío") se usa tal cual
//   · un error 422 de Pydantic es una LISTA de errores, cada uno con
//     loc (dónde: ["body", 0, "fico"]) y msg (qué pasa); se muestra "fico: …"
//   · si no hay detalle, el código HTTP ("HTTP 500")
function detalleError(datos, estado) {
  const detalle = datos?.detail;
  if (typeof detalle === "string") return detalle;
  if (Array.isArray(detalle)) {
    return detalle.map((e) => `${e.loc?.at(-1) ?? ""}: ${e.msg}`).join(" · ");
  }
  return `HTTP ${estado}`;
}


// ---------------------------------------------------------------------
// C. ESTADO DE LA PÁGINA
// ---------------------------------------------------------------------
// Datos "en bruto" (sin formato ni idioma). Las funciones de pintado
// los convierten en texto; así, al cambiar de idioma, se repinta la
// página sin volver a llamar a la API.
let estadoApi = { clase: "cargando", clave: "estado.cargando", segundos: null }; // sección 1.1
let clientes = [];          // respuesta de GET /clientes (sección 2.1)
let notaFiltro = "";        // nota elegida en los chips ("" = todas)
let clienteActual = null;   // cliente de la muestra elegido (null si es un cliente nuevo)
let modoNuevo = false;      // ¿se está puntuando un cliente nuevo? (sección 2.3)
let evaluando = false;      // ¿hay una petición a /predict en curso? (sección 2.6)
let ultimoError = null;     // { clave, detalle } del último error (sección 3.2)
let ultimoResultado = null; // { resultado, datos, nuevo, editado } de la última evaluación (sección 3.3)


// ---------------------------------------------------------------------
// 1. CABECERA
// ---------------------------------------------------------------------

// 1.1 Indicador de estado de la API
function cambiarEstado(clase, clave, segundos = null) {
  estadoApi = { clase, clave, segundos };
  pintarEstado();
}

function pintarEstado() {
  // La clase fija el color del punto (ver styles.css, sección 1.3.a)
  $("estado").className = `estado ${estadoApi.clase}`;
  const huecos = estadoApi.segundos != null ? { s: formatoNumero(estadoApi.segundos, 1) } : {};
  $("estado-texto").textContent = t(estadoApi.clave, huecos);
}

// 1.2 Tema claro / oscuro.
// El tema se guarda como atributo data-theme en <html>; las variables CSS
// de styles.css (sección A) cambian de valor solas. Claro por defecto.
function temaActual() {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

function cambiarTema() {
  const nuevo = temaActual() === "dark" ? "light" : "dark";
  if (nuevo === "dark") document.documentElement.setAttribute("data-theme", "dark");
  else document.documentElement.removeAttribute("data-theme");
  // Recordarlo para la próxima visita (lo lee el script del <head>)
  try { localStorage.setItem("drm-theme", nuevo); } catch { /* sin almacenamiento */ }
  pintarBotonTema();
  // Avisar a cartera.js: los gráficos de ECharts no usan CSS y hay que repintarlos
  document.dispatchEvent(new CustomEvent("tema-cambiado", { detail: { tema: nuevo } }));
}

// El texto para lectores de pantalla dice a qué tema se cambiará
function pintarBotonTema() {
  $("boton-tema").setAttribute("aria-label", t(temaActual() === "dark" ? "aria.temaClaro" : "aria.temaOscuro"));
}

// 1.3 Pestañas Simulador / Cartera.
// Solo se ve el panel de la pestaña activa (los demás llevan hidden).
// La pestaña también se refleja en la dirección (#cartera), para poder
// enlazar directamente al cuadro de mando.
function activarPestana(nombre) {
  for (const pestana of ["simulador", "cartera"]) {
    const activa = pestana === nombre;
    $(`tab-${pestana}`).setAttribute("aria-selected", String(activa));
    $(`panel-${pestana}`).hidden = !activa;
  }
  // replaceState cambia la dirección sin recargar ni añadir una entrada al historial
  history.replaceState(null, "", nombre === "cartera" ? "#cartera" : location.pathname);
  // Avisar a cartera.js: la primera vez descarga ECharts y los datos
  document.dispatchEvent(new CustomEvent("pestana-cambiada", { detail: { pestana: nombre } }));
}


// ---------------------------------------------------------------------
// 2. FORMULARIO
// ---------------------------------------------------------------------

// Campos del formulario, por tipo de control. El id de cada control es
// el nombre del campo en la API (SolicitudEntrada, schemas.py)
const CAMPOS_NUMERO = ["principal", "ingresos", "dti", "fico", "num_lineas_credito",
                       "saldo_revolving", "num_consultas_6meses"];
const CAMPOS_OPCIONALES = ["num_hipotecas", "porc_uso_revolving", "porc_uso_tarjetas", "porc_tarjetas_75p"];
const CAMPOS_LISTA = ["finalidad", "vivienda", "sector_empleo", "antigüedad_empleo"];
const CAMPOS_FECHA = ["fecha_primer_credito"];
const NOTAS = ["A", "B", "C", "D", "E", "F", "G"];

// Valores de partida de un cliente nuevo: un perfil típico de la cartera
// (mediana aproximada de cada variable en Lending Club). Los opcionales
// se dejan vacíos para que los impute el pipeline.
const CLIENTE_NUEVO = {
  principal: 12000, num_cuotas: 36, finalidad: "debt_consolidation",
  vivienda: "RENT", sector_empleo: "otros", "antigüedad_empleo": "2-9",
  ingresos: 60000, dti: 17, fico: 690, num_lineas_credito: 10,
  saldo_revolving: 12000, num_consultas_6meses: 1, fecha_primer_credito: "2005-01-01",
  num_hipotecas: null, porc_uso_revolving: null, porc_uso_tarjetas: null, porc_tarjetas_75p: null,
};

// 2.1 Clientes: pedirlos a la API y rellenar el desplegable
async function cargarClientes() {
  try {
    clientes = await pedirApi("/clientes");
  } catch (error) {
    clientes = [];
    mostrarError("error.clientes", error.message);
  }
  pintarChips();
  pintarClientes();
  // Sin clientes no se puede evaluar: el botón sigue desactivado
  $("boton-evaluar").disabled = clientes.length === 0;
  // Se elige el primero para que el formulario no esté vacío
  if (clientes.length > 0) elegirCliente(clientes[0]);
}

// 2.1.a Chips de nota LC: "Todas" + A … G. El activo lleva aria-pressed="true"
function pintarChips() {
  const chips = ["", ...NOTAS].map((nota) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.dataset.nota = nota;                                  // "" = todas
    chip.textContent = nota || t("form.todas");
    chip.setAttribute("aria-pressed", String(nota === notaFiltro));
    return chip;
  });
  $("filtro-notas").replaceChildren(...chips);
}

// Clientes que pasan el filtro de nota (la nota es la primera letra de la subnota: "C3" → "C")
function clientesFiltrados() {
  return notaFiltro ? clientes.filter((c) => c.nota_lc.startsWith(notaFiltro)) : clientes;
}

// 2.1.b Opciones del desplegable. new Option(texto visible, valor) crea un <option>.
// En modo cliente nuevo se añade una opción más, arriba, que queda elegida.
function pintarClientes() {
  if (clientes.length === 0) return; // queda la opción "Cargando…"
  const opciones = clientesFiltrados().map((c) =>
    new Option(t("form.opcionCliente", { id: c.id_cliente, nota: c.nota_lc, importe: formatoDolares(c.principal) }), c.id_cliente)
  );
  if (modoNuevo) opciones.unshift(new Option(t("form.opcionNuevo"), "nuevo"));
  $("id_cliente").replaceChildren(...opciones);
  // Mantener la selección al repintar (si el cliente sigue en la lista filtrada)
  $("id_cliente").value = modoNuevo ? "nuevo" : String(clienteActual?.id_cliente ?? "");
}

// 2.2 Elegir un cliente de la muestra: rellena el formulario con sus datos
function elegirCliente(cliente) {
  modoNuevo = false;
  clienteActual = cliente;
  rellenarFormulario(cliente);
  pintarClientes();
  pintarFicha();
  pintarResumen();
}

// Al cambiar el desplegable: busca el cliente por su id (como df[df.id_cliente == x])
function alCambiarCliente() {
  const cliente = clientes.find((c) => String(c.id_cliente) === $("id_cliente").value);
  if (cliente) elegirCliente(cliente);
}

// Al pulsar un chip: filtra la lista y elige el primer cliente de esa nota
function alPulsarChip(evento) {
  const chip = evento.target.closest(".chip");   // el clic puede caer en el texto del botón
  if (!chip) return;
  notaFiltro = chip.dataset.nota;
  pintarChips();
  const lista = clientesFiltrados();
  if (lista.length > 0) elegirCliente(lista[0]);
}

// Botón "Al azar": un cliente aleatorio de la lista filtrada
function clienteAlAzar() {
  const lista = clientesFiltrados();
  if (lista.length === 0) return;
  elegirCliente(lista[Math.floor(Math.random() * lista.length)]); // índice entre 0 y n-1
}

// 2.3 Cliente nuevo: formulario con valores típicos, sin id_cliente.
// La API usa entonces la fecha de hoy como fecha de concesión.
function clienteNuevo() {
  modoNuevo = true;
  clienteActual = null;
  rellenarFormulario(CLIENTE_NUEVO);
  pintarClientes();
  pintarFicha();
  pintarResumen();
}

// Botón "Restablecer": vuelve a los datos de partida (del cliente o del cliente nuevo)
function restablecer() {
  rellenarFormulario(modoNuevo ? CLIENTE_NUEVO : clienteActual);
  pintarResumen();
}

// 2.4 Escribir unos datos en el formulario.
// Los opcionales que llegan como null (NaN en el CSV) quedan vacíos.
function rellenarFormulario(datos) {
  for (const campo of [...CAMPOS_NUMERO, ...CAMPOS_OPCIONALES, ...CAMPOS_LISTA, ...CAMPOS_FECHA]) {
    $(campo).value = datos[campo] ?? "";
  }
  // Plazo: marca el radio cuyo value coincide con num_cuotas
  document.querySelector(`input[name="num_cuotas"][value="${datos.num_cuotas}"]`).checked = true;
  // El primer crédito no puede ser posterior a la concesión (lo exige la API)
  $("fecha_primer_credito").max = clienteActual?.fecha_concesion ?? hoy();
}

// 2.5 Leer el formulario en el formato que espera la API (SolicitudEntrada).
// Number(…): los valores del HTML siempre son texto; la API espera números.
// Los opcionales vacíos se envían como null: el pipeline los imputa.
function leerFormulario() {
  const datos = {
    id_cliente: clienteActual?.id_cliente ?? null,          // null en un cliente nuevo
    num_cuotas: Number(document.querySelector('input[name="num_cuotas"]:checked').value),
    // Los clientes de la muestra envían su fecha de concesión real (2012-2015):
    // con la de hoy tendrían 10 años más de historial y una PD más baja.
    // Un cliente nuevo envía null y la API usa la de hoy.
    fecha_concesion: clienteActual?.fecha_concesion ?? null,
  };
  for (const campo of CAMPOS_NUMERO) datos[campo] = Number($(campo).value);
  for (const campo of CAMPOS_OPCIONALES) datos[campo] = $(campo).value === "" ? null : Number($(campo).value);
  for (const campo of [...CAMPOS_LISTA, ...CAMPOS_FECHA]) datos[campo] = $(campo).value;
  return datos;
}

// ¿Ha cambiado el usuario algún dato del cliente de la muestra?
// Compara campo a campo lo que hay en el formulario con lo que devolvió /clientes
function datosEditados() {
  if (!clienteActual) return false;
  const datos = leerFormulario();
  return Object.keys(datos).some((campo) => (datos[campo] ?? null) !== (clienteActual[campo] ?? null));
}

// 2.1.c Ficha del cliente: lo que hizo Lending Club con él (oculta en un cliente nuevo)
function pintarFicha() {
  $("ficha").hidden = !clienteActual;
  $("boton-nuevo").setAttribute("aria-pressed", String(modoNuevo)); // resalta el botón en modo nuevo
  if (!clienteActual) return;
  $("ficha-nota").textContent = clienteActual.nota_lc;
  // tipo_interes_lc llega en puntos porcentuales (7,26 = 7,26 %): se divide entre 100
  $("ficha-interes").textContent = formatoPct(clienteActual.tipo_interes_lc / 100, 2);
  $("ficha-concesion").textContent = formatoMes(clienteActual.fecha_concesion);
}

// Se ejecuta con cada cambio del formulario: actualiza el importe del
// deslizador, su leyenda y el aviso de "datos modificados" (sin llamar a la API)
function pintarResumen() {
  $("principal-valor").textContent = formatoDolares(Number($("principal").value));
  $("principal-min").textContent = formatoDolares(Number($("principal").min));
  $("principal-max").textContent = formatoDolares(Number($("principal").max));
  $("aviso-editado").hidden = !datosEditados();
}

// 2.6 Texto del botón según si hay una evaluación en curso
function pintarBoton() {
  $("boton-evaluar").textContent = t(evaluando ? "form.botonEvaluando" : "form.boton");
}


// ---------------------------------------------------------------------
// 3. RESULTADO
// ---------------------------------------------------------------------

// 3.0 Evaluar: se ejecuta al enviar el formulario (botón 2.6)
async function evaluar(evento) {
  // Por defecto, enviar un formulario RECARGA la página. Se evita:
  // la petición la hacemos nosotros con fetch.
  evento.preventDefault();

  // Validación en el navegador (required, min, max de cada campo).
  // reportValidity() marca el primer campo incorrecto con un aviso nativo
  // y devuelve false: así no se llama a la API con datos que rechazaría.
  // Los opcionales están plegados: si el error está ahí, se despliegan para que se vea.
  if (!$("formulario").checkValidity()) {
    if (CAMPOS_OPCIONALES.some((campo) => !$(campo).checkValidity())) {
      document.querySelector(".opcionales").open = true;
    }
    $("formulario").reportValidity();
    return;
  }

  const datos = leerFormulario();
  const editado = datosEditados();
  evaluando = true;
  $("boton-evaluar").disabled = true;   // evita dobles clics = dobles peticiones
  pintarBoton();
  ocultarError();

  try {
    // La API recibe y devuelve una LISTA (LoteEntrada): se envía [datos]
    // y se toma el primer elemento de la respuesta ([resultado]).
    // content-type: application/json → avisa a FastAPI de que el cuerpo
    // es JSON. Solo en el POST: en un GET obligaría al navegador a hacer
    // una petición previa de CORS (preflight) innecesaria.
    const [resultado] = await pedirApi("/predict", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify([datos]),   // objeto JS → texto JSON (como json.dumps)
    }, 1);
    ultimoResultado = { resultado, datos, nuevo: modoNuevo, editado };
    pintarResultado(true);
    cambiarEstado("ok", "estado.ok"); // si ha respondido, el modelo está listo

  } catch (error) {
    mostrarError("error.evaluar", error.message);
  } finally {
    evaluando = false;
    $("boton-evaluar").disabled = false;
    pintarBoton();
  }
}

// 3.2 Mensaje de error
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
  // SEGURIDAD: textContent, nunca innerHTML. El detalle viene de la API
  // y se trata como texto plano, sin interpretar etiquetas HTML.
  $("error").textContent = t(ultimoError.clave, { detalle: ultimoError.detalle });
}

// 3.3 Pintar el resultado (ScoringSalida).
// desplazar: true solo justo después de evaluar (al cambiar de idioma no se mueve la página)
function pintarResultado(desplazar = false) {
  if (!ultimoResultado) return;
  const { resultado: r, datos, nuevo, editado } = ultimoResultado;

  // 3.1 → 3.3: ocultar el estado vacío y mostrar el resultado
  $("vacio").hidden = true;
  $("resultado").hidden = false;

  // 3.3.1 Pérdida esperada = PD × EAD × LGD, en $ y en % del importe
  $("pe-importe").textContent = formatoDolares(r.perdida_esperada_importe);
  $("pe-porcentaje").textContent = t("res.pePie", {
    pct: formatoPct(r.perdida_esperada, 2), importe: formatoDolares(datos.principal),
  });

  // Parámetros: valor en % y ancho de la barra (0-100 %)
  const parametros = [["pd", r.score_pd], ["ead", r.score_ead], ["lgd", r.score_lgd]];
  for (const [nombre, valor] of parametros) {
    $(`${nombre}-valor`).textContent = formatoPct(valor);
  }
  // Las barras se ponen un instante DESPUÉS de mostrar el bloque:
  // si se hiciera a la vez que se quita "hidden", el navegador no vería
  // el paso de 0 al valor y no animaría la transición del CSS.
  // requestAnimationFrame = "en el siguiente fotograma de la pantalla".
  requestAnimationFrame(() => requestAnimationFrame(() => {
    for (const [nombre, valor] of parametros) {
      $(`${nombre}-barra`).style.width = `${valor * 100}%`;
    }
  }));

  // 3.3.2 Decil de riesgo: 10 casillas, marcada la del cliente
  $("decil-valor").textContent = t("res.decilValor", { d: r.decil_riesgo });
  const casillas = Array.from({ length: 10 }, (_, i) => {   // como range(10) en Python
    const casilla = document.createElement("span");
    casilla.textContent = i + 1;
    if (i + 1 === r.decil_riesgo) casilla.className = "activo";
    return casilla;
  });
  $("regla").replaceChildren(...casillas);

  // 3.3.3 / 3.3.4 Comparación con Lending Club, o aviso de cliente nuevo
  $("bloque-lc").hidden = nuevo;
  $("bloque-nuevo").hidden = !nuevo;
  if (!nuevo) {
    $("lc-nota").textContent = r.nota_lc;
    $("modelo-nota").textContent = r.nota_equivalente_modelo;
    $("lc-pd").textContent = formatoPct(r.pd_implicita_lc);
    $("modelo-pd").textContent = formatoPct(r.score_pd);
    $("lc-interes").textContent = formatoPct(r.tipo_interes_lc / 100, 2);
    // Insignia verde (pagó) o roja (impagó); la clase la colorea en styles.css
    $("insignia-real").textContent = t(r.impago_real ? "real.impago" : "real.pago");
    $("insignia-real").className = `insignia ${r.impago_real ? "impago" : "pago"}`;
    $("nota-editado").hidden = !editado;
  }

  // Tras calcular, si el principio del resultado no se ve (en el móvil queda
  // debajo del formulario; en escritorio, arriba si se ha bajado hasta el botón),
  // se lleva la vista hasta él. getBoundingClientRect().top = distancia del
  // bloque al borde superior de la ventana; 80 px = altura de la cabecera fija
  const arriba = $("resultado").getBoundingClientRect().top;
  if (desplazar && (arriba < 80 || arriba > window.innerHeight - 120)) {
    $("resultado").scrollIntoView({ behavior: "smooth", block: "start" });
  }
}


// ---------------------------------------------------------------------
// D. REPINTAR AL CAMBIAR DE IDIOMA
// ---------------------------------------------------------------------
// i18n.js traduce los textos fijos (data-i18n) y lanza el evento
// "idioma-cambiado". Aquí se repinta lo que genera app.js con los mismos
// datos guardados en la sección C: ninguna llamada a la API.
function repintarTodo() {
  pintarEstado();
  pintarBotonTema();
  pintarChips();
  pintarClientes();
  pintarFicha();
  pintarResumen();
  pintarBoton();
  pintarError();
  pintarResultado();
}


// ---------------------------------------------------------------------
// E. EVENTOS Y ARRANQUE
// ---------------------------------------------------------------------

// E.1 Conectar eventos con funciones
//   "submit": se pulsa el botón (o Intro dentro del formulario)
//   "input":  cambia cualquier control (deslizador, campos, desplegables);
//             el evento "sube" desde el control hasta el <form>, así que
//             un solo escuchador sirve para todos
//   "change": se elige otro cliente
$("formulario").addEventListener("submit", evaluar);
$("formulario").addEventListener("input", pintarResumen);
$("id_cliente").addEventListener("change", alCambiarCliente);
$("filtro-notas").addEventListener("click", alPulsarChip);
$("boton-azar").addEventListener("click", clienteAlAzar);
$("boton-restablecer").addEventListener("click", restablecer);
$("boton-nuevo").addEventListener("click", clienteNuevo);
$("boton-tema").addEventListener("click", cambiarTema);
$("tab-simulador").addEventListener("click", () => activarPestana("simulador"));
$("tab-cartera").addEventListener("click", () => activarPestana("cartera"));
document.addEventListener("idioma-cambiado", repintarTodo);

// E.2 Arranque de la página
async function iniciar() {
  // Idioma inicial (i18n.js). Se aplica aquí porque app.js ya escucha "idioma-cambiado"
  aplicarIdioma(idiomaInicial());
  pintarBoton();
  cambiarEstado("cargando", "estado.cargando");

  // Si la dirección termina en #cartera, se abre esa pestaña
  if (location.hash === "#cartera") activarPestana("cartera");

  // PRECALENTAMIENTO: /health despierta la Lambda mientras el visitante lee
  // la página. Se mide cuánto tarda para mostrar el arranque en frío.
  // performance.now() = cronómetro en milisegundos (como time.perf_counter).
  // 1 reintento: tras un despliegue, la primera llamada puede dar 503.
  const inicio = performance.now();
  try {
    await pedirApi("/health", {}, 1);
    const segundos = (performance.now() - inicio) / 1000;
    // Más de 2 s = ha habido arranque en frío: se muestra su duración
    if (segundos > 2) cambiarEstado("ok", "estado.okArranque", segundos);
    else cambiarEstado("ok", "estado.ok");
  } catch {
    cambiarEstado("error", "estado.error");
  }

  // /clientes va DESPUÉS de /health, no a la vez, a propósito: un
  // contenedor de Lambda atiende una petición cada vez. Dos peticiones
  // simultáneas en frío arrancarían DOS contenedores (dos arranques de
  // ~5 s). En serie, /clientes llega a un contenedor ya caliente.
  await cargarClientes();
}

iniciar();
