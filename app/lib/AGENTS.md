# Server Library Rules

This directory contains server-side logic for database, storage, AI calls, logging, and analysis orchestration.

## Scope

Applies to files under `app/lib/**`.

## Rules

- Treat `.server.ts` modules here as server-only boundaries.
- Do not introduce browser APIs in `.server.ts` files unless they are valid in the Node runtime used by this app.
- Keep secrets and external service access in this directory or in route loaders/actions, not in UI components.
- Reuse existing helpers before adding new utility layers.

## Responsibilities by File

- `supabase.server.ts`: database reads and writes
- `minio.server.ts`: object storage operations
- `litellm.server.ts`: STT and analysis model calls
- `analysis.server.ts`: end-to-end analysis orchestration
- `error-utils.ts`: shared error normalization
- `logger.ts`: structured logging

## Implementation Expectations

- Preserve the separation between STT and analysis steps.
- When saving analysis results, keep DB fields aligned with the current schema, including `summary` and `stt_model_used`.
- Use existing logging and error formatting utilities instead of ad hoc `console.log` or custom error strings.
- Keep long-running analysis flow compatible with the current fire-and-forget plus polling design unless the task explicitly changes architecture.

## High-Risk Areas

- Importing server modules into route components will break Vite builds.
- Changes to STT response shapes must be propagated to `analysis.server.ts` and shared types.
- Changes to DB columns must stay synchronized with Supabase schema.
