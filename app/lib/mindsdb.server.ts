import { extractErrorMessage } from "~/lib/error-utils";
import { logger } from "~/lib/logger";

const MINDSDB_BASE = (process.env.MINDSDB_HOST ?? "http://localhost:47334").replace(/\/$/, "");
const MINDSDB_API_KEY = process.env.MINDSDB_API_KEY ?? "";
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1_000;

interface MindsDBRawResult {
  columns?: Array<string | { name: string }>;
  data?: unknown;
  error?: string;
  type?: string;
  error_message?: string;
}

function buildHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(MINDSDB_API_KEY ? { Authorization: `Bearer ${MINDSDB_API_KEY}` } : {}),
  };
}

async function mindsdbFetch(sql: string, timeoutMs = 30_000): Promise<MindsDBRawResult> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const resp = await fetch(`${MINDSDB_BASE}/api/sql/query`, {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify({ query: sql }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        throw new Error(`MindsDB query failed: ${resp.status} ${resp.statusText} ${body}`.trim());
      }

      const result = (await resp.json()) as MindsDBRawResult;
      if (result.error || result.error_message) {
        throw new Error(`MindsDB error: ${result.error ?? result.error_message}`);
      }
      return result;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(extractErrorMessage(err));
      const isRetryable =
        lastError.message.includes("ECONNREFUSED") ||
        lastError.message.includes("fetch failed") ||
        lastError.message.includes("502") ||
        lastError.message.includes("503");

      if (!isRetryable || attempt === MAX_RETRIES) break;

      logger.warn("mindsdb:retry", {
        attempt: attempt + 1,
        delay: RETRY_DELAY_MS,
        err: lastError.message,
      });
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
    }
  }

  throw lastError ?? new Error("MindsDB query failed after retries");
}

// MindsDB HTTP API returns columnar format:
// { columns: [{name: "answer"}, ...], data: [["value1"], ["value2"], ...] }
// This helper converts it to row objects: [{ answer: "value1" }, ...]
async function mindsdbQuery(
  sql: string,
  fallbackColumns?: string[]
): Promise<Record<string, unknown>[]> {
  const result = await mindsdbFetch(sql);

  const resolvedColumns = result.columns
    ? result.columns.map((col) => (typeof col === "string" ? col : col.name))
    : (fallbackColumns ?? []);
  const rows = (result.data as unknown[][] | null) ?? [];

  return rows.map((row) => {
    const obj: Record<string, unknown> = {};
    resolvedColumns.forEach((name, i) => {
      obj[name] = row[i];
    });
    return obj;
  });
}

export interface KBResult {
  chunk_id: string;
  chunk_content: string;
  relevance: number;
  emotion?: string;
  satisfaction_score?: number;
  illegal_detected?: boolean;
  audio_file_id?: string;
}

const KB_COLUMNS = [
  "chunk_id",
  "chunk_content",
  "relevance",
  "emotion",
  "satisfaction_score",
  "illegal_detected",
  "audio_file_id",
];

export async function semanticSearch(query: string, limit = 10): Promise<KBResult[]> {
  // Fetch more chunks than needed — KB splits each transcription into multiple chunks
  const rows = await mindsdbQuery(
    `SELECT chunk_id, chunk_content, relevance, emotion, satisfaction_score, illegal_detected, audio_file_id
     FROM call_transcriptions
     WHERE content = ${JSON.stringify(query)}
     LIMIT ${limit * 10}`,
    KB_COLUMNS
  );

  // Deduplicate by audio_file_id, keeping the highest-relevance chunk per file
  const seen = new Map<string, KBResult>();
  for (const row of rows) {
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

  logger.info("mindsdb:semantic_search", { query, hits: results.length, chunks: rows.length });
  return results;
}

export async function askAnalyticsAgent(question: string): Promise<string> {
  const sql = `SELECT answer FROM call_analytics_agent WHERE question = ${JSON.stringify(question)}`;
  const result = await mindsdbFetch(sql, 60_000);

  // MindsDB Agent returns answer in 3 possible formats:
  // 1. Scalar:   data: 2          (simple count queries)
  // 2. 2D array: data: [[1]]      (complex queries, no columns header)
  // 3. null:     data: null       (agent still thinking or timed out)
  let answer = "ไม่สามารถตอบได้";

  if (result.data != null && !Array.isArray(result.data)) {
    answer = typeof result.data === "object" ? JSON.stringify(result.data) : String(result.data);
  } else if (Array.isArray(result.data) && result.data.length > 0) {
    const row = result.data[0] as unknown[];
    const val = row[0];
    if (val != null) answer = typeof val === "object" ? JSON.stringify(val) : String(val);
  }

  logger.info("mindsdb:agent_query", { question, answered: answer !== "ไม่สามารถตอบได้" });
  return answer;
}

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
