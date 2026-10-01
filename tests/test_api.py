import pandas as pd
import api.api as api_mod


def test_normalizar_ruc_float():
    assert api_mod.normalizar_ruc(20123456789.0) == "20123456789"


def test_total_4_se_mantiene_y_total_5_se_retira():
    df = pd.DataFrame({"RUC": ["1", "2", "3", "4"], "NOMBRE": ["A", "B", "C", "D"]})
    m, r = api_mod.procesar_dataframe(df, {"1": 0, "2": 4, "3": 5})
    assert m["RUC"].astype(str).tolist() == ["1", "2", "4"]
    assert r["RUC"].astype(str).tolist() == ["3"]
    assert list(m.columns) == ["RUC", "NOMBRE"]
    assert list(r.columns) == ["RUC", "NOMBRE", "TOTAL"]
    assert r["TOTAL"].tolist() == [5]


def test_ruc_repetido_conserva_todas_las_filas():
    df = pd.DataFrame({"RUC": ["9", "9"], "ITEM": [1, 2]})
    m, r = api_mod.procesar_dataframe(df, {"9": 5})
    assert len(m) == 0
    assert len(r) == 2
    assert r["TOTAL"].tolist() == [5, 5]


def test_falta_columna_ruc():
    import pytest
    with pytest.raises(ValueError, match="RUC"):
        api_mod.procesar_dataframe(pd.DataFrame({"NOMBRE": ["A"]}), {})


def test_total_invalido_se_trata_como_cero():
    df = pd.DataFrame({"RUC": ["1"]})
    m, r = api_mod.procesar_dataframe(df, {"1": None})
    assert len(m) == 1
    assert len(r) == 0


def test_health_endpoint_existe_y_responde_ok():
    from fastapi.testclient import TestClient
    r = TestClient(api_mod.app).get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_rechaza_archivo_no_xlsx():
    from fastapi.testclient import TestClient
    r = TestClient(api_mod.app).post(
        "/procesar",
        files={"archivo": ("input.txt", b"abc", "text/plain")},
    )
    assert r.status_code == 400
    assert "xlsx" in r.json()["detail"].lower()


def test_resultado_excel_tiene_dos_hojas_y_solo_total_en_retirados(monkeypatch):
    from io import BytesIO
    monkeypatch.setattr(api_mod, "consultar_totales", lambda rucs: {"1": 4, "2": 5})
    df = pd.DataFrame({"RUC": ["1", "2"], "NOMBRE": ["A", "B"]})
    contenido = api_mod.generar_resultado(df)
    xls = pd.ExcelFile(BytesIO(contenido))
    assert xls.sheet_names == ["Mantenidos", "Retirados"]
    m = pd.read_excel(BytesIO(contenido), sheet_name="Mantenidos")
    r = pd.read_excel(BytesIO(contenido), sheet_name="Retirados")
    assert list(m.columns) == ["RUC", "NOMBRE"]
    assert list(r.columns) == ["RUC", "NOMBRE", "TOTAL"]
    assert r["TOTAL"].tolist() == [5]


def test_xlsx_corrupto_devuelve_400():
    from fastapi.testclient import TestClient
    client = TestClient(api_mod.app, raise_server_exceptions=False)
    r = client.post(
        "/procesar",
        files={"archivo": ("input.xlsx", b"no-es-un-xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )
    assert r.status_code == 400


def test_error_postgres_devuelve_503(monkeypatch):
    from io import BytesIO
    from fastapi.testclient import TestClient
    bio = BytesIO()
    pd.DataFrame({"RUC": ["1"]}).to_excel(bio, index=False)
    monkeypatch.setattr(api_mod, "generar_resultado", lambda df: (_ for _ in ()).throw(RuntimeError("No se pudo consultar PostgreSQL.")))
    r = TestClient(api_mod.app, raise_server_exceptions=False).post(
        "/procesar",
        files={"archivo": ("input.xlsx", bio.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )
    assert r.status_code == 503
