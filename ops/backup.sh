#!/usr/bin/env sh
set -eu

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="${BACKUP_DIR:-backups}"
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-$(basename "$(pwd)")}"

mkdir -p "$BACKUP_DIR"

docker run --rm \
  -v "${PROJECT_NAME}_assistant_data:/data:ro" \
  -v "$(pwd)/$BACKUP_DIR:/backup" \
  alpine:3.20 \
  tar -czf "/backup/assistant-data-$STAMP.tgz" -C /data .

docker run --rm \
  -v "${PROJECT_NAME}_qdrant_data:/data:ro" \
  -v "$(pwd)/$BACKUP_DIR:/backup" \
  alpine:3.20 \
  tar -czf "/backup/qdrant-data-$STAMP.tgz" -C /data .

docker run --rm \
  -v "${PROJECT_NAME}_n8n_data:/data:ro" \
  -v "$(pwd)/$BACKUP_DIR:/backup" \
  alpine:3.20 \
  tar -czf "/backup/n8n-data-$STAMP.tgz" -C /data .

N8N_EXPORT_DIR="/tmp/assistant-xavier-n8n-workflows-$STAMP"
rm -rf "$N8N_EXPORT_DIR"
docker compose exec -T n8n n8n export:workflow --backup --output="$N8N_EXPORT_DIR" >/tmp/assistant-xavier-n8n-export.log 2>&1
docker cp "assistant-n8n:$N8N_EXPORT_DIR" "$BACKUP_DIR/n8n-workflows-$STAMP" >/dev/null
tar -czf "$BACKUP_DIR/n8n-workflows-$STAMP.tgz" -C "$BACKUP_DIR/n8n-workflows-$STAMP" .
rm -rf "$BACKUP_DIR/n8n-workflows-$STAMP"
docker compose exec -T n8n sh -lc "rm -rf '$N8N_EXPORT_DIR'" >/dev/null 2>&1 || true
cat /tmp/assistant-xavier-n8n-export.log
rm -f /tmp/assistant-xavier-n8n-export.log

docker exec assistant-postgres \
  pg_dump -U assistant assistant_xavier > "$BACKUP_DIR/postgres-$STAMP.sql"

echo "Sauvegardes creees dans $BACKUP_DIR"
