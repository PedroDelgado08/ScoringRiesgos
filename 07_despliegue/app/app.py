import os
import requests
import streamlit as st
import pandas as pd
from streamlit_echarts import st_echarts


# =========================
# CONFIGURACIÓN TÉCNICA
# =========================
API_BASE_URL = "https://caso-riesgos-api.onrender.com"
SCORE_ENDPOINT = "/predict"
WARMUP_ENDPOINT = "/docs"
DEFAULT_TIMEOUT = 30
WARMUP_TIMEOUT = 10
ENABLE_WARMUP = True
WARMUP_RETRIES = 1
SCORING_RETRIES = 1
DEBUG_MODE = False

# =========================
# CONFIGURACIÓN VISUAL
# =========================
PAGE_TITLE = "DS4B Risk Score Analyzer"
FAVICON_PATH = os.path.join("assets", "favicon.png")
LOGO_PATH = os.path.join("assets", "logo_empresa.jpg")

st.set_page_config(
    page_title=PAGE_TITLE,
    page_icon=FAVICON_PATH if os.path.exists(FAVICON_PATH) else None,
    layout="wide",
)


# =========================
# CLIENTE HTTP
# =========================
def wake_api():
    if not ENABLE_WARMUP:
        return True
    import time

    url = API_BASE_URL.rstrip("/") + WARMUP_ENDPOINT
    for _ in range(WARMUP_RETRIES + 1):
        try:
            r = requests.get(url, timeout=WARMUP_TIMEOUT)
            if r.status_code in (200, 204):
                return True
        except Exception:
            time.sleep(2)
    return False


def post_scoring(payload):
    last_error = "Error desconocido"
    url = API_BASE_URL.rstrip("/") + SCORE_ENDPOINT
    for _ in range(SCORING_RETRIES + 1):
        try:
            if ENABLE_WARMUP:
                wake_api()
            r = requests.post(url, json=payload, timeout=DEFAULT_TIMEOUT)
            if r.status_code == 200:
                return {
                    "ok": True,
                    "status_code": 200,
                    "data": r.json(),
                    "error_message": None,
                    "raw_text": r.text,
                }
            else:
                return {
                    "ok": False,
                    "status_code": r.status_code,
                    "data": None,
                    "error_message": r.text,
                    "raw_text": r.text,
                }
        except Exception as e:
            last_error = str(e)
    return {
        "ok": False,
        "status_code": None,
        "data": None,
        "error_message": last_error,
        "raw_text": None,
    }


# =========================
# HELPERS
# =========================
def get_risk_band(perdida):
    if perdida >= 5000:
        return "ALTO"
    elif perdida >= 2000:
        return "MEDIO"
    else:
        return "BAJO"


# =========================
# CARGA DE DATOS DEMO
# =========================
DEMO_PATH = os.path.join(
    os.path.dirname(__file__), "..", "api", "data", "demo_03_riesgos.csv"
)
demo_df = None
cliente_ids = [1]
if os.path.exists(DEMO_PATH):
    try:
        demo_df = pd.read_csv(DEMO_PATH)
        if "id_cliente" in demo_df.columns:
            cliente_ids = demo_df["id_cliente"].drop_duplicates().tolist()
    except Exception:
        pass


# =========================
# SIDEBAR
# =========================
with st.sidebar:
    if os.path.exists(LOGO_PATH):
        st.image(LOGO_PATH, width=220)
    st.title("Simulador de Riesgo Crediticio")
    st.markdown("---")
    id_cliente = st.selectbox("Seleccionar cliente", options=cliente_ids, index=0)

    def get_value(col, default):
        if (
            demo_df is not None
            and col in demo_df.columns
            and id_cliente in demo_df["id_cliente"].values
        ):
            val = demo_df.loc[demo_df["id_cliente"] == id_cliente, col].values
            if len(val) > 0:
                return val[0]
        return default

    principal = st.slider(
        "Principal (€)",
        min_value=1000,
        max_value=50000,
        step=500,
        value=int(get_value("principal", 20000)),
        help="Importe del préstamo solicitado",
    )
    tipo_interes = st.slider(
        "Tipo de interés (%)",
        min_value=2.0,
        max_value=15.0,
        step=0.1,
        value=float(get_value("tipo_interes", 4.5)),
        help="Tipo de interés nominal anual",
    )
    _nc_default = int(get_value("num_cuotas", 36))
    _nc_options = [12, 24, 36, 48, 60]
    num_cuotas = st.radio(
        "Duración (meses)",
        options=_nc_options,
        index=_nc_options.index(_nc_default) if _nc_default in _nc_options else 2,
        help="Duración del préstamo en meses",
    )
    finalidad = st.selectbox(
        "Finalidad",
        [
            "home_improvement",
            "debt_consolidation",
            "car",
            "vacation",
            "medical",
            "other",
        ],
        index=0,
        help="Finalidad del préstamo",
    )
    _viv_default = str(get_value("vivienda", "MORTGAGE")).upper()
    _viv_options = ["MORTGAGE", "OWN", "RENT"]
    vivienda = st.selectbox(
        "Vivienda",
        _viv_options,
        index=_viv_options.index(_viv_default) if _viv_default in _viv_options else 0,
        help="Situación de la vivienda",
    )
    st.markdown("---")
    ejecutar = st.button("Calcular riesgo")


# =========================
# PANEL PRINCIPAL
# =========================
RISK_COLORS = {"ALTO": "#DC2626", "MEDIO": "#3B82F6", "BAJO": "#16A34A"}
RISK_TXT = {
    "ALTO": "No aprobar",
    "MEDIO": "Revisar manualmente",
    "BAJO": "Se recomienda aprobar",
}
GAUGE_COLORS = [[0.3, "#16A34A"], [0.7, "#3B82F6"], [1.0, "#DC2626"]]

st.markdown(
    f"<h1 style='text-align:center;'>{PAGE_TITLE}</h1>",
    unsafe_allow_html=True,
)

if "scoring_result" not in st.session_state:
    st.session_state["scoring_result"] = None

if ejecutar:
    payload = [
        {
            "id_cliente": id_cliente,
            "principal": principal,
            "tipo_interes": tipo_interes,
            "num_cuotas": num_cuotas,
            "finalidad": finalidad,
            "vivienda": vivienda,
        }
    ]
    with st.spinner("Calculando riesgo..."):
        result = post_scoring(payload)
    if result["ok"] and isinstance(result["data"], list) and len(result["data"]) > 0:
        st.session_state["scoring_result"] = result["data"][0]
    else:
        st.session_state["scoring_result"] = None
        st.error(f"Error en la inferencia: {result['error_message']}")
        if DEBUG_MODE:
            st.json(result)

data = st.session_state["scoring_result"]

if data:
    pe_euros = data["perdida_esperada"] * principal
    riesgo_tipo = get_risk_band(pe_euros)
    color = RISK_COLORS[riesgo_tipo]
    txt = RISK_TXT[riesgo_tipo]

    # 3.1 KPI: Pérdida Esperada
    st.markdown(
        f"""
        <div style='background:{color};padding:2rem 1rem 1.2rem 1rem;border-radius:16px;margin-bottom:1.5rem;'>
            <h1 style='color:white;margin:0;font-size:2.5rem;'>Pérdida esperada: {pe_euros:.2f} €</h1>
            <h3 style='color:white;margin:0;font-weight:600;'>{txt}</h3>
        </div>
        """,
        unsafe_allow_html=True,
    )

    # 3.2 Barra de impacto
    pct = min(100 * pe_euros / principal, 100) if principal else 0
    st.markdown(
        "<p style='font-size:1.25rem;font-weight:700;margin-bottom:4px;'>Impacto de la pérdida sobre el préstamo</p>",
        unsafe_allow_html=True,
    )
    bar_opts = {
        "xAxis": {
            "type": "value",
            "min": 0,
            "max": 100,
            "splitLine": {"show": False},
            "axisLabel": {"formatter": "{value}%", "fontSize": 14, "margin": 12},
        },
        "yAxis": {
            "type": "category",
            "data": [""],
            "axisLine": {"show": False},
            "axisTick": {"show": False},
        },
        "series": [
            {
                "type": "bar",
                "data": [round(pct, 2)],
                "barWidth": 40,
                "itemStyle": {"color": color},
                "label": {
                    "show": True,
                    "position": "right",
                    "formatter": f"{pct:.2f}% ({pe_euros:.2f} €)",
                    "fontSize": 16,
                    "color": "#333",
                },
                "markLine": {
                    "symbol": ["none", "none"],
                    "silent": True,
                    "data": [
                        {
                            "xAxis": 50,
                            "lineStyle": {
                                "type": "dashed",
                                "color": "#e53e3e",
                                "width": 2,
                            },
                            "label": {
                                "show": True,
                                "formatter": "50%",
                                "position": "insideEndTop",
                                "color": "#e53e3e",
                                "fontSize": 13,
                            },
                        }
                    ],
                },
            }
        ],
        "grid": {"left": 10, "right": 200, "top": 15, "bottom": 35},
    }
    st_echarts(bar_opts, height="110px")
    st.caption("Umbral de alerta: 50% del principal")
    st.markdown("---")

    # 3.3 Gauges: PD arriba, EAD y LGD debajo
    st.markdown(
        "<p style='text-align:center;font-size:1.5rem;font-weight:700;'>Métricas de riesgo</p>",
        unsafe_allow_html=True,
    )
    st.markdown("<br>", unsafe_allow_html=True)

    # Fila 1: PD centrado
    _, col_pd, _ = st.columns([1, 2, 1])
    with col_pd:
        st_echarts(
            {
                "series": [
                    {
                        "type": "gauge",
                        "min": 0,
                        "max": 100,
                        "radius": "90%",
                        "center": ["50%", "60%"],
                        "progress": {"show": True, "width": 22, "roundCap": True},
                        "axisLine": {"lineStyle": {"width": 22, "color": GAUGE_COLORS}},
                        "pointer": {"width": 8},
                        "detail": {
                            "valueAnimation": True,
                            "formatter": "{value} %",
                            "fontSize": 36,
                        },
                        "data": [
                            {"value": round(data["score_pd"] * 100, 2), "name": "PD"}
                        ],
                    }
                ]
            },
            height="400px",
        )

    # Fila 2: EAD y LGD
    col_ead, col_lgd = st.columns(2)
    with col_ead:
        st_echarts(
            {
                "series": [
                    {
                        "type": "gauge",
                        "min": 0,
                        "max": 100,
                        "radius": "80%",
                        "center": ["50%", "60%"],
                        "progress": {"show": True, "width": 16, "roundCap": True},
                        "axisLine": {"lineStyle": {"width": 16, "color": GAUGE_COLORS}},
                        "pointer": {"width": 5},
                        "detail": {
                            "valueAnimation": True,
                            "formatter": "{value} %",
                            "fontSize": 22,
                        },
                        "data": [
                            {"value": round(data["score_ead"] * 100, 2), "name": "EAD"}
                        ],
                    }
                ]
            },
            height="300px",
        )
        st.markdown(
            f"<div style='text-align:center;font-size:1.1rem;'>"
            f"EAD: {data['score_ead']*100:.2f}%<br>({data['score_ead']*principal:.2f} €)</div>",
            unsafe_allow_html=True,
        )

    with col_lgd:
        st_echarts(
            {
                "series": [
                    {
                        "type": "gauge",
                        "min": 0,
                        "max": 100,
                        "radius": "80%",
                        "center": ["50%", "60%"],
                        "progress": {"show": True, "width": 16, "roundCap": True},
                        "axisLine": {"lineStyle": {"width": 16, "color": GAUGE_COLORS}},
                        "pointer": {"width": 5},
                        "detail": {
                            "valueAnimation": True,
                            "formatter": "{value} %",
                            "fontSize": 22,
                        },
                        "data": [
                            {"value": round(data["score_lgd"] * 100, 2), "name": "LGD"}
                        ],
                    }
                ]
            },
            height="300px",
        )
        st.markdown(
            f"<div style='text-align:center;font-size:1.1rem;'>LGD: {data['score_lgd']*100:.2f}%</div>",
            unsafe_allow_html=True,
        )

else:
    st.info("Introduce los datos y pulsa 'Calcular riesgo'.")
