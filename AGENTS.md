<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project conventions

- Use Fish Audio services for runtime AI. Hosted models provided through Fish Audio are allowed.
- Use the installed official Fish Audio skills and SDKs. Use documented Fish HTTP endpoints when the SDK lacks a required field.
- Keep all demo input fictional. Do not expose credentials, account details, private source data, or provider error bodies in the UI or logs.
- Keep audio silent during automated checks. Only explicit Play or user-enabled spoken replies should play speech; no local voice fallback.
- Keep inline emotion cues editable and forward the exact edited speech text to S2.1 Pro.

- For local development use `npm run dev` on port 3101, not `npm start`. Keep the dev server running and use hot reloading for UI changes.
