# Voice Analysis

ระบบวิเคราะห์คุณภาพบทสนทนาเสียงอัตโนมัติ — TonghuaLab Internal Tool

## Tech Stack

- **Framework**: React Router v7 (SSR, framework mode)
- **Database**: Supabase (PostgreSQL)
- **Storage**: MinIO (S3-compatible) — bucket `voice-analysis`
- **AI (STT)**: LiteLLM → `LITELLM_STT_MODEL` (default: `gpt-4o-mini-transcribe`)
- **AI (Analysis)**: LiteLLM proxy → `LITELLM_ANALYSIS_MODEL` (default: Claude Sonnet)
- **Automation**: n8n — analysis pipeline orchestration
- **UI**: shadcn/ui + TailwindCSS v4 + Lucide React

## Getting Started

### Prerequisites

- Node.js 20+
- yarn
- Docker (for MinIO)
- Supabase project
- n8n instance with voice analysis workflows imported

### Installation

```bash
yarn install
```

### Environment Variables

Copy `.env.example` to `.env` and fill in all required values:

```bash
cp .env.example .env
```

### Development

Start MinIO (required for file storage):

```bash
docker-compose up -d
```

Start the dev server:

```bash
yarn dev
```

App runs at `http://localhost:5173`.

### Database Setup

Run migrations in Supabase SQL Editor in order:

```
supabase/migrations/001_initial.sql
supabase/migrations/002_add_summary_stt_model.sql
supabase/migrations/003_add_n8n_execution_id.sql
```

### n8n Workflows

Import all JSON files from `n8n/workflows/` into your n8n instance:

| File                               | Description                                                   |
| ---------------------------------- | ------------------------------------------------------------- |
| `00-voice-analysis-pipeline.json`  | Core STT + LLM analysis pipeline                              |
| `01-post-call-processing.json`     | Alerting: negative emotion, illegal content, low satisfaction |
| `02-daily-summary-report.json`     | Cron: daily stats to Slack                                    |
| `03-quality-gate.json`             | Transcription quality validation                              |
| `04-stuck-processing-monitor.json` | Detect stuck processing >10 min                               |

## Commands

```bash
yarn dev          # Dev server (localhost:5173)
yarn build        # Production build
yarn typecheck    # TypeScript check
docker-compose up -d  # Start MinIO
```

## Production Deployment

Build and run via Docker:

```bash
docker build -t voice-analysis .
docker run -p 3000:3000 --env-file .env voice-analysis
```

Production uses Coolify + GitHub Actions for automated deployment from `main` branch.

## Documentation

- `CLAUDE.md` — Conventions, routes structure, AI pipeline rules
- `docs/architecture.md` — System architecture and data flow diagrams
- `docs/how-it-works.md` — Step-by-step walkthrough for new developers
- `docs/auth-migration.md` — Plan for adding Supabase Auth
- `docs/metabase-dashboard.md` — Dashboard SQL queries (ID 317)
