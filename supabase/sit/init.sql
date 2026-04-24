-- Voice Analysis — SIT PostgreSQL Initialization
-- รันครั้งแรกเมื่อ container สร้างขึ้นใหม่ (docker-entrypoint-initdb.d)
--
-- ไฟล์นี้รวม:
--   1. Migration 001: tables audio_files + analysis_results
--   2. Migration 002: ADD COLUMN summary, stt_model_used
--   3. Migration 003: ADD COLUMN n8n_execution_id
--   4. Grants: ให้ roles ที่ PostgREST ใช้เข้าถึง tables ได้

-- ─────────────────────────────────────────────
-- Migration 001: audio_files + analysis_results
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS voice_analysis.audio_files (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename      TEXT NOT NULL,
  original_name TEXT NOT NULL,
  file_size     BIGINT,
  duration      FLOAT,
  mime_type     TEXT,
  storage_url   TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'processing', 'done', 'error')),
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS voice_analysis.analysis_results (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audio_file_id      UUID NOT NULL REFERENCES voice_analysis.audio_files(id) ON DELETE CASCADE,
  transcription      TEXT,
  emotion            TEXT CHECK (emotion IN ('neutral', 'positive', 'negative')),
  emotion_score      FLOAT CHECK (emotion_score BETWEEN 0 AND 1),
  satisfaction_score INT  CHECK (satisfaction_score BETWEEN 0 AND 100),
  illegal_detected   BOOLEAN NOT NULL DEFAULT false,
  illegal_details    TEXT,
  model_used         TEXT,
  processing_time_ms INT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audio_files_status     ON voice_analysis.audio_files(status);
CREATE INDEX IF NOT EXISTS idx_audio_files_created_at ON voice_analysis.audio_files(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analysis_audio_file_id ON voice_analysis.analysis_results(audio_file_id);

-- ─────────────────────────────────────────────
-- Migration 002: summary + stt_model_used
-- ─────────────────────────────────────────────
ALTER TABLE voice_analysis.analysis_results
  ADD COLUMN IF NOT EXISTS summary       TEXT,
  ADD COLUMN IF NOT EXISTS stt_model_used TEXT;

-- ─────────────────────────────────────────────
-- Migration 003: n8n_execution_id
-- ─────────────────────────────────────────────
ALTER TABLE voice_analysis.audio_files ADD COLUMN IF NOT EXISTS n8n_execution_id TEXT;

-- ─────────────────────────────────────────────
-- Grants: PostgREST roles (supabase/postgres image สร้าง roles เหล่านี้ไว้แล้ว)
-- service_role ใช้ใน server-side queries (bypass RLS)
-- anon ใช้สำหรับ unauthenticated requests
-- ─────────────────────────────────────────────
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- default privileges: tables/sequences ที่สร้างทีหลังก็ได้ grant อัตโนมัติ
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
