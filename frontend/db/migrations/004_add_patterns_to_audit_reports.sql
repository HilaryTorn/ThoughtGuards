-- Migration 004: Add patterns column to audit_reports table
-- This column stores taxonomy patterns detected by the taxonomy-auditor skill

-- Add patterns column (stores taxonomy triad patterns as JSON)
ALTER TABLE audit_reports ADD COLUMN patterns TEXT;
