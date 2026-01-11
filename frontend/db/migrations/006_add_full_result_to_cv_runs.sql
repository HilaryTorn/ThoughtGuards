-- Migration: Add full_result column to cross_validation_runs table
-- This stores the complete CrossValidationResult JSON so we can retrieve
-- all pattern details, agreement metrics, and confidence breakdowns.

ALTER TABLE cross_validation_runs ADD COLUMN full_result TEXT;
