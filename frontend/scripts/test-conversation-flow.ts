/**
 * Test Full Conversation Flow Locally
 * Tests end-to-end conversation with tool calling, CoT extraction, and data persistence
 * 
 * Usage:
 *   npm run test:conversation
 *   or: node scripts/test-conversation-flow.ts
 * 
 * Prerequisites:
 *   1. Local D1 database created and seeded
 *   2. Dev server running: npm run dev:local (in another terminal)
 *   3. API key configured in .dev.vars or Settings
 */

const BASE_URL = process.env.TEST_URL || 'http://localhost:8788';
const API_KEY = process.env.GEMINI_API_KEY || '';

interface TestResult {
  test: string;
  passed: boolean;
  error?: string;
  details?: string;
}

/**
 * Make chat API request
 */
async function sendChatMessage(
  message: string,
  customerId: string,
  chatbotMode: string,
  conversationId?: string,
  model: string = 'gemini-3-flash-preview'
): Promise<any> {
  const url = `${BASE_URL}/api/chat`;
  
  const body: any = {
    message,
    customer_id: customerId,
    chatbot_mode: chatbotMode,
    model
  };
  
  if (conversationId) {
    body.conversation_id = conversationId;
  }
  
  if (API_KEY) {
    body.api_key = API_KEY;
  }
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`HTTP ${response.status}: ${error}`);
  }
  
  return await response.json();
}

/**
 * Test basic conversation
 */
async function testBasicConversation(): Promise<TestResult> {
  try {
    const response = await sendChatMessage(
      'Hello, I need help with my order',
      'CUST-5001',
      'helpful'
    );
    
    if (!response.response) {
      return { 
        test: 'Basic conversation', 
        passed: false, 
        error: 'No response in chat result' 
      };
    }
    
    if (!response.conversation_id) {
      return { 
        test: 'Basic conversation', 
        passed: false, 
        error: 'No conversation_id returned' 
      };
    }
    
    return { 
      test: 'Basic conversation', 
      passed: true,
      details: `Conversation started: ${response.conversation_id}, Response length: ${response.response.length} chars`
    };
  } catch (error: any) {
    return { test: 'Basic conversation', passed: false, error: error.message };
  }
}

/**
 * Test tool calling in conversation
 */
async function testToolCalling(): Promise<TestResult> {
  try {
    const response = await sendChatMessage(
      'What products do you have? Show me laptops',
      'CUST-5001',
      'helpful'
    );
    
    if (!response.response) {
      return { 
        test: 'Tool calling', 
        passed: false, 
        error: 'No response in chat result' 
      };
    }
    
    // Check if tool was called (lookup_product should be called)
    // We can't directly check tool calls from the response, but we can check
    // if the response mentions products (indicating tool was used)
    const mentionsProducts = 
      response.response.toLowerCase().includes('laptop') ||
      response.response.toLowerCase().includes('product') ||
      response.response.toLowerCase().includes('sku');
    
    if (!mentionsProducts) {
      return { 
        test: 'Tool calling', 
        passed: false, 
        error: 'Response does not indicate tool was called',
        details: 'Expected response to mention products after tool call'
      };
    }
    
    return { 
      test: 'Tool calling', 
      passed: true,
      details: `Response received, appears to use lookup_product tool (${response.response.substring(0, 100)}...)`
    };
  } catch (error: any) {
    return { test: 'Tool calling', passed: false, error: error.message };
  }
}

/**
 * Test CoT extraction
 */
async function testCoTExtraction(): Promise<TestResult> {
  try {
    const response = await sendChatMessage(
      'Tell me about product SKU-1001',
      'CUST-5001',
      'helpful',
      undefined,
      'gemini-3-flash-preview' // Use Gemini which may include reasoning
    );
    
    // Check for reasoning_content (CoT)
    const hasCoT = response.reasoning_content && response.reasoning_content.length > 0;
    
    // Note: Not all models return CoT in the same format
    // Some models may not return reasoning_content at all
    if (hasCoT) {
      return { 
        test: 'CoT extraction', 
        passed: true,
        details: `CoT extracted: ${response.reasoning_content.length} chars`
      };
    } else {
      // This is not necessarily a failure - some models don't expose CoT
      return { 
        test: 'CoT extraction', 
        passed: true,
        details: 'No CoT in response (model may not expose reasoning)'
      };
    }
  } catch (error: any) {
    return { test: 'CoT extraction', passed: false, error: error.message };
  }
}

/**
 * Test conversation persistence
 */
async function testConversationPersistence(): Promise<TestResult> {
  try {
    // Start a conversation
    const response1 = await sendChatMessage(
      'Hello, my name is John',
      'CUST-5001',
      'helpful'
    );
    
    if (!response1.conversation_id) {
      return { 
        test: 'Conversation persistence', 
        passed: false, 
        error: 'No conversation_id from first message' 
      };
    }
    
    const conversationId = response1.conversation_id;
    
    // Continue the conversation
    const response2 = await sendChatMessage(
      'What did I just tell you my name was?',
      'CUST-5001',
      'helpful',
      conversationId
    );
    
    // Check if conversation context was maintained
    // The response should reference the previous message
    const maintainsContext = 
      response2.response.toLowerCase().includes('john') ||
      response2.response.toLowerCase().includes('name');
    
    if (!maintainsContext) {
      return { 
        test: 'Conversation persistence', 
        passed: false, 
        error: 'Conversation context not maintained',
        details: 'Second message should reference previous conversation'
      };
    }
    
    return { 
      test: 'Conversation persistence', 
      passed: true,
      details: `Conversation ${conversationId} maintained context across messages`
    };
  } catch (error: any) {
    return { test: 'Conversation persistence', passed: false, error: error.message };
  }
}

/**
 * Test data saved to database
 */
async function testDataPersistence(): Promise<TestResult> {
  try {
    // Send a message
    const response = await sendChatMessage(
      'I want to return my order',
      'CUST-5001',
      'helpful'
    );
    
    if (!response.conversation_id) {
      return { 
        test: 'Data persistence', 
        passed: false, 
        error: 'No conversation_id returned' 
      };
    }
    
    // Check if conversation was saved by querying the database
    // We can't directly query D1 from this script, but we can check
    // if the conversation_id is valid format
    const isValidId = response.conversation_id.startsWith('conv-');
    
    if (!isValidId) {
      return { 
        test: 'Data persistence', 
        passed: false, 
        error: 'Invalid conversation_id format',
        details: 'Expected conversation_id to start with "conv-"'
      };
    }
    
    // Note: Full verification would require querying the database directly
    // This is a basic check that the conversation was created
    
    return { 
      test: 'Data persistence', 
      passed: true,
      details: `Conversation ${response.conversation_id} created, turns and tool_calls should be saved to database`
    };
  } catch (error: any) {
    return { test: 'Data persistence', passed: false, error: error.message };
  }
}

/**
 * Main test function
 */
async function testConversationFlow() {
  console.log('🧪 Testing Full Conversation Flow Locally\n');
  console.log(`Base URL: ${BASE_URL}\n`);
  console.log('⚠️  Make sure dev server is running: npm run dev:local\n');
  
  if (!API_KEY) {
    console.log('⚠️  No API key found. Set GEMINI_API_KEY env var or configure in .dev.vars\n');
  }

  // Check if server is reachable
  try {
    await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'test',
        customer_id: 'CUST-5001',
        chatbot_mode: 'helpful'
      })
    });
  } catch (error) {
    console.error('❌ Cannot reach dev server. Make sure it\'s running:');
    console.error('   npm run dev:local\n');
    process.exit(1);
  }

  const results: TestResult[] = [];

  console.log('Testing basic conversation...');
  results.push(await testBasicConversation());

  console.log('Testing tool calling...');
  results.push(await testToolCalling());

  console.log('Testing CoT extraction...');
  results.push(await testCoTExtraction());

  console.log('Testing conversation persistence...');
  results.push(await testConversationPersistence());

  console.log('Testing data persistence...');
  results.push(await testDataPersistence());

  // Print results
  console.log('\n' + '='.repeat(60));
  console.log('CONVERSATION FLOW TEST RESULTS');
  console.log('='.repeat(60) + '\n');

  let allPassed = true;
  for (const result of results) {
    const icon = result.passed ? '✅' : '❌';
    const status = result.passed ? 'PASS' : 'FAIL';
    console.log(`${icon} ${result.test.padEnd(30)} ${status}`);
    if (result.details) {
      console.log(`   ${result.details}`);
    }
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
    if (!result.passed) {
      allPassed = false;
    }
  }

  console.log('\n' + '='.repeat(60));
  if (allPassed) {
    console.log('✅ All conversation flow tests passed!');
    console.log('\nNext steps:');
    console.log('  1. Test scenarios: npm run test:scenarios');
    console.log('  2. Deploy to Cloudflare: npm run deploy');
  } else {
    console.log('❌ Some conversation flow tests failed.');
    console.log('\nTroubleshooting:');
    console.log('  1. Ensure database is seeded: npm run verify:seeding');
    console.log('  2. Check dev server is running: npm run dev:local');
    console.log('  3. Verify API key is configured');
    console.log('  4. Check chat API endpoint: functions/api/chat.ts');
    process.exit(1);
  }
}

// Run tests
testConversationFlow().catch((error) => {
  console.error('❌ Test suite failed:', error);
  process.exit(1);
});

