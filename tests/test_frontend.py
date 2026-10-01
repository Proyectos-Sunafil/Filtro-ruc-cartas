from pathlib import Path


def test_index_tiene_controles_principales():
    p = Path("index.html")
    assert p.exists(), "falta index.html"
    html = p.read_text(encoding="utf-8")
    assert 'type="file"' in html
    assert 'accept=".xlsx"' in html
    assert 'id="procesar"' in html
    assert 'Resultado.xlsx' in html
    assert '/procesar' in html


def test_index_no_contiene_credenciales_postgres():
    html = Path("index.html").read_text(encoding="utf-8")
    for secreto in ["PG_PASSWORD", "clavepostgres", "postgresql://"]:
        assert secreto not in html
