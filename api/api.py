import os
import re
from io import BytesIO

import pandas as pd
from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

load_dotenv()


def normalizar_ruc(x):
    if pd.isna(x):
        return ""
    s = str(x).strip()
    return s[:-2] if re.fullmatch(r"\d+\.0", s) else s


def procesar_dataframe(df_input, totales):
    df = df_input.copy()
    col = next((c for c in df.columns if str(c).strip().upper() in {"RUC", "V_CODEMP"}), None)
    if col is None:
        raise ValueError("El archivo debe contener una columna RUC o V_CODEMP.")

    claves = df[col].map(normalizar_ruc)
    valores = pd.to_numeric(claves.map(totales), errors="coerce").fillna(0).astype(int)
    mantenidos = df[valores <= 4].copy()
    retirados = df[valores > 4].copy()
    retirados["TOTAL"] = valores[valores > 4].values
    return mantenidos, retirados


def consultar_totales(rucs):
    if not rucs:
        return {}

    import psycopg2

    resultado = {}
    try:
        with psycopg2.connect(
            host=os.getenv("PG_HOST", "localhost"),
            port=int(os.getenv("PG_PORT", "5432")),
            dbname=os.getenv("PG_DATABASE", "filtro_ruc_cartas"),
            user=os.environ["PG_USER"],
            password=os.environ["PG_PASSWORD"],
        ) as cn:
            with cn.cursor() as cur:
                for i in range(0, len(rucs), 5000):
                    lote = rucs[i:i + 5000]
                    cur.execute(
                        "SELECT ruc, COALESCE(total,0) FROM maestro02_transformada WHERE ruc = ANY(%s)",
                        (lote,),
                    )
                    for ruc, total in cur.fetchall():
                        resultado[normalizar_ruc(ruc)] = int(total or 0)
    except psycopg2.Error as e:
        raise RuntimeError("No se pudo consultar PostgreSQL.") from e
    return resultado


def generar_resultado(df_input):
    col = next((c for c in df_input.columns if str(c).strip().upper() in {"RUC", "V_CODEMP"}), None)
    if col is None:
        raise ValueError("El archivo debe contener una columna RUC o V_CODEMP.")

    rucs = list(dict.fromkeys(r for r in df_input[col].map(normalizar_ruc).tolist() if r))
    totales = consultar_totales(rucs)
    mantenidos, retirados = procesar_dataframe(df_input, totales)

    bio = BytesIO()
    with pd.ExcelWriter(bio, engine="openpyxl") as w:
        mantenidos.to_excel(w, sheet_name="Mantenidos", index=False)
        retirados.to_excel(w, sheet_name="Retirados", index=False)
    return bio.getvalue()


app = FastAPI(title="Filtro RUC - Cartas")
origins = [x.strip() for x in os.getenv("ALLOWED_ORIGIN", "").split(",") if x.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/procesar")
async def procesar(archivo: UploadFile = File(...)):
    nombre = archivo.filename or ""
    if not nombre.lower().endswith(".xlsx"):
        raise HTTPException(400, "Solo se admiten archivos .xlsx")

    contenido = await archivo.read()
    if len(contenido) > 20 * 1024 * 1024:
        raise HTTPException(413, "El archivo supera el límite de 20 MB.")

    try:
        entrada = pd.read_excel(BytesIO(contenido))
    except Exception as e:
        raise HTTPException(400, "El archivo .xlsx no es válido.") from e

    try:
        salida = generar_resultado(entrada)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    except RuntimeError as e:
        raise HTTPException(503, str(e)) from e

    return StreamingResponse(
        BytesIO(salida),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="Resultado.xlsx"'},
    )
