# user-scenario-audit

An agent skill that tests your product as 30 first-time users — and refuses to let the agent
guess.

Most AI usability reviews read the source, imagine what renders, and hand you a page of
confident prose. This one makes every claim carry a `file.tsx:120-134`, labels anything it
could not observe as a hypothesis, and refuses to build the report when scenarios are still
half-empty.

Works with [Claude Code](https://claude.com/claude-code) and any agent that reads skill
files. The tooling is plain Python 3 — no dependencies, no build step.

## Install

```bash
git clone https://github.com/mdharastani-pixel/user-scenario-audit.git \
  ~/.claude/skills/user-scenario-audit
```

For one project only, clone into `<your-project>/.claude/skills/` instead.

## Use it

Ask your agent in whatever words come naturally:

> run a first-user audit on this app
> test this like 30 new users and find the launch blockers
> where would a new user get stuck?

The skill takes over: it works out what can actually be observed, generates a balanced
scenario grid, drives the product, fills seven required fields per scenario, ranks the ten
costliest problems, and renders the report.

### Or drive it by hand

```bash
# 1. plan — a grid balanced across personas, areas and viewports
python3 scripts/new_audit.py "My Product" -o findings.json

# 2. investigate — run the product, replace every TODO in findings.json

# 3. render
python3 scripts/build_report.py findings.json -o audit/report.html

# later: what moved since last time
python3 scripts/build_report.py findings.json --previous audit/last.json -o audit/report.html
```

See it work before you commit to anything:

```bash
python3 scripts/build_report.py examples/findings.example.json -o /tmp/report.html
open /tmp/report.html
```

## Not just websites

```bash
python3 scripts/new_audit.py "My CLI"    --kind cli
python3 scripts/new_audit.py "My API"    --kind api
python3 scripts/new_audit.py "My App"    --kind mobile
python3 scripts/new_audit.py "My Editor" --kind desktop
```

The click path becomes a command, a call sequence or a tap path. Everything else — the seven
fields, the evidence rule, the filters — is identical.

Narrow the scope when the product is smaller than the default grid:

```bash
python3 scripts/new_audit.py "My Tool" -n 15 --areas landing,auth,core,edge
```

## What you get

One self-contained HTML file:

- The **ten costliest blockers** at the top, ranked by priority and by how many scenarios
  they hit — that is all most readers will get through
- **Scenario cards** with persona, click path, expectation, what actually happened, the gap,
  one concrete fix, and citations
- A **filter bar** over status, priority, area and viewport with a live "12 of 30 visible"
  counter
- An **audit frame** stating what could and could not be tested, so the reader knows how much
  weight each finding carries
- On re-runs, a **delta** per scenario: fixed · new · still open · regressed

No CDN, no dependencies, light and dark, opens straight from the filesystem.

## The rules it enforces

The skill is opinionated on purpose. These are checked in code, and violations are printed:

| Rule | Why |
|---|---|
| Every finding cites a file, route, log or screenshot | Uncited claims are the failure mode of AI audits |
| A scenario still containing `TODO:` is an error | A scaffold is not a report |
| Duplicate scenario ids are an error | Ids are how re-runs match |
| Read-only: no writes, no signups, no third-party calls, no commits | An audit must be safe to run against anything |
| More than ⅓ hypotheses → warning | You reviewed the source, not the product |
| Everything `P0` → warning | If everything blocks, nothing does |
| Fewer than ⅓ mobile scenarios → warning | Mobile is where layout breaks |
| Two scenarios sharing a click path → warning | The grid was too narrow |

## Why these personas

The bank holds 14, each picked for the class of defect it exposes rather than for
demographic variety. Four are mandatory in every run, because they are the ones product
teams skip:

| Persona | Finds |
|---|---|
| Forgot their password | A recovery path that was never built |
| Empty account | Empty states, usually designed last or not at all |
| Keyboard-only / screen-reader | Focus order, labels, contrast |
| Wants to leave | Export, deletion, unsubscribe |

The other ten cover the sceptic reading your privacy page, the user with 1,000 records, the
one on a slow phone, the one who cancels halfway. Full list in `references/personas.md`,
along with a good and a deliberately bad worked example.

## Layout

| Path | Purpose |
|---|---|
| `SKILL.md` | The skill — eight phases and the rules |
| `scripts/new_audit.py` | Generates the balanced scenario grid |
| `scripts/build_report.py` | Validates, computes the delta, renders |
| `scripts/findings.schema.json` | The contract every worker returns |
| `references/personas.md` | The 14 personas, the area grid, worked examples |
| `references/report-template.html` | Report shell: filters, badges, theming |
| `examples/findings.example.json` | A six-scenario run against a fictional product |

## Licence

MIT. Use it, fork it, ship it.
