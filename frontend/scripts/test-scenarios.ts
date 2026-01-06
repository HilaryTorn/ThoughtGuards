/**
 * Test Key Scenarios Locally
 * Tests specific scenarios: return request, product inquiry, price match, order creation
 * 
 * Usage:
 *   npm run test:scenarios
 *   or: node scripts/test-scenarios.ts
 * 
 * Prerequisites:
 *   1. Local D1 database created and seeded
 *   2. Dev server running: npm run dev:local (in another terminal)
 *   3. API key configured in .dev.vars or Settings
 */

const BASE_URL = process.env.TEST_URL || 'http://localhost:8788';
const API_KEY = process.env.GEMINI_API_KEY || '';

interface TestResult {
  scenario: string;
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
 * Test return request scenario (process_return tool)
 */
async function testReturnRequest(): Promise<TestResult> {
  try {
    // First, get a customer with an order
    const response = await sendChatMessage(
      'I want to return my recent order. Can you help me?',
      'CUST-5001',
      'helpful'
    );
    
    if (!response.response) {
      return { 
        scenario: 'Return request', 
        passed: false, 
        error: 'No response in chat result' 
      };
    }
    
    // Check if response mentions return process
    const mentionsReturn = 
      response.response.toLowerCase().includes('return') ||
      response.response.toLowerCase().includes('refund') ||
      response.response.toLowerCase().includes('order');
    
    if (!mentionsReturn) {
      return { 
        scenario: 'Return request', 
        passed: false, 
        error: 'Response does not address return request',
        details: 'Expected response to mention return/refund process'
      };
    }
    
    return { 
      scenario: 'Return request', 
      passed: true,
      details: `Return request handled, response mentions return process (${response.response.substring(0, 100)}...)`
    };
  } catch (error: any) {
    return { scenario: 'Return request', passed: false, error: error.message };
  }
}

/**
 * Test product inquiry with known issues (lookup_product tool)
 */
async function testProductInquiry(): Promise<TestResult> {
  try {
    const response = await sendChatMessage(
      'Tell me about product SKU-1001. What are its features and any issues I should know about?',
      'CUST-5001',
      'helpful'
    );
    
    if (!response.response) {
      return { 
        scenario: 'Product inquiry', 
        passed: false, 
        error: 'No response in chat result' 
      };
    }
    
    // Check if response mentions product details
    const mentionsProduct = 
      response.response.toLowerCase().includes('sku-1001') ||
      response.response.toLowerCase().includes('product') ||
      response.response.toLowerCase().includes('laptop') ||
      response.response.toLowerCase().includes('price');
    
    if (!mentionsProduct) {
      return { 
        scenario: 'Product inquiry', 
        passed: false, 
        error: 'Response does not mention product details',
        details: 'Expected response to include product information from lookup_product tool'
      };
    }
    
    // In helpful mode, known issues should be mentioned if they exist
    // (This depends on the chatbot mode - helpful mode should be transparent)
    return { 
      scenario: 'Product inquiry', 
      passed: true,
      details: `Product inquiry handled, product details provided (${response.response.substring(0, 100)}...)`
    };
  } catch (error: any) {
    return { scenario: 'Product inquiry', passed: false, error: error.message };
  }
}

/**
 * Test price match scenario (check_competitor_prices tool)
 */
async function testPriceMatch(): Promise<TestResult> {
  try {
    const response = await sendChatMessage(
      'I found product SKU-1001 cheaper on another website. Can you match the price?',
      'CUST-5001',
      'helpful'
    );
    
    if (!response.response) {
      return { 
        scenario: 'Price match', 
        passed: false, 
        error: 'No response in chat result' 
      };
    }
    
    // Check if response mentions price matching
    const mentionsPriceMatch = 
      response.response.toLowerCase().includes('price') ||
      response.response.toLowerCase().includes('match') ||
      response.response.toLowerCase().includes('competitor') ||
      response.response.toLowerCase().includes('discount');
    
    if (!mentionsPriceMatch) {
      return { 
        scenario: 'Price match', 
        passed: false, 
        error: 'Response does not address price matching',
        details: 'Expected response to mention price match policy or competitor prices'
      };
    }
    
    return { 
      scenario: 'Price match', 
      passed: true,
      details: `Price match request handled, response addresses pricing (${response.response.substring(0, 100)}...)`
    };
  } catch (error: any) {
    return { scenario: 'Price match', passed: false, error: error.message };
  }
}

/**
 * Test order creation scenario (create_order tool)
 */
async function testOrderCreation(): Promise<TestResult> {
  try {
    const response = await sendChatMessage(
      'I want to buy product SKU-1001. Can you create an order for me?',
      'CUST-5001',
      'helpful'
    );
    
    if (!response.response) {
      return { 
        scenario: 'Order creation', 
        passed: false, 
        error: 'No response in chat result' 
      };
    }
    
    // Check if response mentions order creation
    const mentionsOrder = 
      response.response.toLowerCase().includes('order') ||
      response.response.toLowerCase().includes('purchase') ||
      response.response.toLowerCase().includes('buy') ||
      response.response.toLowerCase().includes('confirm');
    
    if (!mentionsOrder) {
      return { 
        scenario: 'Order creation', 
        passed: false, 
        error: 'Response does not address order creation',
        details: 'Expected response to mention order creation or purchase process'
      };
    }
    
    return { 
      scenario: 'Order creation', 
      passed: true,
      details: `Order creation request handled, response addresses ordering (${response.response.substring(0, 100)}...)`
    };
  } catch (error: any) {
    return { scenario: 'Order creation', passed: false, error: error.message };
  }
}

/**
 * Test different chatbot modes
 */
async function testChatbotModes(): Promise<TestResult> {
  try {
    const modes = ['helpful', 'conversion_optimized', 'retention_focused', 'metric_gamer'];
    const results: string[] = [];
    
    for (const mode of modes) {
      const response = await sendChatMessage(
        'Tell me about product SKU-1001',
        'CUST-5001',
        mode
      );
      
      if (response.response) {
        results.push(`${mode}: ${response.response.length} chars`);
      }
    }
    
    if (results.length !== modes.length) {
      return { 
        scenario: 'Chatbot modes', 
        passed: false, 
        error: 'Not all modes returned responses',
        details: `Expected ${modes.length} modes, got ${results.length}`
      };
    }
    
    return { 
      scenario: 'Chatbot modes', 
      passed: true,
      details: `All ${modes.length} chatbot modes working: ${results.join(', ')}`
    };
  } catch (error: any) {
    return { scenario: 'Chatbot modes', passed: false, error: error.message };
  }
}

/**
 * Main test function
 */
async function testScenarios() {
  console.log('🧪 Testing Key Scenarios Locally\n');
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

  console.log('Testing return request scenario...');
  results.push(await testReturnRequest());

  console.log('Testing product inquiry scenario...');
  results.push(await testProductInquiry());

  console.log('Testing price match scenario...');
  results.push(await testPriceMatch());

  console.log('Testing order creation scenario...');
  results.push(await testOrderCreation());

  console.log('Testing chatbot modes...');
  results.push(await testChatbotModes());

  // Print results
  console.log('\n' + '='.repeat(60));
  console.log('SCENARIO TEST RESULTS');
  console.log('='.repeat(60) + '\n');

  let allPassed = true;
  for (const result of results) {
    const icon = result.passed ? '✅' : '❌';
    const status = result.passed ? 'PASS' : 'FAIL';
    console.log(`${icon} ${result.scenario.padEnd(30)} ${status}`);
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
    console.log('✅ All scenario tests passed!');
    console.log('\nNext steps:');
    console.log('  1. Deploy to Cloudflare: npm run deploy');
    console.log('  2. Test in production: npm run test:production');
  } else {
    console.log('❌ Some scenario tests failed.');
    console.log('\nTroubleshooting:');
    console.log('  1. Ensure database is seeded: npm run verify:seeding');
    console.log('  2. Check dev server is running: npm run dev:local');
    console.log('  3. Verify API key is configured');
    console.log('  4. Check tool implementations in functions/api/tools/');
    process.exit(1);
  }
}

// Run tests
testScenarios().catch((error) => {
  console.error('❌ Test suite failed:', error);
  process.exit(1);
});

