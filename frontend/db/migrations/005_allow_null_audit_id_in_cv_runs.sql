-- Migration: Allow NULL audit_id in cross_validation_runs
-- Date: 2026-01-10
-- Purpose: Cross-validation results can be created independently of audits

-- SQLite doesn't support ALTER COLUMN, so we need to recreate the table
-- Step 1: Create new table with nullable audit_id
CREATE TABLE IF NOT EXISTS cross_validation_runs_new (
    cv_id TEXT PRIMARY KEY,
    audit_id TEXT,  -- Now nullable
    conversation_id TEXT NOT NULL,

    -- Judge models
    primary_judge TEXT NOT NULL,
    secondary_judge TEXT NOT NULL,

    -- Scores
    primary_score REAL NOT NULL,
    secondary_score REAL NOT NULL,
    score_difference REAL,

    -- Agreement
    agreement BOOLEAN,
    agreement_threshold REAL DEFAULT 0.1,
    cohens_kappa REAL,

    -- Bias detection
    self_preference_detected BOOLEAN,
    bias_magnitude REAL,

    created_at TEXT NOT NULL,

    FOREIGN KEY (audit_id) REFERENCES audit_reports(report_id),
    FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id)
);

-- Step 2: Copy data from old table (if exists)
INSERT OR IGNORE INTO cross_validation_runs_new
SELECT * FROM cross_validation_runs WHERE EXISTS (SELECT 1 FROM cross_validation_runs LIMIT 1);

-- Step 3: Drop old table
DROP TABLE IF EXISTS cross_validation_runs;

-- Step 4: Rename new table
ALTER TABLE cross_validation_runs_new RENAME TO cross_validation_runs;

-- Step 5: Recreate indexes
CREATE INDEX IF NOT EXISTS idx_cv_runs_audit ON cross_validation_runs(audit_id);
CREATE INDEX IF NOT EXISTS idx_cv_runs_agreement ON cross_validation_runs(agreement);
