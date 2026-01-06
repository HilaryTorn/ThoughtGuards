/**
 * Sync conversations from mock_data to the database
 * 
 * This script keeps the database in sync with mock_data files:
 * - Adds new conversations from new files
 * - Updates existing conversations when files change
 * - Optionally removes conversations when files are deleted
 * 
 * Usage:
 *   npx tsx scripts/sync-conversations.ts [--watch] [--delete-missing]
 * 
 * Options:
 *   --watch: Watch for file changes and sync automatically
 *   --delete-missing: Remove conversations from DB if source file is deleted
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to mock_data directory
const MOCK_DATA_DIR = path.join(__dirname, '../../../mock_data');

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
  metadata?: any;
  source_file?: string;
  file_hash?: string;
}

interface FileSyncStatus {
  file_path: string;
  conversation_id: string;
  file_hash: string;
  last_synced: string;
}

/**
 * Calculate file hash for change detection
 */
function calculateFileHash(filePath: string): string {
  const content = fs.readFileSync(filePath, 'utf-8');
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Find all JSON files in mock_data directory recursively
 */
function findJsonFiles(dir: string): Array<{ path: string; relativePath: string }> {
  const files: Array<{ path: string; relativePath: string }> = [];
  
  if (!fs.existsSync(dir)) {
    console.warn(`Directory ${dir} does not exist`);
    return files;
  }
  
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(MOCK_DATA_DIR, fullPath);
    
    if (entry.isDirectory()) {
      files.push(...findJsonFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      files.push({ path: fullPath, relativePath });
    }
  }
  
  return files;
}

/**
 * Parse a conversation file and return conversation data
 */
function parseConversationFile(filePath: string, relativePath: string): ConversationData[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(content);
  
  const conversations: ConversationData[] = [];
  
  // Handle dataset format (ecommerce_cot_dataset.json)
  if (data.conversations && Array.isArray(data.conversations)) {
    for (const conv of data.conversations) {
      conversations.push({
        conversation_id: conv.id || `conv-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        customer_id: 'CUST-5001', // Default customer
        chatbot_mode: 'helpful',
        turns: conv.turns || [],
        label: conv.severity === 'high' || (conv.flags && conv.flags.length > 0) ? 'adversarial' : 'clean',
        expected_manipulation: conv.severity === 'high' || (conv.flags && conv.flags.length > 0) ? 1 : 0,
        metadata: {
          scenario: conv.scenario,
          flags: conv.flags || [],
          severity: conv.severity,
        },
        source_file: relativePath,
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
      metadata: data.metadata,
      source_file: relativePath,
    });
  }
  
  // Calculate hash for each conversation
  const fileHash = calculateFileHash(filePath);
  conversations.forEach(conv => {
    conv.file_hash = fileHash;
  });
  
  return conversations;
}

/**
 * Generate SQL for syncing a conversation (INSERT OR REPLACE)
 */
function generateConversationSyncSQL(conv: ConversationData): string[] {
  const statements: string[] = [];
  
  // Insert or replace conversation
  const startedAt = conv.timestamp || new Date().toISOString();
  const endedAt = conv.turns.length > 0 
    ? (conv.turns[conv.turns.length - 1].timestamp || startedAt)
    : startedAt;
  
  statements.push(`
    INSERT OR REPLACE INTO conversations (
      conversation_id, customer_id, chatbot_mode, chatbot_provider, 
      chatbot_model, started_at, ended_at, label, expected_manipulation
    ) VALUES (
      '${conv.conversation_id.replace(/'/g, "''")}',
      '${(conv.customer_id || 'CUST-5001').replace(/'/g, "''")}',
      '${(conv.chatbot_mode || 'helpful').replace(/'/g, "''")}',
      ${conv.chatbot_provider ? `'${conv.chatbot_provider.replace(/'/g, "''")}'` : 'NULL'},
      ${conv.chatbot_model ? `'${conv.chatbot_model.replace(/'/g, "''")}'` : 'NULL'},
      '${startedAt}',
      '${endedAt}',
      ${conv.label ? `'${conv.label.replace(/'/g, "''")}'` : 'NULL'},
      ${conv.expected_manipulation || 0}
    );
  `);
  
  // Delete existing turns and tool calls for this conversation (clean slate)
  statements.push(`
    DELETE FROM tool_calls 
    WHERE turn_id IN (
      SELECT turn_id FROM conversation_turns WHERE conversation_id = '${conv.conversation_id.replace(/'/g, "''")}'
    );
  `);
  
  statements.push(`
    DELETE FROM conversation_turns 
    WHERE conversation_id = '${conv.conversation_id.replace(/'/g, "''")}';
  `);
  
  // Insert conversation turns
  for (let i = 0; i < conv.turns.length; i++) {
    const turn = conv.turns[i];
    const turnNumber = turn.turn || i + 1;
    const role = turn.role === 'customer' || turn.role === 'user' ? 'customer' : 'assistant';
    const timestamp = turn.timestamp || startedAt;
    
    const turnId = `turn-${conv.conversation_id}-${turnNumber}`;
    const content = (turn.content || '').replace(/'/g, "''");
    const reasoningContent = (turn.reasoning_content || '').replace(/'/g, "''");
    
    statements.push(`
      INSERT INTO conversation_turns (
        turn_id, conversation_id, turn_number, role, content, reasoning_content, timestamp
      ) VALUES (
        '${turnId.replace(/'/g, "''")}',
        '${conv.conversation_id.replace(/'/g, "''")}',
        ${turnNumber},
        '${role}',
        '${content}',
        ${reasoningContent ? `'${reasoningContent}'` : 'NULL'},
        '${timestamp}'
      );
    `);
    
    // Insert tool calls if present
    if (turn.tool_calls && Array.isArray(turn.tool_calls)) {
      for (const toolCall of turn.tool_calls) {
        const callId = `call-${turnId}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        const argumentsJson = JSON.stringify(toolCall.arguments || {}).replace(/'/g, "''");
        const resultJson = JSON.stringify(toolCall.result || {}).replace(/'/g, "''");
        
        statements.push(`
          INSERT INTO tool_calls (
            call_id, conversation_id, turn_id, tool_name, arguments, result, timestamp
          ) VALUES (
            '${callId.replace(/'/g, "''")}',
            '${conv.conversation_id.replace(/'/g, "''")}',
            '${turnId.replace(/'/g, "''")}',
            '${(toolCall.tool || '').replace(/'/g, "''")}',
            '${argumentsJson}',
            '${resultJson}',
            '${timestamp}'
          );
        `);
      }
    }
  }
  
  return statements;
}

/**
 * Generate SQL to track sync status (optional - requires sync_status table)
 */
function generateSyncStatusSQL(conv: ConversationData, filePath: string): string {
  const fileHash = calculateFileHash(filePath);
  return `
    INSERT OR REPLACE INTO sync_status (
      conversation_id, source_file, file_hash, last_synced
    ) VALUES (
      '${conv.conversation_id.replace(/'/g, "''")}',
      '${conv.source_file?.replace(/'/g, "''") || ''}',
      '${fileHash}',
      '${new Date().toISOString()}'
    );
  `;
}

/**
 * Main sync function
 */
async function syncConversations(options: { deleteMissing?: boolean } = {}) {
  console.log('🔍 Scanning mock_data directory...');
  const jsonFiles = findJsonFiles(MOCK_DATA_DIR);
  console.log(`📁 Found ${jsonFiles.length} JSON files`);
  
  const allConversations: ConversationData[] = [];
  const fileConversationMap = new Map<string, ConversationData[]>();
  
  // Parse all files
  for (const { path: filePath, relativePath } of jsonFiles) {
    try {
      const conversations = parseConversationFile(filePath, relativePath);
      allConversations.push(...conversations);
      fileConversationMap.set(relativePath, conversations);
      console.log(`✅ Parsed ${conversations.length} conversation(s) from ${relativePath}`);
    } catch (error: any) {
      console.warn(`⚠️  Failed to parse ${relativePath}:`, error.message);
    }
  }
  
  console.log(`\n📊 Total conversations: ${allConversations.length}`);
  
  // Generate SQL for all conversations
  const sqlStatements: string[] = [];
  
  // Add sync status table creation if it doesn't exist (optional tracking)
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
  
  // Generate sync SQL for each conversation
  for (const { path: filePath, relativePath } of jsonFiles) {
    const conversations = fileConversationMap.get(relativePath) || [];
    for (const conv of conversations) {
      sqlStatements.push(...generateConversationSyncSQL(conv));
      // Track sync status
      sqlStatements.push(generateSyncStatusSQL(conv, filePath));
    }
  }
  
  // Optionally delete conversations from deleted files
  if (options.deleteMissing) {
    console.log('\n🗑️  Checking for deleted files...');
    // This would require querying the database to find conversations
    // that don't have corresponding files - we'll add a comment for manual cleanup
    sqlStatements.push(`
      -- To remove conversations from deleted files, run:
      -- DELETE FROM conversations WHERE conversation_id NOT IN (
      --   SELECT conversation_id FROM sync_status
      -- );
    `);
  }
  
  // Write to file
  const outputFile = path.join(__dirname, '../db/sync_conversations.sql');
  const sql = sqlStatements.join('\n');
  
  // Ensure db directory exists
  const dbDir = path.dirname(outputFile);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  
  fs.writeFileSync(outputFile, sql);
  console.log(`\n💾 SQL script generated: ${outputFile}`);
  console.log(`📝 Total statements: ${sqlStatements.length}`);
  console.log(`\n🚀 To apply to database, run:`);
  console.log(`   npx wrangler d1 execute DB_NAME --local --file=./db/sync_conversations.sql`);
  console.log(`\n   Or for production:`);
  console.log(`   npx wrangler d1 execute DB_NAME --file=./db/sync_conversations.sql`);
  
  return {
    filesProcessed: jsonFiles.length,
    conversationsProcessed: allConversations.length,
    sqlFile: outputFile,
  };
}

/**
 * Watch mode - monitor files for changes
 */
async function watchMode() {
  console.log('👀 Watching for file changes in mock_data...');
  console.log('   Press Ctrl+C to stop\n');
  
  let lastSync = Date.now();
  const DEBOUNCE_MS = 1000; // Wait 1 second after last change before syncing
  
  const syncTimeout = { current: null as NodeJS.Timeout | null };
  
  const scheduleSync = () => {
    if (syncTimeout.current) {
      clearTimeout(syncTimeout.current);
    }
    
    syncTimeout.current = setTimeout(async () => {
      console.log('\n🔄 Changes detected, syncing...');
      try {
        await syncConversations();
        console.log('✅ Sync complete!\n');
      } catch (error) {
        console.error('❌ Sync failed:', error);
      }
      lastSync = Date.now();
    }, DEBOUNCE_MS);
  };
  
  // Watch the mock_data directory recursively
  const watchDir = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    
    fs.watch(dir, { recursive: true }, (eventType, filename) => {
      if (filename && filename.endsWith('.json')) {
        console.log(`📝 ${eventType}: ${filename}`);
        scheduleSync();
      }
    });
    
    // Watch subdirectories
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        watchDir(path.join(dir, entry.name));
      }
    }
  };
  
  watchDir(MOCK_DATA_DIR);
  
  // Initial sync
  await syncConversations();
  console.log('✅ Initial sync complete!\n');
}

// Main execution
const args = process.argv.slice(2);
const watchModeEnabled = args.includes('--watch');
const deleteMissing = args.includes('--delete-missing');

if (watchModeEnabled) {
  watchMode().catch(console.error);
} else {
  syncConversations({ deleteMissing }).catch(console.error);
}

export { syncConversations, parseConversationFile, calculateFileHash, findJsonFiles };

