# ClinicFlow — arquitectura

Plataforma multi-tenant de agendamiento de citas por WhatsApp: **n8n** (orquestación) + **Evolution API** (WhatsApp) + **Supabase/PostgreSQL** (datos) + **Cal.com** (agenda, se reemplazará por una API propia) + **Groq** (IA: intención, NLP, transcripción de audio).

## Estructura

| Carpeta | Contenido |
|---|---|
| `n8n/workflows/` | Los 19 workflows activos `[CF]`, exportados del servidor y **sin secretos** (`{{REDACTED:...}}`) |
| `deploy/` | Producción: `docker-compose.prod.yml` (Caddy + n8n + Evolution + Postgres), `Caddyfile`, `backup.sh` |
| `docker-compose.yml` | Entorno local de desarrollo |
| `supabase/` | Migraciones de esquema y consultas de inspección |
| `scripts/calcom/` | Utilidades de Cal.com (leen `CF_CALCOM_API_KEY` del entorno) |
| `scripts/n8n/` | Parches de workflows y `sanitize_workflows.py` (limpia secretos antes de subir a git) |
| `contexto_workflows_n8n.md` | Descripción de cada workflow |
| `.env.example` | Variables necesarias (sin valores) |

## Flujo de un mensaje

```
WhatsApp → Evolution → CF-01E (filtro + dedup) → CF-01EA (audio→texto) → CF-01BE (normalizar)
  → CF-02 (tenant) → CF-03 (log) → CF-04 (usuario/sesión) → CF-05 (expiración) → CF-06 (router)
  → CF-07 paciente · CF-08 catálogo · CF-09 intención · CF-10 FAQ · CF-11 disponibilidad
  → CF-12 reserva · CF-13 cancelar/reagendar · CF-16 admin
  → CF-14E (respuesta por Evolution)
CF-15 recordatorios (cada 15 min) · CF-17 onboarding desde Tally
```

## Desplegar en un VPS

```bash
sudo install -d -o $USER /opt/clinicflow && cd /opt/clinicflow
# copiar deploy/* y crear .env a partir de .env.example (+ N8N_DOMAIN, EVO_DOMAIN, ACME_EMAIL)
docker compose -f docker-compose.prod.yml --env-file .env up -d
```

Para restaurar workflows desde este repo hay que reemplazar los `{{REDACTED:...}}` por las llaves reales (o, mejor, migrarlos a Credenciales de n8n). El respaldo completo y restaurable (base de n8n + llave de cifrado) lo genera `deploy/backup.sh` en el servidor.

## Qué NO está en este repo (a propósito)

- `.env` y cualquier llave o token.
- Datos de n8n, Evolution y Postgres (sesiones de WhatsApp, credenciales cifradas).
- `privado/`: seeds con datos reales de doctores y clínicas.
