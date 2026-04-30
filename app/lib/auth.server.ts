import { createServerClient, parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";
import { redirect } from "react-router";
import { logger } from "~/lib/logger";

/**
 * สร้าง Supabase client ที่รองรับ SSR session ผ่าน cookies
 * ต้องส่ง responseHeaders เพื่อให้ client เขียน Set-Cookie กลับไปที่ browser
 */
export function createSupabaseServerClient(request: Request, responseHeaders: Headers) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");
  }

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    db: { schema: "voice_analysis" },
    cookies: {
      getAll() {
        return parseCookieHeader(request.headers.get("Cookie") ?? "").filter(
          (c): c is { name: string; value: string } => c.value !== undefined
        );
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          responseHeaders.append("Set-Cookie", serializeCookieHeader(name, value, options));
        });
      },
    },
  });
}

/**
 * ตรวจสอบว่า user login อยู่ — ถ้าไม่อยู่จะ redirect ไป /auth/login
 * ใช้ใน loader ของ protected routes
 */
export async function requireAuth(request: Request) {
  const responseHeaders = new Headers();
  const supabase = createSupabaseServerClient(request, responseHeaders);

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    const url = new URL(request.url);
    logger.warn("Unauthenticated access blocked", { path: url.pathname });
    throw redirect(`/auth/login?next=${encodeURIComponent(url.pathname)}`, {
      headers: responseHeaders,
    });
  }

  logger.info("Auth verified", { userId: user.id, email: user.email ?? undefined });
  return { user, supabase, responseHeaders };
}

/**
 * ดึง user ถ้า login อยู่ — ไม่ redirect ถ้าไม่ได้ login
 * ใช้ใน loader ที่ต้องการแสดง user info แต่ไม่บังคับ login
 */
export async function getOptionalUser(request: Request) {
  const responseHeaders = new Headers();
  const supabase = createSupabaseServerClient(request, responseHeaders);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { user, supabase, responseHeaders };
}
