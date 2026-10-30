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

# 5) Workflows a GitHub (repo PRIVADO; los workflows aún tienen llaves escritas en nodos)
REPO=$BASE/workflows-repo
if [ -d "$REPO/.git" ]; then
  mkdir -p "$REPO/workflows"
  rm -f "$REPO"/workflows/*.json
  cp "$WORK"/workflows/*.json "$REPO/workflows/"
  cd "$REPO"
  git add -A
  if ! git diff --cached --quiet; then
    git commit -q -m "backup: workflows $STAMP"
    git push -q origin HEAD
  fi
fi

echo "OK $STAMP $(du -h "$DEST/clinicflow-$STAMP.tar.gz" | cut -f1)"
