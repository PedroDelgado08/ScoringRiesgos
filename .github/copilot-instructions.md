- Me responderás siempre en español de España.
- Comenzarás cada mensaje con este emoji 🤖
- Siempre genera código para el script abierto, nunca para la ventana interactiva, salvo que se indique explícitamente lo contrario.
- La ventana interactiva solo se usará para verificar resultados o mensajes de error, pero no para generar código.
- No expliques el código si no se solicita.


## ESTADO ACTUAL DEL PROYECTO

**Fase actual:** Interfaz Streamlit para inferencia ML (A_12_Streamlit_ML_App_Builder)

**API de inferencia consumida por la app:**
- Ruta: 07_despliegue/api/
- Endpoint: POST /predict
- Entrada canónica: [{...}]
- Salida canónica: lista JSON de objetos
- Contrato heredado desde A_11 sin redefinición en A_12

**Artefactos generados:**
- 07_despliegue/app/
- 07_despliegue/app/idea/
- 07_despliegue/app/assets/

**Dependencias principales:**
- streamlit
- requests

La app consume la API de inferencia generada en la fase anterior.

**Configuración de Render de la API vigente:**
- Root Directory: 07_despliegue/api
- Build Command: pip install -r requirements.txt
- Start Command: uvicorn api.main:app --host 0.0.0.0 --port $PORT --app-dir ..
- Key: PYTHON_VERSION
- Value: 3.11.15

**Configuración de Render de la app:**
- Root Directory: 07_despliegue/app
- Build Command: pip install -r requirements.txt
- Start Command: streamlit run app.py --server.port $PORT --server.address 0.0.0.0
- Key: PYTHON_VERSION
- Value: 3.11.15

**Ejecución local de la app:**
1. Activa primero el entorno Python operativo del proyecto.
2. Arranca la API en una terminal dedicada:
   ```bash
   cd 07_despliegue/api
   uvicorn api.main:app --reload --app-dir ..
   ```
3. Abre una segunda terminal, activa el mismo entorno y ejecuta:
   ```bash
   cd 07_despliegue/app
   streamlit run app.py
   ```
4. Usa `pip install -r requirements.txt` solo si faltan dependencias o no existe entorno operativo.

**Modo operativo por defecto:**
- Local-first

**Guía de Render:**
- La app se despliega solo después de validar el flujo local.
- La API debe estar previamente desplegada y accesible.
- Debe configurarse `API_BASE_URL` con la URL real del servicio.
- Debe sustituirse cualquier valor local como `http://127.0.0.1:8000` o `http://localhost:8000` por la URL pública real de la API en Render.

**Notas adicionales:**
- Si usas servicios gratuitos, la primera llamada puede tardar por cold start; la app ya está preparada para gestionarlo.
- Si tienes imágenes (logo, favicon, etc.), deben estar en `07_despliegue/app/assets/`.

---

El resto del archivo `copilot-instructions.md` permanece intacto.
