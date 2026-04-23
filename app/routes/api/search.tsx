import { data } from "react-router";
import { semanticSearch, isMindsDBConfigured } from "~/lib/mindsdb.server";
import { extractErrorMessage } from "~/lib/error-utils";
import type { Route } from "./+types/search";

/**
 * GET /api/search?q=<query>&limit=<n>
 *
 * Semantic search over call transcriptions via MindsDB Knowledge Base.
 * Returns ranked results by relevance score.
 * Requires MINDSDB_HOST env var — returns 503 if not configured.
 */
export async function loader({ request }: Route.LoaderArgs) {
  if (!isMindsDBConfigured()) {
    return data({ error: "MindsDB is not configured" }, { status: 503 });
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim();
  if (!q) {
    return data({ results: [] });
  }

  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Math.min(Math.max(1, parseInt(limitParam, 10)), 50) : 10;

  try {
    const results = await semanticSearch(q, limit);
    return data({ results });
  } catch (err) {
    return data({ error: extractErrorMessage(err) }, { status: 500 });
  }
}
