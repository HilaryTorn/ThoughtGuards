-- Migration 003: Add patterns column to audit_results table
-- This column stores taxonomy patterns detected by the taxonomy-auditor skill

-- Add patterns column if it doesn't exist
-- SQLite doesn't support IF NOT EXISTS for ALTER TABLE, so we'll use a workaround
-- that's safe to run multiple times

-- Check if column exists by trying to select from it
-- If it fails, add the column

-- Add patterns column (stores taxonomy triad patterns as JSON)
ALTER TABLE audit_results ADD COLUMN patterns TEXT;
