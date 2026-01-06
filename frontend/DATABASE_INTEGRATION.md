# Database Integration for Processing Tab

This document describes the integration of the database with the processing tab, allowing conversations to be loaded from the database instead of JSON files, with enhanced display of reasoning and tool calls.

## Overview

The processing tab (AuditView) now:
1. Loads conversations from the database as the primary source
2. Displays reasoning content with proper formatting
3. Shows tool calls with syntax-highlighted JSON
4. Falls back to JSON files if database is unavailable

## Components

### 1. Database Sync Script (Recommended)

**File**: `scripts/sync-conversations.ts`

This script keeps the database in sync with the `mock_data` folder. It handles:
- ✅ Adding new conversations when files are added
- ✅ Updating existing conversations when files are modified
- ✅ Tracking file changes using SHA-256 hashes
- ✅ Watch mode for automatic change detection

**Usage**:
```bash
# One-time sync
npx tsx scripts/sync-conversations.ts
npx wrangler d1 execute DB_NAME --local --file=./db/sync_conversations.sql

# Watch mode (auto-detect changes)
npx tsx scripts/sync-conversations.ts --watch

# Include cleanup of deleted files
npx tsx scripts/sync-conversations.ts --delete-missing
```

The script:
- Recursively finds all JSON files in `mock_data/`
- Calculates SHA-256 hashes to detect changes
- Uses `INSERT OR REPLACE` to update conversations
- Tracks sync status in `sync_status` table
- Generates SQL for:
  - `conversations` table
  - `conversation_turns` table (with reasoning_content)
  - `tool_calls` table
  - `sync_status` table (for tracking)

**Workflow**:
1. Edit a file in `mock_data/`
2. Run: `npx tsx scripts/sync-conversations.ts`
3. Apply: `npx wrangler d1 execute DB_NAME --local --file=./db/sync_conversations.sql`
4. Changes appear in Processing tab!

See `scripts/README_SYNC.md` for detailed documentation.

### 1b. Legacy Seeding Script

**File**: `scripts/seed-conversations.ts`

One-time initial seeding script. Use `sync-conversations.ts` for ongoing maintenance.

### 2. Conversations API Endpoint

**File**: `functions/api/conversations.ts`

New API endpoint that fetches conversations from the database.

**Endpoint**: `GET /api/conversations`

**Query Parameters**:
- `limit` (default: 100) - Maximum number of conversations to return
- `offset` (default: 0) - Pagination offset
- `label` - Filter by label ('adversarial', 'clean', etc.)
- `chatbot_mode` - Filter by chatbot mode

**Response**:
```json
{
  "conversations": [
    {
      "conversation_id": "...",
      "customer_id": "...",
      "chatbot_mode": "...",
      "turns": [
        {
          "turn_number": 1,
          "role": "customer",
          "content": "...",
          "reasoning_content": "...",
          "tool_calls": [
            {
              "tool": "get_customer_history",
              "arguments": {...},
              "result": {...}
            }
          ]
        }
      ]
    }
  ],
  "total": 100,
  "limit": 100,
  "offset": 0
}
```

### 3. Database Client Extensions

**File**: `lib/db.ts`

Added new methods to `DatabaseClient`:
- `getConversations(options)` - Fetch conversations with filters
- `getToolCallsForTurn(turnId)` - Get tool calls for a specific turn

### 4. Enhanced Test Case Loading

**File**: `lib/loadTestCases.ts`

Updated `loadAllTestCases()` to:
1. First try loading from database via `/api/conversations`
2. Fall back to hardcoded test cases
3. Fall back to JSON files from `mock_data`

The database conversations are converted to `EnrichedTestCase` format with:
- Reasoning content preserved from `reasoning_content` field
- Tool calls attached to each turn
- Proper category inference from chatbot mode and labels

### 5. Reasoning Display Component

**File**: `components/ReasoningDisplay.tsx`

New component that displays:
- **Chain of Thought**: Formatted reasoning content with proper whitespace
- **Tool Calls**: Expandable list with:
  - Tool name and timestamp
  - Syntax-highlighted JSON for arguments
  - Syntax-highlighted JSON for results
  - Collapsible sections for better UX

**Features**:
- Expandable/collapsible sections
- JSON syntax highlighting (colors for keys, strings, numbers, booleans)
- Scrollable code blocks for long content
- Tool call count badges

### 6. Updated AuditView

**File**: `components/AuditView.tsx`

Updated to:
- Use `ReasoningDisplay` component for each turn
- Display reasoning and tool calls from database conversations
- Show tool calls with proper formatting

## Data Flow

1. **Seeding**: Run `seed-conversations.ts` to populate database from `mock_data/`
2. **Loading**: `loadAllTestCases()` fetches from `/api/conversations`
3. **Display**: `AuditView` shows conversations with `ReasoningDisplay` component
4. **New Chats**: When new chats are created via `/api/chat`, they're automatically saved to the database

## Database Schema

The schema includes:
- `conversations` table - Main conversation records
- `conversation_turns` table - Individual turns with `reasoning_content` field
- `tool_calls` table - Tool call records with JSON `arguments` and `result`
- `sync_status` table - Tracks which files have been synced (file path, hash, timestamp)

## Usage

### Initial Setup

1. Ensure database schema is applied:
   ```bash
   npx wrangler d1 execute DB_NAME --local --file=./db/schema.sql
   ```

2. Sync conversations from mock_data (recommended):
   ```bash
   npx tsx scripts/sync-conversations.ts
   npx wrangler d1 execute DB_NAME --local --file=./db/sync_conversations.sql
   ```

   Or for one-time initial seed:
   ```bash
   npx tsx scripts/seed-conversations.ts
   npx wrangler d1 execute DB_NAME --local --file=./db/seed_conversations.sql
   ```

### Running the Application

1. Start the development server
2. Navigate to the Processing tab
3. Conversations will load from the database automatically
4. Click on any conversation to see reasoning and tool calls

### Adding/Updating Conversations

**From mock_data files:**
1. Edit or add files in `mock_data/`
2. Run sync: `npx tsx scripts/sync-conversations.ts`
3. Apply SQL: `npx wrangler d1 execute DB_NAME --local --file=./db/sync_conversations.sql`
4. Changes appear in Processing tab!

**From Chat tab:**
New conversations created via the Chat tab are automatically saved to the database and will appear in the Processing tab.

## Benefits

1. **Unified Data Source**: All conversations (chat and processing) use the same database
2. **Rich Display**: Reasoning and tool calls are properly formatted and highlighted
3. **Better Performance**: Database queries are more efficient than loading many JSON files
4. **Real-time Updates**: New chats appear in processing tab automatically
5. **Scalability**: Database can handle large numbers of conversations

## Future Enhancements

- Add search/filter UI in AuditView
- Add pagination for large result sets
- Add export functionality
- Add conversation analytics
- Add real-time streaming updates

