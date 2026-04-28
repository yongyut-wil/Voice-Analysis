import mindsdbSdk from "mindsdb-js-sdk";
import type SqlQueryResult from "mindsdb-js-sdk/dist/sql/sqlQueryResult";
import { extractErrorMessage } from "~/lib/error-utils";
import { logger } from "~/lib/logger";

// SDK is CJS-only (no ESM module field) — Vite SSR wraps default differently
const MindsDB = (mindsdbSdk as Record<string, unknown>).default
  ? ((mindsdbSdk as Record<string, unknown>).default as typeof mindsdbSdk)
  : mindsdbSdk;

const MINDSDB_BASE = (process.env.MINDSDB_HOST ?? "http://localhost:47334").replace(/\/$/, "");

// ── Connection management ──────────────────────────────────────────────────────

let connected = false;

async function ensureConnected(): Promise<void> {
  if (connected) return;

  try {
    // Self-hosted MindsDB — user/password can be empty strings per SDK docs
    await MindsDB.connect({
      user: "",
      password: "",
      host: MINDSDB_BASE,
    });
    connected = true;
    logger.info("mindsdb:connected", { host: MINDSDB_BASE });
  } catch (err) {
    connected = false;
    throw new Error(`MindsDB connection failed: ${extractErrorMessage(err)}`, { cause: err });
  }
}

// ── Typo Normalization ──────────────────────────────────────────────────────────

const TYPO_MAP: Record<string, string> = {
  // neutral
  netural: "neutral",
  nuteral: "neutral",
  neutal: "neutral",
  neutrel: "neutral",
  // positive
  positve: "positive",
  postive: "positive",
  possitive: "positive",
  postivie: "positive",
  // negative
  negitive: "negative",
  negtive: "negative",
  negativ: "negative",
  negatve: "negative",
};

function normalizeQuestion(question: string): { normalized: string; corrected: boolean } {
  const words = question.split(/(\s+)/); // preserve whitespace
  let corrected = false;
  const normalized = words
    .map((w) => {
      const lower = w.toLowerCase();
      if (TYPO_MAP[lower]) {
        corrected = true;
        // Preserve original casing style: if all-lower, return all-lower; else title-case
        return w === lower ? TYPO_MAP[lower] : TYPO_MAP[lower];
      }
      return w;
    })
    .join("");
  return { normalized, corrected };
}

// ── Answer Cache ────────────────────────────────────────────────────────────────

const CACHE_MAX = 50;
const CACHE_TTL_MS = 5 * 60 * 1_000; // 5 minutes

interface CacheEntry {
  answer: string;
  expiry: number;
}

const answerCache = new Map<string, CacheEntry>();

function getCached(question: string): string | null {
  const entry = answerCache.get(question);
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    answerCache.delete(question);
    return null;
  }
  return entry.answer;
}

function setCache(question: string, answer: string): void {
  // Evict oldest entries if at capacity
  if (answerCache.size >= CACHE_MAX) {
    const oldest = answerCache.keys().next().value;
    if (oldest) answerCache.delete(oldest);
  }
  answerCache.set(question, { answer, expiry: Date.now() + CACHE_TTL_MS });
}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface KBResult {
  chunk_id: string;
  chunk_content: string;
  relevance: number;
  emotion?: string;
  satisfaction_score?: number;
  illegal_detected?: boolean;
  audio_file_id?: string;
}

// ── Semantic Search (via SDK SQL) ──────────────────────────────────────────────

export async function semanticSearch(query: string, limit = 10): Promise<KBResult[]> {
  await ensureConnected();

  // NOTE: KnowledgeBases module is not available in npm v2.3.2 (only on GitHub main).
  // Using MindsDB.SQL.runQuery() instead — same result, SDK handles columnar→row conversion.
  const result: SqlQueryResult = await MindsDB.SQL.runQuery(
    `SELECT chunk_id, chunk_content, relevance, emotion, satisfaction_score, illegal_detected, audio_file_id
     FROM call_transcriptions
     WHERE content = ${JSON.stringify(query)}
     LIMIT ${limit * 10}`
  );

  if (result.type === "error") {
    throw new Error(`MindsDB error: ${result.error_message ?? "unknown"}`);
  }

  // Deduplicate by audio_file_id, keeping the highest-relevance chunk per file
  const seen = new Map<string, KBResult>();
  for (const row of result.rows) {
    const typed = row as unknown as KBResult;
    const key = typed.audio_file_id ?? typed.chunk_id;
    const existing = seen.get(key);
    if (!existing || (typed.relevance ?? 0) > (existing.relevance ?? 0)) {
      seen.set(key, typed);
    }
  }

  const results = Array.from(seen.values())
    .sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0))
    .slice(0, limit);

  logger.info("mindsdb:semantic_search", {
    query,
    hits: results.length,
    chunks: result.rows.length,
  });
  return results;
}

// ── Agent Query (via SDK SQL — no dedicated Agent JS syntax per official docs) ─

export async function askAnalyticsAgent(question: string): Promise<string> {
  // Normalize typos in domain-specific terms
  const { normalized, corrected } = normalizeQuestion(question);
  if (corrected) {
    logger.info("mindsdb:question_normalized", { original: question, normalized });
  }
  const queryQuestion = normalized;

  // Check cache first
  const cached = getCached(queryQuestion);
  if (cached) {
    logger.info("mindsdb:agent_cache_hit", { question: queryQuestion });
    return cached;
  }

  await ensureConnected();

  // Per https://docs.mindsdb.com/sdks/javascript/agents —
  // "Currently, there is no JavaScript syntax for using Agents.
  //  To use Agents from JavaScript SDK, refer to the Agents documentation
  //  in SQL and execute SQL queries."
  const result: SqlQueryResult = await MindsDB.SQL.runQuery(
    `SELECT answer FROM call_analytics_agent WHERE question = ${JSON.stringify(queryQuestion)}`
  );

  if (result.type === "error") {
    throw new Error(`MindsDB error: ${result.error_message ?? "unknown"}`);
  }

  // SDK returns rows as Record<string, any>[] — answer is in the first row's "answer" column
  let answer = "ไม่สามารถตอบได้";

  if (result.rows.length > 0) {
    const row = result.rows[0] as Record<string, unknown>;
    const val = row["answer"];
    if (val != null) {
      answer = typeof val === "string" ? val : JSON.stringify(val);
    }
  }

  const answered = answer !== "ไม่สามารถตอบได้";

  if (answered) {
    setCache(queryQuestion, answer);
  } else {
    // Log raw result for debugging unanswered queries
    logger.warn("mindsdb:agent_unanswered", {
      question: queryQuestion,
      originalQuestion: question,
      rows: result.rows.length,
      rawAnswer: result.rows.length > 0 ? result.rows[0] : null,
    });
  }

  logger.info("mindsdb:agent_query", { question: queryQuestion, answered });
  return answer;
}

// ── Configuration & Health ─────────────────────────────────────────────────────

export function isMindsDBConfigured(): boolean {
  return !!process.env.MINDSDB_HOST;
}

export async function checkMindsDBHealth(): Promise<{
  ok: boolean;
  status?: string;
  error?: string;
}> {
  try {
    const resp = await fetch(`${MINDSDB_BASE}/api/status`, {
      method: "GET",
      signal: AbortSignal.timeout(5_000),
    });
    if (!resp.ok) {
      return { ok: false, error: `HTTP ${resp.status}` };
    }
    const body = (await resp.json()) as { status?: string };
    return { ok: true, status: body.status };
  } catch (err) {
    return { ok: false, error: extractErrorMessage(err) };
  }
}
