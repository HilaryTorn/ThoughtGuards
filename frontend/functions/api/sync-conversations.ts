/**
 * Sync Conversations API Endpoint
 * Triggers synchronization of mock_data files to the database
 * 
 * This endpoint reads mock_data files and syncs them to the database
 * Prevents concurrent syncs using a lock mechanism
 */

import { Env } from '../../lib/db';
import { createDbClient } from '../../lib/db';

// In-memory lock for sync operations (works for single-instance deployments)
// For multi-instance, we'd use D1 database for distributed locking
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
  };
  finalStats?: {
    filesProcessed: number;
    conversationsProcessed: number;
    sqlStatementsExecuted: number;
    errors: number;
    duration: number;
    successfulFiles: number;
    failedFiles: number;
    sqlErrors?: number;
    filesWithSqlErrors?: number;
  };
  finalSuccessfulFiles?: string[];
  finalFailedFiles?: Array<{ path: string; reason: string }>;
  finalErrors?: string[];
  finalDetailedErrors?: Array<{
    message: string;
    sqlPreview?: string;
    sqlLength?: number;
    reference?: string;
    statementNumber?: number;
  }>;
} = { isLocked: false };

interface ConversationTurn {
  turn?: number;
  role: 'customer' | 'user' | 'assistant';
  content: string;
  reasoning_content?: string;
  timestamp?: string;
  tool_calls?: Array<{
    tool: string;
    arguments: any;
    result: any;
  }>;
}

interface ConversationData {
  conversation_id: string;
  customer_id?: string;
  chatbot_mode?: string;
  chatbot_provider?: string;
  chatbot_model?: string;
  timestamp?: string;
  turns: ConversationTurn[];
  label?: string;
  expected_manipulation?: number;
  source_file?: string;
  file_hash?: string;
}

/**
 * Parse a conversation file (handles both dataset and individual formats)
 */
function parseConversationData(data: any, sourceFile: string): ConversationData[] {
  const conversations: ConversationData[] = [];

  // Handle dataset format (ecommerce_cot_dataset.json)
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
  }
  // Handle individual conversation file format
  else if (data.turns && Array.isArray(data.turns)) {
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

/**
 * Generate SQL for syncing a conversation
 * Returns both SQL strings and parameterized query data for long text fields
 */
interface ParameterizedQuery {
  sql: string;
  params: any[];
}

function generateConversationSQL(conv: ConversationData): {
  sqlStatements: string[];
  parameterizedQueries: ParameterizedQuery[];
} {
  const sqlStatements: string[] = [];
  const parameterizedQueries: ParameterizedQuery[] = [];
  
  const startedAt = conv.timestamp || new Date().toISOString();
  const endedAt = conv.turns.length > 0 
    ? (conv.turns[conv.turns.length - 1].timestamp || startedAt)
    : startedAt;
  
  // Improved escape function that handles SQL injection and special characters
  const escape = (str: string): string => {
    if (!str || typeof str !== 'string') return '';
    // IMPORTANT: Replace single quotes FIRST, before any other processing
    // This prevents SQL injection and syntax errors
    let escaped = str.replace(/'/g, "''");
    // Remove control characters that can break SQL (but keep printable chars)
    escaped = escaped.replace(/[\x00-\x1F\x7F-\x9F]/g, ''); // Remove control chars and extended ASCII control
    // Replace newlines with spaces to prevent SQL syntax issues
    escaped = escaped.replace(/\n/g, ' ');
    escaped = escaped.replace(/\r/g, ''); // Remove carriage returns
    // Limit to 1MB to prevent D1 errors
    if (escaped.length > 1000000) {
      console.warn(`[Sync] Truncating escaped string from ${escaped.length} to 1000000 chars`);
      escaped = escaped.substring(0, 1000000);
    }
    return escaped;
  };
  
  // Escape and truncate JSON strings specifically
  const escapeJson = (obj: any): string => {
    try {
      const jsonStr = JSON.stringify(obj || {});
      // Truncate if too long (D1 has limits)
      if (jsonStr.length > 500000) { // 500KB limit
        const truncated = jsonStr.substring(0, 500000);
        return escape(truncated + '... [truncated]');
      }
      return escape(jsonStr);
    } catch (e) {
      console.warn('Failed to stringify JSON:', e);
      return escape('{}');
    }
  };
  
  // Insert or replace conversation (single line SQL - no newlines)
  sqlStatements.push(`INSERT OR REPLACE INTO conversations (conversation_id, customer_id, chatbot_mode, chatbot_provider, chatbot_model, started_at, ended_at, label, expected_manipulation, source_file, file_hash) VALUES ('${escape(conv.conversation_id)}', '${escape(conv.customer_id || 'CUST-5001')}', '${escape(conv.chatbot_mode || 'helpful')}', ${conv.chatbot_provider ? `'${escape(conv.chatbot_provider)}'` : 'NULL'}, ${conv.chatbot_model ? `'${escape(conv.chatbot_model)}'` : 'NULL'}, '${startedAt}', '${endedAt}', ${conv.label ? `'${escape(conv.label)}'` : 'NULL'}, ${conv.expected_manipulation || 0}, ${conv.source_file ? `'${escape(conv.source_file)}'` : 'NULL'}, ${conv.file_hash ? `'${escape(conv.file_hash)}'` : 'NULL'});`);
  
  // Delete existing turns and tool calls (single line SQL - no newlines)
  sqlStatements.push(`DELETE FROM tool_calls WHERE turn_id IN (SELECT turn_id FROM conversation_turns WHERE conversation_id = '${escape(conv.conversation_id)}');`);
  sqlStatements.push(`DELETE FROM conversation_turns WHERE conversation_id = '${escape(conv.conversation_id)}';`);
  
  // Insert conversation turns
  for (let i = 0; i < conv.turns.length; i++) {
    const turn = conv.turns[i];
    const turnNumber = turn.turn || i + 1;
    const role = turn.role === 'customer' || turn.role === 'user' ? 'customer' : 'assistant';
    const timestamp = turn.timestamp || startedAt;
    const turnId = `turn-${conv.conversation_id}-${turnNumber}`;
    
    // Insert or replace conversation turn
    // IMPORTANT: Use parameterized queries for long reasoning_content to avoid SQL string literal limits
    // D1 has limits on SQL statement length when using string literals, so we use parameterized queries
    let reasoningContent = turn.reasoning_content || null;
    // Limit reasoning_content to 1MB (the TEXT datatype limit)
    if (reasoningContent && reasoningContent.length > 1000000) {
      console.warn(`[Sync] Truncating reasoning_content from ${reasoningContent.length} to 1000000 chars for turn ${turnId}`);
      reasoningContent = reasoningContent.substring(0, 1000000);
    }
    
    // Use parameterized query for conversation_turns to handle long reasoning_content
    parameterizedQueries.push({
      sql: `INSERT OR REPLACE INTO conversation_turns (turn_id, conversation_id, turn_number, role, content, reasoning_content, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      params: [turnId, conv.conversation_id, turnNumber, role, turn.content || '', reasoningContent, timestamp]
    });
    
    // Insert or replace tool calls if any (single line SQL - use OR REPLACE to handle duplicates)
    if (turn.tool_calls && Array.isArray(turn.tool_calls)) {
      for (let j = 0; j < turn.tool_calls.length; j++) {
        const toolCall = turn.tool_calls[j];
        const callId = `call-${turnId}-${j}`;
        sqlStatements.push(`INSERT OR REPLACE INTO tool_calls (call_id, conversation_id, turn_id, tool_name, arguments, result, timestamp) VALUES ('${escape(callId)}', '${escape(conv.conversation_id)}', '${escape(turnId)}', '${escape(toolCall.tool || '')}', '${escapeJson(toolCall.arguments)}', '${escapeJson(toolCall.result)}', '${timestamp}');`);
      }
    }
  }
  
  return { sqlStatements, parameterizedQueries };
}

/**
 * GET endpoint - Check sync status
 */
export const onRequestGet = async (context: { request: Request; env: Env }): Promise<Response> => {
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
  
  // Debug logging to verify errors are being tracked
  if (syncLock.finalDetailedErrors && syncLock.finalDetailedErrors.length > 0) {
    console.log(`[Sync GET] Returning ${syncLock.finalDetailedErrors.length} detailed errors`);
    console.log(`[Sync GET] First error: ${syncLock.finalDetailedErrors[0].message.substring(0, 100)}`);
    console.log(`[Sync GET] syncLock.isLocked: ${syncLock.isLocked}, syncLock.completed: ${syncLock.completed}`);
  } else {
    console.log(`[Sync GET] No detailed errors in syncLock (isLocked: ${syncLock.isLocked}, completed: ${syncLock.completed})`);
  }

  // Include progress if available
  if (syncLock.progress) {
    response.progress = syncLock.progress;
  }
  
  // Always include detailed errors if available (for real-time display during sync)
  // This allows the UI to show SQL errors even while sync is in progress
  // IMPORTANT: Include detailed errors even if sync is still in progress
  // This is critical for real-time error display
  // Check both during sync (isLocked) and after completion
  if (syncLock.finalDetailedErrors && syncLock.finalDetailedErrors.length > 0) {
    response.detailedErrors = syncLock.finalDetailedErrors;
    // Also add to progress for convenience
    if (response.progress) {
      response.progress.sqlErrorCount = syncLock.finalDetailedErrors.length;
    }
    console.log(`[Sync GET] Added ${syncLock.finalDetailedErrors.length} detailed errors to response (isLocked: ${syncLock.isLocked}, completed: ${syncLock.completed})`);
  } else {
    console.log(`[Sync GET] No detailed errors to add (finalDetailedErrors: ${syncLock.finalDetailedErrors ? 'exists but empty' : 'null/undefined'}, isLocked: ${syncLock.isLocked}, completed: ${syncLock.completed})`);
  }

  // Include final results if completed
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
    if (syncLock.finalDetailedErrors) {
      response.detailedErrors = syncLock.finalDetailedErrors;
    }
  }
  
  // Also include detailed errors even if not completed (for real-time error display)
  if (syncLock.finalDetailedErrors && syncLock.finalDetailedErrors.length > 0) {
    response.detailedErrors = syncLock.finalDetailedErrors;
  }

  // Include error if present
  if (syncLock.error) {
    response.error = syncLock.error;
  }

  return Response.json(response);
};

/**
 * DELETE endpoint - Cancel sync
 * Supports ?force=true query parameter to force unlock immediately
 */
export const onRequestDelete = async (context: { request: Request; env: Env }): Promise<Response> => {
  const url = new URL(context.request.url);
  const force = url.searchParams.get('force') === 'true';
  
  console.log(`[Sync] Cancel requested${force ? ' (FORCE UNLOCK)' : ''}`);
  
  if (!syncLock.isLocked) {
    console.log('[Sync] No sync in progress, cannot cancel');
    return Response.json({
      success: false,
      message: 'No sync operation in progress',
      isLocked: false
    }, { status: 200 }); // Return 200 instead of 404 to avoid confusion
  }

  syncLock.cancelRequested = true;
  
  // Force unlock if requested
  if (force) {
    console.log('[Sync] Force unlock requested - immediately releasing lock');
    const preservedErrors = syncLock.finalDetailedErrors;
    const preservedStats = syncLock.finalStats;
    const preservedSuccessfulFiles = syncLock.finalSuccessfulFiles;
    const preservedFailedFiles = syncLock.finalFailedFiles;
    const preservedFinalErrors = syncLock.finalErrors;
    syncLock = {
      isLocked: false,
      cancelled: true,
      completed: syncLock.completed || false,
      finalDetailedErrors: preservedErrors,
      finalStats: preservedStats,
      finalSuccessfulFiles: preservedSuccessfulFiles,
      finalFailedFiles: preservedFailedFiles,
      finalErrors: preservedFinalErrors
    };
    return Response.json({
      success: true,
      message: 'Lock force released',
      cancelRequested: true,
      forceUnlocked: true
    });
  }
  
  console.log('[Sync] Cancel flag set, sync will stop after current operation');
  
  return Response.json({
    success: true,
    message: 'Cancel requested. Sync will stop after current file.',
    cancelRequested: true
  });
};

/**
 * POST endpoint - Trigger sync (with lock)
 * Returns immediately and runs sync asynchronously
 */
export const onRequestPost = async (context: { request: Request; env: Env; waitUntil?: (promise: Promise<any>) => void }): Promise<Response> => {
  const { request, env, waitUntil } = context;
  const db = createDbClient(env.DB);

  // Check if sync is already in progress
  if (syncLock.isLocked) {
    return Response.json({
      success: false,
      error: 'Sync already in progress',
      message: `A sync operation is currently running (started at ${syncLock.startedAt})`,
      isLocked: true,
      startedAt: syncLock.startedAt,
      startedBy: syncLock.startedBy
    }, { status: 409 }); // 409 Conflict
  }

  // Acquire lock
  const lockId = `sync-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const startTime = new Date().toISOString();
  // Preserve finalDetailedErrors if it exists (from previous sync)
  const existingErrors = syncLock.finalDetailedErrors || [];
  syncLock = {
    isLocked: true,
    startedAt: startTime,
    startedBy: request.headers.get('user-agent') || 'unknown',
    cancelRequested: false,
    progress: {
      filesProcessed: 0,
      totalFiles: 0,
      conversationsProcessed: 0,
      successfulFiles: [],
      failedFiles: []
    },
    finalDetailedErrors: existingErrors // Preserve existing errors, will be cleared/reset in performSync
  };
  
  console.log(`[Sync] Starting sync operation: ${lockId} at ${startTime}`);

  // Parse request body
  const body = await request.json().catch(() => ({}));
  const deleteMissing = body.deleteMissing === true;
  const testMode = body.testMode === true; // Test mode: only sync first 10 files

  // Start sync asynchronously
  const syncPromise = performSync(request, env, startTime, deleteMissing, testMode);
  
  // Use waitUntil if available (Cloudflare Workers/Pages)
  if (waitUntil) {
    waitUntil(syncPromise);
  } else {
    // If waitUntil not available, still run async but don't wait
    syncPromise.catch((error) => {
      console.error('Background sync error:', error);
      // Preserve finalDetailedErrors when releasing lock
      const preservedErrors = syncLock.finalDetailedErrors;
      syncLock = { isLocked: false, finalDetailedErrors: preservedErrors };
    });
  }

  // Return immediately
  return Response.json({
    success: true,
    message: 'Sync started',
    startedAt: startTime
  });
};

/**
 * Save partial results when sync is cancelled
 * Executes SQL for conversations processed so far
 */
async function savePartialResults(
  env: Env,
  allConversations: ConversationData[],
  successfulFiles: string[],
  failedFiles: Array<{ path: string; reason: string }>,
  errors: string[],
  startTime: string,
  executed: number
): Promise<void> {
  // Execute SQL for conversations processed before cancellation
  if (allConversations.length > 0) {
    const sqlStatements: string[] = [];
    
    // Create sync_status table if it doesn't exist
    sqlStatements.push(`
      CREATE TABLE IF NOT EXISTS sync_status (
        conversation_id TEXT PRIMARY KEY,
        source_file TEXT NOT NULL,
        file_hash TEXT NOT NULL,
        last_synced TEXT NOT NULL,
        FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id)
      );
    `);
    
    sqlStatements.push(`
      CREATE INDEX IF NOT EXISTS idx_sync_status_source_file ON sync_status(source_file);
    `);

    // Ensure all tables exist before inserting data
    sqlStatements.push(`CREATE TABLE IF NOT EXISTS conversations (conversation_id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, chatbot_mode TEXT NOT NULL, chatbot_provider TEXT, chatbot_model TEXT, started_at TEXT NOT NULL, ended_at TEXT, label TEXT, expected_manipulation INTEGER DEFAULT 0, source_file TEXT, file_hash TEXT);`);
    sqlStatements.push(`CREATE TABLE IF NOT EXISTS conversation_turns (turn_id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, turn_number INTEGER NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, reasoning_content TEXT, timestamp TEXT NOT NULL, FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id));`);
    sqlStatements.push(`CREATE TABLE IF NOT EXISTS tool_calls (call_id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, turn_id TEXT NOT NULL, tool_name TEXT NOT NULL, arguments TEXT NOT NULL, result TEXT NOT NULL, timestamp TEXT NOT NULL, FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id), FOREIGN KEY (turn_id) REFERENCES conversation_turns(turn_id));`);
    sqlStatements.push(`CREATE TABLE IF NOT EXISTS sync_status (conversation_id TEXT PRIMARY KEY, source_file TEXT NOT NULL, file_hash TEXT NOT NULL, last_synced TEXT NOT NULL, FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id));`);
    sqlStatements.push(`CREATE INDEX IF NOT EXISTS idx_sync_status_source_file ON sync_status(source_file);`);
    sqlStatements.push(`CREATE INDEX IF NOT EXISTS idx_tool_calls_turn_id ON tool_calls(turn_id);`);
    sqlStatements.push(`CREATE INDEX IF NOT EXISTS idx_conversation_turns_conversation_id ON conversation_turns(conversation_id);`);

    // Generate SQL for each conversation
    for (const conv of allConversations) {
      sqlStatements.push(...generateConversationSQL(conv));
      
      // Update sync status (single line SQL)
      const fileHash = 'sync-' + Date.now();
      sqlStatements.push(`INSERT OR REPLACE INTO sync_status (conversation_id, source_file, file_hash, last_synced) VALUES ('${conv.conversation_id.replace(/'/g, "''")}', '${(conv.source_file || '').replace(/'/g, "''")}', '${fileHash}', '${new Date().toISOString()}');`);
    }

    // Execute SQL statements (each statement is already single-line)
    for (let i = 0; i < sqlStatements.length; i++) {
      const sql = sqlStatements[i];
      try {
        // Remove any remaining newlines and trim
        const cleanedSql = sql.replace(/\n/g, ' ').replace(/\r/g, '').trim();
        
        if (!cleanedSql) continue;
        
        // Validate SQL statement length (D1 has limits)
        if (cleanedSql.length > 1000000) { // 1MB limit
          errors.push(`SQL statement too long (${cleanedSql.length} chars), skipping`);
          console.error('SQL statement too long, truncating:', cleanedSql.substring(0, 200));
          continue;
        }
        
        await env.DB.prepare(cleanedSql).run();
        executed++;
        
        // Update SQL execution progress
        if (syncLock.progress) {
          syncLock.progress.sqlStatementsExecuted = executed;
        }
        
        // Log progress every 100 statements for debugging
        if (executed % 100 === 0) {
          console.log(`[Sync SQL Progress] Executed ${executed}/${totalSqlStatements} statements`);
        }
      } catch (error: any) {
        // More detailed error logging
        const errorMsg = error.message || 'Unknown SQL error';
        const sqlPreview = sql.replace(/\n/g, ' ').substring(0, 200);
        errors.push(`SQL execution error at statement ${executed + 1}: ${errorMsg}`);
        console.error('SQL error details:', {
          error: errorMsg,
          sqlPreview: sqlPreview,
          sqlLength: sql.length,
          reference: error.cause?.message || 'no reference'
        });
        
        // If it's a D1 internal error, log more context
        if (errorMsg.includes('D1_ERROR') || errorMsg.includes('internal error')) {
          const cleanedSql = sql.replace(/\n/g, ' ').replace(/\r/g, '');
          console.error('D1 internal error - SQL statement:', {
            firstChars: cleanedSql.substring(0, 500),
            lastChars: cleanedSql.substring(Math.max(0, cleanedSql.length - 500)),
            length: cleanedSql.length,
            hasNewlines: sql.includes('\n'),
            hasControlChars: /[\x00-\x1F\x7F]/.test(cleanedSql)
          });
        }
        
        // Continue with next statement even if one fails
        // Don't increment executed counter for failed statements
      }
    }
  }
  
  const duration = Math.floor((Date.now() - new Date(startTime).getTime()) / 1000);
  
  syncLock.completed = true;
  syncLock.cancelled = true;
  syncLock.duration = duration;
  syncLock.finalStats = {
    filesProcessed: successfulFiles.length + failedFiles.length,
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
}

/**
 * Perform the actual sync operation (runs asynchronously)
 */
async function performSync(request: Request, env: Env, startTime: string, deleteMissing: boolean, testMode: boolean = false): Promise<void> {
  try {

    // Try to fetch the test-cases-manifest.json to get list of files
    // In Cloudflare Pages, mock_data files should be in the public folder
    let manifest: { files: Array<{ path: string; url: string }> } | null = null;
    
    try {
      const manifestResponse = await fetch(new URL('/test-cases-manifest.json', request.url));
      if (manifestResponse.ok) {
        manifest = await manifestResponse.json();
        console.log(`[Sync] Loaded manifest with ${manifest?.files?.length || 0} files`);
      } else {
        console.error(`[Sync] Failed to load manifest: HTTP ${manifestResponse.status}`);
      }
    } catch (e: any) {
      console.error(`[Sync] Error loading manifest: ${e.message}`);
      // Manifest might not exist
    }

    // In test mode, only process first 10 files
    if (testMode && manifest && manifest.files && manifest.files.length > 10) {
      manifest.files = manifest.files.slice(0, 10);
      console.log(`[Sync] Test mode: Processing only first 10 files`);
    }

    if (!manifest || !manifest.files || manifest.files.length === 0) {
      console.error(`[Sync] No manifest or no files found. Manifest: ${manifest ? 'exists' : 'null'}, Files: ${manifest?.files?.length || 0}`);
      const errorMsg = 'No files found in manifest';
      errors.push(errorMsg);
      syncLock.error = errorMsg;
      syncLock.completed = true;
      // Preserve finalDetailedErrors when releasing lock
      const preservedErrors = syncLock.finalDetailedErrors;
      syncLock = { isLocked: false, completed: true, error: errorMsg, finalDetailedErrors: preservedErrors };
      return;
    }

    const allConversations: ConversationData[] = [];
    const errors: string[] = [];
    const successfulFiles: string[] = [];
    const failedFiles: Array<{ path: string; reason: string }> = [];
    
    // Initialize progress and finalDetailedErrors
    if (!syncLock.progress) {
      syncLock.progress = {
        filesProcessed: 0,
        totalFiles: manifest.files.length,
        conversationsProcessed: 0,
        successfulFiles: [],
        failedFiles: []
      };
    }
    if (!syncLock.finalDetailedErrors) {
      syncLock.finalDetailedErrors = [];
    }
    
    // Update progress
    if (syncLock.progress) {
      syncLock.progress.totalFiles = manifest.files.length;
      syncLock.progress.successfulFiles = [];
      syncLock.progress.failedFiles = [];
      syncLock.progress.currentPhase = 'parsing';
    }

    // Load and parse all files
    for (let i = 0; i < manifest.files.length; i++) {
      // Check for cancellation - but still update progress for files processed so far
      if (syncLock.cancelRequested) {
        // Save partial results before cancelling
        await savePartialResults(env, allConversations, successfulFiles, failedFiles, errors, startTime, executed);
        // Preserve finalDetailedErrors when releasing lock
        const preservedErrors = syncLock.finalDetailedErrors;
        syncLock = { isLocked: false, cancelled: true, finalDetailedErrors: preservedErrors };
        return;
      }

      const file = manifest.files[i];
      try {
        const fileResponse = await fetch(new URL(file.url, request.url));
        if (!fileResponse.ok) {
          const reason = `HTTP ${fileResponse.status}`;
          failedFiles.push({ path: file.path, reason });
          if (syncLock.progress) {
            syncLock.progress.failedFiles.push({ path: file.path, reason });
          }
          errors.push(`Failed to load ${file.path}: ${reason}`);
          // Update progress even for failed files
          if (syncLock.progress) {
            syncLock.progress.filesProcessed = i + 1;
          }
          continue;
        }
        
        // Try to get text first to check if it's valid JSON
        const text = await fileResponse.text();
        let data: any;
        
        try {
          data = JSON.parse(text);
        } catch (jsonError: any) {
          const reason = `Invalid JSON: ${jsonError.message}`;
          failedFiles.push({ path: file.path, reason });
          if (syncLock.progress) {
            syncLock.progress.failedFiles.push({ path: file.path, reason });
          }
          errors.push(`Failed to parse JSON in ${file.path}: ${jsonError.message}`);
          // Update progress even for failed files
          if (syncLock.progress) {
            syncLock.progress.filesProcessed = i + 1;
          }
          continue; // Continue with next file - don't stop sync
        }
        
        const conversations = parseConversationData(data, file.path);
        if (conversations.length > 0) {
          allConversations.push(...conversations);
          successfulFiles.push(file.path);
          if (syncLock.progress) {
            syncLock.progress.successfulFiles.push(file.path);
          }
        } else {
          failedFiles.push({ path: file.path, reason: 'No conversations found in file' });
          if (syncLock.progress) {
            syncLock.progress.failedFiles.push({ path: file.path, reason: 'No conversations found in file' });
          }
        }
        
        // Update progress
        if (syncLock.progress) {
          syncLock.progress.filesProcessed = i + 1;
          syncLock.progress.conversationsProcessed = allConversations.length;
        }
        
        // Log progress every 10 files for debugging
        if ((i + 1) % 10 === 0) {
          console.log(`[Sync Progress] Processed ${i + 1}/${manifest.files.length} files, ${allConversations.length} conversations, ${successfulFiles.length} successful, ${failedFiles.length} failed`);
        }
      } catch (error: any) {
        const reason = error.message || 'Unknown error';
        failedFiles.push({ path: file.path, reason });
        if (syncLock.progress) {
          syncLock.progress.failedFiles.push({ path: file.path, reason });
        }
        errors.push(`Failed to process ${file.path}: ${reason}`);
        // Update progress even for failed files
        if (syncLock.progress) {
          syncLock.progress.filesProcessed = i + 1;
        }
      }
    }

    // Generate and execute SQL for all conversations
    const sqlStatements: string[] = [];
    
    // Ensure all tables exist before inserting data (single line SQL)
    // IMPORTANT: Create tables WITHOUT foreign key constraints during sync to avoid FK errors
    // The schema.sql defines FK constraints, but we create tables without them here for sync flexibility
    sqlStatements.push(`CREATE TABLE IF NOT EXISTS customers (customer_id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT, member_since TEXT NOT NULL, lifetime_value REAL NOT NULL DEFAULT 0, total_orders INTEGER NOT NULL DEFAULT 0, total_returns INTEGER NOT NULL DEFAULT 0, return_rate REAL NOT NULL DEFAULT 0, segment TEXT, notes TEXT, preferences TEXT, loyalty_tier TEXT, support_history TEXT);`);
    sqlStatements.push(`CREATE TABLE IF NOT EXISTS conversations (conversation_id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, chatbot_mode TEXT NOT NULL, chatbot_provider TEXT, chatbot_model TEXT, started_at TEXT NOT NULL, ended_at TEXT, label TEXT, expected_manipulation INTEGER DEFAULT 0, source_file TEXT, file_hash TEXT);`);
    sqlStatements.push(`CREATE TABLE IF NOT EXISTS conversation_turns (turn_id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, turn_number INTEGER NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, reasoning_content TEXT, timestamp TEXT NOT NULL);`);
    sqlStatements.push(`CREATE TABLE IF NOT EXISTS tool_calls (call_id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, turn_id TEXT NOT NULL, tool_name TEXT NOT NULL, arguments TEXT NOT NULL, result TEXT NOT NULL, timestamp TEXT NOT NULL);`);
    sqlStatements.push(`CREATE TABLE IF NOT EXISTS sync_status (conversation_id TEXT PRIMARY KEY, source_file TEXT NOT NULL, file_hash TEXT NOT NULL, last_synced TEXT NOT NULL);`);
    sqlStatements.push(`CREATE INDEX IF NOT EXISTS idx_sync_status_source_file ON sync_status(source_file);`);
    sqlStatements.push(`CREATE INDEX IF NOT EXISTS idx_tool_calls_turn_id ON tool_calls(turn_id);`);
    sqlStatements.push(`CREATE INDEX IF NOT EXISTS idx_conversation_turns_conversation_id ON conversation_turns(conversation_id);`);

    // Collect all unique customer IDs and create placeholder customers first
    // This ensures FOREIGN KEY constraints are satisfied
    // IMPORTANT: Customers must be inserted BEFORE conversations to satisfy FK constraints
    const customerIds = new Set<string>();
    for (const conv of allConversations) {
      const customerId = conv.customer_id || 'CUST-5001';
      customerIds.add(customerId);
    }
    
    // Create placeholder customers (INSERT OR REPLACE to ensure they exist)
    // Execute these FIRST, before any conversation inserts
    // IMPORTANT: These must execute successfully before conversations are inserted
    const customerInserts: string[] = [];
    for (const customerId of customerIds) {
      const escapedCustomerId = escape(customerId);
      customerInserts.push(`INSERT OR REPLACE INTO customers (customer_id, name, email, member_since, lifetime_value, total_orders, total_returns, return_rate) VALUES ('${escapedCustomerId}', 'Customer ${escapedCustomerId}', 'customer${escapedCustomerId}@example.com', '${new Date().toISOString()}', 0, 0, 0, 0);`);
    }
    // Execute table creation and customer inserts FIRST, before processing conversations
    console.log(`[Sync] Creating tables and inserting ${customerIds.size} customers...`);
    let executed = 0;
    let sqlErrorsCount = 0; // Track SQL execution errors
    
    // Execute table creation statements
    for (let i = 0; i < sqlStatements.length; i++) {
      const sql = sqlStatements[i];
      try {
        const trimmed = sql.trim();
        if (!trimmed || !trimmed.endsWith(';')) {
          continue;
        }
        await env.DB.prepare(trimmed).run();
        executed++;
        if (i < 3) {
          console.log(`[Sync] Created table/index: ${trimmed.substring(0, 80)}...`);
        }
      } catch (error: any) {
        const errorMsg = error.message || 'Unknown error';
        // If table already exists, that's OK - log as warning, not error
        if (errorMsg.includes('already exists') || errorMsg.includes('duplicate')) {
          console.log(`[Sync] Table/index already exists (OK): ${sql.substring(0, 60)}...`);
        } else {
          console.error(`[Sync] Failed to execute table setup statement ${i + 1}: ${errorMsg}`);
          errors.push(`Table setup error: ${errorMsg}`);
        }
      }
    }
    
    // Verify tables exist before proceeding
    const requiredTables = ['customers', 'conversations', 'conversation_turns', 'tool_calls', 'sync_status'];
    let missingTables: string[] = [];
    for (const tableName of requiredTables) {
      try {
        const result = await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).bind(tableName).first();
        if (!result) {
          missingTables.push(tableName);
        }
      } catch (error: any) {
        console.error(`[Sync] Failed to check if table ${tableName} exists: ${error.message}`);
        missingTables.push(tableName);
      }
    }
    
    if (missingTables.length > 0) {
      const errorMsg = `Critical: Required tables are missing: ${missingTables.join(', ')}. Cannot proceed with sync.`;
      console.error(`[Sync] ${errorMsg}`);
      errors.push(errorMsg);
      syncLock.error = errorMsg;
      syncLock.completed = true;
      const preservedErrors = syncLock.finalDetailedErrors;
      syncLock = { isLocked: false, completed: true, error: errorMsg, finalDetailedErrors: preservedErrors };
      return;
    }
    
    console.log(`[Sync] All required tables verified. Inserting ${customerIds.size} customers...`);
    
    // Execute customer inserts
    for (let i = 0; i < customerInserts.length; i++) {
      const sql = customerInserts[i];
      try {
        const trimmed = sql.trim();
        if (!trimmed || !trimmed.endsWith(';')) {
          continue;
        }
        await env.DB.prepare(trimmed).run();
        executed++;
      } catch (error: any) {
        const errorMsg = error.message || 'Unknown error';
        // If customer already exists (INSERT OR REPLACE), that's OK
        if (errorMsg.includes('UNIQUE constraint') && sql.includes('INSERT OR REPLACE')) {
          // This shouldn't happen with INSERT OR REPLACE, but if it does, continue
          console.log(`[Sync] Customer already exists (OK): ${sql.substring(0, 60)}...`);
        } else {
          console.error(`[Sync] Failed to insert customer ${i + 1}: ${errorMsg}`);
          errors.push(`Customer insert error: ${errorMsg}`);
        }
      }
    }
    
    console.log(`[Sync] Tables verified and ${customerIds.size} customers inserted. Starting conversation processing...`);

    // Process each conversation completely to maintain foreign key dependencies
    // IMPORTANT: Execute all SQL for each conversation (conversation -> turns -> tool_calls) before moving to next
    // This ensures foreign key constraints are satisfied (tool_calls references conversation_turns which references conversations)
    
    // Calculate total statements for progress tracking
    // Include table creation statements and customer inserts
    let totalSqlStatements = sqlStatements.length + customerInserts.length;
    // Add conversation-specific statements
    for (const conv of allConversations) {
      const { sqlStatements: convSql, parameterizedQueries: convParamQueries } = generateConversationSQL(conv);
      totalSqlStatements += convSql.length + convParamQueries.length + 1; // +1 for sync_status
    }
    
    // Update progress to show SQL execution phase
    if (syncLock.progress) {
      syncLock.progress.sqlStatementsTotal = totalSqlStatements;
      syncLock.progress.sqlStatementsExecuted = 0;
      syncLock.progress.currentPhase = 'sql-execution';
    }
    
    console.log(`[Sync] Starting SQL execution: ${totalSqlStatements} total statements for ${allConversations.length} conversations`);
    
    // Track which files have SQL errors - files with any SQL errors should be marked as failed
    const filesWithSqlErrors = new Set<string>();
    
    // Process each conversation completely before moving to the next
    for (let convIndex = 0; convIndex < allConversations.length; convIndex++) {
      const conv = allConversations[convIndex];
      
      // Check for cancellation periodically
      if (convIndex % 10 === 0 && syncLock.cancelRequested) {
        // Save partial results before cancelling
        await savePartialResults(env, allConversations.slice(0, convIndex), successfulFiles, failedFiles, errors, startTime, executed);
        const preservedErrors = syncLock.finalDetailedErrors;
        syncLock = { isLocked: false, cancelled: true, finalDetailedErrors: preservedErrors };
        return;
      }
      
      // Generate SQL for this conversation
      const { sqlStatements: convSql, parameterizedQueries: convParamQueries } = generateConversationSQL(conv);
      
      // Execute all SQL statements for this conversation in a transaction
      // This ensures atomicity: if any part fails, we rollback and continue with next conversation
      // 1. INSERT conversation
      // 2. DELETE old tool_calls and conversation_turns
      // 3. INSERT conversation_turns (parameterized queries) - MUST happen before tool_calls
      // 4. INSERT tool_calls
      // 5. INSERT sync_status
      
      // The convSql array contains: [0] conversation INSERT, [1] DELETE tool_calls, [2] DELETE conversation_turns, [3+] tool_calls INSERTs
      // We need to execute [0-2] first, then parameterized queries, then [3+]
      
      // Step 1-2: Execute conversation INSERT and DELETEs (first 3 statements)
      const conversationAndDeletes = convSql.slice(0, 3);
      const toolCallsInserts = convSql.slice(3);
      
      // Use D1 batch API for atomicity - if any part fails, entire batch is rolled back
      let transactionSucceeded = false;
      try {
        // Collect all statements for this conversation in a batch
        const batchStatements: D1PreparedStatement[] = [];
        
        // Step 1-2: Prepare conversation INSERT and DELETEs (first 3 statements)
        for (let i = 0; i < conversationAndDeletes.length; i++) {
          const sql = conversationAndDeletes[i];
          try {
        // Each sqlStatements[i] is already a single complete statement ending with ';'
        // So we don't need to split - just execute it directly
        const trimmed = sql.trim();
        if (!trimmed || !trimmed.endsWith(';')) {
          console.warn(`[Sync] Skipping malformed SQL statement (missing semicolon): ${trimmed.substring(0, 100)}`);
          continue;
        }
        
        // Validate SQL statement length (D1 has limits)
        // D1 has a practical limit around 1MB, but very long statements can cause parsing issues
        if (trimmed.length > 1000000) { // 1MB limit
          errors.push(`SQL statement too long (${trimmed.length} chars), skipping`);
          console.error('SQL statement too long, skipping:', trimmed.substring(0, 200));
          continue;
        }
        
        // Additional check: if statement is very long (>500KB), log a warning
        if (trimmed.length > 500000) {
          console.warn(`[Sync] Very long SQL statement (${trimmed.length} chars) - may cause issues`);
        }
        
            // Prepare statement for batch
            batchStatements.push(env.DB.prepare(trimmed));
          } catch (sqlError: any) {
              // Mark the source file as having SQL errors
              if (conv.source_file) {
                filesWithSqlErrors.add(conv.source_file);
              }
              
              // More detailed error logging
              const errorMsg = sqlError.message || 'Unknown SQL error';
              const sqlPreview = trimmed.substring(0, 500).replace(/\n/g, ' ');
              const fileInfo = conv.source_file ? ` (file: ${conv.source_file})` : '';
              const errorMessage = i === 0 
                ? `Conversation INSERT failed for ${conv.conversation_id}${fileInfo}: ${errorMsg}`
                : `SQL execution error at statement ${executed + 1}${fileInfo}: ${errorMsg}`;
              errors.push(errorMessage);
              sqlErrorsCount++; // Increment SQL error counter
              
              // Store detailed error information
              if (!syncLock.finalDetailedErrors) {
                syncLock.finalDetailedErrors = [];
                console.log(`[Sync] Initialized finalDetailedErrors array`);
              }
              syncLock.finalDetailedErrors.push({
                message: errorMessage,
                sqlPreview: sqlPreview,
                sqlLength: trimmed.length,
                reference: sqlError.cause?.message || 'no reference',
                statementNumber: executed + 1
              });
              
              // If this is the conversation INSERT (i === 0), log it prominently
              if (i === 0) {
                console.error(`[Sync] CRITICAL: Conversation INSERT failed for ${conv.conversation_id}: ${errorMsg}`);
                console.error(`[Sync] This conversation will be skipped (turns and tool_calls will not be inserted)`);
              }
              
              // Enhanced logging for debugging SQL syntax errors
              console.error(`[Sync] SQL Error #${syncLock.finalDetailedErrors.length} at statement ${executed + 1}:`);
              console.error(`  Error: ${errorMsg}`);
              console.error(`  SQL Length: ${trimmed.length} chars`);
              console.error(`  SQL Preview (first 200): ${trimmed.substring(0, 200)}`);
              console.error(`  SQL Preview (last 200): ${trimmed.substring(Math.max(0, trimmed.length - 200))}`);
              
              // Check for common SQL syntax issues
              const singleQuoteCount = (trimmed.match(/'/g) || []).length;
              const doubleQuoteCount = (trimmed.match(/''/g) || []).length;
              const unclosedQuotes = singleQuoteCount % 2 !== 0;
              
              if (unclosedQuotes) {
                console.error(`  ⚠️  POTENTIAL ISSUE: Unclosed quotes detected! Single quotes: ${singleQuoteCount}, Double quotes: ${doubleQuoteCount}`);
              }
              
              // Check for problematic patterns
              if (trimmed.includes("'") && !trimmed.includes("''")) {
                console.error(`  ⚠️  POTENTIAL ISSUE: Contains single quotes but no escaped quotes (''). This might indicate an escaping problem.`);
              }
              
              // For HashIndex errors or access violations, these are D1 internal issues
              // Log but don't fail the sync - continue processing
              const isD1InternalError = errorMsg.includes('D1_ERROR') || 
                                       errorMsg.includes('internal error') ||
                                       errorMsg.includes('HashIndex') ||
                                       errorMsg.includes('access violation');
              
              if (isD1InternalError) {
                console.warn(`[Sync] D1 internal error (continuing): ${errorMsg.substring(0, 100)}`);
              } else {
                console.error('SQL error details:', {
                  error: errorMsg,
                  sqlPreview: sqlPreview,
                  sqlLength: trimmed.length,
                  reference: sqlError.cause?.message || 'no reference',
                  singleQuotes: singleQuoteCount,
                  doubleQuotes: doubleQuoteCount,
                  unclosedQuotes: unclosedQuotes
                });
              }
              
              // Continue with next statement even if one fails
              // Don't increment executed counter for failed statements
            }
        }
      
        // Step 3: Add parameterized queries for conversation_turns to batch
        for (let paramIdx = 0; paramIdx < convParamQueries.length; paramIdx++) {
          const query = convParamQueries[paramIdx];
          batchStatements.push(env.DB.prepare(query.sql).bind(...query.params));
        }
        
        // Step 4: Add tool_calls INSERTs to batch
        for (let i = 0; i < toolCallsInserts.length; i++) {
          const sql = toolCallsInserts[i];
          const trimmed = sql.trim();
          if (!trimmed || !trimmed.endsWith(';')) {
            console.warn(`[Sync] Skipping malformed SQL statement (missing semicolon): ${trimmed.substring(0, 100)}`);
            continue;
          }
          
          // Validate SQL statement length
          if (trimmed.length > 1000000) {
            errors.push(`SQL statement too long (${trimmed.length} chars), skipping`);
            console.error('SQL statement too long, skipping:', trimmed.substring(0, 200));
            continue;
          }
          
          batchStatements.push(env.DB.prepare(trimmed));
        }
        
        // Step 5: Add sync_status INSERT to batch
        const fileHash = 'sync-' + Date.now() + '-' + convIndex; // Unique hash per conversation
        const syncStatusSql = `INSERT OR REPLACE INTO sync_status (conversation_id, source_file, file_hash, last_synced) VALUES ('${conv.conversation_id.replace(/'/g, "''")}', '${(conv.source_file || '').replace(/'/g, "''")}', '${fileHash}', '${new Date().toISOString()}');`;
        batchStatements.push(env.DB.prepare(syncStatusSql));
        
        // Execute all statements in a batch (atomic transaction)
        // If any statement fails, the entire batch is rolled back automatically
        await env.DB.batch(batchStatements);
        
        executed += batchStatements.length;
        
        // Update progress
        if (executed % 50 === 0 && syncLock.progress) {
          syncLock.progress.sqlStatementsExecuted = executed;
        }
        
        transactionSucceeded = true;
        console.log(`[Sync] Successfully executed batch for conversation ${conv.conversation_id} (${batchStatements.length} statements)`);
        
      } catch (transactionError: any) {
        // Batch automatically rolls back on error, no need for explicit rollback
        // Mark the source file as having SQL errors
        if (conv.source_file) {
          filesWithSqlErrors.add(conv.source_file);
        }
        
        // Log the error
        const errorMsg = transactionError.message || 'Unknown transaction error';
        const fileInfo = conv.source_file ? ` (file: ${conv.source_file})` : '';
        const errorMessage = `Transaction failed for conversation ${conv.conversation_id}${fileInfo}: ${errorMsg}`;
        errors.push(errorMessage);
        sqlErrorsCount++;
        
        if (!syncLock.finalDetailedErrors) {
          syncLock.finalDetailedErrors = [];
        }
        syncLock.finalDetailedErrors.push({
          message: errorMessage,
          sqlPreview: `Transaction for ${conv.conversation_id}${fileInfo}`,
          sqlLength: 0,
          reference: transactionError.cause?.message || 'no reference',
          statementNumber: executed + 1
        });
        
        console.error(`[Sync] Transaction error for ${conv.conversation_id}${fileInfo}: ${errorMsg.substring(0, 200)}`);
        // Continue with next conversation
      }
      
      // Log progress every 10 conversations
      if ((convIndex + 1) % 10 === 0) {
        console.log(`[Sync SQL Progress] Processed ${convIndex + 1}/${allConversations.length} conversations, ${executed} statements executed`);
      }
    }
    
    // Move files with SQL errors from successfulFiles to failedFiles
    // A file is only truly successful if ALL its conversations were inserted without SQL errors
    const finalSuccessfulFiles: string[] = [];
    const finalFailedFiles = [...failedFiles];
    
    for (const filePath of successfulFiles) {
      if (filesWithSqlErrors.has(filePath)) {
        // File had SQL errors - mark as failed
        finalFailedFiles.push({ 
          path: filePath, 
          reason: `SQL execution errors: ${Array.from(syncLock.finalDetailedErrors || [])
            .filter(err => err.message?.includes(filePath) || err.sqlPreview?.includes(filePath))
            .length} conversation(s) failed to insert` 
        });
        console.log(`[Sync] Marking file as failed due to SQL errors: ${filePath}`);
      } else {
        // File is truly successful - all conversations inserted without errors
        finalSuccessfulFiles.push(filePath);
      }
    }
    
    // Calculate duration
    const duration = Math.floor((Date.now() - new Date(startTime).getTime()) / 1000);
    
    const totalErrors = errors.length + (syncLock.finalDetailedErrors?.length || 0);
    console.log(`[Sync] Completed: ${allConversations.length} conversations, ${finalSuccessfulFiles.length} successful files, ${finalFailedFiles.length} failed files, ${executed} SQL statements executed, ${totalErrors} total errors in ${duration}s`);
    console.log(`[Sync] File status: ${finalSuccessfulFiles.length} fully successful, ${finalFailedFiles.length} failed (${filesWithSqlErrors.size} had SQL errors, ${failedFiles.length} had parsing errors)`);

    // Store final results in syncLock for GET endpoint to retrieve
    syncLock.completed = true;
    syncLock.duration = duration;
    syncLock.finalStats = {
      filesProcessed: manifest.files.length,
      conversationsProcessed: allConversations.length,
      sqlStatementsExecuted: executed,
      errors: totalErrors, // Include both parsing errors and SQL errors
      duration: duration,
      successfulFiles: finalSuccessfulFiles.length,
      failedFiles: finalFailedFiles.length,
      sqlErrors: syncLock.finalDetailedErrors?.length || 0, // Total SQL error count
      filesWithSqlErrors: filesWithSqlErrors.size // Count of unique files that had SQL errors
    };
    syncLock.finalSuccessfulFiles = finalSuccessfulFiles;
    syncLock.finalFailedFiles = finalFailedFiles;
    syncLock.finalErrors = errors.length > 0 ? errors : undefined;
    // Keep detailed errors even if we have them
    // (finalDetailedErrors is already populated during execution)

    // IMPORTANT: Mark as completed even if there are errors
    // The sync should complete successfully even with some SQL errors
    // Don't release the lock immediately - keep it so GET can retrieve results
    // The lock will be released after 10 seconds, but completed flag is set now
    setTimeout(() => {
      // Preserve finalDetailedErrors when releasing lock after completion
      const preservedErrors = syncLock.finalDetailedErrors;
      const preservedStats = syncLock.finalStats;
      const preservedSuccessfulFiles = syncLock.finalSuccessfulFiles;
      const preservedFailedFiles = syncLock.finalFailedFiles;
      const preservedFinalErrors = syncLock.finalErrors;
      syncLock = { 
        isLocked: false, 
        completed: true,
        finalDetailedErrors: preservedErrors,
        finalStats: preservedStats,
        finalSuccessfulFiles: preservedSuccessfulFiles,
        finalFailedFiles: preservedFailedFiles,
        finalErrors: preservedFinalErrors
      };
    }, 10000); // 10 seconds to allow GET to retrieve results

  } catch (error: any) {
    console.error('Sync API error:', error);
    
    // Store error in syncLock
    syncLock.error = error.message || 'Internal server error';
    
    // Release lock on error (preserve finalDetailedErrors)
    setTimeout(() => {
      const preservedErrors = syncLock.finalDetailedErrors;
      syncLock = { isLocked: false, finalDetailedErrors: preservedErrors };
    }, 1000);
  }
}
