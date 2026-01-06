# Conversation Sync Scripts

## Overview

There are two scripts for managing conversations in the database:

1. **`seed-conversations.ts`** - One-time initial load (legacy)
2. **`sync-conversations.ts`** - Ongoing sync with mock_data (recommended)

## Recommended: sync-conversations.ts

This script keeps the database in sync with the `mock_data` folder. It:
- ✅ Adds new conversations when new files are added
- ✅ Updates existing conversations when files are modified
- ✅ Tracks file changes using SHA-256 hashes
- ✅ Supports watch mode for automatic syncing
- ✅ Can optionally remove conversations from deleted files

### Usage

#### One-time sync:
```bash
npx tsx scripts/sync-conversations.ts
npx wrangler d1 execute DB_NAME --local --file=./db/sync_conversations.sql
```

#### Watch mode (auto-sync on file changes):
```bash
npx tsx scripts/sync-conversations.ts --watch
```

This will:
- Monitor the `mock_data` directory for changes
- Automatically generate sync SQL when files are added/modified
- You still need to apply the SQL manually (or set up automation)

#### Delete missing conversations:
```bash
npx tsx scripts/sync-conversations.ts --delete-missing
```

This will add SQL comments for removing conversations that no longer have source files.

### How It Works

1. **Scans** all JSON files in `mock_data/` recursively
2. **Calculates** SHA-256 hash for each file to detect changes
3. **Parses** conversations from files (supports both dataset and individual formats)
4. **Generates** SQL with `INSERT OR REPLACE` to update conversations
5. **Tracks** sync status in `sync_status` table (file path, hash, timestamp)

### Sync Status Table

The script uses a `sync_status` table to track:
- Which conversations came from which files
- File hashes to detect changes
- Last sync timestamp

This allows the script to:
- Detect when files have been modified
- Track source files for each conversation
- Optionally clean up conversations from deleted files

### Workflow

1. **Edit** a file in `mock_data/`
2. **Run** sync script: `npx tsx scripts/sync-conversations.ts`
3. **Apply** SQL: `npx wrangler d1 execute DB_NAME --local --file=./db/sync_conversations.sql`
4. **Refresh** the Processing tab to see changes

Or use watch mode for automatic detection (you still need to apply SQL manually).

### File Formats Supported

- **Dataset format**: `ecommerce_cot_dataset.json` with `conversations` array
- **Individual files**: Single conversation files with `turns` array
- **Batch folders**: Files in subdirectories like `o2-mini_batch_*/`

### Example

```bash
# Make changes to mock_data/o2-mini_batch_20260104_080751/adv_00001.json

# Run sync
npx tsx scripts/sync-conversations.ts

# Apply to database
npx wrangler d1 execute DB_NAME --local --file=./db/sync_conversations.sql

# Changes now appear in Processing tab!
```

## Legacy: seed-conversations.ts

This script is for one-time initial seeding. It doesn't track changes or handle updates well. Use `sync-conversations.ts` instead for ongoing maintenance.

## Database Schema

The sync script requires the `sync_status` table, which is included in `schema.sql`. If you're using an existing database, you may need to add it:

```sql
CREATE TABLE IF NOT EXISTS sync_status (
    conversation_id TEXT PRIMARY KEY,
    source_file TEXT NOT NULL,
    file_hash TEXT NOT NULL,
    last_synced TEXT NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_sync_status_source_file ON sync_status(source_file);
```

## Tips

- Run sync after making changes to mock_data files
- Use watch mode during development for automatic detection
- The sync script uses `INSERT OR REPLACE`, so it's safe to run multiple times
- File hashes ensure only changed files trigger updates
- Large files may take a moment to process

