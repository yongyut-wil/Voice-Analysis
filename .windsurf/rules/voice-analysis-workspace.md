---
trigger: model_decision
description: Use this when working on Voice Analysis project code, architecture, package management, database fields, or AI pipeline behavior.
---

# Voice Analysis Workspace Rule

## Project Constraints

- This project uses `yarn` only. Do not suggest `npm install`, `npm run`, or `npx` when project commands already exist.
- Treat `CLAUDE.md` as the main project reference for conventions and architecture.
- Prefer the current codebase conventions over generic React Router starter defaults.

## Architecture

- Framework is React Router v7 in framework mode with SSR.
- Server-only work belongs in `.server.ts` modules or route `loader` and `action` functions.
- Do not import `.server.ts` modules into client-rendered components.
- Reuse existing utilities and types before introducing new abstractions.

## Data Model

- Main tables are `audio_files` and `analysis_results`.
- `audio_files.status` uses `pending`, `processing`, `done`, or `error`.
- `analysis_results` includes `summary` and `stt_model_used` in addition to the original analysis fields.
- Emotion values must remain lowercase: `positive`, `neutral`, `negative`.

## AI Pipeline

- n8n is the primary orchestration layer for analysis jobs.
- STT uses LiteLLM with the configured `LITELLM_STT_MODEL`.
- Analysis output should stay aligned with the structured schema expected by the app and database.
- Preserve Thai text cleanup and current analysis flow unless the task explicitly changes it.
