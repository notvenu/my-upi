MyUPI is a Next.js (App Router) + React + TypeScript website, mobile-first but used on a laptop too. Data lives in the browser
and syncs to Supabase when signed in. No native app: no Expo, React Native, Capacitor, Svelte or Vite.

## Commands

```bash
npm install
npm run dev     # dev server, http://localhost:3000
npm test        # logic checks in src/lib/check.ts (plain node, no framework)
npm run check   # tsc
npm run build   # production build (also type-checks)
```

Run `npm test` and `npm run build` before declaring any task done.

## Conventions

- `src/app/`: routes only (`/` the app, `/s/[id]` a public split link). Both render client-only through `components/AppLoader` / `ShareLoader` (`dynamic(..., { ssr: false })`), because the app reads localStorage on load.
- `src/screens/` screens and sheets, `src/components/` shared pieces, `src/lib/` logic and state.
- State: plain objects in `lib/db.ts`, `nav.ts`, `ui.ts`, `sync.ts`; every change calls `emit()` (`lib/store.ts`) and the app root re-renders. Data writes go through `db.ts` functions, which call `save()`: persist locally, emit, sync.
- Pure logic (money maths, parsing, split links) lives in plain `.ts` files under `src/lib/` and gets an assertion in `check.ts`.
- Component styles: scoped `<style jsx>` (styled-jsx, built into Next); shared tokens and utility classes in `src/app/globals.css`. Dark theme only.
- Sheets use `components/Sheet.tsx` (mark the field to focus with `data-autofocus`); choices with more than a few options use `components/Combobox.tsx`.
- New ids come from `nextId()` (time-based) so devices never collide.
- Supabase schema changes go in `supabase/schema.sql` (idempotent, re-runnable). Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (see `.env.example`).

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
