#!/usr/bin/env bash
# Respaldo diario de ClinicFlow (n8n + Evolution). Lo ejecuta cron como el usuario deploy.
# - Copia consistente de la base de n8n (sqlite .backup) + su config (llave de cifrado de credenciales)
# - Workflows exportados como JSON (uno por archivo)
# - pg_dump de la base de Evolution
# - Si existe /opt/clinicflow/workflows-repo (git), sube los workflows ahí
# Conserva 14 días en /opt/clinicflow/backups
set -euo pipefail

BASE=/opt/clinicflow
DEST=$BASE/backups
STAMP=$(date +%Y-%m-%d_%H%M)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$DEST"
cd "$BASE"
envget() { grep -m1 "^$1=" .env | cut -d= -f2- | tr -d '\r' | sed 's/^ *//; s/ *$//'; }
EVO_DB_USER=$(envget EVO_DB_USER)
EVO_DB_NAME=$(envget EVO_DB_NAME)

# 1) n8n: copia consistente aunque esté corriendo
sudo sqlite3 n8n_data/database.sqlite ".backup '$WORK/n8n-database.sqlite'"
sudo cp n8n_data/config "$WORK/n8n-config"

# 2) Workflows en JSON
docker exec clinicflow-n8n sh -c 'rm -rf /tmp/wfexp && mkdir -p /tmp/wfexp && n8n export:workflow --all --separate --pretty --output=/tmp/wfexp/ >/dev/null 2>&1'
mkdir -p "$WORK/workflows"
docker cp clinicflow-n8n:/tmp/wfexp/. "$WORK/workflows/" >/dev/null

# 3) Evolution (Postgres)
docker exec clinicflow-postgres pg_dump -U "$EVO_DB_USER" -d "$EVO_DB_NAME" -Fc > "$WORK/evolution.dump"

# 4) Configuración del despliegue
cp docker-compose.prod.yml Caddyfile .env "$WORK/"

sudo chown -R deploy:deploy "$WORK"
tar -czf "$DEST/clinicflow-$STAMP.tar.gz" -C "$WORK" .
chmod 600 "$DEST/clinicflow-$STAMP.tar.gz"
find "$DEST" -name 'clinicflow-*.tar.gz' -mtime +14 -delete

# 5) Workflows activos a GitHub, SIEMPRE limpios de secretos y teléfonos
#    (requiere /opt/clinicflow/repo clonado con una deploy key con permiso de escritura)
REPO=$BASE/repo
if [ -d "$REPO/.git" ]; then
  mkdir -p "$WORK/activos"
  python3 - "$WORK/workflows" "$WORK/activos" <<'PY'
import json, glob, os, shutil, sys
for f in glob.glob(os.path.join(sys.argv[1], "*.json")):
    if json.load(open(f, encoding="utf-8")).get("active"):
        shutil.copy(f, sys.argv[2])
PY
  cd "$REPO"
  git pull -q --rebase origin main
  rm -rf n8n/workflows
  # Si el limpiador detecta una posible fuga sale con error y no se sube nada
  python3 scripts/n8n/sanitize_workflows.py "$WORK/activos" n8n/workflows "$BASE/.env" >/dev/null
  git add n8n/workflows
  if ! git diff --cached --quiet; then
    git commit -q -m "backup: workflows $STAMP"
    git push -q origin HEAD:main
  fi
fi

echo "OK $STAMP $(du -h "$DEST/clinicflow-$STAMP.tar.gz" | cut -f1)"
