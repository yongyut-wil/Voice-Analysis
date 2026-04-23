# Voice Analysis

ระบบวิเคราะห์คุณภาพบทสนทนาเสียงอัตโนมัติ — TonghuaLab Internal Tool

## Features

- **Audio Upload** — Drag-and-drop รองรับ MP3, WAV, M4A, OGG, WebM (สูงสุด 100 MB)
- **Speech-to-Text** — ถอดเสียงอัตโนมัติผ่าน LiteLLM STT + Thai text cleanup pipeline
- **Conversation Analysis** — สรุปบทสนทนา, วิเคราะห์อารมณ์ (positive/neutral/negative), คะแนนความพึงพอใจ (0–100), ตรวจจับเนื้อหาเสี่ยง
- **Analysis History** — ดูประวัติผลวิเคราะห์ย้อนหลังทั้งหมด
- **Result Detail** — หน้ารายละเอียดพร้อม summary, emotion badge, satisfaction score, illegal alert, transcription
- **Retry** — ลองวิเคราะห์ใหม่เมื่อ error โดยไม่ต้องอัปโหลดใหม่
- **Auto Cleanup** — ลบไฟล์เสียงจาก MinIO หลังวิเคราะห์เสร็จ
- **Semantic Search** — ค้นหาบทสนทนาด้วยความหมาย ไม่ใช่ keyword ตรง
- **Analytics Chat** — ถามคำถามภาษาธรรมชาติ เช่น "สายที่ negative วันนี้มีกี่สาย?"

## Pages

| Route           | หน้าที่                        |
| --------------- | ------------------------------ |
| `/`             | อัปโหลดไฟล์เสียง (Dropzone)    |
| `/analyses`     | ประวัติผลวิเคราะห์ทั้งหมด      |
| `/analyses/:id` | รายละเอียดผลวิเคราะห์แต่ละไฟล์ |

## Tech Stack

- **Framework**: React Router v7 (SSR, framework mode)
- **Database**: Supabase (PostgreSQL) — schema `voice_analysis`
- **Storage**: MinIO (S3-compatible) — bucket `voice-analysis`
- **AI (STT)**: LiteLLM → `LITELLM_STT_MODEL` (default: `gpt-4o-mini-transcribe`)
- **AI (Analysis)**: LiteLLM proxy → `LITELLM_ANALYSIS_MODEL` (default: Claude Sonnet)
- **Automation**: n8n — analysis pipeline orchestration
- **Analytics**: MindsDB + pgvector (Supabase) — semantic search + NL analytics agent
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

1. `supabase/migrations/001_initial.sql` — สร้าง schema `voice_analysis` และตาราง `audio_files`, `analysis_results`
2. `supabase/migrations/002_add_summary_stt_model.sql` — เพิ่มคอลัมน์ `summary`, `stt_model_used`
3. `supabase/migrations/003_add_n8n_execution_id.sql` — เพิ่มคอลัมน์ `n8n_execution_id`

> **หมายเหตุ:** ตารางทั้งหมดอยู่ใน schema `voice_analysis` (ไม่ใช่ `public`) — app ส่ง `{ db: { schema: "voice_analysis" } }` ให้ Supabase client อัตโนมัติ

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
- `docs/prd.md` — Product Requirement Document
- `docs/architecture.md` — System architecture and data flow (text-based)
- `docs/how-it-works.md` — Step-by-step walkthrough for new developers
- `docs/demo-session.md` — Demo script และ architecture overview
- `docs/mindsdb-integration.md` — MindsDB setup guide (KB + Agent + Forecasting)
- `docs/mindsdb-testing.md` — Checklist ทดสอบ MindsDB หลัง reset หรือ deploy
- `docs/reset-data.md` — วิธีล้างข้อมูลทั้งหมด (Supabase + MinIO + MindsDB KB)
- `docs/deploy-coolify.md` — Production deployment guide (Coolify + Docker)
- `docs/auth-migration.md` — Plan for adding Supabase Auth
- `docs/metabase-dashboard.md` — Dashboard SQL queries (ID 317)
- `docs/workshop/` — Workshop: MindsDB + GenAI Toolbox + PostgreSQL/Supabase
