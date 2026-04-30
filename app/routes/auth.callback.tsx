import type { Route } from "./+types/auth.callback";
import { redirect } from "react-router";
import { createSupabaseServerClient } from "~/lib/auth.server";
import { logger } from "~/lib/logger";

/**
 * OAuth callback handler — รองรับทั้ง email confirmation และ OAuth (Authentik ใน Phase 2)
 * Supabase ส่ง ?code= มาให้แลกเป็น session
 */
export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";
  const errorParam = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  const responseHeaders = new Headers();

  // Supabase หรือ IdP ส่ง error กลับมา
  if (errorParam) {
    logger.warn("Auth callback error from provider", {
      error: errorParam,
      description: errorDescription ?? undefined,
    });
    throw redirect(`/auth/login?error=${encodeURIComponent(errorDescription ?? errorParam)}`, {
      headers: responseHeaders,
    });
  }

  if (!code) {
    logger.warn("Auth callback: missing code param");
    throw redirect("/auth/login", { headers: responseHeaders });
  }

  const supabase = createSupabaseServerClient(request, responseHeaders);
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    logger.error("OAuth code exchange failed", { error: error.message });
    throw redirect("/auth/login?error=callback_failed", { headers: responseHeaders });
  }

  logger.info("Auth callback: session established");
  throw redirect(next, { headers: responseHeaders });
}

// ไม่ต้องมี UI — redirect ทันที
export default function AuthCallback() {
  return null;
}
