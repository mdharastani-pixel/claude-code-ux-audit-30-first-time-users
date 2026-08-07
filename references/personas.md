# Personas, areas, and worked examples

## The persona bank

Pick from these. They are chosen because each one exposes a different class of defect —
not because they are demographically diverse.

| # | Persona | What they break |
|---|---|---|
| 1 | First-time visitor, no context | Positioning, above-the-fold clarity, the first CTA |
| 2 | Sceptic checking price and privacy | Pricing honesty, legal pages, subprocessor lists, trial terms |
| 3 | Invited team member | Invite flow, permissions, what a non-owner may see |
| 4 | Returning user after four weeks | Session expiry, changed UI, stale data, re-onboarding |
| 5 | User who forgot their password | Recovery paths — the single most commonly missing flow |
| 6 | Paying power user | Limits, bulk actions, keyboard paths, performance at volume |
| 7 | Executive with no login | Public artefacts, shared links, read-only views, demo mode |
| 8 | User with an empty account | Empty states — usually designed last or not at all |
| 9 | User with 1,000 records | Pagination, virtualisation, search, timeouts |
| 10 | User with messy data | Umlauts, emoji, RTL text, very long strings, nulls |
| 11 | User on a slow phone | Bundle size, layout shift, tap targets, offline behaviour |
| 12 | Keyboard-only / screen-reader user | Focus order, labels, contrast, ARIA, skip links |
| 13 | User who cancels midway | Half-finished state, orphaned records, resumability |
| 14 | User who wants to leave | Export, deletion, unsubscribe, account closure |

Persona 5, 8, 12 and 14 are the ones teams skip. Include all four in every run.

## The area grid

| Area | Typical scenario count in a run of 30 |
|---|---|
| Landing / marketing | 3 |
| Signup and login | 4 |
| Onboarding / first run | 4 |
| Core loop (the thing the product is for) | 8 |
| Settings and account | 3 |
| Billing and plans | 3 |
| Legal and privacy | 2 |
| Failure states and edge cases | 3 |

Adjust to the product, but never let the core loop drop below a quarter — and never let it
take everything, because the defects that lose users cluster at the edges.

## Viewport split

Desktop 50%, mobile 35%, tablet 15%. Mobile below a third makes the report untrustworthy:
that is where layout collides, tap targets overlap, and fixed elements stack on top of
each other.

## Two worked examples

Copy the shape, not the content.

### Good

> **02 · Mobile visitor checks pricing and whether it installs as an app**
> `PARTIAL` · `P1` · Landing · Mobile
>
> - **Persona and goal** — A visitor on a phone wants to know whether this works as a mobile app and what it costs.
> - **Entry and click path** — `/` → Pricing → FAQ → Login.
> - **Expected** — Page holds together on a small screen, trial terms are unambiguous, app is installable.
> - **Actual** — Pricing and FAQ render. The install promise is not backed: `manifest.ts` exists, but `layout.tsx` sets no viewport, theme-color or Apple meta tags, and no service worker is registered.
> - **Problems** — The landing page promises an app experience the build cannot deliver; on iOS "Add to Home Screen" produces a bookmark, not an app.
> - **Fix** — Either soften the copy until the PWA is real, or finish it: maskable icon, iOS meta tags, offline check, one mobile smoke test.
> - **Evidence** — `components/Landing.tsx:90-104` pricing block; `app/manifest.ts:4-17`; `app/layout.tsx:4-7` base metadata only.

Why it works: the click path is real, "actual" names files rather than impressions, the
problem is stated as user consequence, and the fix offers the cheap option first.

### Bad

> **07 · User tests the dashboard**
> `VERIFIED` · `P0` · App · Desktop
>
> - **Actual** — The dashboard feels cluttered and the UX could be improved.
> - **Fix** — Refactor the dashboard components and improve the information architecture.

Why it fails: no named person and no goal, no click path, "feels cluttered" is taste with a
`VERIFIED` badge on it, `P0` is unearned, and the fix is a work order for a quarter, not an
intervention.

## Writing the goal line

A usable goal has a subject, an intent, and a stopping condition.

| Weak | Strong |
|---|---|
| User looks at settings | A returning user wants to switch the workspace timezone before their first meeting |
| User tests search | A user with 1,000 records wants to find one by a partial name they half remember |
| User checks privacy | A sceptic wants to confirm their data is not sent to a third-party model provider before signing up |
