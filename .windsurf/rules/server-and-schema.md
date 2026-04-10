---
trigger: glob
globs: app/lib/**/*.ts,app/types/**/*.ts
---

# Server and Schema Rule

## Server Libraries

- Keep database, storage, and AI provider calls in server-side modules.
- Use `app/lib/error-utils.ts` for error normalization and `app/lib/logger.ts` for structured logs.
- Prefer extending existing service modules over adding duplicate service layers.

## Schema Alignment

- Keep server code and shared types aligned with the current Supabase schema.
- `analysis_results` includes `summary` and `stt_model_used` and code should account for both when reading or writing analysis records.
- Reflect shape changes from STT or analysis outputs in both orchestration code and shared types.

## Analysis Flow

- Preserve the current fire-and-forget plus polling architecture unless the task explicitly requests an architectural change.
- Keep the separation between transcription and downstream analysis clear in code.
- Prefer Deepgram when configured, with LiteLLM STT as fallback.
