-- Voice Analysis: Add summary and stt_model_used columns
-- Migration: 002_add_summary_stt_model.sql
-- Note: These columns were added manually via Supabase SQL Editor
--       This file documents the change for future environment setup

ALTER TABLE analysis_results
  ADD COLUMN IF NOT EXISTS summary       TEXT,
  ADD COLUMN IF NOT EXISTS stt_model_used TEXT;
