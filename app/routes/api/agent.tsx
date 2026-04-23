import { data } from "react-router";
import { askAnalyticsAgent, isMindsDBConfigured } from "~/lib/mindsdb.server";
import { extractErrorMessage } from "~/lib/error-utils";
import type { Route } from "./+types/agent";

/**
 * POST /api/agent
 * Body: { question: string }
 *
 * Natural language analytics via MindsDB Agent.
 * Agent queries Supabase directly and returns Thai-language answers.
 * Requires MINDSDB_HOST env var — returns 503 if not configured.
 */
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }

  if (!isMindsDBConfigured()) {
    return data({ error: "MindsDB is not configured" }, { status: 503 });
  }

  const body = (await request.json()) as { question?: string };
  const question = body.question?.trim();

  if (!question) {
    return data({ error: "question is required" }, { status: 400 });
  }

  try {
    const answer = await askAnalyticsAgent(question);
    return data({ answer });
  } catch (err) {
    return data({ error: extractErrorMessage(err) }, { status: 500 });
  }
}
