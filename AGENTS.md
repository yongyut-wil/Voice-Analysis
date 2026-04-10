# Voice Analysis — Windsurf Agent Guide

## Project Scope

This repository is an internal TonghuaLab app for analyzing voice conversation quality.

Primary stack:

- React Router v7 in framework mode with SSR
- TypeScript strict mode
- Supabase PostgreSQL for data
- MinIO for audio storage
- Deepgram Nova-3 or LiteLLM STT
- LiteLLM for analysis model calls
- shadcn/ui + Tailwind CSS v4 + Lucide React for UI

## Source of Truth

When instructions conflict, prefer this order:

1. Existing code in the touched directory
2. `CLAUDE.md`
3. `docs/project-overview.md`
4. Generic framework defaults

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

## Database and Data Rules

Main tables:

- `audio_files`
- `analysis_results`

Important invariants:

- `audio_files.status` lifecycle is `pending -> processing -> done | error`
- emotion values are lowercase: `positive`, `neutral`, `negative`
- `analysis_results` includes `summary` and `stt_model_used`
- Use Supabase service-role access only on the server side

For schema updates:

- There is no local migration runner in normal app flow
- Schema changes are typically applied directly in Supabase
- Reflect any schema change in server code and shared types when needed

## AI Pipeline Rules

- `transcribeAudio(buffer, filename)` should return both transcription text and the STT model identifier
- `analyzeTranscription(text)` should return the structured analysis output including `summary`
- Prefer Deepgram when `DEEPGRAM_API_KEY` is configured
- LiteLLM STT is the fallback path
- Keep Thai text cleanup and repetition removal behavior intact unless intentionally changing the pipeline

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
