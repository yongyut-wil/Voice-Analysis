---
trigger: glob
globs: app/lib/**/*.ts,app/types/**/*.ts
---

# Server and Schema Rule

## Server Libraries

- Keep database, storage, and AI provider calls in server-side modules.
- Use `app/lib/error-utils.ts` for error normalization and `app/lib/logger.ts` for structured logs.
- Prefer extending existing service modules over adding duplicate service layers.
- `app/lib/mindsdb.server.ts` — MindsDB HTTP client; use `mindsdbFetch()` (shared fetch primitive) for all MindsDB calls. Do not duplicate auth headers or base URL logic.
- `app/lib/litellm.server.ts` — LiteLLM client via `getLiteLLMClient()`; reuse this for any new LLM calls including function calling.

## Schema Alignment

- Keep server code and shared types aligned with the current Supabase schema.
- `analysis_results` includes `summary` and `stt_model_used` and code should account for both when reading or writing analysis records.
- Reflect shape changes from STT or analysis outputs in both orchestration code and shared types.

## Analysis Flow

- Preserve the current fire-and-forget plus polling architecture unless the task explicitly requests an architectural change.
- Keep the separation between transcription and downstream analysis clear in code.
- Prefer the current n8n-first orchestration with LiteLLM as the active STT path.

## MindsDB Response Format

- MindsDB returns columnar format: `{ columns: [...], data: [[...], ...] }`. Use `mindsdbQuery()` to convert to row objects.
- MindsDB Agent (`call_analytics_agent`) returns 3 formats: scalar, `[[value]]`, or `null`. The existing `askAnalyticsAgent()` handles all three.
- Knowledge Base (`call_transcriptions`) splits long transcriptions into multiple chunks. Always deduplicate results by `audio_file_id`.
