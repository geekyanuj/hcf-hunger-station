# Backup and Restore

## Strategy

MongoDB is the single source of truth for this system; Redis holds only a
disposable cache (safe to lose, never needs backing up). Back up MongoDB
with mongodump, on a schedule, to storage separate from the database host
itself.

## Scripts

Three scripts live in scripts/, none of which delete anything
automatically:

### scripts/backup.sh [output-directory]

Runs mongodump --gzip against $MONGO_URI, writes a timestamped directory,
and computes a SHA-256 checksum manifest alongside it so corruption can be
detected later.

```bash
MONGO_URI="mongodb://user:pass@host:27017/hfc_ros?authSource=admin" \
  ./scripts/backup.sh /var/backups/hcf-ros
```

### scripts/verify-backup.sh <backup-directory> [--test-restore]

Checks the checksum manifest. With --test-restore, additionally restores
into a throwaway scratch database and reports the collection count, so you
can confirm a backup is actually restorable, not just present on disk.
Drop the scratch database yourself afterward (the script prints the exact
command).

```bash
./scripts/verify-backup.sh /var/backups/hcf-ros/hfc_ros_20260101_020000 --test-restore
```

### scripts/restore.sh <backup-directory> [target-mongo-uri]

Restores a backup with mongorestore --drop, which replaces existing
collections of the same name. It pauses 5 seconds before running so you
have a chance to Ctrl+C if you ran it against the wrong target by mistake.

```bash
./scripts/restore.sh /var/backups/hcf-ros/hfc_ros_20260101_020000 \
  "mongodb://user:pass@host:27017/hfc_ros?authSource=admin"
```

## Recommended schedule

A daily cron entry calling backup.sh, retained per your own retention
policy - these scripts never delete old backups automatically; decide your
retention window explicitly and prune deliberately, rather than baking
silent deletion into the backup script itself.

```cron
0 2 * * * MONGO_URI="mongodb://..." /path/to/scripts/backup.sh /var/backups/hcf-ros >> /var/log/hcf-backup.log 2>&1
```

Run verify-backup.sh --test-restore periodically (weekly is reasonable)
against your most recent backup - a backup you've never test-restored is
an unverified assumption, not a safety net.

## Restore verification checklist

Before trusting a restored database in production:

1. Run verify-backup.sh <path> --test-restore and confirm the collection
   count roughly matches what you expect.
2. Spot-check a few known documents in the scratch database (an Order by
   orderNumber, a User by email) to confirm field-level integrity.
3. Only then run restore.sh against the real target.

## What backups do NOT cover

- Redis's cached menu data - entirely disposable, repopulated automatically
  on the next GET /menu cache miss. Never back this up.
- Uploaded/hosted images referenced by MenuItem.images or Outlet.logoUrl -
  these are plain URLs to externally-hosted images (see docs/SECURITY.md
  "File uploads"), so they live in whatever object storage or CDN you're
  pointing those URLs at, not in this project's database or backup scripts.
