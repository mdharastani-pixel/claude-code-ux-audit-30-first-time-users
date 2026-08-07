# user-scenario-audit

An agent skill that audits a product through the eyes of 30 first-time users — and refuses
to let the agent guess.

Most AI usability reviews read the source, imagine what renders, and hand you a page of
confident prose. This one makes every claim carry a `file.tsx:120-134`, labels anything it
could not observe as a hypothesis, and tells you off in the terminal when more than a third
of the report turns out to be hypotheses.

Works with [Claude Code](https://claude.com/claude-code) and any agent that reads skill
files. The report builder is plain Python 3 with no dependencies.

## What you get

A single self-contained HTML file:

- The **ten costliest blockers** at the top, ranked by priority and by how many scenarios
  they hit — because that is all most readers will get through
- **30 scenario cards**, each with persona, click path, expectation, what actually happened,
  the gap, one concrete fix, and citations
- A **filter bar** over status, priority, area and viewport with a live "12 of 30 visible"
  counter
- An **audit frame** stating what could and could not be tested, so the reader knows how much
  weight each finding carries
- On re-runs, a **delta**: fixed · new · still open · regressed

No CDN, no build step, light and dark, opens from the filesystem.

## Install

```bash
git clone https://github.com/USER/user-scenario-audit.git ~/.claude/skills/user-scenario-audit
```

Or for one project only, clone into `<project>/.claude/skills/`.

## Use

Ask your agent for an audit in whatever words come naturally — "run a first-user audit",
"test this like 30 new users", "find the launch blockers". The skill takes over from there.

It works in eight phases: establish what is observable, build a persona × area × viewport
grid, verify by actually driving the UI (in parallel, one worker per area), fill seven
required fields per scenario, classify, rank the ten worst, render, and — on re-runs —
diff against last time.

To render a report by hand:

```bash
python3 scripts/build_report.py findings.json -o audit/report.html
python3 scripts/build_report.py findings.json --previous audit/last.json -o audit/report.html
```

Try it on the bundled example:

```bash
python3 scripts/build_report.py examples/findings.example.json -o /tmp/report.html
```

## The rules it enforces

The skill is opinionated on purpose. These are checked, and violations are printed:

| Rule | Why |
|---|---|
| Every finding cites a file, route, log or screenshot | Uncited claims are the failure mode of AI audits |
| Read-only: no writes, no signups, no third-party calls, no commits | An audit must be safe to run against anything |
| A scenario with a blank field is not done | Seven fields, every time |
| More than ⅓ hypotheses → warning | You reviewed the source, not the product |
| Everything `P0` → warning | If everything blocks, nothing does |
| Under ⅓ mobile scenarios → warning | Mobile is where layout breaks |
| Two scenarios sharing a click path → warning | The grid was too narrow |
| Duplicate scenario ids → error | Ids are how re-runs match |

## Layout

| Path | Purpose |
|---|---|
| `SKILL.md` | The skill itself — the eight phases and the rules |
| `references/personas.md` | 14 personas chosen for the defect class each exposes, plus a good and a bad worked example |
| `references/report-template.html` | Report shell: filters, badges, theming |
| `scripts/build_report.py` | Validates, computes the delta, renders |
| `scripts/findings.schema.json` | The contract every worker returns |
| `examples/findings.example.json` | A six-scenario run against a fictional product |

## Why the personas are fixed

Personas 5, 8, 12 and 14 — forgot their password, empty account, keyboard-only, wants to
leave — are the ones product teams skip, and they are where audits find real defects. The
skill requires all four in every run.

## Licence

MIT. Use it, fork it, ship it.
