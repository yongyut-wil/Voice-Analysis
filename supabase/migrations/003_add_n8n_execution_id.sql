-- Add n8n_execution_id column for tracing analysis runs
-- between Supabase records and n8n execution logs
ALTER TABLE audio_files ADD COLUMN IF NOT EXISTS n8n_execution_id TEXT;
