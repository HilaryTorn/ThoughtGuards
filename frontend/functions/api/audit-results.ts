import { createDbClient } from '../../lib/db';

export const onRequest: PagesFunction<{ DB: D1Database }> = async (context) => {
  const { request, env } = context;
  const db = createDbClient(env.DB);

  // Ensure audit_results table exists and has all required columns
  try {
    // Create table if it doesn't exist
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS audit_results (
        audit_id TEXT PRIMARY KEY,
        trace_id TEXT NOT NULL UNIQUE,
        conversation_id TEXT NOT NULL,
        skill_id TEXT NOT NULL,
        model_name TEXT NOT NULL,
        overall_score REAL NOT NULL,
        confidence TEXT NOT NULL,
        status TEXT NOT NULL,
        risk_score REAL NOT NULL,
        detected_types TEXT,
        metrics TEXT,
        recommendations TEXT,
        limitations TEXT,
        usage TEXT,
        detection_event TEXT,
        conversation_data TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        skill_results TEXT,
        combined_score REAL,
        primary_category TEXT,
        secondary_categories TEXT,
        detection_metadata TEXT,
        FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id)
      )
    `).run();

    // Add new columns if they don't exist (migration for existing tables)
    // SQLite doesn't support IF NOT EXISTS for ALTER TABLE ADD COLUMN, so we check first
    try {
      await env.DB.prepare(`ALTER TABLE audit_results ADD COLUMN skill_results TEXT`).run();
    } catch (e: any) {
      // Column already exists, ignore
      if (!e.message?.includes('duplicate column')) {
        console.warn('Failed to add skill_results column:', e.message);
      }
    }
    
    try {
      await env.DB.prepare(`ALTER TABLE audit_results ADD COLUMN combined_score REAL`).run();
    } catch (e: any) {
      if (!e.message?.includes('duplicate column')) {
        console.warn('Failed to add combined_score column:', e.message);
      }
    }
    
    try {
      await env.DB.prepare(`ALTER TABLE audit_results ADD COLUMN primary_category TEXT`).run();
    } catch (e: any) {
      if (!e.message?.includes('duplicate column')) {
        console.warn('Failed to add primary_category column:', e.message);
      }
    }
    
    try {
      await env.DB.prepare(`ALTER TABLE audit_results ADD COLUMN secondary_categories TEXT`).run();
    } catch (e: any) {
      if (!e.message?.includes('duplicate column')) {
        console.warn('Failed to add secondary_categories column:', e.message);
      }
    }
    
    try {
      await env.DB.prepare(`ALTER TABLE audit_results ADD COLUMN detection_metadata TEXT`).run();
    } catch (e: any) {
      if (!e.message?.includes('duplicate column')) {
        console.warn('Failed to add detection_metadata column:', e.message);
      }
    }

    // Add statistical columns
    const statisticalColumns = [
      { name: 'run_count', type: 'INTEGER DEFAULT 1' },
      { name: 'score_mean', type: 'REAL' },
      { name: 'score_stddev', type: 'REAL' },
      { name: 'score_p5', type: 'REAL' },
      { name: 'score_p50', type: 'REAL' },
      { name: 'score_p95', type: 'REAL' },
      { name: 'score_ci_lower', type: 'REAL' },
      { name: 'score_ci_upper', type: 'REAL' },
      { name: 'calibration_metrics', type: 'TEXT' },
    ];

    for (const col of statisticalColumns) {
      try {
        await env.DB.prepare(`ALTER TABLE audit_results ADD COLUMN ${col.name} ${col.type}`).run();
      } catch (e: any) {
        if (!e.message?.includes('duplicate column')) {
          console.warn(`Failed to add ${col.name} column:`, e.message);
        }
      }
    }

    // Create audit_runs table if it doesn't exist
    try {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS audit_runs (
          run_id TEXT PRIMARY KEY,
          audit_id TEXT NOT NULL,
          conversation_id TEXT NOT NULL,
          run_number INTEGER NOT NULL,
          seed INTEGER,
          temperature REAL,
          model_name TEXT NOT NULL,
          overall_score REAL NOT NULL,
          confidence TEXT NOT NULL,
          detected_types TEXT,
          metrics TEXT,
          created_at TEXT NOT NULL,
          FOREIGN KEY (audit_id) REFERENCES audit_results(audit_id),
          FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id)
        )
      `).run();
      await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_audit_runs_audit_id ON audit_runs(audit_id)`).run();
      await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_audit_runs_conversation_id ON audit_runs(conversation_id)`).run();
    } catch (error: any) {
      console.warn('Failed to ensure audit_runs table exists:', error);
    }

    // Create ground_truth_labels table if it doesn't exist
    try {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS ground_truth_labels (
          label_id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL UNIQUE,
          is_manipulation INTEGER NOT NULL,
          confidence TEXT NOT NULL,
          annotator_id TEXT,
          annotation_notes TEXT,
          created_at TEXT NOT NULL,
          FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id)
        )
      `).run();
      await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_ground_truth_conversation_id ON ground_truth_labels(conversation_id)`).run();
    } catch (error: any) {
      console.warn('Failed to ensure ground_truth_labels table exists:', error);
    }

    // Create indexes
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_audit_results_conversation_id ON audit_results(conversation_id)`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_audit_results_trace_id ON audit_results(trace_id)`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_audit_results_created_at ON audit_results(created_at)`).run();
  } catch (error: any) {
    console.warn('Failed to ensure audit_results table exists:', error);
    // Continue anyway - table might already exist
  }

  if (request.method === 'POST') {
    // Save audit result
    try {
      let body;
      try {
        body = await request.json();
      } catch (parseError: any) {
        return new Response(
          JSON.stringify({ error: 'Invalid JSON in request body: ' + (parseError.message || 'Unknown error') }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
      const {
        audit_id,
        trace_id,
        conversation_id,
        skill_id,
        model_name,
        overall_score,
        confidence,
        status,
        risk_score,
        detected_types,
        metrics,
        recommendations,
        limitations,
        usage,
        detection_event,
        conversation_data,
        skill_results,
        combined_score,
        primary_category,
        secondary_categories,
        detection_metadata,
        // Statistical fields
        run_count,
        statistics,
        runs,
      } = body;

      if (!audit_id || !trace_id || !conversation_id) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields: audit_id, trace_id, conversation_id' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const now = new Date().toISOString();

      // Check if statistical columns exist
      let hasStatisticalColumns = false;
      try {
        const testQuery = await env.DB.prepare(`SELECT run_count FROM audit_results LIMIT 1`).first();
        hasStatisticalColumns = true;
      } catch (e: any) {
        hasStatisticalColumns = false;
      }

      // Check if multi-skill columns exist
      let hasMultiSkillColumns = false;
      try {
        const testQuery = await env.DB.prepare(`SELECT skill_results FROM audit_results LIMIT 1`).first();
        hasMultiSkillColumns = true;
      } catch (e: any) {
        hasMultiSkillColumns = false;
      }

      // Extract statistical data
      const runCount = run_count || (runs ? runs.length : 1);
      const scoreMean = statistics?.mean;
      const scoreStddev = statistics?.stddev;
      const scoreP5 = statistics?.quantiles?.p5;
      const scoreP50 = statistics?.quantiles?.p50;
      const scoreP95 = statistics?.quantiles?.p95;
      const scoreCiLower = statistics?.confidenceInterval?.lower;
      const scoreCiUpper = statistics?.confidenceInterval?.upper;

      // Use INSERT OR REPLACE to handle updates
      const stmt = env.DB.prepare(hasStatisticalColumns ? `
        INSERT OR REPLACE INTO audit_results (
          audit_id, trace_id, conversation_id, skill_id, model_name,
          overall_score, confidence, status, risk_score,
          detected_types, metrics, recommendations, limitations, usage,
          detection_event, conversation_data, 
          skill_results, combined_score, primary_category, secondary_categories, detection_metadata,
          run_count, score_mean, score_stddev, score_p5, score_p50, score_p95, score_ci_lower, score_ci_upper,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?, ?,
          COALESCE((SELECT created_at FROM audit_results WHERE audit_id = ?), ?), ?)
      ` : hasMultiSkillColumns ? `
        INSERT OR REPLACE INTO audit_results (
          audit_id, trace_id, conversation_id, skill_id, model_name,
          overall_score, confidence, status, risk_score,
          detected_types, metrics, recommendations, limitations, usage,
          detection_event, conversation_data, 
          skill_results, combined_score, primary_category, secondary_categories, detection_metadata,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 
          ?, ?, ?, ?, ?,
          COALESCE((SELECT created_at FROM audit_results WHERE audit_id = ?), ?), ?)
      ` : `
        INSERT OR REPLACE INTO audit_results (
          audit_id, trace_id, conversation_id, skill_id, model_name,
          overall_score, confidence, status, risk_score,
          detected_types, metrics, recommendations, limitations, usage,
          detection_event, conversation_data, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 
          COALESCE((SELECT created_at FROM audit_results WHERE audit_id = ?), ?), ?)
      `);

      if (hasStatisticalColumns) {
        await stmt.bind(
          audit_id,
          trace_id,
          conversation_id,
          skill_id || '',
          model_name || '',
          overall_score || 0,
          confidence || 'low',
          status || 'clean',
          risk_score || 0,
          JSON.stringify(detected_types || []),
          JSON.stringify(metrics || {}),
          JSON.stringify(recommendations || []),
          JSON.stringify(limitations || []),
          JSON.stringify(usage || null),
          JSON.stringify(detection_event || null),
          JSON.stringify(conversation_data || []),
          skill_results ? JSON.stringify(skill_results) : null,
          combined_score !== undefined ? combined_score : null,
          primary_category || null,
          secondary_categories ? JSON.stringify(secondary_categories) : null,
          detection_metadata ? JSON.stringify(detection_metadata) : null,
          runCount,
          scoreMean !== undefined ? scoreMean : null,
          scoreStddev !== undefined ? scoreStddev : null,
          scoreP5 !== undefined ? scoreP5 : null,
          scoreP50 !== undefined ? scoreP50 : null,
          scoreP95 !== undefined ? scoreP95 : null,
          scoreCiLower !== undefined ? scoreCiLower : null,
          scoreCiUpper !== undefined ? scoreCiUpper : null,
          audit_id, // For COALESCE to preserve created_at
          now, // created_at if new
          now  // updated_at
        ).run();
      } else if (hasMultiSkillColumns) {
        await stmt.bind(
          audit_id,
          trace_id,
          conversation_id,
          skill_id || '',
          model_name || '',
          overall_score || 0,
          confidence || 'low',
          status || 'clean',
          risk_score || 0,
          JSON.stringify(detected_types || []),
          JSON.stringify(metrics || {}),
          JSON.stringify(recommendations || []),
          JSON.stringify(limitations || []),
          JSON.stringify(usage || null),
          JSON.stringify(detection_event || null),
          JSON.stringify(conversation_data || []),
          skill_results ? JSON.stringify(skill_results) : null,
          combined_score !== undefined ? combined_score : null,
          primary_category || null,
          secondary_categories ? JSON.stringify(secondary_categories) : null,
          detection_metadata ? JSON.stringify(detection_metadata) : null,
          audit_id, // For COALESCE to preserve created_at
          now, // created_at if new
          now  // updated_at
        ).run();
      } else {
        await stmt.bind(
          audit_id,
          trace_id,
          conversation_id,
          skill_id || '',
          model_name || '',
          overall_score || 0,
          confidence || 'low',
          status || 'clean',
          risk_score || 0,
          JSON.stringify(detected_types || []),
          JSON.stringify(metrics || {}),
          JSON.stringify(recommendations || []),
          JSON.stringify(limitations || []),
          JSON.stringify(usage || null),
          JSON.stringify(detection_event || null),
          JSON.stringify(conversation_data || []),
          audit_id, // For COALESCE to preserve created_at
          now, // created_at if new
          now  // updated_at
        ).run();
      }

      // Store individual runs if provided
      if (runs && Array.isArray(runs) && runs.length > 0) {
        try {
          const runStatements = runs.map((run: any) => {
            return env.DB.prepare(`
              INSERT OR REPLACE INTO audit_runs (
                run_id, audit_id, conversation_id, run_number,
                seed, temperature, model_name, overall_score,
                confidence, detected_types, metrics, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(
              run.run_id,
              audit_id,
              conversation_id,
              run.run_number || 1,
              run.seed || null,
              run.temperature || null,
              run.model_name || model_name,
              run.overall_score,
              run.confidence || confidence,
              JSON.stringify(run.detected_types || []),
              JSON.stringify(run.metrics || {}),
              run.created_at || now
            );
          });
          await env.DB.batch(runStatements);
        } catch (runError: any) {
          console.warn('Failed to store audit runs:', runError);
          // Don't fail the whole request if runs can't be stored
        }
      }

      return new Response(
        JSON.stringify({ success: true, audit_id, trace_id }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } catch (error: any) {
      console.error('Error saving audit result:', error);
      return new Response(
        JSON.stringify({ error: error.message || 'Failed to save audit result' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  } else if (request.method === 'GET') {
    // Fetch audit results (traces)
    try {
      const url = new URL(request.url);
      const limit = parseInt(url.searchParams.get('limit') || '100');
      const offset = parseInt(url.searchParams.get('offset') || '0');
      const status = url.searchParams.get('status');
      const conversationId = url.searchParams.get('conversation_id');


      // Check if statistical columns exist
      let hasStatisticalColumns = false;
      try {
        const testQuery = await env.DB.prepare(`SELECT run_count FROM audit_results LIMIT 1`).first();
        hasStatisticalColumns = true;
      } catch (e: any) {
        hasStatisticalColumns = false;
      }

      let query = `
        SELECT 
          audit_id,
          trace_id,
          conversation_id,
          skill_id,
          model_name,
          overall_score,
          confidence,
          status,
          risk_score,
          detected_types,
          metrics,
          recommendations,
          limitations,
          usage,
          detection_event,
          conversation_data,
          skill_results,
          combined_score,
          primary_category,
          secondary_categories,
          detection_metadata,
          ${hasStatisticalColumns ? `
          run_count,
          score_mean,
          score_stddev,
          score_p5,
          score_p50,
          score_p95,
          score_ci_lower,
          score_ci_upper,
          calibration_metrics,
          ` : ''}
          created_at,
          updated_at
        FROM audit_results
        WHERE 1=1
      `;
      const params: any[] = [];

      if (status) {
        query += ' AND status = ?';
        params.push(status);
      }

      if (conversationId) {
        query += ' AND conversation_id = ?';
        params.push(conversationId);
      }

      query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      let result;
      try {
        const stmt = env.DB.prepare(query);
        result = await stmt.bind(...params).all();
      } catch (queryError: any) {
        // If table doesn't exist, return empty array instead of error
        if (queryError.message && queryError.message.includes('no such table')) {
          console.log('audit_results table does not exist yet, returning empty array');
          return new Response(
            JSON.stringify({ traces: [], total: 0 }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        // Re-throw other errors
        throw queryError;
      }

      // Handle case where result is empty or invalid
      if (!result || !result.results) {
        return new Response(
          JSON.stringify({ traces: [], total: 0 }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const traces = result.results.map((row: any) => {
        // Helper function to safely parse JSON
        const safeJsonParse = (jsonStr: string | null | undefined, defaultValue: any) => {
          if (!jsonStr) return defaultValue;
          try {
            return JSON.parse(jsonStr);
          } catch (e) {
            console.warn('Failed to parse JSON:', jsonStr?.substring(0, 100));
            return defaultValue;
          }
        };

        // Helper function to safely parse date
        const safeDateParse = (dateStr: string | null | undefined) => {
          if (!dateStr) return 'N/A';
          try {
            return new Date(dateStr).toLocaleTimeString();
          } catch (e) {
            return dateStr || 'N/A';
          }
        };

        return {
          id: row.trace_id,
          timestamp: safeDateParse(row.created_at),
          messageCount: safeJsonParse(row.conversation_data, []).length,
          status: row.status || 'clean',
          riskScore: row.risk_score || 0,
          detectionEvent: row.detection_event ? safeJsonParse(row.detection_event, undefined) : undefined,
          conversation: safeJsonParse(row.conversation_data, []),
          // Include audit metadata
          auditId: row.audit_id,
          conversationId: row.conversation_id,
          skillId: row.skill_id || '',
          modelName: row.model_name || '',
          overallScore: row.overall_score || 0,
          confidence: row.confidence || 'low',
          detectedTypes: safeJsonParse(row.detected_types, []),
          metrics: safeJsonParse(row.metrics, {}),
          recommendations: safeJsonParse(row.recommendations, []),
          limitations: safeJsonParse(row.limitations, []),
          usage: row.usage ? safeJsonParse(row.usage, undefined) : undefined,
          // Multi-skill fields
          skillResults: row.skill_results ? safeJsonParse(row.skill_results, []) : undefined,
          combinedScore: row.combined_score !== null && row.combined_score !== undefined ? row.combined_score : undefined,
          primaryCategory: row.primary_category || undefined,
          secondaryCategories: row.secondary_categories ? safeJsonParse(row.secondary_categories, []) : undefined,
          detectionMetadata: row.detection_metadata ? safeJsonParse(row.detection_metadata, undefined) : undefined,
          // Statistical fields
          runCount: hasStatisticalColumns ? (row.run_count || 1) : 1,
          statistics: hasStatisticalColumns && row.score_mean !== null ? {
            mean: row.score_mean,
            stddev: row.score_stddev || 0,
            quantiles: {
              p5: row.score_p5 || 0,
              p50: row.score_p50 || row.overall_score,
              p95: row.score_p95 || 0
            },
            confidenceInterval: row.score_ci_lower !== null ? {
              lower: row.score_ci_lower,
              upper: row.score_ci_upper,
              level: 0.95,
              method: 'bootstrap'
            } : undefined
          } : undefined,
          calibrationMetrics: hasStatisticalColumns && row.calibration_metrics ? safeJsonParse(row.calibration_metrics, undefined) : undefined,
          createdAt: row.created_at || new Date().toISOString(),
          updatedAt: row.updated_at || new Date().toISOString(),
        };
      });

      return new Response(
        JSON.stringify({ traces, total: traces.length }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } catch (error: any) {
      console.error('Error fetching audit results:', error);
      return new Response(
        JSON.stringify({ error: error.message || 'Failed to fetch audit results' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  } else {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

