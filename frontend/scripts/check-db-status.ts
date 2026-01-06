/**
 * Check database status and tables
 * Tests if database is initialized
 */

const BASE_URL = process.env.TEST_URL || 'http://localhost:8788';

async function checkDatabaseStatus() {
  console.log('🔍 Checking database status...\n');
  console.log(`Server URL: ${BASE_URL}\n`);

  try {
    // Test the chat API endpoint (which uses the database)
    const response = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'test',
        customer_id: 'CUST-5001',
        chatbot_mode: 'helpful',
        model: 'gemini-3-flash-preview'
      })
    });

    const text = await response.text();
    
    // Parse response
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      console.log(`❌ Server returned non-JSON response (status ${response.status})`);
      console.log(`   Response: ${text.substring(0, 200)}`);
      return false;
    }
    
    // Check for API key error (this means server and DB are working!)
    if (data.error?.includes('API key')) {
      console.log('✅ Server is running and database is accessible!');
      console.log('⚠️  API key needed to test full functionality');
      console.log(`   Error: ${data.error}`);
      console.log('\n   To test fully:');
      console.log('   1. Set GEMINI_API_KEY in .dev.vars file');
      console.log('   2. Or set it in the Settings UI');
      console.log('   3. Then run: npm run test:tools');
      return true; // Server and DB are working
    }
    
    if (!response.ok && !data.error?.includes('API key')) {
      console.log(`❌ Server returned status ${response.status}`);
      console.log(`   Error: ${data.error || text.substring(0, 200)}`);
      
      // Check for database errors
      if (data.error?.includes('table') || data.error?.includes('no such table') || data.error?.includes('SQLITE_ERROR')) {
        console.log('\n   Database tables may not be initialized');
        console.log('   Run migrations when server is stopped');
      }
      return false;
    }

    
    if (data.response || data.conversation_id) {
      console.log('✅ Server is responding!');
      if (data.error) {
        if (data.error.includes('table') || data.error.includes('no such table') || data.error.includes('SQLITE_ERROR')) {
          console.log('❌ Database tables not found or not initialized');
          console.log('   Error:', data.error);
          console.log('\n   Solution: Apply migrations when server is stopped');
          console.log('   Or let the system initialize automatically');
          return false;
        } else if (data.error.includes('API key')) {
          console.log('⚠️  Server working, but API key needed');
          console.log('   Error:', data.error);
          console.log('   Set GEMINI_API_KEY in .dev.vars or Settings');
          return true; // Server is working, just needs API key
        } else {
          console.log('⚠️  Server responded with error:', data.error);
          return false;
        }
      } else {
        console.log('✅ Database appears to be working!');
        console.log(`   Conversation ID: ${data.conversation_id || 'N/A'}`);
        return true;
      }
    } else if (data.error?.includes('table') || data.error?.includes('no such table') || data.error?.includes('SQLITE_ERROR')) {
      console.log('❌ Database tables not found');
      console.log('   Error:', data.error);
      console.log('\n   Run migrations: .\\scripts\\apply-migrations-sqlite.ps1');
      return false;
    } else {
      console.log('⚠️  Unexpected response format');
      console.log('   Data:', JSON.stringify(data, null, 2).substring(0, 300));
      return false;
    }
  } catch (error: any) {
    if (error.message.includes('ECONNREFUSED') || error.message.includes('fetch failed')) {
      console.log('❌ Cannot connect to dev server');
      console.log('   Make sure dev server is running: npm run dev:local');
    } else {
      console.log('❌ Error:', error.message);
    }
    return false;
  }
}

checkDatabaseStatus().then(success => {
  process.exit(success ? 0 : 1);
});

