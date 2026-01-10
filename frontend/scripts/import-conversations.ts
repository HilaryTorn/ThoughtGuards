/**
 * Import conversations from JSON files into the database via API
 *
 * Usage:
 *   npm run import -- ./mock_data/conversation.json
 *   npm run import -- ./mock_data/
 *   npm run import -- ./mock_data/ --api https://your-app.pages.dev
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default API endpoint (local dev)
const DEFAULT_API = 'http://localhost:8787';

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
}

/**
 * Find all JSON files in a directory recursively
 */
function findJsonFiles(dir: string): string[] {
  const files: string[] = [];

  if (!fs.existsSync(dir)) {
    console.error(`Directory ${dir} does not exist`);
    return files;
  }

  const stat = fs.statSync(dir);
  if (stat.isFile() && dir.endsWith('.json')) {
    return [dir];
  }

  if (!stat.isDirectory()) {
    return files;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    // Skip subdirectories (comment out to enable recursive scanning)
    // if (entry.isDirectory()) {
    //   files.push(...findJsonFiles(fullPath));
    // } else
    if (entry.isFile() && entry.name.endsWith('.json')) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Parse a JSON file and extract conversations
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
        customer_id: 'CUST-5001',
        chatbot_mode: 'helpful',
        turns: conv.turns || [],
        label: conv.severity === 'high' || (conv.flags && conv.flags.length > 0) ? 'adversarial' : 'clean',
        expected_manipulation: conv.severity === 'high' || (conv.flags && conv.flags.length > 0) ? 1 : 0,
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
    });
  }

  return conversations;
}

/**
 * Import a conversation via API
 */
async function importConversation(apiBase: string, conv: ConversationData): Promise<boolean> {
  try {
    // Create conversation
    const createResponse = await fetch(`${apiBase}/api/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation_id: conv.conversation_id,
        customer_id: conv.customer_id,
        chatbot_mode: conv.chatbot_mode,
        chatbot_provider: conv.chatbot_provider,
        chatbot_model: conv.chatbot_model,
        label: conv.label,
        expected_manipulation: conv.expected_manipulation,
      }),
    });

    if (!createResponse.ok) {
      const error = await createResponse.text();
      console.error(`  Failed to create conversation ${conv.conversation_id}: ${error}`);
      return false;
    }

    // Add turns
    for (let i = 0; i < conv.turns.length; i++) {
      const turn = conv.turns[i];
      const turnResponse = await fetch(`${apiBase}/api/conversations/${conv.conversation_id}/turns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: turn.role === 'customer' || turn.role === 'user' ? 'customer' : 'assistant',
          content: turn.content,
          reasoning_content: turn.reasoning_content,
          tool_calls: turn.tool_calls,
        }),
      });

      if (!turnResponse.ok) {
        console.error(`  Failed to add turn ${i + 1} to ${conv.conversation_id}`);
        return false;
      }
    }

    return true;
  } catch (error: any) {
    console.error(`  Error importing ${conv.conversation_id}: ${error.message}`);
    return false;
  }
}

/**
 * Main import function
 */
async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  let inputPath = args[0];
  let apiBase = DEFAULT_API;

  const apiIndex = args.indexOf('--api');
  if (apiIndex !== -1 && args[apiIndex + 1]) {
    apiBase = args[apiIndex + 1];
  }

  if (!inputPath || inputPath.startsWith('--')) {
    console.log(`
Usage: npm run import -- <path> [--api <url>]

Arguments:
  <path>       Path to a JSON file or directory containing JSON files
  --api <url>  API endpoint (default: ${DEFAULT_API})

Examples:
  npm run import -- ./mock_data/conversation.json
  npm run import -- ./mock_data/
  npm run import -- ./mock_data/ --api https://your-app.pages.dev
`);
    process.exit(1);
  }

  // Resolve path
  inputPath = path.resolve(inputPath);

  console.log(`📁 Scanning: ${inputPath}`);
  console.log(`🌐 API: ${apiBase}`);
  console.log('');

  // Find JSON files
  const jsonFiles = findJsonFiles(inputPath);
  console.log(`Found ${jsonFiles.length} JSON file(s)`);

  if (jsonFiles.length === 0) {
    console.log('No JSON files found.');
    process.exit(0);
  }

  // Parse and import
  let totalConversations = 0;
  let successCount = 0;
  let errorCount = 0;

  for (const filePath of jsonFiles) {
    const relativePath = path.relative(process.cwd(), filePath);
    console.log(`\n📄 Processing: ${relativePath}`);

    try {
      const conversations = parseConversationFile(filePath);
      console.log(`   Found ${conversations.length} conversation(s)`);

      for (const conv of conversations) {
        totalConversations++;
        const success = await importConversation(apiBase, conv);

        if (success) {
          successCount++;
          console.log(`   ✅ ${conv.conversation_id}`);
        } else {
          errorCount++;
          console.log(`   ❌ ${conv.conversation_id}`);
        }
      }
    } catch (error: any) {
      console.error(`   ❌ Failed to parse: ${error.message}`);
      errorCount++;
    }
  }

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Import Complete
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Files processed: ${jsonFiles.length}
   Conversations:   ${totalConversations}
   ✅ Success:      ${successCount}
   ❌ Errors:       ${errorCount}
`);

  process.exit(errorCount > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
