# API Routes Rules

This directory contains API route handlers for the voice analysis backend.

## Scope

Applies to files under `app/routes/api/**`.

## Rules

- Export route handlers only (no UI components in this directory).
- Keep handlers focused: accept request, delegate to server modules, return response.
- Use consistent error response formats aligned with the app's error handling conventions.
- Prefer returning JSON responses with appropriate HTTP status codes.

## Route Patterns

- `*.delete-audio.tsx`: Audio cleanup/deletion handlers
- `*.callback.tsx`: Webhook callback handlers from external services (n8n, etc.)
- `*.upload.tsx`: File upload handlers

## Implementation Guidelines

- Validate inputs before processing.
- Delegate business logic to `app/lib/*.server.ts` modules.
- Return structured error responses using `app/lib/error-utils.ts`.
- Log significant operations using `app/lib/logger.ts`.

## Integration Points

- n8n callbacks: Handle async analysis completion notifications
- Supabase: Database updates for analysis status and results
- MinIO: Audio file storage operations
