#!/usr/bin/env bash
# Restores a MongoDB backup produced by backup.sh.
# Usage: ./scripts/restore.sh <backup-directory> [target-mongo-uri]
#
# By default restores into MONGO_URI's database with --drop, which REPLACES
# existing collections with the backup's contents. Review before running
# against a production database - consider restoring into a scratch
# database first (see docs/BACKUP.md "Restore verification").
set -euo pipefail

BACKUP_PATH="${1:?Usage: ./scripts/restore.sh <backup-directory> [target-mongo-uri]}"
MONGO_URI="${2:-${MONGO_URI:-mongodb://localhost:27017/hfc_ros}}"

if [ ! -d "$BACKUP_PATH" ]; then
  echo "Backup directory not found: $BACKUP_PATH" >&2
  exit 1
fi

echo "Restoring $BACKUP_PATH into $MONGO_URI ..."
echo "This will DROP existing collections with the same names. Press Ctrl+C within 5s to cancel."
sleep 5

mongorestore --uri="$MONGO_URI" --gzip --drop "$BACKUP_PATH"/hfc_ros

echo "Restore complete."
