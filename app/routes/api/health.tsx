import { data } from "react-router";
import { logger } from "~/lib/logger";
import type { Route } from "./+types/health";

interface ServiceCheck {
  status: "ok" | "degraded" | "down";
  latencyMs?: number;
  error?: string;
}

async function checkN8n(): Promise<ServiceCheck> {
  const start = Date.now();
  try {
    const webhookUrl = process.env.N8N_WEBHOOK_URL ?? "http://localhost:5678";
    const res = await fetch(`${webhookUrl}/healthz`, {
      signal: AbortSignal.timeout(5000),
    });
    return { status: res.ok ? "ok" : "degraded", latencyMs: Date.now() - start };
  } catch (err) {
    return { status: "down", error: err instanceof Error ? err.message : String(err) };
  }
}

async function checkMinio(): Promise<ServiceCheck> {
  const start = Date.now();
  try {
    await import("~/lib/minio.server");
    const { MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY } = process.env;
    if (MINIO_ENDPOINT && MINIO_ACCESS_KEY && MINIO_SECRET_KEY) {
      return { status: "ok", latencyMs: Date.now() - start };
    }
    return { status: "degraded", error: "Missing credentials" };
  } catch (err) {
    return { status: "down", error: err instanceof Error ? err.message : String(err) };
  }
}

async function checkSupabase(): Promise<ServiceCheck> {
  const start = Date.now();
  try {
    await import("~/lib/supabase.server");
    const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
    if (SUPABASE_URL && SUPABASE_ANON_KEY) {
      return { status: "ok", latencyMs: Date.now() - start };
    }
    return { status: "degraded", error: "Missing credentials" };
  } catch (err) {
    return { status: "down", error: err instanceof Error ? err.message : String(err) };
  }
}

function getOverallStatus(checks: Record<string, { status: string }>): string {
  const values = Object.values(checks);
  if (values.some((c) => c.status === "down")) return "degraded";
  return "ok";
}

/**
 * GET /api/health
 *
 * Health check endpoint for monitoring service availability.
 * Checks n8n, MinIO, and Supabase connectivity.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const checks: Record<string, ServiceCheck> = {
    n8n: await checkN8n(),
    minio: await checkMinio(),
    supabase: await checkSupabase(),
  };

  const overallStatus = getOverallStatus(checks);

  logger.info("health:checked", { overallStatus, checks });

  return data({
    status: overallStatus,
    n8n_enabled: true,
    checks,
  });
}
