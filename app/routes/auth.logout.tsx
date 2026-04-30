import type { Route } from "./+types/auth.logout";
import { redirect } from "react-router";
import { createSupabaseServerClient } from "~/lib/auth.server";
import { logger } from "~/lib/logger";

export async function action({ request }: Route.ActionArgs) {
  const responseHeaders = new Headers();
  const supabase = createSupabaseServerClient(request, responseHeaders);

  const { error } = await supabase.auth.signOut();

  if (error) {
    logger.error("Sign out failed", { error: error.message });
  } else {
    logger.info("User signed out");
  }

  throw redirect("/auth/login", { headers: responseHeaders });
}

// GET ที่หลุดมา → redirect ไป login
export async function loader() {
  throw redirect("/auth/login");
}

export default function Logout() {
  return null;
}
