#!/usr/bin/env bash
# Backs up the HFC ROS MongoDB database using mongodump.
# Usage: ./scripts/backup.sh [output-directory]
#
# Never deletes old backups automatically - see docs/BACKUP.md for a
# retention policy you can wire into a cron job separately, on purpose,
# rather than baking silent deletion into this script.
set -euo pipefail

OUTPUT_DIR="${1:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_PATH="${OUTPUT_DIR}/hfc_ros_${TIMESTAMP}"

MONGO_URI="${MONGO_URI:-mongodb://localhost:27017/hfc_ros}"

mkdir -p "$BACKUP_PATH"

echo "Backing up MongoDB ($MONGO_URI) to $BACKUP_PATH ..."
mongodump --uri="$MONGO_URI" --out="$BACKUP_PATH" --gzip

# Compute a checksum manifest so verify-backup.sh can confirm nothing was
# corrupted or truncated later (e.g. by a flaky disk or interrupted copy).
find "$BACKUP_PATH" -type f -exec sha256sum {} \; > "${BACKUP_PATH}.sha256"

echo "Backup complete: $BACKUP_PATH"
echo "Checksum manifest: ${BACKUP_PATH}.sha256"
echo "Verify with: ./scripts/verify-backup.sh $BACKUP_PATH"
