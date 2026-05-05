# Voice Analysis — Windsurf Agent Guide

## Project Scope

This repository is an internal TonghuaLab app for analyzing voice conversation quality.

Primary stack:

- React Router v7 in framework mode with SSR
- TypeScript strict mode
- Supabase PostgreSQL for data
- MinIO for audio storage
- LiteLLM STT and analysis run directly in server-side Node.js flow by default
- n8n remains available as an optional orchestration / callback integration path
- shadcn/ui + Tailwind CSS v4 + Lucide React for UI

## Source of Truth

When instructions conflict, prefer this order:

1. Existing code in the touched directory
2. `CLAUDE.md`
3. `docs/status.md` (for current feature status)
4. `docs/project-overview.md`
5. Generic framework defaults

Do not follow the default `README.md` commands if they conflict with the project conventions. This project uses `yarn`, not `npm`.

## Core Project Rules

- Use `yarn` only for install, dev, build, and typecheck workflows.
- Keep server-only logic in `.server.ts` files or React Router `loader` and `action` functions.
- Never import `.server.ts` modules into client-rendered route components or client components.
- Prefer existing types from `app/types/analysis.ts` over redefining inline types.
- Keep API routes inside `app/routes/api/` and export route handlers only.
- Prefer existing shadcn/ui primitives from `~/components/ui/` before introducing new base components.
- Use Lucide React for icons.
- Do not hardcode visual colors if matching CSS variables already exist.
- Reuse existing components like `semantic-search.tsx` before building new search UI.

## Database and Data Rules

Main tables (schema: `public`):

- `audio_files`
- `analysis_results`

Important invariants:

- `audio_files.status` lifecycle is `pending -> processing -> done | error`
- emotion values are lowercase: `positive`, `neutral`, `negative`
- `analysis_results` includes `summary` and `stt_model_used`
- Use Supabase service-role access only on the server side

### Schema Source of Truth

**`supabase/schema.sql` is the single canonical schema file** — it contains every table, column, index, and policy in one place and is safe to run from scratch.

For schema updates:

- There is no local migration runner in normal app flow
- Apply SQL directly via **Supabase Dashboard → SQL Editor**
- **After any schema change** (add column, new table, new index, new policy), you MUST also update `supabase/schema.sql` to reflect the new state
- The individual `supabase/migrations/` files remain as historical audit trail — do not delete them, but `schema.sql` is the go-to reference
- Reflect any schema change in server code and shared types (`app/types/analysis.ts`) when needed

## AI Pipeline Rules

- `transcribeAudio(buffer, filename)` should return both transcription text and the STT model identifier
- `analyzeTranscription(text)` should return the structured analysis output including `summary`
- `runAnalysis(...)` in `app/lib/analysis.server.ts` is the direct orchestration path used when `SKIP_N8N=true`
- `n8n` integration is optional and should be treated as a fallback / alternate path when `SKIP_N8N=false`
- LiteLLM STT is the active speech-to-text path
- Keep Thai text cleanup and repetition removal behavior intact unless intentionally changing the pipeline

## MindsDB Analytics

- MindsDB adds semantic search and NL analytics on top of Supabase — it does not replace n8n or LiteLLM
- `app/lib/mindsdb.server.ts` exposes `semanticSearch()` and `askAnalyticsAgent()`
- Semantic search deduplicates by `audio_file_id` — MindsDB splits transcriptions into chunks, always return one result per audio file
- Both analytics features are conditional on `MINDSDB_HOST` being set; return 503 otherwise
- GenAI Toolbox integration is planned (`tools.workshop.yaml` exists) but not yet in production

## React Router Conventions

- Use loader/action patterns consistently
- Avoid unhandled loader throws for routine not-found or empty states when the existing route expects safe fallbacks
- Follow the route structure already defined in `app/routes.ts`

## Quality Guardrails

Before making meaningful code changes:

- Check whether the touched file is server-only or client-rendered
- Reuse existing utilities in `app/lib/error-utils.ts` and `app/lib/logger.ts`
- Preserve structured logging patterns for server operations
- Prefer small targeted edits over broad refactors

Before finishing a task that changes code:

- Run or recommend `yarn typecheck` when relevant
- Call out any required environment variables or Supabase schema dependencies
