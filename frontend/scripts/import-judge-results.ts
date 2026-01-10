/**
 * Import LLM judge results from Python pipeline into the database
 *
 * Usage:
 *   npm run import:judge-results -- --dry-run
 *   npm run import:judge-results -- --local
 *   npm run import:judge-results -- --production
 *   npm run import:judge-results -- --local --filter "adv_00001"
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { createHash } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default paths
const JUDGE_RESULTS_DIR = path.join(__dirname, '../../evaluations/judge_results');
const LOCAL_DB_PATH = '.wrangler/state/v3/d1/miniflare-D1DatabaseObject';
const PRODUCTION_API = 'https://thoughtguards.pages.dev';

interface Quote {
  speaker: string;
  message_index: number;
  text: string;
}

interface Pattern {
  triad_pattern_id: string;
  labels: {
    TARGET: string;
    HOW: string;
    WHY: string;
  };
  short_desc: string;
  prominence: number;
  confidence: number;
  severity: number;
  quotes: Quote[];
  evidence_notes: string;
  counterevidence_notes?: string | null;
  _agreement?: string;
}

interface ManipulationEvaluation {
  evaluator_id: string;
  evaluator_type: string;
  model_name: string;
  created_at: string;
  patterns: Pattern[];
  notes?: string;
}

interface JudgeResult {
  conversation_id: string;
  manipulation_evaluations: ManipulationEvaluation[];
  _meta: {
    judge_1_model: string;
    judge_2_model: string;
    judge_1_tokens: number;
    judge_2_tokens: number;
    agreement_type: string;
    agreement_rate: number;
    patterns_judge_1: string[];
    patterns_judge_2: string[];
    patterns_common: string[];
  };
  _source?: {
    file: string;
    chatbot_mode?: string;
    chatbot_model?: string;
    persona_id?: string;
    analyzed_at?: string;
  };
}

interface AuditReport {
  report_id: string;
  conversation_id: string;
  skill_id: string;
  skill_version: string;
  model_name: string;
  llm_parameters: string;
  prompt_hash: string;
  prompt_version: string;
  response_hash: string;
  completion_tokens: number;
  prompt_tokens: number;
  latency_ms: number | null;
  system_fingerprint: string | null;
  cache_hit: boolean;
  overall_score: number;
  confidence: string;
  detected_types: string;
  skill_results: string | null;
  combined_score: number | null;
  primary_category: string | null;
  secondary_categories: string | null;
  detection_metadata: string | null;
  patterns: string;
  conversation_snapshot: string | null;
  created_at: string;
  tags: string | null;
  notes: string | null;
}

/**
 * Find all judgment JSON files (exclude summaries)
 */
function findJudgmentFiles(filterPattern?: string): string[] {
  if (!fs.existsSync(JUDGE_RESULTS_DIR)) {
    console.error(`❌ Judge results directory not found: ${JUDGE_RESULTS_DIR}`);
    return [];
  }

  const files = fs.readdirSync(JUDGE_RESULTS_DIR)
    .filter(f => f.endsWith('_judgment.json'))
    .filter(f => !filterPattern || f.includes(filterPattern))
    .map(f => path.join(JUDGE_RESULTS_DIR, f));

  return files;
}

/**
 * Generate a deterministic hash for a string
 */
function generateHash(content: string): string {
  return createHash('sha256').update(content).digest('hex').substring(0, 16);
}

/**
 * Generate a unique report ID
 */
function generateReportId(conversationId: string, modelName: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `audit_${conversationId}_${generateHash(modelName)}_${timestamp}_${random}`;
}

/**
 * Calculate overall score from patterns
 */
function calculateOverallScore(patterns: Pattern[]): number {
  if (patterns.length === 0) return 0;

  // Weight by prominence * confidence * severity
  let totalWeightedScore = 0;
  let totalWeight = 0;

  for (const pattern of patterns) {
    const weight = pattern.prominence * pattern.confidence;
    const score = pattern.severity / 5.0; // Normalize severity to 0-1
    totalWeightedScore += score * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? totalWeightedScore / totalWeight : 0;
}

/**
 * Determine confidence level from agreement rate
 */
function determineConfidence(agreementRate: number): string {
  if (agreementRate >= 0.7) return 'high';
  if (agreementRate >= 0.3) return 'medium';
  return 'low';
}

/**
 * Extract detected types (HOW codes) from patterns
 */
function extractDetectedTypes(patterns: Pattern[]): string[] {
  const types = new Set<string>();
  for (const pattern of patterns) {
    types.add(pattern.labels.HOW);
  }
  return Array.from(types);
}

/**
 * Transform Python judge result to audit report format
 */
function transformToAuditReport(judgeResult: JudgeResult): AuditReport {
  const evaluation = judgeResult.manipulation_evaluations[0];
  const patterns = evaluation.patterns;
  const meta = judgeResult._meta;

  const reportId = generateReportId(
    judgeResult.conversation_id,
    evaluation.model_name
  );

  const overallScore = calculateOverallScore(patterns);
  const detectedTypes = extractDetectedTypes(patterns);

  // Create LLM parameters JSON with agreement metadata
  const llmParameters = {
    judge_system: 'dual-judge',
    judge_1_model: meta.judge_1_model,
    judge_2_model: meta.judge_2_model,
    agreement_type: meta.agreement_type,
    agreement_rate: meta.agreement_rate,
    patterns_common: meta.patterns_common,
    patterns_judge_1: meta.patterns_judge_1,
    patterns_judge_2: meta.patterns_judge_2,
    temperature: null, // Not available from Python judge
    top_p: null,
    seed: null,
  };

  // Create prompt hash (from taxonomy system prompt - consistent identifier)
  const promptContent = 'taxonomy-dual-judge-v1.0'; // Version identifier
  const promptHash = generateHash(promptContent);

  // Create response hash (from patterns for deduplication)
  const responseContent = JSON.stringify(patterns.map(p => p.triad_pattern_id).sort());
  const responseHash = generateHash(responseContent);

  return {
    report_id: reportId,
    conversation_id: judgeResult.conversation_id,
    skill_id: 'taxonomy-auditor-dual-judge',
    skill_version: '1.0.0',
    model_name: evaluation.model_name,
    llm_parameters: JSON.stringify(llmParameters),
    prompt_hash: promptHash,
    prompt_version: 'dual-judge-v1.0',
    response_hash: responseHash,
    completion_tokens: meta.judge_1_tokens + meta.judge_2_tokens,
    prompt_tokens: 0, // Not tracked separately in Python judge
    latency_ms: null,
    system_fingerprint: null,
    cache_hit: false,
    overall_score: overallScore,
    confidence: determineConfidence(meta.agreement_rate),
    detected_types: JSON.stringify(detectedTypes),
    skill_results: null,
    combined_score: null,
    primary_category: detectedTypes.length > 0 ? detectedTypes[0] : null,
    secondary_categories: detectedTypes.length > 1 ? JSON.stringify(detectedTypes.slice(1)) : null,
    detection_metadata: null,
    patterns: JSON.stringify(patterns),
    conversation_snapshot: null,
    created_at: evaluation.created_at,
    tags: JSON.stringify(['dual-judge', 'python-pipeline']),
    notes: evaluation.notes || null,
  };
}

/**
 * Insert audit report into local database
 */
function insertIntoLocalDB(report: AuditReport, db: Database.Database): boolean {
  try {
    // Check if report already exists (by conversation_id + model_name)
    const existing = db.prepare(
      'SELECT report_id FROM audit_reports WHERE conversation_id = ? AND skill_id = ?'
    ).get(report.conversation_id, report.skill_id);

    if (existing) {
      console.log(`  ⏭️  Skipping ${report.conversation_id} (already exists)`);
      return false;
    }

    const stmt = db.prepare(`
      INSERT INTO audit_reports (
        report_id, conversation_id, created_at, skill_id, skill_version, model_name,
        llm_parameters, prompt_hash, prompt_version, timestamp_utc, response_hash,
        completion_tokens, prompt_tokens, latency_ms, system_fingerprint, cache_hit,
        evaluator_model, overall_score, confidence, detected_types, metrics,
        skill_results, combined_score, primary_category, secondary_categories, detection_metadata,
        patterns, conversation_snapshot, tags, notes
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?
      )
    `);

    stmt.run(
      report.report_id, report.conversation_id, report.created_at, report.skill_id, report.skill_version, report.model_name,
      report.llm_parameters, report.prompt_hash, report.prompt_version, report.created_at, report.response_hash,
      report.completion_tokens, report.prompt_tokens, report.latency_ms, report.system_fingerprint, report.cache_hit ? 1 : 0,
      report.model_name, report.overall_score, report.confidence, report.detected_types, '{}',
      report.skill_results, report.combined_score, report.primary_category, report.secondary_categories, report.detection_metadata,
      report.patterns, report.conversation_snapshot || '{}', report.tags, report.notes
    );

    return true;
  } catch (error) {
    console.error(`  ❌ Error inserting ${report.conversation_id}:`, error);
    return false;
  }
}

/**
 * Insert audit report via production API
 */
async function insertViaAPI(report: AuditReport, apiUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${apiUrl}/api/audit-reports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(report),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`  ❌ API error for ${report.conversation_id}: ${response.status} ${errorText}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error(`  ❌ Network error for ${report.conversation_id}:`, error);
    return false;
  }
}

/**
 * Find local D1 database file
 */
function findLocalDB(): string | null {
  const stateDir = path.join(process.cwd(), LOCAL_DB_PATH);

  if (!fs.existsSync(stateDir)) {
    console.error(`❌ Local D1 state directory not found: ${stateDir}`);
    return null;
  }

  // Find the .sqlite file
  const files = fs.readdirSync(stateDir);
  const dbFile = files.find(f => f.endsWith('.sqlite'));

  if (!dbFile) {
    console.error(`❌ No .sqlite file found in ${stateDir}`);
    return null;
  }

  return path.join(stateDir, dbFile);
}

/**
 * Main import function
 */
async function importJudgeResults(options: {
  dryRun: boolean;
  local: boolean;
  production: boolean;
  filter?: string;
}) {
  console.log('🔍 Finding judgment files...');
  const files = findJudgmentFiles(options.filter);

  if (files.length === 0) {
    console.log('❌ No judgment files found');
    return;
  }

  console.log(`✅ Found ${files.length} judgment file(s)\n`);

  if (options.dryRun) {
    console.log('🏃 DRY RUN MODE - No changes will be made\n');
  }

  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  // Open database connection if local mode
  let db: Database.Database | null = null;
  if (options.local && !options.dryRun) {
    const dbPath = findLocalDB();
    if (!dbPath) {
      return;
    }
    console.log(`📁 Opening database: ${dbPath}\n`);
    db = new Database(dbPath);
    // Disable foreign key constraints since conversations may not exist
    db.pragma('foreign_keys = OFF');
  }

  for (const file of files) {
    const filename = path.basename(file);
    console.log(`\n📄 Processing: ${filename}`);

    try {
      // Parse judge result
      const content = fs.readFileSync(file, 'utf-8');
      const judgeResult: JudgeResult = JSON.parse(content);

      // Transform to audit report
      const report = transformToAuditReport(judgeResult);

      // Show report details
      console.log(`  📊 Conversation: ${report.conversation_id}`);
      console.log(`  🤖 Models: ${judgeResult._meta.judge_1_model.split('-').slice(-2).join('-')} + ${judgeResult._meta.judge_2_model.split('-').slice(-2).join('-')}`);
      console.log(`  🤝 Agreement: ${judgeResult._meta.agreement_type} (${(judgeResult._meta.agreement_rate * 100).toFixed(1)}%)`);
      console.log(`  📈 Patterns: ${judgeResult.manipulation_evaluations[0].patterns.length} total, ${judgeResult._meta.patterns_common.length} common`);
      console.log(`  🎯 Score: ${(report.overall_score * 100).toFixed(1)}% (confidence: ${report.confidence})`);

      if (options.dryRun) {
        console.log(`  ✅ Would import`);
        successCount++;
      } else if (options.local && db) {
        const inserted = insertIntoLocalDB(report, db);
        if (inserted) {
          console.log(`  ✅ Imported to local DB`);
          successCount++;
        } else {
          skipCount++;
        }
      } else if (options.production) {
        const inserted = await insertViaAPI(report, PRODUCTION_API);
        if (inserted) {
          console.log(`  ✅ Imported to production`);
          successCount++;
        } else {
          errorCount++;
        }
      }
    } catch (error) {
      console.error(`  ❌ Error processing ${filename}:`, error);
      errorCount++;
    }
  }

  // Close database
  if (db) {
    db.close();
  }

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('IMPORT COMPLETE');
  console.log('='.repeat(60));
  console.log(`✅ Success: ${successCount}`);
  console.log(`⏭️  Skipped: ${skipCount}`);
  console.log(`❌ Errors: ${errorCount}`);
  console.log(`📊 Total: ${files.length}`);
}

// ============================================================================
// CLI
// ============================================================================

const args = process.argv.slice(2);
const options = {
  dryRun: args.includes('--dry-run'),
  local: args.includes('--local'),
  production: args.includes('--production'),
  filter: args.includes('--filter') ? args[args.indexOf('--filter') + 1] : undefined,
};

// Validate options
if (!options.dryRun && !options.local && !options.production) {
  console.error('❌ Error: Must specify either --dry-run, --local, or --production');
  console.error('\nUsage:');
  console.error('  npm run import:judge-results -- --dry-run');
  console.error('  npm run import:judge-results -- --local');
  console.error('  npm run import:judge-results -- --production');
  console.error('  npm run import:judge-results -- --local --filter "adv_00001"');
  process.exit(1);
}

if (options.local && options.production) {
  console.error('❌ Error: Cannot specify both --local and --production');
  process.exit(1);
}

// Run import
importJudgeResults(options).catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
