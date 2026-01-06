/**
 * Check conversation count in database
 * Compares database count with mock_data files
 */

const BASE_URL = process.env.TEST_URL || 'http://localhost:8788';

async function checkConversationCount() {
  console.log('🔍 Checking conversation counts...\n');
  console.log(`Server URL: ${BASE_URL}\n`);

  try {
    // Get count from database via API
    const response = await fetch(`${BASE_URL}/api/conversations?limit=10000`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const dbCount = data.conversations?.length || 0;
    const total = data.total || dbCount;

    console.log(`📊 Database conversations: ${dbCount}`);
    console.log(`   (API returned ${total} total)\n`);

    // Count mock_data files
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const mockDataDir = path.join(__dirname, '../../../mock_data');

    if (!fs.existsSync(mockDataDir)) {
      console.log('⚠️  mock_data directory not found');
      return;
    }

    function findJsonFiles(dir: string): string[] {
      const files: string[] = [];
      if (!fs.existsSync(dir)) return files;
      
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

    const jsonFiles = findJsonFiles(mockDataDir);
    const individualFiles = jsonFiles.filter(f => !f.includes('dataset'));
    const datasetFiles = jsonFiles.filter(f => f.includes('dataset'));

    console.log(`📁 mock_data files:`);
    console.log(`   Total JSON files: ${jsonFiles.length}`);
    console.log(`   Individual files: ${individualFiles.length}`);
    console.log(`   Dataset files: ${datasetFiles.length}\n`);

    // Try to count conversations in dataset files
    let datasetConversations = 0;
    for (const file of datasetFiles) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        const data = JSON.parse(content);
        if (data.conversations && Array.isArray(data.conversations)) {
          datasetConversations += data.conversations.length;
        }
      } catch (e) {
        // Skip if can't parse
      }
    }

    const estimatedTotal = individualFiles.length + datasetConversations;
    console.log(`📈 Estimated conversations in mock_data:`);
    console.log(`   Individual files: ${individualFiles.length}`);
    console.log(`   Dataset conversations: ${datasetConversations}`);
    console.log(`   Estimated total: ${estimatedTotal}\n`);

    console.log('='.repeat(60));
    if (dbCount === estimatedTotal) {
      console.log('✅ Counts match! All data appears to be migrated.');
    } else if (dbCount < estimatedTotal) {
      console.log(`⚠️  Database has fewer conversations (${dbCount} vs ${estimatedTotal})`);
      console.log(`   Missing: ${estimatedTotal - dbCount} conversations`);
      console.log(`\n   To sync all data, run:`);
      console.log(`   npx tsx scripts/sync-conversations.ts`);
      console.log(`   npx wrangler d1 execute thoughtguards-db --local --file=./db/sync_conversations.sql`);
    } else {
      console.log(`ℹ️  Database has more conversations (${dbCount} vs ${estimatedTotal})`);
      console.log(`   This could be from previous migrations or manual additions.`);
    }
    console.log('='.repeat(60));

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.message.includes('ECONNREFUSED') || error.message.includes('fetch failed')) {
      console.log('\n   Make sure dev server is running: npm run dev:local');
    }
  }
}

checkConversationCount().catch(console.error);

