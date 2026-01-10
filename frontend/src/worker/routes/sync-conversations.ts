/**
 * Sync Conversations API Routes
 * Handles synchronization of mock_data files to the database
 */

import { Hono } from 'hono';
import type { Env } from '../index';

export const syncConversationsRoutes = new Hono<{ Bindings: Env }>();

// In-memory lock for sync operations
let syncLock: {
  isLocked: boolean;
  startedAt?: string;
  startedBy?: string;
  cancelRequested?: boolean;
  completed?: boolean;
  cancelled?: boolean;
  duration?: number;
  error?: string;
  progress?: {
    filesProcessed: number;
    totalFiles: number;
    conversationsProcessed: number;
    successfulFiles: string[];
    failedFiles: Array<{ path: string; reason: string }>;
    currentPhase?: string;
    sqlStatementsTotal?: number;
    sqlStatementsExecuted?: number;
  };
  finalStats?: any;
  finalSuccessfulFiles?: string[];
  finalFailedFiles?: Array<{ path: string; reason: string }>;
  finalErrors?: string[];
  finalDetailedErrors?: Array<any>;
} = { isLocked: false };

// Get sync status
syncConversationsRoutes.get('/', async (c) => {
  const duration = syncLock.startedAt
    ? Math.floor((Date.now() - new Date(syncLock.startedAt).getTime()) / 1000)
    : (syncLock.duration || 0);

  const response: any = {
    isLocked: syncLock.isLocked,
    startedAt: syncLock.startedAt,
    startedBy: syncLock.startedBy,
    duration: duration,
    cancelRequested: syncLock.cancelRequested || false
  };

  if (syncLock.progress) {
    response.progress = syncLock.progress;
  }

  if (syncLock.finalDetailedErrors && syncLock.finalDetailedErrors.length > 0) {
    response.detailedErrors = syncLock.finalDetailedErrors;
  }

  if (syncLock.completed && syncLock.finalStats) {
    response.completed = true;
    response.cancelled = syncLock.cancelled || false;
    response.duration = syncLock.duration || duration;
    response.stats = syncLock.finalStats;
    response.successfulFiles = syncLock.finalSuccessfulFiles || [];
    response.failedFiles = syncLock.finalFailedFiles || [];
    if (syncLock.finalErrors) {
      response.errors = syncLock.finalErrors;
    }
  }

  if (syncLock.error) {
    response.error = syncLock.error;
  }

  return c.json(response);
});

// Cancel sync
syncConversationsRoutes.delete('/', async (c) => {
  const force = c.req.query('force') === 'true';

  if (!syncLock.isLocked) {
    return c.json({
      success: false,
      message: 'No sync operation in progress',
      isLocked: false
    });
  }

  syncLock.cancelRequested = true;

  if (force) {
    const preservedErrors = syncLock.finalDetailedErrors;
    const preservedStats = syncLock.finalStats;
    syncLock = {
      isLocked: false,
      cancelled: true,
      completed: syncLock.completed || false,
      finalDetailedErrors: preservedErrors,
      finalStats: preservedStats
    };
    return c.json({
      success: true,
      message: 'Lock force released',
      cancelRequested: true,
      forceUnlocked: true
    });
  }

  return c.json({
    success: true,
    message: 'Cancel requested. Sync will stop after current file.',
    cancelRequested: true
  });
});

// Trigger sync
syncConversationsRoutes.post('/', async (c) => {
  const db = c.env.DB;

  if (syncLock.isLocked) {
    return c.json({
      success: false,
      error: 'Sync already in progress',
      message: `A sync operation is currently running (started at ${syncLock.startedAt})`,
      isLocked: true,
      startedAt: syncLock.startedAt,
      startedBy: syncLock.startedBy
    }, 409);
  }

  const lockId = `sync-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const startTime = new Date().toISOString();

  syncLock = {
    isLocked: true,
    startedAt: startTime,
    startedBy: c.req.header('user-agent') || 'unknown',
    cancelRequested: false,
    progress: {
      filesProcessed: 0,
      totalFiles: 0,
      conversationsProcessed: 0,
      successfulFiles: [],
      failedFiles: []
    },
    finalDetailedErrors: []
  };

  const body = await c.req.json().catch(() => ({}));
  const deleteMissing = body.deleteMissing === true;
  const testMode = body.testMode === true;

  // Start sync asynchronously using waitUntil if available
  const syncPromise = performSync(c.req.raw, db, startTime, deleteMissing, testMode);

  // Use c.executionCtx.waitUntil if available
  if (c.executionCtx && c.executionCtx.waitUntil) {
    c.executionCtx.waitUntil(syncPromise);
  } else {
    syncPromise.catch((error) => {
      console.error('Background sync error:', error);
      syncLock = { isLocked: false };
    });
  }

  return c.json({
    success: true,
    message: 'Sync started',
    startedAt: startTime
  });
});

// Perform the actual sync operation
async function performSync(
  request: Request,
  db: D1Database,
  startTime: string,
  deleteMissing: boolean,
  testMode: boolean
): Promise<void> {
  try {
    // Fetch manifest
    let manifest: { files: Array<{ path: string; url: string }> } | null = null;

    try {
      const manifestResponse = await fetch(new URL('/test-cases-manifest.json', request.url));
      if (manifestResponse.ok) {
        manifest = await manifestResponse.json();
      }
    } catch (e: any) {
      console.error(`[Sync] Error loading manifest: ${e.message}`);
    }

    if (testMode && manifest && manifest.files && manifest.files.length > 10) {
      manifest.files = manifest.files.slice(0, 10);
    }

    if (!manifest || !manifest.files || manifest.files.length === 0) {
      const errorMsg = 'No files found in manifest';
      syncLock.error = errorMsg;
      syncLock.completed = true;
      syncLock = { isLocked: false, completed: true, error: errorMsg };
      return;
    }

    const allConversations: any[] = [];
    const errors: string[] = [];
    const successfulFiles: string[] = [];
    const failedFiles: Array<{ path: string; reason: string }> = [];

    if (syncLock.progress) {
      syncLock.progress.totalFiles = manifest.files.length;
      syncLock.progress.currentPhase = 'parsing';
    }

    // Load and parse all files
    for (let i = 0; i < manifest.files.length; i++) {
      if (syncLock.cancelRequested) {
        syncLock.cancelled = true;
        syncLock.completed = true;
        syncLock.isLocked = false;
        return;
      }

      const file = manifest.files[i];
      try {
        const fileResponse = await fetch(new URL(file.url, request.url));
        if (!fileResponse.ok) {
          const reason = `HTTP ${fileResponse.status}`;
          failedFiles.push({ path: file.path, reason });
          continue;
        }

        const text = await fileResponse.text();
        let data: any;

        try {
          data = JSON.parse(text);
        } catch (jsonError: any) {
          const reason = `Invalid JSON: ${jsonError.message}`;
          failedFiles.push({ path: file.path, reason });
          continue;
        }

        const conversations = parseConversationData(data, file.path);
        // Filter out conversations with no turns
        const validConversations = conversations.filter(c => c.turns && c.turns.length > 0);
        if (validConversations.length > 0) {
          allConversations.push(...validConversations);
          successfulFiles.push(file.path);
        } else {
          failedFiles.push({ path: file.path, reason: 'No valid conversations with turns found in file' });
        }

        if (syncLock.progress) {
          syncLock.progress.filesProcessed = i + 1;
          syncLock.progress.conversationsProcessed = allConversations.length;
        }
      } catch (error: any) {
        const reason = error.message || 'Unknown error';
        failedFiles.push({ path: file.path, reason });
      }
    }

    // Update progress phase
    if (syncLock.progress) {
      syncLock.progress.currentPhase = 'sql-execution';
    }

    // Create tables if needed
    await ensureTablesExist(db);

    // Insert conversations
    let executed = 0;
    for (const conv of allConversations) {
      if (syncLock.cancelRequested) break;

      try {
        await insertConversation(db, conv);
        executed++;
      } catch (error: any) {
        errors.push(`Failed to insert ${conv.conversation_id}: ${error.message}`);
      }
    }

    const duration = Math.floor((Date.now() - new Date(startTime).getTime()) / 1000);

    syncLock.completed = true;
    syncLock.duration = duration;
    syncLock.finalStats = {
      filesProcessed: manifest.files.length,
      conversationsProcessed: allConversations.length,
      sqlStatementsExecuted: executed,
      errors: errors.length,
      duration: duration,
      successfulFiles: successfulFiles.length,
      failedFiles: failedFiles.length
    };
    syncLock.finalSuccessfulFiles = successfulFiles;
    syncLock.finalFailedFiles = failedFiles;
    syncLock.finalErrors = errors.length > 0 ? errors : undefined;

    // Release lock after delay
    setTimeout(() => {
      const preserved = {
        finalDetailedErrors: syncLock.finalDetailedErrors,
        finalStats: syncLock.finalStats,
        finalSuccessfulFiles: syncLock.finalSuccessfulFiles,
        finalFailedFiles: syncLock.finalFailedFiles,
        finalErrors: syncLock.finalErrors
      };
      syncLock = {
        isLocked: false,
        completed: true,
        ...preserved
      };
    }, 10000);

  } catch (error: any) {
    console.error('Sync API error:', error);
    syncLock.error = error.message || 'Internal server error';
    setTimeout(() => {
      syncLock = { isLocked: false };
    }, 1000);
  }
}

// Parse conversation data from file
function parseConversationData(data: any, sourceFile: string): any[] {
  const conversations: any[] = [];

  if (data.conversations && Array.isArray(data.conversations)) {
    for (const conv of data.conversations) {
      conversations.push({
        conversation_id: conv.id || `conv-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        customer_id: 'CUST-5001',
        chatbot_mode: 'helpful',
        turns: conv.turns || [],
        label: conv.severity === 'high' || (conv.flags && conv.flags.length > 0) ? 'adversarial' : 'clean',
        expected_manipulation: conv.severity === 'high' || (conv.flags && conv.flags.length > 0) ? 1 : 0,
        source_file: sourceFile,
      });
    }
  } else if (data.turns && Array.isArray(data.turns)) {
    conversations.push({
      conversation_id: data.conversation_id || `conv-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      customer_id: data.customer_id || 'CUST-5001',
      chatbot_mode: data.chatbot_mode || 'helpful',
      chatbot_provider: data.chatbot_provider,
      chatbot_model: data.chatbot_model,
      timestamp: data.timestamp,
      turns: data.turns,
      label: data.label || (data.expected_manipulation ? 'adversarial' : 'clean'),
      expected_manipulation: data.expected_manipulation || (data.label === 'adversarial' ? 1 : 0),
      source_file: sourceFile,
    });
  }

  return conversations;
}

// Ensure required tables exist
async function ensureTablesExist(db: D1Database) {
  const tables = [
    `CREATE TABLE IF NOT EXISTS customers (customer_id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT, member_since TEXT NOT NULL, lifetime_value REAL NOT NULL DEFAULT 0, total_orders INTEGER NOT NULL DEFAULT 0, total_returns INTEGER NOT NULL DEFAULT 0, return_rate REAL NOT NULL DEFAULT 0, segment TEXT, notes TEXT, preferences TEXT, loyalty_tier TEXT, support_history TEXT)`,
    `CREATE TABLE IF NOT EXISTS conversations (conversation_id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, chatbot_mode TEXT NOT NULL, chatbot_provider TEXT, chatbot_model TEXT, started_at TEXT NOT NULL, ended_at TEXT, label TEXT, expected_manipulation INTEGER DEFAULT 0, source_file TEXT, file_hash TEXT)`,
    `CREATE TABLE IF NOT EXISTS conversation_turns (turn_id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, turn_number INTEGER NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, reasoning_content TEXT, timestamp TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS tool_calls (call_id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, turn_id TEXT NOT NULL, tool_name TEXT NOT NULL, arguments TEXT NOT NULL, result TEXT NOT NULL, timestamp TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS sync_status (conversation_id TEXT PRIMARY KEY, source_file TEXT NOT NULL, file_hash TEXT NOT NULL, last_synced TEXT NOT NULL)`
  ];

  for (const sql of tables) {
    try {
      await db.prepare(sql).run();
    } catch (error: any) {
      // Ignore if table exists
    }
  }

  // Insert default customer
  try {
    await db.prepare(`INSERT OR IGNORE INTO customers (customer_id, name, email, member_since) VALUES ('CUST-5001', 'Default Customer', 'customer@example.com', ?)`).bind(new Date().toISOString()).run();
  } catch (error: any) {
    // Ignore
  }
}

// Insert a conversation with its turns
async function insertConversation(db: D1Database, conv: any) {
  const startedAt = conv.timestamp || new Date().toISOString();
  const endedAt = conv.turns.length > 0
    ? (conv.turns[conv.turns.length - 1].timestamp || startedAt)
    : startedAt;

  // Ensure customer exists
  await db.prepare(`INSERT OR IGNORE INTO customers (customer_id, name, email, member_since) VALUES (?, ?, ?, ?)`)
    .bind(conv.customer_id, `Customer ${conv.customer_id}`, `${conv.customer_id}@example.com`, new Date().toISOString())
    .run();

  // Insert conversation
  await db.prepare(`INSERT OR REPLACE INTO conversations (conversation_id, customer_id, chatbot_mode, chatbot_provider, chatbot_model, started_at, ended_at, label, expected_manipulation, source_file) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      conv.conversation_id,
      conv.customer_id,
      conv.chatbot_mode,
      conv.chatbot_provider || null,
      conv.chatbot_model || null,
      startedAt,
      endedAt,
      conv.label || null,
      conv.expected_manipulation || 0,
      conv.source_file || null
    )
    .run();

  // Delete existing turns and tool calls
  await db.prepare(`DELETE FROM tool_calls WHERE conversation_id = ?`).bind(conv.conversation_id).run();
  await db.prepare(`DELETE FROM conversation_turns WHERE conversation_id = ?`).bind(conv.conversation_id).run();

  // Insert turns
  for (let i = 0; i < conv.turns.length; i++) {
    const turn = conv.turns[i];
    const turnNumber = turn.turn || i + 1;
    const role = turn.role === 'customer' || turn.role === 'user' ? 'customer' : 'assistant';
    const timestamp = turn.timestamp || startedAt;
    const turnId = `turn-${conv.conversation_id}-${turnNumber}`;

    await db.prepare(`INSERT OR REPLACE INTO conversation_turns (turn_id, conversation_id, turn_number, role, content, reasoning_content, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(turnId, conv.conversation_id, turnNumber, role, turn.content || '', turn.reasoning_content || null, timestamp)
      .run();

    // Insert tool calls
    if (turn.tool_calls && Array.isArray(turn.tool_calls)) {
      for (let j = 0; j < turn.tool_calls.length; j++) {
        const tc = turn.tool_calls[j];
        const callId = `call-${turnId}-${j}`;
        await db.prepare(`INSERT OR REPLACE INTO tool_calls (call_id, conversation_id, turn_id, tool_name, arguments, result, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .bind(callId, conv.conversation_id, turnId, tc.tool || '', JSON.stringify(tc.arguments || {}), JSON.stringify(tc.result || {}), timestamp)
          .run();
      }
    }
  }

  // Update sync status
  await db.prepare(`INSERT OR REPLACE INTO sync_status (conversation_id, source_file, file_hash, last_synced) VALUES (?, ?, ?, ?)`)
    .bind(conv.conversation_id, conv.source_file || '', `sync-${Date.now()}`, new Date().toISOString())
    .run();
}
