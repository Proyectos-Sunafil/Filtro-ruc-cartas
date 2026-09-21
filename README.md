# Filtro RUC - Cartas

Interfaz web para subir un Excel de RUC, procesarlo contra PostgreSQL en la PC de oficina y descargar `Resultado.xlsx`.

## Regla

- RUC no encontrado: se mantiene.
- `TOTAL <= 4`: se mantiene.
- `TOTAL > 4`: se retira.
- `Mantenidos`: conserva exactamente las columnas originales del Input.
- `Retirados`: conserva las columnas originales y agrega únicamente `TOTAL`.

## API en la PC de oficina

Carpeta prevista:

```text
D:\Amotozono\Proyectos VC\API (Filtro RUC - Cartas)
```

1. Instalar dependencias:

```bat
python -m pip install -r api\requirements.txt
```

2. Copiar `api\.env.example` como `api\.env` y completar la contraseña local de PostgreSQL.

3. Iniciar la API:

```bat
api\iniciar_api.bat
```

4. Verificar:

```text
http://127.0.0.1:8000/health
```

Debe responder:

```json
{"status":"ok"}
```

## Cloudflare Tunnel

Con la API activa:

```bat
cloudflared tunnel --url http://127.0.0.1:8000
```

Cloudflare entregará una URL HTTPS. Colócala en `API_URL` dentro de `index.html`.

## GitHub Pages

En el repositorio, abrir `Settings > Pages` y elegir:

- Source: `Deploy from a branch`
- Branch: `main`
- Folder: `/ (root)`

## Seguridad

`api/.env` está excluido de Git y no debe subirse al repositorio. El HTML nunca contiene la contraseña de PostgreSQL.
