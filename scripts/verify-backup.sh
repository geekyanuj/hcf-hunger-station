#!/usr/bin/env bash
# Verifies a backup produced by backup.sh: checks the checksum manifest, and
# optionally does a test-restore into a scratch database to confirm the
# backup is actually restorable (not just present on disk).
# Usage: ./scripts/verify-backup.sh <backup-directory> [--test-restore]
set -euo pipefail

BACKUP_PATH="${1:?Usage: ./scripts/verify-backup.sh <backup-directory> [--test-restore]}"
MANIFEST="${BACKUP_PATH}.sha256"

if [ ! -f "$MANIFEST" ]; then
  echo "Checksum manifest not found: $MANIFEST (was this backup made with backup.sh?)" >&2
  exit 1
fi

echo "Verifying checksums against $MANIFEST ..."
(cd "$(dirname "$BACKUP_PATH")" && sha256sum -c "$(basename "$MANIFEST")")
echo "Checksums OK."

if [ "${2:-}" = "--test-restore" ]; then
  SCRATCH_DB="hfc_ros_verify_$(date +%s)"
  SCRATCH_URI="${MONGO_URI_BASE:-mongodb://localhost:27017}/${SCRATCH_DB}"
  echo "Test-restoring into scratch database: $SCRATCH_DB ..."
  mongorestore --uri="$SCRATCH_URI" --gzip "$BACKUP_PATH"/hfc_ros
  COUNT=$(mongosh "$SCRATCH_URI" --quiet --eval "db.getCollectionNames().length")
  echo "Restored $COUNT collections into $SCRATCH_DB. Drop it with:"
  echo "  mongosh \"$SCRATCH_URI\" --eval \"db.dropDatabase()\""
fi

echo "Verification complete."
