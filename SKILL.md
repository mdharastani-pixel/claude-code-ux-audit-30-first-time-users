---
name: user-scenario-audit
description: Audit a product through the eyes of 30 first-time users. Each scenario names a persona, walks a real click path, states what they expected, what actually happened, and cites the file and line that proves it. Produces a filterable HTML report with status, priority and the ten costliest blockers. Use when asked for a UX audit, first-run review, launch-blocker hunt, usability pass, "test it like a new user", "30 testers", or (German) "Erstnutzer-Audit", "Nutzer-Szenarien", "30 Tester".
---

# User Scenario Audit

Most usability reviews fail the same way: someone who already knows the product walks
through it and finds nothing, because they cannot un-know the shortcuts. This skill
replaces that with 30 strangers who each want one specific thing, and it forces every
claim about what they see to carry a citation.

The output is a single self-contained HTML file. The ten worst findings sit at the top,
because that is all most readers will get through.

## Quick start

```bash
python3 scripts/new_audit.py "<product name>" -o findings.json   # 30 scenarios, pre-planned
# … fill in every TODO by running the product (phases 1–6 below) …
python3 scripts/build_report.py findings.json -o audit/report.html
```

The generator hands you a grid that is already balanced across personas, areas and
viewports, so the job is to investigate and fill in — never to invent 30 scenarios from a
blank page. Inventing them badly is how audits end up testing the same happy path five
times.

**It does not have to be a website.** Pass `--kind cli`, `api`, `mobile` or `desktop` and the
click path becomes a command, a call sequence, or a tap path. The seven fields, the
evidence rule and the report are identical — only the vocabulary changes.

## The four rules

These are not style preferences. They are why the report can be trusted.

1. **No claim without evidence.** Every statement about behaviour cites `file.tsx:120-134`,
   a route, a log line, a screenshot, or a test result. What you cannot cite is labelled
   `UX-HYPOTHESIS` — never dressed up as a finding.
2. **Read-only.** No production data, no writes, no real signups, no third-party calls, no
   installs, no commits, no deploys. If a scenario cannot be tested without side effects,
   its status is `NOT TESTABLE` and you say why.
3. **A broken app is a finding, not a blocker.** If it will not run locally, that is
   finding number one. The audit continues at code level.
4. **One fix per scenario, one or two sentences.** "Should be refactored" is not a fix and
   gets cut.

## Process

### Phase 1 — Establish the frame

Before scenario one, find out what you can actually observe. Record:

- Does it run? Start command, port, first response from `/`
- Type check and lint: clean or not
- Test run without a database: passed, skipped, failed
- How many routes, endpoints, data models
- What is **out of reach** — payment, mail, cron, third-party APIs — listed explicitly

**Then the question that decides the whole audit: can you get in?**

Almost everything worth auditing sits behind a login, and rule 2 forbids writing to
production. So before generating a grid, establish all three:

1. Which database does the local instance point at? Read the connection string. If it is
   production, no flow that writes may run.
2. Does signing in itself write? Check the auth path for `update`, `create` or `upsert` —
   last-login stamps and failed-attempt counters are common, and they are writes.
3. Is there a throwaway account against a non-production database?

If the answer to 3 is no and the answer to 2 is yes, **stop and say so** before building the
grid. Ask for a seeded local database or a disposable account. An audit that cannot open the
product will only ever describe its front door, and the honest response is to name that
limit up front rather than to hand back a report that looks complete.

If access cannot be arranged, continue — but pass the unreachable areas to the generator so
the grid does not fill with scenarios you already know you cannot run:

```bash
python3 scripts/new_audit.py "Acme" --blocked core,settings,billing
```

This block goes into the report verbatim. It tells the reader how much weight each finding
carries, and it is the difference between an audit and an opinion.

### Phase 2 — Build the grid

Thirty scenarios must not be five ideas repeated. Generate the grid instead of writing it:

```bash
python3 scripts/new_audit.py "Acme Notes" -o findings.json          # web, 30 scenarios
python3 scripts/new_audit.py "Acme CLI" --kind cli -n 15            # a command-line tool
python3 scripts/new_audit.py "Acme API" --kind api --areas auth,core,billing
```

It crosses three axes and hands back a scenario per row:

- **Persona** — the bank of 14 in `references/personas.md`, each chosen for the defect class
  it exposes. Four are mandatory and the generator will not drop them
- **Area** — landing, signup, onboarding, core loop, settings, billing, legal, failure states,
  weighted so the core loop gets the largest share without taking everything
- **Viewport** — desktop 50 / mobile 35 / tablet 15, or a single value for CLI and API

Then read the product and give each row a real goal, reachable in **one sitting**. "User
explores the app" is not a scenario. "A first-time visitor wants to understand within 30
seconds what this does and whether they can start" is one. Replace every `TODO:` — a
remaining TODO means the scenario was skipped, and the report builder will say so.

Adjust the grid where the product demands it. A tool with no billing does not need billing
scenarios; drop the area rather than inventing three hollow ones.

### Phase 3 — Verify for real, in parallel

Two failure modes to avoid: reading code and calling it observation, and walking 30
scenarios end to end in one thread.

**Verify by running it.** Drive the actual UI with whatever browser automation is available
(Playwright, Puppeteer, a headless browser skill, the browser tools in your harness). Load
the page, click the path, read the console, capture a screenshot. Reading the component and
inferring what renders is a hypothesis, and must be labelled as one. A run where more than a
third of scenarios end as `UX-HYPOTHESIS` did not audit the product, it reviewed the source.

**Split the work.** Assign each area to its own worker (subagent, task, session) with the
frame from phase 1 as shared context, and have it return findings as JSON matching
`scripts/findings.schema.json`. Merge at the end. Areas are independent; there is no reason
to serialise them. Give every worker the same rule set — inconsistent status labels across
areas make the report unfilterable.

### Phase 4 — Fill the seven fields

Every scenario, every field, same order. A blank field means the scenario is not done.

| Field | Content |
|---|---|
| **Persona and goal** | Who, wanting what, in one sentence |
| **Entry and click path** | The actual route: `/` → pricing → login |
| **Expected** | What this person reasonably expects at this point |
| **Actual** | What the runtime delivered — status code, error text, observed behaviour |
| **Problems** | The gap between the two. No gap? Write "none" |
| **Fix** | One intervention that closes it. One or two sentences |
| **Evidence** | `file.tsx:50-60`, routes, log lines, screenshots — at least one |

### Phase 5 — Classify

**Status**, exactly one per scenario:

| Status | Meaning |
|---|---|
| `VERIFIED` | Executed and observed first-hand |
| `PARTIAL` | Part observed, remainder inferred from code |
| `MOCK` | Works, but on placeholder data |
| `BROKEN` | Reproducibly fails |
| `NOT TESTABLE` | External system, deliberately untouched |
| `UX-HYPOTHESIS` | Code reading only, no runtime evidence |

**Priority**:

| | |
|---|---|
| `P0` | Blocks use or launch, or is a legal/privacy defect |
| `P1` | User cannot reach the goal, but a workaround exists |
| `P2` | Friction, confusion, inconsistency |
| `P3` | Polish |

### Phase 6 — The ten costliest blockers

Across all scenarios, the ten items that cost the most — ranked by priority, then by how
many scenarios they hit at once. A heading and two sentences each. A problem appearing in
nine scenarios outranks a worse-sounding one that appears in a single edge case.

### Phase 7 — Build the report

Write findings as JSON conforming to `scripts/findings.schema.json`, then:

```bash
python3 scripts/build_report.py findings.json -o audit/report.html
```

The template ships with the skill (`references/report-template.html`): self-contained, no
CDN, light and dark, and a filter bar over status, priority, area and viewport with a live
"12 of 30 visible" counter. Do not hand-roll the HTML — a 30-card page without working
filters is unreadable, and rebuilding it each run guarantees it will differ each run.

Save the report inside the audited repository (`audit/`), never outside it.

### Phase 8 — Re-runs: report the delta

When a previous `findings.json` exists, pass it:

```bash
python3 scripts/build_report.py findings.json --previous audit/2026-01-14-findings.json -o audit/report.html
```

Scenarios are matched by `id`, and each is marked **fixed**, **new**, **still open** or
**regressed**. A second audit that starts from zero wastes the first one: what everybody
wants to know is what moved.

## Self-check before you publish the report

Run these against your own output. Each one has caught a bad audit.

- More than a third `UX-HYPOTHESIS` → you reviewed source, not product. Go back to phase 3.
- Two scenarios with the same click path → the grid was too narrow. Replace one.
- A finding with no citation → cut it, or demote it to hypothesis.
- Everything is `P0` → then nothing is. Cap `P0` at a third.
- A fix you could not implement yourself tomorrow → too vague, rewrite it.
- No mobile scenario failed → suspicious. Mobile is where layout breaks; look again.

## Files

| Path | Purpose |
|---|---|
| `scripts/new_audit.py` | Generates the balanced scenario grid to fill in |
| `references/personas.md` | 14 personas, the area grid, and worked scenario examples |
| `references/report-template.html` | The report shell — filters, badges, theming |
| `scripts/build_report.py` | Renders findings JSON into the template; computes the delta |
| `scripts/findings.schema.json` | The contract every worker returns |
