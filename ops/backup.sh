#!/usr/bin/env sh
set -eu

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="${BACKUP_DIR:-backups}"

mkdir -p "$BACKUP_DIR"

docker run --rm \
  -v assistant_data:/data:ro \
  -v "$(pwd)/$BACKUP_DIR:/backup" \
  alpine:3.20 \
  tar -czf "/backup/assistant-data-$STAMP.tgz" -C /data .

docker run --rm \
  -v qdrant_data:/data:ro \
  -v "$(pwd)/$BACKUP_DIR:/backup" \
  alpine:3.20 \
  tar -czf "/backup/qdrant-data-$STAMP.tgz" -C /data .

docker exec assistant-postgres \
  pg_dump -U assistant assistant_xavier > "$BACKUP_DIR/postgres-$STAMP.sql"

echo "Sauvegardes creees dans $BACKUP_DIR"
