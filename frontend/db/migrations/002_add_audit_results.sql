-- Migration: Add audit_results table and related tables
-- SAFE MIGRATION: Creates tables only if they don't exist (preserves existing data)

-- Sync status table
CREATE TABLE IF NOT EXISTS sync_status (
    source_file TEXT PRIMARY KEY,
    last_synced TEXT NOT NULL,
    conversation_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    error_message TEXT
);

-- Audit results table (for storing audit reports)
CREATE TABLE IF NOT EXISTS audit_results (
    audit_id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    trace_id TEXT NOT NULL UNIQUE,
    skill_id TEXT NOT NULL,
    model_name TEXT NOT NULL,
    overall_score REAL NOT NULL,
    confidence TEXT NOT NULL,
    status TEXT NOT NULL,
    risk_score INTEGER NOT NULL,
    detected_types TEXT NOT NULL,
    metrics TEXT NOT NULL,
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
    run_count INTEGER DEFAULT 1,
    score_mean REAL,
    score_stddev REAL,
    score_p5 REAL,
    score_p50 REAL,
    score_p95 REAL,
    score_ci_lower REAL,
    score_ci_upper REAL,
    calibration_metrics TEXT,
    FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id)
);

-- Indexes for audit_results
CREATE INDEX IF NOT EXISTS idx_audit_results_conversation_id ON audit_results(conversation_id);
CREATE INDEX IF NOT EXISTS idx_audit_results_trace_id ON audit_results(trace_id);
CREATE INDEX IF NOT EXISTS idx_audit_results_created_at ON audit_results(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_results_primary_category ON audit_results(primary_category);
CREATE INDEX IF NOT EXISTS idx_audit_results_model_name ON audit_results(model_name);

-- Audit runs table
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
);

CREATE INDEX IF NOT EXISTS idx_audit_runs_audit_id ON audit_runs(audit_id);
CREATE INDEX IF NOT EXISTS idx_audit_runs_conversation_id ON audit_runs(conversation_id);

-- Ground truth labels table
CREATE TABLE IF NOT EXISTS ground_truth_labels (
    label_id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL UNIQUE,
    is_manipulation INTEGER NOT NULL,
    manipulation_type TEXT,
    severity TEXT,
    labeler TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_ground_truth_conversation_id ON ground_truth_labels(conversation_id);

-- Aggregate reports table
CREATE TABLE IF NOT EXISTS aggregate_reports (
    report_id TEXT PRIMARY KEY,
    report_type TEXT NOT NULL,
    model_name TEXT,
    date_range_start TEXT,
    date_range_end TEXT,
    total_conversations INTEGER NOT NULL,
    total_detections INTEGER NOT NULL,
    detection_rate REAL NOT NULL,
    category_breakdown TEXT,
    confidence_distribution TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_aggregate_reports_type ON aggregate_reports(report_type);
CREATE INDEX IF NOT EXISTS idx_aggregate_reports_model ON aggregate_reports(model_name);

-- Report cache table
CREATE TABLE IF NOT EXISTS report_cache (
    cache_key TEXT PRIMARY KEY,
    report_data TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_report_cache_expires ON report_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_sync_status_source_file ON sync_status(source_file);
