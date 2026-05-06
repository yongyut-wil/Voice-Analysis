import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("analyses", "routes/analyses.tsx"),
  route("analyses/:id", "routes/analyses.$id.tsx"),

  // ── Auth ────────────────────────────────────────────────
  route("auth/login", "routes/auth.login.tsx"),
  route("auth/logout", "routes/auth.logout.tsx"),
  route("auth/callback", "routes/auth.callback.tsx"),
  // ────────────────────────────────────────────────────────

  route("api/upload", "routes/api/upload.tsx"),
  route("api/analyze", "routes/api/analyze.tsx"),
  route("api/retry/:id", "routes/api/retry.tsx"),
  route("api/status/:id", "routes/api/status.tsx"),
  route("api/health", "routes/api/health.tsx"),
  route("api/search", "routes/api/search.tsx"),
  route("api/agent", "routes/api/agent.tsx"),
  route(".well-known/*", "routes/well-known.tsx"),
] satisfies RouteConfig;
