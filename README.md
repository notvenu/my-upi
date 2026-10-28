# MyUPI

A personal money log for UPI, cash and card payments, with splits for roommates and trips. A Next.js website (installable as an app on your phone), synced between phone and laptop through Supabase.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # logic checks (src/lib/check.ts)
npm run check      # typecheck
npm run build      # production build
npm start          # serve the build
```

## Account, sync and split links (Supabase)

1. Create a project at supabase.com and run [supabase/schema.sql](supabase/schema.sql) in its SQL Editor.
2. Authentication → Users → **Add user**: your email and a password (tick "Auto confirm"). That's the login.
3. Authentication → Sign In / Providers → Email: turn **off** "Allow new users to sign up", so nobody else can make an account.
4. Copy `.env.example` to `.env.local` and fill in the project URL and anon key (Project Settings → API).

With Supabase set up, the site opens on a login screen. Each device stays signed in until you sign out there
(which also clears that browser's copy); You → Sign out other devices ends every other session.
Without Supabase the app works signed out, keeping data only in that browser.
Add `http://localhost:3000` and your site's address under Authentication → URL Configuration.

## Keyboard (laptop)

`1`–`4` tabs · `S` scan · `N` new entry · `H` history · `A` autopays · `Esc` closes a sheet · ↑ ↓ Enter in dropdowns

## Layout

- `src/app/`: routes. `/` is the app, `/s/<id>` a public split link.
- `src/screens/`: screens and sheets (`App.tsx` is the shell: tabs, sheets, toasts). `src/components/`: shared pieces.
- `src/lib/db.ts`: the data store; `sync.ts`: Supabase sync; `share.ts`: what a split link shows;
  `calc.ts`, `scope.ts`, `statement.ts`, `upi.ts`: pure logic, checked by `check.ts`.
- `supabase/schema.sql`: tables, row-level security and the public `get_share` function.

## Deploying

Any Next.js host works (Vercel is the simplest). Set the two `NEXT_PUBLIC_SUPABASE_*` variables there too.
