-- Voice Analysis: Initial Schema
-- Migration: 001_initial.sql

CREATE TABLE IF NOT EXISTS audio_files (
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

CREATE TABLE IF NOT EXISTS analysis_results (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audio_file_id      UUID NOT NULL REFERENCES audio_files(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_audio_files_status     ON audio_files(status);
CREATE INDEX IF NOT EXISTS idx_audio_files_created_at ON audio_files(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analysis_audio_file_id ON analysis_results(audio_file_id);
