# End-to-end checks

| Command | What it does | Needs |
|---|---|---|
| `npm run test:smoke` | 28 auth-boundary checks (anonymous redirects, 401/403, CSRF origin, input validation) against a running build | `BASE_URL` of a running build |
| `npm run test:render` | Builds against a **fake Supabase** and renders every `/360` page as CEO, manager, staff and parent: HTTP 200, no runtime/hydration/console errors, expected text present, **leak checks** (other-branch students/leads/classes, money on StaffOS), Lao at 390 px with no horizontal overflow. 36 checks | Pre-installed Playwright/Chromium |

`fake-supabase.mjs` is a **non-production test double**: FICTIONAL data, implements only the Auth user
endpoint, PostgREST reads (eq/in/gte/lt/order/range, single-object responses) and a few RPCs. It does **not**
emulate RLS: database authorisation is tested against real Postgres in `tests/db` (`npm run test:db`).
Server-side branch scoping in `/360` *is* exercised here, because the fake applies the same filters the app sends.

`test:render` overwrites `.next` with a test build; run `npm run build` again before deploying from the same checkout.
