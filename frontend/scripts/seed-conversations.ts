/**
 * Initial seed conversations from mock_data into the database
 * 
 * NOTE: For ongoing sync, use sync-conversations.ts instead!
 * 
 * Usage:
 *   npx tsx scripts/seed-conversations.ts
 * 
 * This script reads JSON files from mock_data and imports them into the database.
 * This is a one-time initial load. For keeping the database in sync with file changes,
 * use sync-conversations.ts instead.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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
}

interface DatasetFile {
  conversations?: Array<{
    id: string;
    scenario?: string;
    flags?: string[];
    severity?: string;
    turns: ConversationTurn[];
  }>;
}

/**
 * Find all JSON files in mock_data directory recursively
 */
function findJsonFiles(dir: string): string[] {
  const files: string[] = [];
  
  if (!fs.existsSync(dir)) {
    console.warn(`Directory ${dir} does not exist`);
    return files;
  }
  
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      files.push(...findJsonFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      files.push(fullPath);
    }
  }
  
  return files;
}

/**
 * Parse a conversation file and return conversation data
 */
function parseConversationFile(filePath: string): ConversationData[] {
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
    });
  }
  
  return conversations;
}

/**
 * Generate SQL INSERT statements for conversations
 */
function generateConversationSQL(conversations: ConversationData[]): string[] {
  const statements: string[] = [];
  
  for (const conv of conversations) {
    // Insert conversation
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
        INSERT OR REPLACE INTO conversation_turns (
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
            INSERT OR REPLACE INTO tool_calls (
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
  }
  
  return statements;
}

/**
 * Main execution
 */
function main() {
  console.log('Finding JSON files in mock_data...');
  const jsonFiles = findJsonFiles(MOCK_DATA_DIR);
  console.log(`Found ${jsonFiles.length} JSON files`);
  
  const allConversations: ConversationData[] = [];
  
  // Parse all files
  for (const filePath of jsonFiles) {
    try {
      const conversations = parseConversationFile(filePath);
      allConversations.push(...conversations);
      console.log(`Parsed ${conversations.length} conversation(s) from ${path.relative(MOCK_DATA_DIR, filePath)}`);
    } catch (error: any) {
      console.warn(`Failed to parse ${filePath}:`, error.message);
    }
  }
  
  console.log(`\nTotal conversations: ${allConversations.length}`);
  
  // Generate SQL
  const sqlStatements = generateConversationSQL(allConversations);
  
  // Write to file
  const outputFile = path.join(__dirname, '../db/seed_conversations.sql');
  const sql = sqlStatements.join('\n');
  
  // Ensure db directory exists
  const dbDir = path.dirname(outputFile);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  
  fs.writeFileSync(outputFile, sql);
  console.log(`\nSQL script generated: ${outputFile}`);
  console.log(`Total statements: ${sqlStatements.length}`);
  console.log(`\nTo apply to database, run:`);
  console.log(`  npx wrangler d1 execute DB_NAME --file=./db/seed_conversations.sql`);
  console.log(`\nOr for local development:`);
  console.log(`  npx wrangler d1 execute DB_NAME --local --file=./db/seed_conversations.sql`);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('seed-conversations.ts')) {
  main();
}

export { parseConversationFile, generateConversationSQL, findJsonFiles };

