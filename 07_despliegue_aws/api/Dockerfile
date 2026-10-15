# =====================================================================
# Dockerfile - Receta para construir la imagen de la API (Lambda)
# ---------------------------------------------------------------------
# Cada instrucción crea una "capa" de la imagen. Docker guarda las capas
# en caché: si una capa y las anteriores no cambian, no se vuelve a hacer.
# Por eso primero se instalan las librerías (cambian poco) y al final se
# copia el código y los modelos (cambian más a menudo).
# Construir:  docker build -t scoring-api .   (desde la carpeta api/)
# =====================================================================

# --- 1. Imagen base -----------------------------------------------------
# Linux Debian mínimo ("slim") con Python ya instalado.
# Versión EXACTA 3.11.16, la del entorno scoring-aws: los .pkl se guardaron
# con cloudpickle "por valor" y solo se abren con Python 3.11
FROM python:3.11.16-slim

# --- 2. Carpeta de trabajo ----------------------------------------------
# Carpeta dentro de la imagen donde va la aplicación (se crea si no existe).
# /var/task es la carpeta estándar de Lambda para el código de la función
WORKDIR /var/task

# --- 3. Librerías de Python ---------------------------------------------
# Se copia SOLO requirements.txt y se instala antes que el código: así,
# si cambias main.py, Docker reutiliza esta capa y no reinstala todo.
#   --no-cache-dir         : no guarda los instaladores descargados (imagen más pequeña)
#   --only-binary=:all:    : solo paquetes ya compilados (wheels); evita compilar
#                            numpy/scipy desde el código fuente, que fallaría sin compilador
COPY requirements.txt .
RUN pip install --no-cache-dir --only-binary=:all: -r requirements.txt

# --- 4. Código, modelos y datos de la demo ------------------------------
# Copia la carpeta app/ completa: main.py, schemas.py, scoring.py,
# modelos/*.pkl y data/ (los genera preparar_datos_demo.py).
# .dockerignore evita copiar __pycache__ y .pyc
COPY app/ ./app/

# --- 5. Arranque del contenedor -----------------------------------------
# ENTRYPOINT: programa que se ejecuta al arrancar. awslambdaric es el
# "cliente de ejecución" de Lambda: pide eventos a Lambda, llama a la
# función de Python y le devuelve la respuesta
ENTRYPOINT ["python", "-m", "awslambdaric"]
# CMD: argumento para el ENTRYPOINT = función que recibe los eventos
# (variable handler del archivo app/main.py, el adaptador Mangum)
CMD ["app.main.handler"]
