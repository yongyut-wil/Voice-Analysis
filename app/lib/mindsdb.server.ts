import { logger } from "~/lib/logger";

const MINDSDB_BASE = (process.env.MINDSDB_HOST ?? "http://localhost:47334").replace(/\/$/, "");

async function mindsdbFetch(sql: string, timeoutMs = 30_000) {
  const apiKey = process.env.MINDSDB_API_KEY ?? "";
  const resp = await fetch(`${MINDSDB_BASE}/api/sql/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({ query: sql }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!resp.ok) throw new Error(`MindsDB query failed: ${resp.status} ${resp.statusText}`);
  return resp.json() as Promise<{
    columns?: Array<string | { name: string }>;
    data?: unknown;
    error?: string;
  }>;
}

// MindsDB HTTP API returns columnar format:
// { columns: [{name: "answer"}, ...], data: [["value1"], ["value2"], ...] }
// This helper converts it to row objects: [{ answer: "value1" }, ...]
async function mindsdbQuery(
  sql: string,
  fallbackColumns?: string[]
): Promise<Record<string, unknown>[]> {
  const result = await mindsdbFetch(sql);
  if (result.error) throw new Error(`MindsDB error: ${result.error}`);

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
  for (const row of rows as unknown as KBResult[]) {
    const key = row.audio_file_id ?? row.chunk_id;
    const existing = seen.get(key);
    if (!existing || (row.relevance ?? 0) > (existing.relevance ?? 0)) {
      seen.set(key, row);
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
  if (result.error) throw new Error(`MindsDB error: ${result.error}`);

  // MindsDB Agent returns answer in 3 possible formats:
  // 1. Scalar:   data: 2          (simple count queries)
  // 2. 2D array: data: [[1]]      (complex queries, no columns header)
  // 3. null:     data: null       (agent still thinking or timed out)
  let answer = "ไม่สามารถตอบได้";

  if (result.data != null && !Array.isArray(result.data)) {
    answer = String(result.data);
  } else if (Array.isArray(result.data) && result.data.length > 0) {
    const row = result.data[0] as unknown[];
    const val = row[0];
    if (val != null) answer = String(val);
  }

  logger.info("mindsdb:agent_query", { question, answered: answer !== "ไม่สามารถตอบได้" });
  return answer;
}

export function isMindsDBConfigured(): boolean {
  return !!process.env.MINDSDB_HOST;
}
