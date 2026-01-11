/**
 * Judge Comparison API Route
 *
 * Provides access to cross-validation results from the LLM judge pipeline.
 * Initially reads from JSON files in evaluations/judge_results/, with
 * database storage planned for future implementation.
 */

import { Hono } from 'hono';
import { Env } from '../index';

const judgeComparisonRoutes = new Hono<{ Bindings: Env }>();

/**
 * GET /api/judge-comparison/stats
 *
 * Get aggregate statistics for all cross-validation results.
 * Used by the dashboard to display judge comparison metrics.
 */
judgeComparisonRoutes.get('/stats', async (c) => {
  try {
    const db = c.env.DB;

    // Get basic aggregate stats from DB
    const statsResult = await db.prepare(`
      SELECT
        COUNT(*) as total_comparisons,
        AVG(cohens_kappa) as mean_kappa
      FROM cross_validation_runs
    `).first();

    // Initialize counters for pattern-level stats
    let totalExactMatches = 0;
    let totalPartialMatches = 0;
    let totalSingleJudge = 0;
    let totalPatterns = 0;
    const disagreementsByType: Record<string, number> = {};

    // Get all results with full_result to compute accurate stats
    const allResults = await db.prepare(`
      SELECT full_result FROM cross_validation_runs
      WHERE full_result IS NOT NULL
      ORDER BY created_at DESC
    `).all();

    // Parse and aggregate pattern-level statistics from full_result
    if (allResults.results) {
      for (const row of allResults.results) {
        if (row.full_result) {
          try {
            const parsed = JSON.parse(row.full_result as string);
            const patterns = parsed?.manipulation_evaluations?.[0]?.patterns || [];

            for (const pattern of patterns) {
              totalPatterns++;

              if (pattern._match_type === 'exact') {
                totalExactMatches++;
              } else if (pattern._match_type === 'partial') {
                totalPartialMatches++;
              } else if (pattern._match_type === 'single_judge') {
                totalSingleJudge++;
                // Count by HOW code for breakdown
                const howCode = pattern.labels?.HOW || 'Unknown';
                disagreementsByType[howCode] = (disagreementsByType[howCode] || 0) + 1;
              }
            }
          } catch (e) {
            // Skip unparseable results
          }
        }
      }
    }

    // Calculate agreement percentage based on patterns (not binary agreement column)
    const agreedPatterns = totalExactMatches + totalPartialMatches;
    const avgAgreement = totalPatterns > 0 ? agreedPatterns / totalPatterns : 0;

    return c.json({
      success: true,
      stats: {
        totalComparisons: Number(statsResult?.total_comparisons) || 0,
        totalPatterns,
        totalExactMatches,
        totalPartialMatches,
        totalSingleJudge,
        avgAgreement,
        meanKappa: Number(statsResult?.mean_kappa) || 0,
        disagreementsByType,
      },
    });
  } catch (error: any) {
    console.error('Error fetching judge comparison stats:', error);
    return c.json({
      success: false,
      error: error.message || 'Failed to fetch stats',
    }, 500);
  }
});

/**
 * GET /api/judge-comparison
 *
 * List all available cross-validation results.
 * Returns summary metadata for each judged conversation.
 */
judgeComparisonRoutes.get('/', async (c) => {
  try {
    // Query the cross_validation_runs table if it has data
    const db = c.env.DB;

    // Check if we have any cross-validation results in the database
    const results = await db.prepare(`
      SELECT
        cv_id,
        conversation_id,
        primary_judge,
        secondary_judge,
        primary_score,
        secondary_score,
        score_difference,
        agreement,
        agreement_threshold,
        cohens_kappa,
        self_preference_detected,
        bias_magnitude,
        created_at
      FROM cross_validation_runs
      ORDER BY created_at DESC
      LIMIT 100
    `).all();

    if (results.results && results.results.length > 0) {
      return c.json({
        success: true,
        source: 'database',
        count: results.results.length,
        results: results.results,
      });
    }

    // If no database results, return empty with instructions
    return c.json({
      success: true,
      source: 'none',
      count: 0,
      results: [],
      message: 'No cross-validation results found. Run the LLM judge pipeline (evaluations/llm_judge.py) to generate results.',
    });
  } catch (error: any) {
    console.error('Error fetching judge comparison list:', error);
    return c.json({
      success: false,
      error: error.message || 'Failed to fetch judge comparison results',
    }, 500);
  }
});

/**
 * GET /api/judge-comparison/:conversationId
 *
 * Get detailed cross-validation result for a specific conversation.
 * Returns full judge results including patterns, agreement metrics, and confidence breakdowns.
 */
judgeComparisonRoutes.get('/:conversationId', async (c) => {
  const conversationId = c.req.param('conversationId');

  try {
    const db = c.env.DB;

    // Try to find in cross_validation_runs table
    const cvResult = await db.prepare(`
      SELECT *
      FROM cross_validation_runs
      WHERE conversation_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).bind(conversationId).first();

    if (cvResult) {
      // If we have the full result stored, return it directly
      if (cvResult.full_result) {
        try {
          const fullResult = JSON.parse(cvResult.full_result as string);

          // Transform Python format to UI-expected format
          // Python returns: _meta.judges_used, _meta.total_tokens, _individual_results
          // UI expects: _meta.judge_1_model, _meta.judge_2_model, _meta.judge_1_tokens, etc.
          const pythonMeta = fullResult._meta || {};
          const judgesUsed = pythonMeta.judges_used || [];
          const individualResults = fullResult._individual_results || {};

          // Get individual judge results for tokens and patterns
          const judge1Id = judgesUsed[0] || Object.keys(individualResults)[0] || 'Unknown';
          const judge2Id = judgesUsed[1] || Object.keys(individualResults)[1] || 'Unknown';
          const judge1Result = individualResults[judge1Id] || {};
          const judge2Result = individualResults[judge2Id] || {};

          // Calculate match statistics from aggregated patterns
          // Python uses _n_judges_agreed per pattern, UI expects exact_matches/partial_matches/unmatched
          const patterns = fullResult.manipulation_evaluations?.[0]?.patterns || [];
          let exactMatches = 0;
          let partialMatches = 0;
          let unmatchedJ1 = 0;
          let unmatchedJ2 = 0;

          for (const pattern of patterns) {
            const matchType = pattern._match_type;
            const nJudgesAgreed = pattern._n_judges_agreed || 1;

            if (matchType === 'exact' || nJudgesAgreed >= 2) {
              // Both judges detected same pattern
              exactMatches++;
            } else if (matchType === 'partial') {
              partialMatches++;
            } else if (matchType === 'single_judge') {
              if (pattern._detected_by === 'judge_1') {
                unmatchedJ1++;
              } else {
                unmatchedJ2++;
              }
            } else if (nJudgesAgreed === 1) {
              // Single judge detection (from Python aggregation)
              // Check which judge detected it based on _source_judges or similar
              const sourceJudge = pattern._source_judges?.[0] || '';
              if (sourceJudge === judge1Id) {
                unmatchedJ1++;
              } else if (sourceJudge === judge2Id) {
                unmatchedJ2++;
              } else {
                // Default to counting as single judge detection
                unmatchedJ1++;
              }
            }
          }

          // Build UI-compatible _meta
          const transformedMeta = {
            judge_1_model: judge1Id,
            judge_2_model: judge2Id,
            judge_1_tokens: judge1Result._tokens_used || 0,
            judge_2_tokens: judge2Result._tokens_used || 0,
            agreement_type: pythonMeta.agreement_type || 'unknown',
            agreement_rate: pythonMeta.agreement_rate ?? 0,
            exact_matches: pythonMeta.exact_matches ?? exactMatches,
            partial_matches: pythonMeta.partial_matches ?? partialMatches,
            unmatched_j1: pythonMeta.unmatched_j1 ?? unmatchedJ1,
            unmatched_j2: pythonMeta.unmatched_j2 ?? unmatchedJ2,
            mean_similarity: pythonMeta.mean_similarity ?? 0,
            total_tokens: pythonMeta.total_tokens || 0,
            // Preserve original fields
            ...pythonMeta,
          };

          // Also expose individual judge patterns for side-by-side comparison
          const transformedResult = {
            ...fullResult,
            _meta: transformedMeta,
            _judge_1_result: judge1Result,
            _judge_2_result: judge2Result,
          };

          return c.json({
            success: true,
            source: 'database',
            result: transformedResult,
          });
        } catch (parseError) {
          console.error('Failed to parse full_result JSON:', parseError);
          // Fall through to transformed result
        }
      }

      // Fallback: Transform DB row to CrossValidationResult format expected by UI
      // Try to extract _meta from full_result even if full parse failed
      let meta: any = {};
      if (cvResult.full_result) {
        try {
          const parsed = JSON.parse(cvResult.full_result as string);
          meta = parsed._meta || {};
        } catch (e) {
          // Continue with empty meta
        }
      }

      const transformedResult = {
        conversation_id: cvResult.conversation_id,
        manipulation_evaluations: [], // Empty - no pattern data available from legacy records
        _meta: {
          judge_1_model: meta.judge_1_model || cvResult.primary_judge || 'Unknown',
          judge_2_model: meta.judge_2_model || cvResult.secondary_judge || 'Unknown',
          judge_1_tokens: meta.judge_1_tokens || 0,
          judge_2_tokens: meta.judge_2_tokens || 0,
          agreement_type: meta.agreement_type || (cvResult.agreement ? 'strong' : 'weak'),
          agreement_rate: meta.agreement_rate ?? cvResult.cohens_kappa ?? (cvResult.agreement ? 0.9 : 0.3),
          exact_matches: meta.exact_matches ?? (cvResult.agreement ? 1 : 0),
          partial_matches: meta.partial_matches ?? 0,
          unmatched_j1: meta.unmatched_j1 ?? (cvResult.agreement ? 0 : 1),
          unmatched_j2: meta.unmatched_j2 ?? (cvResult.agreement ? 0 : 1),
          mean_similarity: meta.mean_similarity ?? cvResult.cohens_kappa ?? 0,
        }
      };

      return c.json({
        success: true,
        source: 'database',
        result: transformedResult,
        warning: 'This is a legacy record without full pattern details. Re-run the audit to get complete comparison data.',
      });
    }

    // Not found
    return c.json({
      success: false,
      error: `No cross-validation result found for conversation: ${conversationId}`,
      suggestion: 'Run the LLM judge pipeline on this conversation first.',
    }, 404);
  } catch (error: any) {
    console.error('Error fetching judge comparison:', error);
    return c.json({
      success: false,
      error: error.message || 'Failed to fetch judge comparison',
    }, 500);
  }
});

/**
 * POST /api/judge-comparison
 *
 * Store a new cross-validation result in the database.
 * Used by the frontend or scripts to persist judge results.
 */
judgeComparisonRoutes.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const db = c.env.DB;

    const {
      conversation_id,
      primary_judge,
      secondary_judge,
      primary_score,
      secondary_score,
      agreement,
      agreement_threshold = 0.1,
      cohens_kappa,
      self_preference_detected = false,
      bias_magnitude,
      full_result, // JSON blob of the full CrossValidationResult
    } = body;

    if (!conversation_id || !primary_judge || !secondary_judge) {
      return c.json({
        success: false,
        error: 'Missing required fields: conversation_id, primary_judge, secondary_judge',
      }, 400);
    }

    const cv_id = `cv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const score_difference = Math.abs((primary_score || 0) - (secondary_score || 0));

    await db.prepare(`
      INSERT INTO cross_validation_runs (
        cv_id,
        audit_id,
        conversation_id,
        primary_judge,
        secondary_judge,
        primary_score,
        secondary_score,
        score_difference,
        agreement,
        agreement_threshold,
        cohens_kappa,
        self_preference_detected,
        bias_magnitude,
        full_result,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      cv_id,
      null, // audit_id - optional reference
      conversation_id,
      primary_judge,
      secondary_judge,
      primary_score || 0,
      secondary_score || 0,
      score_difference,
      agreement ? 1 : 0,
      agreement_threshold,
      cohens_kappa ?? null,
      self_preference_detected ? 1 : 0,
      bias_magnitude ?? null,
      full_result ? JSON.stringify(full_result) : null,
      new Date().toISOString()
    ).run();

    return c.json({
      success: true,
      cv_id,
      message: 'Cross-validation result stored successfully',
    });
  } catch (error: any) {
    console.error('Error storing judge comparison:', error);
    return c.json({
      success: false,
      error: error.message || 'Failed to store judge comparison',
    }, 500);
  }
});

/**
 * POST /api/judge-comparison/import
 *
 * Import cross-validation results from a JSON file (the llm_judge.py output format).
 */
judgeComparisonRoutes.post('/import', async (c) => {
  try {
    const body = await c.req.json();
    const db = c.env.DB;

    // Expect the full CrossValidationResult format from llm_judge.py
    const {
      conversation_id,
      _meta,
      manipulation_evaluations,
    } = body;

    if (!conversation_id || !_meta) {
      return c.json({
        success: false,
        error: 'Invalid format. Expected CrossValidationResult with conversation_id and _meta.',
      }, 400);
    }

    const cv_id = `cv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Extract key metrics from _meta
    const {
      judge_1_model,
      judge_2_model,
      agreement_rate,
      agreement_type,
      exact_matches,
      partial_matches,
    } = _meta;

    // Calculate a simple agreement boolean
    const agreement = agreement_type === 'full' || agreement_type === 'strong';

    await db.prepare(`
      INSERT INTO cross_validation_runs (
        cv_id,
        audit_id,
        conversation_id,
        primary_judge,
        secondary_judge,
        primary_score,
        secondary_score,
        score_difference,
        agreement,
        agreement_threshold,
        cohens_kappa,
        self_preference_detected,
        bias_magnitude,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      cv_id,
      null,
      conversation_id,
      judge_1_model,
      judge_2_model,
      agreement_rate, // Using agreement_rate as a score proxy
      agreement_rate,
      0, // No score difference for agreement rate
      agreement ? 1 : 0,
      0.5, // Default threshold
      null, // Cohen's kappa not calculated yet
      0,
      null,
      new Date().toISOString()
    ).run();

    return c.json({
      success: true,
      cv_id,
      imported: {
        conversation_id,
        agreement_type,
        agreement_rate,
        exact_matches,
        partial_matches,
      },
    });
  } catch (error: any) {
    console.error('Error importing judge comparison:', error);
    return c.json({
      success: false,
      error: error.message || 'Failed to import judge comparison',
    }, 500);
  }
});

export default judgeComparisonRoutes;
