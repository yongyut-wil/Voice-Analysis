import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("analyses", "routes/analyses.tsx"),
  route("analyses/:id", "routes/analyses.$id.tsx"),
  route("api/upload", "routes/api/upload.tsx"),
  route("api/analyze", "routes/api/analyze.tsx"),
  route("api/retry/:id", "routes/api/retry.tsx"),
  route("api/status/:id", "routes/api/status.tsx"),
  route(".well-known/*", "routes/well-known.tsx"),
] satisfies RouteConfig;
