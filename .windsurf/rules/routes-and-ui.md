---
trigger: glob
globs: app/routes.ts,app/routes/**/*.tsx,app/components/**/*.tsx,app/root.tsx
---

# Routes and UI Rule

## Routing

- Follow the route structure already defined in `app/routes.ts`.
- API route files under `app/routes/api/` should export route handlers only and should not grow UI components.
- Prefer loader and action patterns consistent with existing routes.
- Avoid routine unhandled loader errors when the route already expects safe fallbacks.

## UI

- Prefer existing shadcn/ui components from `~/components/ui/` before creating new primitives.
- Use Lucide React for icons.
- Keep styling aligned with existing CSS variables and Tailwind conventions.
- Do not introduce a different font system when editing UI. The app standard is Noto Sans Thai configured in `root.tsx`.

## Safety

- Before editing a route file, check whether it is server-only, client-rendered, or mixed.
- Do not import server-only modules into components that render on the client.
