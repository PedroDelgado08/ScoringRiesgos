from pathlib import Path
import pandas as pd

AQUI = Path(__file__).resolve().parent
ORIGEN = AQUI.parent / "02_datos" / "01_Originales" / "prestamos.csv"
DESTINO = AQUI / "api" / "app" / "data" / "clientes.csv"

COLUMNAS = [
    "id_cliente",
    "ingresos",
    "ingresos_verificados",
    "rating",
    "dti",
    "antigüedad_empleo",
    "num_lineas_credito",
    "porc_uso_revolving",
    "num_derogatorios",
]

df = pd.read_csv(ORIGEN, usecols=COLUMNAS)
df.dropna(inplace=True)
df.drop_duplicates(inplace=True)
df_sample = df.sample(n=100, random_state=42)

df_sample[COLUMNAS].to_csv(DESTINO, index=False)
print(f'{len(df_sample)} clientes guardados en {DESTINO}')

