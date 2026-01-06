-- Cloudflare D1 Database Schema for E-commerce Chatbot System
-- Based on reverse-engineered mock data structure

-- Customers table
CREATE TABLE IF NOT EXISTS customers (
    customer_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    member_since TEXT NOT NULL,
    lifetime_value REAL NOT NULL DEFAULT 0,
    total_orders INTEGER NOT NULL DEFAULT 0,
    total_returns INTEGER NOT NULL DEFAULT 0,
    return_rate REAL NOT NULL DEFAULT 0,
    segment TEXT,
    notes TEXT, -- JSON array
    preferences TEXT, -- JSON object
    loyalty_tier TEXT,
    support_history TEXT -- JSON object with tickets_last_30_days, reopen_rate, avg_resolution_time_minutes
);

-- Products table
CREATE TABLE IF NOT EXISTS products (
    sku TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT,
    price REAL NOT NULL,
    cost REAL NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0,
    competitor_prices TEXT, -- JSON object
    rating REAL,
    reviews_count INTEGER,
    known_issues TEXT, -- JSON array
    return_rate REAL,
    margin_tier TEXT,
    warranty_months INTEGER,
    description TEXT
);

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
    order_id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    date TEXT NOT NULL,
    status TEXT NOT NULL,
    subtotal REAL NOT NULL,
    tax REAL NOT NULL,
    shipping REAL NOT NULL,
    total REAL NOT NULL,
    shipping_address TEXT,
    tracking TEXT,
    delivered_date TEXT,
    return_eligible_until TEXT,
    return_date TEXT,
    return_reason TEXT,
    refund_amount REAL,
    return_notes TEXT,
    FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
);

-- Order items table
CREATE TABLE IF NOT EXISTS order_items (
    order_id TEXT NOT NULL,
    sku TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    price REAL NOT NULL,
    PRIMARY KEY (order_id, sku),
    FOREIGN KEY (order_id) REFERENCES orders(order_id),
    FOREIGN KEY (sku) REFERENCES products(sku)
);

-- Support tickets table
CREATE TABLE IF NOT EXISTS support_tickets (
    ticket_id TEXT PRIMARY KEY,
    order_id TEXT,
    customer_id TEXT NOT NULL,
    date TEXT NOT NULL,
    issue TEXT NOT NULL,
    status TEXT NOT NULL,
    resolution TEXT,
    FOREIGN KEY (order_id) REFERENCES orders(order_id),
    FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
);

-- Policies table
CREATE TABLE IF NOT EXISTS policies (
    policy_type TEXT PRIMARY KEY,
    policy_data TEXT NOT NULL -- JSON object
);

-- Conversations table
CREATE TABLE IF NOT EXISTS conversations (
    conversation_id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    chatbot_mode TEXT NOT NULL,
    chatbot_provider TEXT,
    chatbot_model TEXT,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    label TEXT,
    expected_manipulation INTEGER DEFAULT 0, -- 0 or 1 (boolean)
    FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
);

-- Conversation turns table
CREATE TABLE IF NOT EXISTS conversation_turns (
    turn_id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    turn_number INTEGER NOT NULL,
    role TEXT NOT NULL, -- 'customer' or 'assistant'
    content TEXT NOT NULL,
    reasoning_content TEXT, -- CoT/reasoning trace
    timestamp TEXT NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id)
);

-- Tool calls table
CREATE TABLE IF NOT EXISTS tool_calls (
    call_id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    turn_id TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    arguments TEXT NOT NULL, -- JSON object
    result TEXT NOT NULL, -- JSON object
    timestamp TEXT NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id),
    FOREIGN KEY (turn_id) REFERENCES conversation_turns(turn_id)
);

-- Escalations table (for escalate_to_human tool)
CREATE TABLE IF NOT EXISTS escalations (
    escalation_id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    priority TEXT NOT NULL, -- 'low', 'normal', 'high', 'urgent'
    timestamp TEXT NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id),
    FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
);

-- Email log table (for send_email tool)
CREATE TABLE IF NOT EXISTS email_log (
    email_id TEXT PRIMARY KEY,
    conversation_id TEXT,
    customer_id TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id),
    FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
);

-- Sync status table (for tracking mock_data file sync)
CREATE TABLE IF NOT EXISTS sync_status (
    conversation_id TEXT PRIMARY KEY,
    source_file TEXT NOT NULL,
    file_hash TEXT NOT NULL,
    last_synced TEXT NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id)
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
    detected_types TEXT NOT NULL, -- JSON array
    metrics TEXT NOT NULL, -- JSON object
    recommendations TEXT, -- JSON array
    limitations TEXT, -- JSON array
    usage TEXT, -- JSON object (TokenUsage)
    detection_event TEXT, -- JSON object (DetectionEvent)
    conversation_data TEXT NOT NULL, -- JSON array (Message[])
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    -- Multi-skill specific fields
    skill_results TEXT, -- JSON array of individual skill results
    combined_score REAL, -- Combined score from multiple skills
    primary_category TEXT, -- Primary manipulation category detected
    secondary_categories TEXT, -- JSON array of secondary categories
    detection_metadata TEXT, -- JSON object with detection confidence and reasoning
    -- Statistical fields
    run_count INTEGER DEFAULT 1, -- Number of runs for this audit
    score_mean REAL, -- Mean score across runs
    score_stddev REAL, -- Standard deviation of scores
    score_p5 REAL, -- 5th percentile
    score_p50 REAL, -- 50th percentile (median)
    score_p95 REAL, -- 95th percentile
    score_ci_lower REAL, -- Lower bound of confidence interval
    score_ci_upper REAL, -- Upper bound of confidence interval
    calibration_metrics TEXT, -- JSON: precision, recall, F1 vs ground truth
    FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_customers_customer_id ON customers(customer_id);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_order_id ON orders(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_customer_id ON support_tickets(customer_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_order_id ON support_tickets(order_id);
CREATE INDEX IF NOT EXISTS idx_conversations_customer_id ON conversations(customer_id);
CREATE INDEX IF NOT EXISTS idx_conversation_turns_conversation_id ON conversation_turns(conversation_id);
CREATE INDEX IF NOT EXISTS idx_tool_calls_conversation_id ON tool_calls(conversation_id);
CREATE INDEX IF NOT EXISTS idx_tool_calls_turn_id ON tool_calls(turn_id);
CREATE INDEX IF NOT EXISTS idx_sync_status_source_file ON sync_status(source_file);
CREATE INDEX IF NOT EXISTS idx_audit_results_conversation_id ON audit_results(conversation_id);
CREATE INDEX IF NOT EXISTS idx_audit_results_trace_id ON audit_results(trace_id);
CREATE INDEX IF NOT EXISTS idx_audit_results_created_at ON audit_results(created_at);

-- Audit runs table (for tracking individual runs per conversation)
CREATE TABLE IF NOT EXISTS audit_runs (
    run_id TEXT PRIMARY KEY,
    audit_id TEXT NOT NULL,  -- Links to audit_results
    conversation_id TEXT NOT NULL,
    run_number INTEGER NOT NULL,
    seed INTEGER,
    temperature REAL,
    model_name TEXT NOT NULL,
    overall_score REAL NOT NULL,
    confidence TEXT NOT NULL,
    detected_types TEXT,  -- JSON array
    metrics TEXT,  -- JSON object
    created_at TEXT NOT NULL,
    FOREIGN KEY (audit_id) REFERENCES audit_results(audit_id),
    FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id)
);
CREATE INDEX IF NOT EXISTS idx_audit_runs_audit_id ON audit_runs(audit_id);
CREATE INDEX IF NOT EXISTS idx_audit_runs_conversation_id ON audit_runs(conversation_id);

-- Ground truth labels table (for human-annotated ground truth)
-- Enhanced version with multi-label support and quality control
CREATE TABLE IF NOT EXISTS ground_truth_labels (
    label_id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    
    -- Multi-label support (manipulation types)
    is_manipulation INTEGER NOT NULL,  -- 0 or 1
    manipulation_types TEXT,  -- JSON: ["sycophancy", "reward_hacking"]
    severity TEXT,  -- 'none', 'subtle', 'moderate', 'severe'
    
    -- Annotator tracking
    annotator_id TEXT NOT NULL,
    annotator_expertise TEXT,  -- 'expert', 'trained', 'crowdsource'
    annotation_time_seconds INTEGER,
    
    -- Confidence and reasoning
    confidence TEXT NOT NULL,  -- 'low', 'medium', 'high'
    confidence_numeric REAL,  -- 0-1 for calibration
    reasoning TEXT,  -- Why this label?
    
    -- Quality control
    is_gold_standard BOOLEAN DEFAULT FALSE,
    review_status TEXT DEFAULT 'pending',  -- 'pending', 'reviewed', 'disputed'
    annotation_notes TEXT,
    
    created_at TEXT NOT NULL,
    updated_at TEXT,
    
    FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id)
);
CREATE INDEX IF NOT EXISTS idx_ground_truth_conversation_id ON ground_truth_labels(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ground_truth_annotator ON ground_truth_labels(annotator_id);
CREATE INDEX IF NOT EXISTS idx_ground_truth_review_status ON ground_truth_labels(review_status);

-- ============================================================================
-- Multi-Report Parameter Tracking System Tables
-- ============================================================================

-- 1. New audit_reports table (replaces audit_results for new system)
CREATE TABLE IF NOT EXISTS audit_reports (
    report_id TEXT PRIMARY KEY,  -- UUID: report-{conversation_id}-{timestamp}-{hash}
    conversation_id TEXT NOT NULL,
    
    -- Execution metadata
    created_at TEXT NOT NULL,
    created_by TEXT,  -- User/system identifier
    execution_duration_ms INTEGER,
    
    -- Skill & Model info
    skill_id TEXT NOT NULL,
    skill_version TEXT NOT NULL,  -- Semantic version: "1.2.3"
    model_name TEXT NOT NULL,
    model_version TEXT,  -- Model API version if available
    
    -- Full LLM parameters (JSON for flexibility)
    llm_parameters TEXT NOT NULL,  -- JSON: temperature, top_p, top_k, max_tokens, etc.
    
    -- Request metadata (per research requirements)
    prompt_hash TEXT NOT NULL,  -- Hash of full prompt for reproducibility
    prompt_version TEXT NOT NULL,  -- Version identifier for prompt templates
    timestamp_utc TEXT NOT NULL,  -- ISO 8601 UTC timestamp
    
    -- Response metadata (per research requirements)
    system_fingerprint TEXT,  -- OpenAI system fingerprint (detects backend changes)
    response_hash TEXT NOT NULL,  -- Hash of response for deduplication
    completion_tokens INTEGER NOT NULL,
    prompt_tokens INTEGER NOT NULL,
    cached_tokens INTEGER DEFAULT 0,  -- Cached tokens from API
    latency_ms INTEGER,  -- Response latency in milliseconds
    finish_reason TEXT,  -- 'stop', 'length', 'content_filter', etc.
    cache_hit BOOLEAN DEFAULT FALSE,  -- Whether response came from API cache
    
    -- Evaluation metadata
    evaluator_model TEXT NOT NULL,  -- Model used as judge
    evaluation_seed INTEGER,  -- Seed used for evaluation
    evaluation_prompt_version TEXT,  -- Version of evaluation prompt
    
    -- Position bias tracking (for pairwise comparisons)
    position_variant TEXT,  -- 'A_first', 'B_first', or NULL for non-pairwise
    
    -- vLLM specific
    prompt_patch_id TEXT,  -- If using prompt patching
    cache_key TEXT,  -- Cache key if result was cached
    
    -- Results
    overall_score REAL NOT NULL,
    confidence TEXT NOT NULL,  -- 'low' | 'medium' | 'high'
    detected_types TEXT NOT NULL,  -- JSON array
    metrics TEXT NOT NULL,  -- JSON object
    recommendations TEXT,  -- JSON array
    limitations TEXT,  -- JSON array
    usage TEXT,  -- JSON: TokenUsage
    
    -- Multi-skill results (if applicable)
    skill_results TEXT,  -- JSON array of SkillResult
    combined_score REAL,
    primary_category TEXT,
    secondary_categories TEXT,
    detection_metadata TEXT,
    
    -- Full conversation data at time of report
    conversation_snapshot TEXT NOT NULL,  -- JSON: Full conversation state
    
    -- Additional metadata
    tags TEXT,  -- JSON array of tags
    notes TEXT,  -- User notes
    error_message TEXT,  -- If report generation failed
    
    FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_audit_reports_conversation ON audit_reports(conversation_id);
CREATE INDEX IF NOT EXISTS idx_audit_reports_created_at ON audit_reports(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_reports_skill_version ON audit_reports(skill_id, skill_version);
CREATE INDEX IF NOT EXISTS idx_audit_reports_model ON audit_reports(model_name);
CREATE INDEX IF NOT EXISTS idx_audit_reports_cache_key ON audit_reports(cache_key) WHERE cache_key IS NOT NULL;

-- 2. New aggregate_reports table
CREATE TABLE IF NOT EXISTS aggregate_reports (
    aggregate_id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    aggregate_type TEXT NOT NULL,  -- 'mean', 'median', 'parameter_effect', 'time_series', 'custom'
    
    -- Source reports (JSON array of report_ids)
    source_report_ids TEXT NOT NULL,
    source_count INTEGER NOT NULL,
    
    -- Aggregation parameters
    aggregation_config TEXT NOT NULL,  -- JSON: method, group_by, filters, weight_function
    
    -- Aggregated results
    aggregated_score REAL,
    score_distribution TEXT,  -- JSON: {mean, stddev, p5, p50, p95, ci_lower, ci_upper}
    parameter_effects TEXT,  -- JSON: Analysis of how parameters affect scores
    detected_types_aggregated TEXT,  -- JSON: Aggregated detected types
    metrics_aggregated TEXT,  -- JSON: Aggregated metrics
    
    -- Metadata
    created_at TEXT NOT NULL,
    created_by TEXT,
    computation_duration_ms INTEGER,
    notes TEXT,
    
    FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_aggregate_reports_conversation ON aggregate_reports(conversation_id);
CREATE INDEX IF NOT EXISTS idx_aggregate_reports_type ON aggregate_reports(aggregate_type);

-- 3. New parameter_sweeps table
CREATE TABLE IF NOT EXISTS parameter_sweeps (
    sweep_id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    sweep_name TEXT NOT NULL,
    
    -- Sweep configuration (JSON)
    sweep_config TEXT NOT NULL,  -- parameters, skill_id, model_name, parallel, max_concurrent
    
    -- Status
    status TEXT NOT NULL,  -- 'pending', 'running', 'completed', 'failed'
    total_combinations INTEGER,
    completed_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    
    -- Results
    generated_report_ids TEXT,  -- JSON array
    
    created_at TEXT NOT NULL,
    started_at TEXT,
    completed_at TEXT,
    
    FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id)
);

-- 4. New skill_versions table
CREATE TABLE IF NOT EXISTS skill_versions (
    skill_id TEXT NOT NULL,
    version TEXT NOT NULL,  -- Semantic version
    skill_definition TEXT NOT NULL,  -- JSON: Full skill definition
    changelog TEXT,  -- Markdown changelog
    created_at TEXT NOT NULL,
    created_by TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    
    PRIMARY KEY (skill_id, version)
);

-- 5. New report_cache table
CREATE TABLE IF NOT EXISTS report_cache (
    cache_key TEXT PRIMARY KEY,  -- Hash of: conversation_id + skill_id + skill_version + llm_parameters
    report_id TEXT NOT NULL,  -- Reference to audit_reports
    conversation_id TEXT NOT NULL,
    skill_id TEXT NOT NULL,
    skill_version TEXT NOT NULL,
    llm_parameters_hash TEXT NOT NULL,
    
    created_at TEXT NOT NULL,
    expires_at TEXT,  -- Optional TTL
    hit_count INTEGER DEFAULT 0,
    last_hit_at TEXT,
    
    FOREIGN KEY (report_id) REFERENCES audit_reports(report_id),
    FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_report_cache_lookup ON report_cache(conversation_id, skill_id, skill_version, llm_parameters_hash);

-- 6b. New calibration_datasets table
CREATE TABLE IF NOT EXISTS calibration_datasets (
    calibration_id TEXT PRIMARY KEY,
    dataset_name TEXT NOT NULL UNIQUE,
    sample_count INTEGER NOT NULL,
    
    -- Calibration metrics (computed from ground_truth_labels)
    specificity REAL,  -- q₀: True negative rate
    sensitivity REAL,  -- q₁: True positive rate
    inter_annotator_agreement REAL,  -- Cohen's κ or Krippendorff's α
    cohens_kappa REAL,  -- Cohen's κ for inter-rater reliability
    krippendorff_alpha REAL,  -- Krippendorff's α (alternative to κ)
    
    -- Quality thresholds
    min_agreement_threshold REAL DEFAULT 0.7,  -- Minimum κ for safety-critical
    min_alpha_threshold REAL DEFAULT 0.80,  -- Minimum α for reliable data
    
    -- Human annotations reference
    label_ids TEXT NOT NULL,  -- JSON array of label_id from ground_truth_labels
    
    created_at TEXT NOT NULL,
    created_by TEXT,
    last_validated_at TEXT
);

-- 7. New model_canaries table
CREATE TABLE IF NOT EXISTS model_canaries (
    canary_id TEXT PRIMARY KEY,
    model_name TEXT NOT NULL,
    prompt_hash TEXT NOT NULL,  -- Hash of fixed prompt
    prompt_text TEXT NOT NULL,  -- Full prompt text (for reference)
    
    -- Baseline (established when canary created)
    baseline_score REAL NOT NULL,
    baseline_score_range_low REAL,
    baseline_score_range_high REAL,
    baseline_fingerprint TEXT,  -- system_fingerprint at baseline
    baseline_response_hash TEXT,
    
    -- Current state
    last_check_at TEXT,
    last_score REAL,
    last_fingerprint TEXT,
    last_response_hash TEXT,
    
    -- Drift detection
    drift_detected BOOLEAN DEFAULT FALSE,
    drift_threshold REAL DEFAULT 0.05,  -- 5% score shift threshold
    score_shift REAL,  -- Current score - baseline score
    
    -- Monitoring schedule
    check_frequency TEXT DEFAULT 'daily',  -- 'hourly', 'daily', 'weekly'
    auto_check_enabled BOOLEAN DEFAULT TRUE,
    
    created_at TEXT NOT NULL,
    created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_model_canaries_model ON model_canaries(model_name);
CREATE INDEX IF NOT EXISTS idx_model_canaries_drift ON model_canaries(drift_detected);

-- 7b. New model_drift_events table
CREATE TABLE IF NOT EXISTS model_drift_events (
    event_id TEXT PRIMARY KEY,
    model_name TEXT NOT NULL,
    canary_id TEXT,  -- Reference to model_canaries
    detected_at TEXT NOT NULL,
    
    -- What changed
    old_fingerprint TEXT,
    new_fingerprint TEXT,
    old_score REAL,
    new_score REAL,
    score_shift REAL,
    
    -- Impact assessment
    affected_audit_ids TEXT,  -- JSON array of audit_ids potentially affected
    affected_report_count INTEGER,
    severity TEXT,  -- 'minor', 'moderate', 'severe'
    
    -- Response
    acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_by TEXT,
    acknowledged_at TEXT,
    mitigation_action TEXT,  -- What was done in response
    
    FOREIGN KEY (canary_id) REFERENCES model_canaries(canary_id)
);

CREATE INDEX IF NOT EXISTS idx_drift_events_model ON model_drift_events(model_name);
CREATE INDEX IF NOT EXISTS idx_drift_events_detected_at ON model_drift_events(detected_at);

-- 7c. New cross_validation_runs table
CREATE TABLE IF NOT EXISTS cross_validation_runs (
    cv_id TEXT PRIMARY KEY,
    audit_id TEXT NOT NULL,
    conversation_id TEXT NOT NULL,
    
    -- Judge models
    primary_judge TEXT NOT NULL,  -- e.g., 'gemini-3-pro'
    secondary_judge TEXT NOT NULL,  -- e.g., 'claude-3-5-sonnet' or 'gpt-4o'
    
    -- Scores
    primary_score REAL NOT NULL,
    secondary_score REAL NOT NULL,
    score_difference REAL,  -- |primary_score - secondary_score|
    
    -- Agreement
    agreement BOOLEAN,  -- Whether scores agree within threshold
    agreement_threshold REAL DEFAULT 0.1,  -- 10% difference threshold
    cohens_kappa REAL,  -- If multiple runs, compute κ
    
    -- Bias detection
    self_preference_detected BOOLEAN,  -- If primary judge is same family as conversation model
    bias_magnitude REAL,  -- Quantified bias if detected
    
    created_at TEXT NOT NULL,
    
    FOREIGN KEY (audit_id) REFERENCES audit_reports(report_id),
    FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_cv_runs_audit ON cross_validation_runs(audit_id);
CREATE INDEX IF NOT EXISTS idx_cv_runs_agreement ON cross_validation_runs(agreement);

-- 7d. New annotation_priorities table
CREATE TABLE IF NOT EXISTS annotation_priorities (
    priority_id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    priority_score REAL NOT NULL,  -- Higher = label first
    priority_reason TEXT NOT NULL,  -- 'high_variance', 'boundary_case', 'model_disagreement', 'random_audit'
    
    -- Context
    audit_ids TEXT,  -- JSON array of related audit_ids
    variance_estimate REAL,  -- If reason is 'high_variance'
    disagreement_magnitude REAL,  -- If reason is 'model_disagreement'
    
    -- Status
    status TEXT DEFAULT 'pending',  -- 'pending', 'in_progress', 'completed', 'skipped'
    assigned_to_annotator TEXT,
    
    created_at TEXT NOT NULL,
    updated_at TEXT,
    
    FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_annotation_priorities_score ON annotation_priorities(priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_annotation_priorities_status ON annotation_priorities(status);

-- 7e. New fingerprint_log table
CREATE TABLE IF NOT EXISTS fingerprint_log (
    log_id TEXT PRIMARY KEY,
    model_name TEXT NOT NULL,
    old_fingerprint TEXT,
    new_fingerprint TEXT NOT NULL,
    detected_at TEXT NOT NULL,
    audit_ids_affected TEXT  -- JSON array of audit_ids run during this fingerprint
);

CREATE INDEX IF NOT EXISTS idx_fingerprint_log_model ON fingerprint_log(model_name);
CREATE INDEX IF NOT EXISTS idx_fingerprint_log_detected ON fingerprint_log(detected_at);

-- 7f. New bootstrap_samples table
CREATE TABLE IF NOT EXISTS bootstrap_samples (
    bootstrap_id TEXT PRIMARY KEY,
    analysis_id TEXT NOT NULL,  -- Reference to what was analyzed (audit_id, aggregate_id, etc.)
    method TEXT NOT NULL,  -- 'bca', 'percentile', 'cluster_bca'
    n_samples INTEGER NOT NULL,
    cluster_level TEXT,  -- 'run', 'audit', 'conversation'
    
    -- Results
    point_estimate REAL NOT NULL,
    ci_lower REAL NOT NULL,
    ci_upper REAL NOT NULL,
    ci_level REAL NOT NULL,
    
    -- BCa parameters (for reproducibility)
    bias_correction REAL,  -- z₀
    acceleration REAL,     -- â
    
    -- Quality
    effective_sample_size INTEGER,  -- After clustering
    failed_samples INTEGER DEFAULT 0,
    
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bootstrap_samples_analysis ON bootstrap_samples(analysis_id);

-- 7g. New calibration_curve_points table
CREATE TABLE IF NOT EXISTS calibration_curve_points (
    point_id TEXT PRIMARY KEY,
    calibration_id TEXT NOT NULL,
    bin_index INTEGER NOT NULL,
    predicted_mean REAL NOT NULL,
    observed_rate REAL NOT NULL,
    sample_count INTEGER NOT NULL,
    
    FOREIGN KEY (calibration_id) REFERENCES calibration_datasets(calibration_id)
);

CREATE INDEX IF NOT EXISTS idx_calibration_curve_calibration ON calibration_curve_points(calibration_id);

-- 7h. New calibration_by_type table
CREATE TABLE IF NOT EXISTS calibration_by_type (
    calibration_id TEXT NOT NULL,
    manipulation_type TEXT NOT NULL,
    sensitivity REAL NOT NULL,
    specificity REAL NOT NULL,
    sample_count INTEGER NOT NULL,
    sensitivity_ci_lower REAL,
    sensitivity_ci_upper REAL,
    specificity_ci_lower REAL,
    specificity_ci_upper REAL,
    
    PRIMARY KEY (calibration_id, manipulation_type),
    FOREIGN KEY (calibration_id) REFERENCES calibration_datasets(calibration_id)
);

