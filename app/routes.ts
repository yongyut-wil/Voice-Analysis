import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("analyses", "routes/analyses.tsx"),
  route("analyses/:id", "routes/analyses.$id.tsx"),
  route("api/upload", "routes/api/upload.tsx"),
  route("api/analyze", "routes/api/analyze.tsx"),
  route("api/retry/:id", "routes/api/retry.tsx"),
  route("api/status/:id", "routes/api/status.tsx"),
  route("api/callback/status", "routes/api/callback.status.tsx"),
  route("api/callback/audio-download-url", "routes/api/callback.audio-download-url.tsx"),
  route("api/callback/transcribe-audio", "routes/api/callback.transcribe-audio.tsx"),
  route("api/callback/save-analysis", "routes/api/callback.save-analysis.tsx"),
  route("api/callback/delete-audio", "routes/api/callback.delete-audio.tsx"),
  route("api/health", "routes/api/health.tsx"),
  route("api/search", "routes/api/search.tsx"),
  route("api/agent", "routes/api/agent.tsx"),
  route(".well-known/*", "routes/well-known.tsx"),
] satisfies RouteConfig;
