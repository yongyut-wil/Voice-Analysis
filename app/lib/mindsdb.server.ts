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
let mindsdbToken = "";

async function ensureMindsDBAuth(): Promise<{ token: string; cookie: string }> {
  if (mindsdbToken) return { token: mindsdbToken, cookie: "" };

  const user = process.env.MINDSDB_USERNAME ?? "admin";
  const password = process.env.MINDSDB_PASSWORD ?? "admin123";

  try {
    const resp = await fetch(`${MINDSDB_BASE}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: user, password }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!resp.ok) throw new Error(`Login failed: HTTP ${resp.status}`);

    const data = (await resp.json()) as { token?: string };
    if (!data.token) throw new Error("No token in login response");

    // Try to extract session cookie from Set-Cookie header
    const setCookieHeader = resp.headers.get("set-cookie");
    const sessionCookie = setCookieHeader ? setCookieHeader.split(";")[0] : "";

    mindsdbToken = data.token;
    logger.info("mindsdb:auth_acquired", { user, hasCookie: !!sessionCookie });
    return { token: mindsdbToken, cookie: sessionCookie };
  } catch (err) {
    mindsdbToken = "";
    logger.error("mindsdb:auth_failed", { user, error: extractErrorMessage(err) });
    throw err;
  }
}

async function ensureConnected(force = false): Promise<void> {
  if (connected && !force) return;

  try {
    const user = process.env.MINDSDB_USERNAME ?? "admin";
    const password = process.env.MINDSDB_PASSWORD ?? "admin123";
    logger.info("mindsdb:connecting", { host: MINDSDB_BASE, user, force });
    await MindsDB.connect({
      user,
      password,
      host: MINDSDB_BASE,
    });
    connected = true;
    logger.info("mindsdb:connected", { host: MINDSDB_BASE, user, force });
  } catch (err) {
    connected = false;
    const errMsg = extractErrorMessage(err);
    logger.error("mindsdb:connection_failed", {
      host: MINDSDB_BASE,
      user: process.env.MINDSDB_USERNAME ?? "admin",
      error: errMsg,
    });
    throw new Error(`MindsDB connection failed: ${errMsg}`, { cause: err });
  }
}

/** Reset connection state so next ensureConnected() re-authenticates (e.g. after 401) */
function invalidateConnection(): void {
  connected = false;
}

/** Run a MindsDB SQL query with automatic 401 retry (session expiry recovery) */
async function runQueryWithRetry(sql: string): Promise<SqlQueryResult> {
  await ensureConnected();
  logger.info("mindsdb:running_query", { sqlLength: sql.length });

  try {
    let result: SqlQueryResult = await MindsDB.SQL.runQuery(sql);

    if (result.type === "error") {
      logger.error("mindsdb:query_error", { error: result.error_message, sql: sql.slice(0, 100) });
      // If we get a 401-like error, re-authenticate and retry once
      if (/401|unauthorized|authenticate/i.test(result.error_message ?? "")) {
        logger.warn("mindsdb:session_expired_reconnecting", { error: result.error_message });
        invalidateConnection();
        await ensureConnected(true);
        result = await MindsDB.SQL.runQuery(sql);
      }
    }

    return result;
  } catch (err) {
    const errMsg = extractErrorMessage(err);
    logger.error("mindsdb:query_exception", { error: errMsg, sql: sql.slice(0, 100) });
    // If exception contains 401, retry connection and query
    if (/401|unauthorized|authenticate/i.test(errMsg)) {
      logger.warn("mindsdb:session_expired_retrying_after_exception", { error: errMsg });
      invalidateConnection();
      await ensureConnected(true);
      return MindsDB.SQL.runQuery(sql);
    }
    throw err;
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
        return w === lower
          ? TYPO_MAP[lower]
          : TYPO_MAP[lower].charAt(0).toUpperCase() + TYPO_MAP[lower].slice(1);
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

/** Clear all cached answers — useful for debugging stale responses */
export function clearAnswerCache(): void {
  answerCache.clear();
  logger.info("mindsdb:cache_cleared");
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
  try {
    // Get auth (login if needed)
    const auth = await ensureMindsDBAuth();

    const sql = `SELECT chunk_id, chunk_content, relevance, emotion, satisfaction_score, illegal_detected, audio_file_id
     FROM call_kb
     WHERE content = ${JSON.stringify(query)}
     LIMIT ${limit * 10}`;

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (auth.token) headers.Authorization = `Bearer ${auth.token}`;
    if (auth.cookie) headers.Cookie = auth.cookie;

    const resp = await fetch(`${MINDSDB_BASE}/api/sql/query`, {
      method: "POST",
      headers,
      body: JSON.stringify({ query: sql }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!resp.ok) {
      throw new Error(`MindsDB API error: HTTP ${resp.status}`);
    }

    const result = (await resp.json()) as { data?: unknown[] };

    // Convert array format [chunk_id, chunk_content, relevance, emotion, satisfaction_score, illegal_detected, audio_file_id] to KBResult
    const kbResults: KBResult[] = [];
    for (const row of result.data ?? []) {
      const arr = row as unknown[];
      if (arr.length >= 7) {
        kbResults.push({
          chunk_id: String(arr[0]),
          chunk_content: String(arr[1]),
          relevance: Number(arr[2]) || 0,
          emotion: arr[3] ? String(arr[3]) : undefined,
          satisfaction_score: arr[4] ? Number(arr[4]) : undefined,
          illegal_detected: arr[5] ? Boolean(arr[5]) : undefined,
          audio_file_id: arr[6] ? String(arr[6]) : undefined,
        });
      }
    }

    // Deduplicate by audio_file_id, keeping the highest-relevance chunk per file
    const seen = new Map<string, KBResult>();
    for (const typed of kbResults) {
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
      chunks: result.data?.length ?? 0,
    });
    return results;
  } catch (err) {
    logger.error("mindsdb:semantic_search_failed", { query, error: extractErrorMessage(err) });
    throw err;
  }
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

  try {
    logger.info("mindsdb:agent_query_starting", { question: queryQuestion });

    // Get token (login if needed)
    const auth = await ensureMindsDBAuth();

    // Use MindsDB Agent API (JSON-RPC 2.0 with SSE streaming)
    const taskId = crypto.randomUUID();
    const payload = {
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "tasks/sendSubscribe",
      params: {
        id: taskId,
        message: {
          role: "user",
          parts: [{ text: queryQuestion, type: "text" }],
          metadata: {
            agentName: "call_analytics_agent",
            project: "mindsdb",
            projectName: "mindsdb",
          },
        },
      },
    };

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (auth.token) headers.Authorization = `Bearer ${auth.token}`;
    if (auth.cookie) headers.Cookie = auth.cookie;

    const resp = await fetch(`${MINDSDB_BASE}/a2a/`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60_000),
    });

    if (!resp.ok) {
      throw new Error(`MindsDB API error: HTTP ${resp.status}`);
    }

    let answer = "ไม่สามารถตอบได้";
    const reader = resp.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (!data) continue;

            const obj = JSON.parse(data) as Record<string, unknown>;
            // Look for the final data response with the table output
            if (obj.type === "data" && obj.text) {
              answer = obj.text as string;
              logger.info("mindsdb:agent_raw_answer", {
                question: queryQuestion,
                answerPreview: String(obj.text).slice(0, 300),
              });
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    const answered = answer !== "ไม่สามารถตอบได้";
    if (answered) {
      setCache(queryQuestion, answer);
    } else {
      logger.warn("mindsdb:agent_unanswered", {
        question: queryQuestion,
        originalQuestion: question,
      });
    }

    logger.info("mindsdb:agent_query", { question: queryQuestion, answered });
    return answer;
  } catch (err) {
    logger.error("mindsdb:agent_query_failed", { question, error: extractErrorMessage(err) });
    throw err;
  }
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
