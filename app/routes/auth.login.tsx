import type { Route } from "./+types/auth.login";
import { data, redirect } from "react-router";
import { Form, useActionData, useNavigation } from "react-router";
import { createSupabaseServerClient } from "~/lib/auth.server";
import { logger } from "~/lib/logger";
import { Loader2 } from "lucide-react";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "เข้าสู่ระบบ — Voice Analysis" },
    { name: "description", content: "เข้าสู่ระบบเพื่อใช้งาน Voice Analysis" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const responseHeaders = new Headers();
  const supabase = createSupabaseServerClient(request, responseHeaders);

  // ถ้า login อยู่แล้ว → ไป home
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const url = new URL(request.url);
    const next = url.searchParams.get("next") ?? "/";
    throw redirect(next, { headers: responseHeaders });
  }

  return null;
}

export async function action({ request }: Route.ActionArgs) {
  const responseHeaders = new Headers();
  const supabase = createSupabaseServerClient(request, responseHeaders);
  const url = new URL(request.url);
  const next = url.searchParams.get("next") ?? "/";
  const intent = url.searchParams.get("intent");

  // ── Phase 2: Authentik SSO (uncomment เมื่อ Authentik พร้อม) ──────────
  if (intent === "sso") {
    const origin = url.origin;
    const { data: oauthData, error } = await supabase.auth.signInWithOAuth({
      provider: "custom:authentik" as never,
      options: {
        redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
        scopes: "openid profile email",
      },
    });
    if (error) {
      logger.error("SSO initiation failed", { error: error.message });
      return data({ error: "ไม่สามารถเชื่อมต่อ SSO ได้ กรุณาลองใหม่" }, { status: 500 });
    }
    throw redirect(oauthData.url, { headers: responseHeaders });
  }
  // ─────────────────────────────────────────────────────────────────────

  // ── Phase 1: Email/Password ───────────────────────────────────────────
  const form = await request.formData();
  const email = form.get("email") as string;
  const password = form.get("password") as string;

  if (!email || !password) {
    return data({ error: "กรุณากรอกอีเมลและรหัสผ่าน" }, { status: 400 });
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    logger.warn("Login failed", { email, error: error.message });
    return data(
      { error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" },
      { status: 401, headers: responseHeaders }
    );
  }

  logger.info("Login successful", { email });
  throw redirect(next, { headers: responseHeaders });
  // ─────────────────────────────────────────────────────────────────────
}

export default function LoginPage() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <main className="bg-background flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="bg-primary/10 mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl">
            <svg
              className="text-primary h-7 w-7"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Voice Analysis</h1>
          <p className="text-muted-foreground mt-1 text-sm">เข้าสู่ระบบเพื่อดำเนินการต่อ</p>
        </div>

        {/* Card */}
        <div className="bg-card rounded-2xl border p-6 shadow-sm">
          <Form method="post" className="space-y-4" id="login-form">
            {/* Error message */}
            {actionData?.error && (
              <div className="bg-destructive/10 text-destructive rounded-lg px-4 py-3 text-sm">
                {actionData.error}
              </div>
            )}

            {/* Email */}
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium">
                อีเมล
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@example.com"
                className="border-input bg-background placeholder:text-muted-foreground focus-visible:ring-ring w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus-visible:ring-2 disabled:opacity-50"
                disabled={isSubmitting}
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium">
                รหัสผ่าน
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="••••••••"
                className="border-input bg-background placeholder:text-muted-foreground focus-visible:ring-ring w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus-visible:ring-2 disabled:opacity-50"
                disabled={isSubmitting}
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              id="login-submit"
              disabled={isSubmitting}
              className="bg-primary text-primary-foreground hover:bg-primary/90 flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-70"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  กำลังเข้าสู่ระบบ...
                </>
              ) : (
                "เข้าสู่ระบบ"
              )}
            </button>
          </Form>

          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <span className="border-border w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card text-muted-foreground px-2">หรือ</span>
            </div>
          </div>
          <Form method="post" action="?intent=sso">
            <button
              type="submit"
              id="login-sso-submit"
              className="border-input bg-background hover:bg-accent flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors"
            >
              เข้าสู่ระบบด้วย Authentik SSO
            </button>
          </Form>
        </div>
      </div>
    </main>
  );
}
