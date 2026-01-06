/**
 * Test Sync Functionality
 * 
 * This script tests the sync API endpoint to ensure it works correctly.
 * 
 * By default, runs in TEST_MODE (first 10 files only, 12 second timeout).
 * For full sync, set TEST_MODE=false (all files, 60 second timeout).
 * 
 * Usage:
 *   npm run test:sync                    # Test mode (10 files, 12s timeout)
 *   TEST_MODE=false npm run test:sync    # Full sync (all files, 60s timeout)
 * 
 * Or with custom base URL:
 *   BASE_URL=http://localhost:3014 npm run test:sync
 */

// Default to port 8788 (matches npm run dev:local)
// Can override with BASE_URL env var (e.g., BASE_URL=http://localhost:3014)
const BASE_URL = process.env.BASE_URL || 'http://localhost:8788';
const TEST_MODE = process.env.TEST_MODE !== 'false'; // Default to true
const TIMEOUT_MS = TEST_MODE ? 12000 : 60000; // 12s for test, 60s for full

interface SyncStatus {
  isLocked: boolean;
  startedAt?: string;
  duration?: number;
  progress?: {
    filesProcessed: number;
    totalFiles: number;
    conversationsProcessed: number;
    successfulFiles?: string[];
    failedFiles?: Array<{ path: string; reason: string }>;
    sqlStatementsTotal?: number;
    sqlStatementsExecuted?: number;
    currentPhase?: 'parsing' | 'sql-execution';
    sqlErrorCount?: number;
  };
  completed?: boolean;
  cancelled?: boolean;
  stats?: {
    filesProcessed: number;
    conversationsProcessed: number;
    sqlStatementsExecuted: number;
    errors: number;
    duration: number;
    successfulFiles: number;
    failedFiles: number;
    sqlErrors: number;
  };
  detailedErrors?: Array<{
    message: string;
    sqlPreview?: string;
    sqlLength?: number;
    reference?: string;
    statementNumber?: number;
  }>;
  error?: string;
  successfulFiles?: string[];
  failedFiles?: Array<{ path: string; reason: string }>;
}

async function checkSyncStatus(): Promise<SyncStatus> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout for status check
  
  try {
    const response = await fetch(`${BASE_URL}/api/sync-conversations`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Request timeout: Server not responding at ${BASE_URL}`);
    }
    throw error;
  }
}

async function startSync(testMode: boolean): Promise<{ success: boolean; message: string; startedAt?: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  
  try {
    const response = await fetch(`${BASE_URL}/api/sync-conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        deleteMissing: false,
        testMode: testMode
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Request timeout: Server not responding at ${BASE_URL}`);
    }
    throw error;
  }
}

async function waitForCompletion(timeout: number): Promise<SyncStatus> {
  const startTime = Date.now();
  let lastProgress = '';
  let lastLogTime = 0;
  
  while (Date.now() - startTime < timeout) {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const remaining = Math.floor((timeout - (Date.now() - startTime)) / 1000);
    
    let status: SyncStatus;
    try {
      status = await checkSyncStatus();
    } catch (error: any) {
      throw new Error(`Failed to check sync status: ${error.message}`);
    }
    
    // Check if completed
    if (status.completed) {
      return status;
    }
    
    // Show progress if locked (but not too frequently)
    if (status.isLocked) {
      if (status.progress) {
        const percent = status.progress.totalFiles > 0 
          ? Math.round((status.progress.filesProcessed / status.progress.totalFiles) * 100)
          : 0;
        const phase = status.progress.currentPhase || 'parsing';
        const progressMsg = `  [${elapsed}s/${Math.floor(timeout/1000)}s] ${status.progress.filesProcessed}/${status.progress.totalFiles} files (${percent}%) - ${status.progress.conversationsProcessed} conversations [${phase}]`;
        
        // Log progress every 2 seconds or when it changes significantly
        if (progressMsg !== lastProgress && (elapsed - lastLogTime >= 2 || progressMsg.includes('100%'))) {
          console.log(progressMsg);
          lastProgress = progressMsg;
          lastLogTime = elapsed;
        }
        
        if (status.detailedErrors && status.detailedErrors.length > 0 && elapsed % 3 === 0) {
          console.log(`  ⚠ ${status.detailedErrors.length} SQL errors detected so far`);
        }
      } else if (elapsed % 2 === 0) {
        // Locked but no progress yet - log every 2 seconds
        console.log(`  [${elapsed}s] Sync starting...`);
      }
    } else if (!status.isLocked && elapsed > 2) {
      // Not locked anymore but not completed - might be an error
      throw new Error(`Sync stopped unexpectedly (not locked, not completed). Error: ${status.error || 'Unknown'}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000)); // Poll every 1 second
  }
  
  // Timeout reached
  const timeoutSeconds = Math.floor(timeout / 1000);
  throw new Error(`❌ Sync did not complete within ${timeoutSeconds} seconds (timeout)`);
}

async function testSync() {
  console.log('🧪 Testing Sync Functionality\n');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Test Mode: ${TEST_MODE ? 'ON (first 10 files only, 12s timeout)' : 'OFF (all files, 60s timeout)'}\n`);
  
  try {
    // Step 1: Check initial status
    console.log('1️⃣ Checking initial sync status...');
    let initialStatus: SyncStatus;
    try {
      initialStatus = await checkSyncStatus();
    } catch (error: any) {
      throw new Error(`Failed to connect to server at ${BASE_URL}: ${error.message}\nMake sure the server is running: npm run dev:local`);
    }
    console.log(`   Status: ${initialStatus.isLocked ? 'Locked (sync in progress)' : 'Unlocked (ready)'}`);
    
    if (initialStatus.isLocked) {
      console.log(`   ⚠️  Sync is already in progress. Waiting for completion (max ${TIMEOUT_MS/1000} seconds)...`);
      const completedStatus = await waitForCompletion(TIMEOUT_MS);
      console.log(`   ✓ Sync completed`);
      if (completedStatus.stats) {
        console.log(`   Files: ${completedStatus.stats.successfulFiles} successful, ${completedStatus.stats.failedFiles} failed`);
        console.log(`   Errors: ${completedStatus.stats.errors} total (${completedStatus.stats.sqlErrors} SQL)`);
        
        // Show failed files if any
        if (completedStatus.failedFiles && completedStatus.failedFiles.length > 0) {
          console.log(`\n   ❌ Failed Files (${completedStatus.failedFiles.length}):`);
          completedStatus.failedFiles.slice(0, 10).forEach((failed, i) => {
            console.log(`      ${i + 1}. ${failed.path}: ${failed.reason}`);
          });
          if (completedStatus.failedFiles.length > 10) {
            console.log(`      ... and ${completedStatus.failedFiles.length - 10} more`);
          }
        }
        
        // Show SQL errors if any (including FOREIGN KEY errors)
        if (completedStatus.detailedErrors && completedStatus.detailedErrors.length > 0) {
          console.log(`\n   ⚠️  SQL Errors (${completedStatus.detailedErrors.length}):`);
          completedStatus.detailedErrors.slice(0, 10).forEach((err, i) => {
            console.log(`      ${i + 1}. ${err.message.substring(0, 200)}`);
            if (err.reference) {
              console.log(`         Reference: ${err.reference}`);
            }
            if (err.statementNumber) {
              console.log(`         Statement #${err.statementNumber}`);
            }
          });
          if (completedStatus.detailedErrors.length > 10) {
            console.log(`      ... and ${completedStatus.detailedErrors.length - 10} more SQL errors`);
          }
          
          // Count and show FOREIGN KEY errors specifically
          const foreignKeyErrors = completedStatus.detailedErrors.filter(err => 
            err.message.toUpperCase().includes('FOREIGN KEY')
          );
          if (foreignKeyErrors.length > 0) {
            console.log(`\n   🔗 FOREIGN KEY Errors (${foreignKeyErrors.length}):`);
            foreignKeyErrors.slice(0, 5).forEach((err, i) => {
              console.log(`      ${i + 1}. ${err.message.substring(0, 200)}`);
              if (err.reference) {
                console.log(`         Reference: ${err.reference}`);
              }
            });
            if (foreignKeyErrors.length > 5) {
              console.log(`      ... and ${foreignKeyErrors.length - 5} more FOREIGN KEY errors`);
            }
          }
        }
      }
      return;
    }
    
    // Step 2: Start sync (in test mode by default)
    console.log('\n2️⃣ Starting sync...');
    let startResult: { success: boolean; message: string; startedAt?: string };
    try {
      startResult = await startSync(TEST_MODE);
    } catch (error: any) {
      throw new Error(`Failed to start sync: ${error.message}`);
    }
    if (!startResult.success) {
      throw new Error(`Failed to start sync: ${startResult.message}`);
    }
    console.log(`   ✓ ${startResult.message}`);
    console.log(`   Started at: ${startResult.startedAt}`);
    
    // Step 3: Wait for completion with strict timeout
    console.log(`\n3️⃣ Waiting for sync to complete (max ${TIMEOUT_MS/1000} seconds)...`);
    let finalStatus: SyncStatus;
    try {
      finalStatus = await waitForCompletion(TIMEOUT_MS);
    } catch (error: any) {
      // Timeout or other error
      console.error(`\n❌ ${error.message}`);
      // Try to get current status to show what happened
      try {
        const currentStatus = await checkSyncStatus();
        if (currentStatus.isLocked) {
          console.log(`   Sync is still running (locked: ${currentStatus.isLocked})`);
          if (currentStatus.progress) {
            console.log(`   Progress: ${currentStatus.progress.filesProcessed}/${currentStatus.progress.totalFiles} files`);
          }
        }
      } catch (e) {
        // Ignore
      }
      process.exit(1);
    }
    
    // Step 4: Verify results
    console.log('\n4️⃣ Verifying results...');
    
    if (!finalStatus.completed) {
      throw new Error('Sync did not complete successfully (completed flag is false)');
    }
    
    if (finalStatus.cancelled) {
      console.log('   ⚠️  Sync was cancelled');
      if (finalStatus.stats) {
        console.log(`   Partial results: ${finalStatus.stats.successfulFiles} files successful, ${finalStatus.stats.failedFiles} failed`);
      }
      return;
    }
    
    if (finalStatus.stats) {
      const stats = finalStatus.stats;
      console.log(`   ✓ Sync completed`);
      console.log(`   Files processed: ${stats.filesProcessed}`);
      console.log(`   Conversations processed: ${stats.conversationsProcessed}`);
      console.log(`   SQL statements executed: ${stats.sqlStatementsExecuted}`);
      console.log(`   Successful files: ${stats.successfulFiles}`);
      console.log(`   Failed files: ${stats.failedFiles}`);
      console.log(`   Total errors: ${stats.errors} (${stats.sqlErrors} SQL, ${stats.errors - stats.sqlErrors} parsing)`);
      console.log(`   Duration: ${Math.floor(stats.duration / 60)}m ${stats.duration % 60}s`);
      
      // Show failed files if any
      if (finalStatus.failedFiles && finalStatus.failedFiles.length > 0) {
        console.log(`\n   ❌ Failed Files (${finalStatus.failedFiles.length}):`);
        finalStatus.failedFiles.slice(0, 10).forEach((failed, i) => {
          console.log(`      ${i + 1}. ${failed.path}: ${failed.reason}`);
        });
        if (finalStatus.failedFiles.length > 10) {
          console.log(`      ... and ${finalStatus.failedFiles.length - 10} more`);
        }
      }
      
      // Show SQL errors if any
      if (finalStatus.detailedErrors && finalStatus.detailedErrors.length > 0) {
        console.log(`\n   ⚠️  SQL Errors (${finalStatus.detailedErrors.length}):`);
        finalStatus.detailedErrors.slice(0, 5).forEach((err, i) => {
          console.log(`      ${i + 1}. ${err.message.substring(0, 150)}`);
          if (err.reference) {
            console.log(`         Reference: ${err.reference}`);
          }
        });
        if (finalStatus.detailedErrors.length > 5) {
          console.log(`      ... and ${finalStatus.detailedErrors.length - 5} more SQL errors`);
        }
      }
      
      // Success criteria: At least some files should succeed, even if some fail
      // The sync should complete successfully even with errors (graceful degradation)
      const hasSuccessfulFiles = stats.successfulFiles > 0;
      const hasConversations = stats.conversationsProcessed > 0;
      
      if (hasSuccessfulFiles && hasConversations) {
        console.log(`\n✅ Test PASSED: Sync completed successfully`);
        if (stats.failedFiles > 0 || stats.sqlErrors > 0) {
          console.log(`   Note: Some files/statements had errors but sync completed gracefully`);
        }
      } else {
        console.log(`\n❌ Test FAILED: No successful files or conversations processed`);
        console.log(`   Successful files: ${stats.successfulFiles}, Conversations: ${stats.conversationsProcessed}`);
        process.exit(1);
      }
    } else {
      throw new Error('No stats available after sync completion');
    }
    
  } catch (error: any) {
    console.error(`\n❌ Test FAILED: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run the test
testSync();
