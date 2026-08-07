#!/usr/bin/env python3
"""Generate a scenario grid to audit any product.

    python3 new_audit.py "Acme Notes" -o findings.json
    python3 new_audit.py "Acme CLI" --kind cli -n 20
    python3 new_audit.py "Acme API" --kind api --areas landing,auth,core,billing

Writes a findings file pre-filled with N scenarios, each carrying a persona, an area and
a viewport, so no two scenarios repeat and the mandatory personas are never dropped.
Every content field arrives as a TODO for the auditor to replace.

The point is that nobody should have to invent 30 scenarios from a blank page — inventing
them badly is how audits end up testing the same happy path five times.
"""

import argparse
import json
import re
import sys
from pathlib import Path

# Personas, and the defect class each one exposes. Order matters: MANDATORY first.
PERSONAS = [
    ("forgot-password", "User who forgot their password", "recovery paths", ["auth"]),
    ("empty-account", "User with an empty account", "empty states", ["onboarding", "core"]),
    ("keyboard-only", "Keyboard-only / screen-reader user", "focus order, labels, contrast", ["core", "auth", "settings"]),
    ("wants-to-leave", "User who wants to leave", "export, deletion, unsubscribe", ["settings", "billing"]),
    ("first-visit", "First-time visitor, no context", "positioning and the first call to action", ["landing"]),
    ("sceptic", "Sceptic checking price and privacy", "pricing honesty, legal pages", ["landing", "legal", "billing"]),
    ("invited", "Invited team member", "invite flow and permissions", ["auth", "onboarding", "settings"]),
    ("returning", "Returning user after four weeks", "session expiry, stale data", ["auth", "core"]),
    ("power-user", "Paying power user", "limits, bulk actions, performance", ["core", "billing"]),
    ("exec-no-login", "Executive with no login", "public artefacts, read-only views", ["landing", "core"]),
    ("thousand-records", "User with 1,000 records", "pagination, search, timeouts", ["core"]),
    ("messy-data", "User with messy data", "unicode, long strings, nulls", ["core", "onboarding"]),
    ("slow-phone", "User on a slow phone", "bundle size, tap targets, offline", ["landing", "core"]),
    ("cancels-midway", "User who cancels midway", "half-finished state, resumability", ["onboarding", "core", "billing"]),
]
MANDATORY = {"forgot-password", "empty-account", "keyboard-only", "wants-to-leave"}

# Default areas and their share of a run. Weights, not counts — they scale with -n.
AREAS = {
    "landing": ("Landing", 3),
    "auth": ("Signup and login", 4),
    "onboarding": ("Onboarding", 4),
    "core": ("Core loop", 8),
    "settings": ("Settings and account", 3),
    "billing": ("Billing and plans", 3),
    "legal": ("Legal and privacy", 2),
    "edge": ("Failure states", 3),
}

# Products without a UI still have entry points; only the vocabulary changes.
KINDS = {
    "web": ("Desktop", "Mobile", "Tablet"),
    "mobile": ("Mobile", "Tablet", "Desktop"),
    "cli": ("Terminal",),
    "api": ("HTTP client",),
    "desktop": ("Desktop",),
}
PATH_HINT = {
    "web": "TODO: the real click path, e.g. / -> pricing -> login",
    "mobile": "TODO: the real tap path, e.g. launch -> onboarding -> permissions",
    "cli": "TODO: the real command, e.g. acme init --force",
    "api": "TODO: the real call sequence, e.g. POST /v1/session -> GET /v1/items",
    "desktop": "TODO: the real click path, e.g. launch -> File -> Import",
}


def viewports_for(kind, n):
    """Desktop 50 / mobile 35 / tablet 15 for web; single value for the rest."""
    opts = KINDS[kind]
    if len(opts) == 1:
        return [opts[0]] * n
    if kind == "mobile":
        share = [0.6, 0.25, 0.15]
    else:
        share = [0.5, 0.35, 0.15]
    out = []
    for opt, frac in zip(opts, share):
        out += [opt] * round(n * frac)
    while len(out) < n:
        out.append(opts[0])
    return out[:n]


def plan(n, kind, areas):
    """Distribute n scenarios over areas by weight, then assign personas that fit."""
    weights = {k: AREAS[k][1] for k in areas}
    total = sum(weights.values())
    counts = {k: max(1, round(n * w / total)) for k, w in weights.items()}

    # Reconcile rounding against n, taking from or giving to the heaviest areas first.
    order = sorted(counts, key=lambda k: -weights[k])
    while sum(counts.values()) > n:
        for k in reversed(order):
            if sum(counts.values()) == n:
                break
            if counts[k] > 1:
                counts[k] -= 1
    while sum(counts.values()) < n:
        for k in order:
            if sum(counts.values()) == n:
                break
            counts[k] += 1

    by_area = {}
    for slug, label, _, fits in PERSONAS:
        for a in fits:
            by_area.setdefault(a, []).append((slug, label))

    used, rows = set(), []
    for area in order:
        pool = by_area.get(area, [])
        if not pool:
            pool = [(p[0], p[1]) for p in PERSONAS]
        # Mandatory personas that belong here go first, then unused ones, then reuse.
        pool = (sorted(pool, key=lambda p: (p[0] not in MANDATORY, p[0] in used)))
        for i in range(counts[area]):
            slug, label = pool[i % len(pool)]
            used.add(slug)
            rows.append((area, slug, label))

    missing = MANDATORY - used
    if missing:
        print(f"  note: mandatory personas not placed: {', '.join(sorted(missing))}. "
              f"Add an area they fit, or raise -n.", file=sys.stderr)
    return rows


def blocked_stub(area, view, kind):
    """One placeholder per unreachable area — named, not silently dropped."""
    return {
        "id": f"{area}-unreachable",
        "title": f"TODO: what a user is trying to do in {AREAS[area][0].lower()}",
        "status": "NOT TESTABLE",
        "priority": "P1",
        "area": AREAS[area][0],
        "viewport": view,
        "persona": "Blocked area",
        "persona_goal": f"TODO: the goal a user has in {AREAS[area][0].lower()} — state it even though you cannot run it",
        "path": PATH_HINT[kind],
        "expected": "TODO: what a user reasonably expects here",
        "actual": "TODO: not executed — say exactly why (no session, writes to production, external system)",
        "problems": "TODO: unjudged. Name what stays unknown because of it",
        "fix": "TODO: what would make this area auditable — a seeded database, a throwaway account, a dry-run mode",
        "evidence": ["TODO: cite what proves the block — a connection string, an auth write, a 307"],
    }


def build(product, n, kind, areas, blocked=()):
    rows = plan(n, kind, areas)
    views = viewports_for(kind, len(rows) + len(blocked))
    seen, scenarios = set(), []

    for area in blocked:
        scenarios.append(blocked_stub(area, views.pop(), kind))
        seen.add(f"{area}-unreachable")

    for (area, slug, persona), view in zip(rows, views):
        base = f"{area}-{slug}"
        sid, k = base, 2
        while sid in seen:
            sid, k = f"{base}-{k}", k + 1
        seen.add(sid)
        scenarios.append({
            "id": sid,
            "title": f"TODO: what {persona.lower()} is trying to do here",
            "status": "UX-HYPOTHESIS",
            "priority": "P2",
            "area": AREAS[area][0],
            "viewport": view,
            "persona": persona,
            "persona_goal": f"TODO: {persona} wants to … (one sentence, with a stopping condition)",
            "path": PATH_HINT[kind],
            "expected": "TODO: what this person reasonably expects at this point",
            "actual": "TODO: what actually happened — status code, error text, observed behaviour",
            "problems": "TODO: the gap, stated as user consequence. Write 'none' if there is none",
            "fix": "TODO: one intervention, one or two sentences",
            "evidence": ["TODO: file.ext:12-20, a route, a log line or a screenshot path"],
        })

    return {
        "product": product,
        "date": "TODO: YYYY-MM-DD",
        "method": "TODO: how it was audited, and what was deliberately not touched",
        "stats": {},
        "frame": [
            {"label": "Starts locally", "value": "TODO: start command, port, first response"},
            {"label": "Type check / lint", "value": "TODO: clean or not"},
            {"label": "Tests", "value": "TODO: passed / skipped / failed"},
            {"label": "Surface", "value": "TODO: routes, endpoints, data models"},
            {"label": "Out of reach", "value": "TODO: payment, mail, cron, third parties", "ok": False},
        ],
        "blockers": [{"title": "TODO: fill after all scenarios are done",
                      "detail": "TODO: what breaks, and what it costs. Rank by priority, then by how many scenarios it hits"}],
        "scenarios": scenarios,
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("product", help="name of the product being audited")
    ap.add_argument("-n", "--scenarios", type=int, default=30)
    ap.add_argument("-k", "--kind", choices=sorted(KINDS), default="web",
                    help="what kind of product this is (default: web)")
    ap.add_argument("-a", "--areas", help="comma-separated subset of: " + ", ".join(AREAS))
    ap.add_argument("-b", "--blocked",
                    help="areas you established in phase 1 that you cannot reach (e.g. no test "
                         "account). Each gets one NOT TESTABLE stub instead of a full share")
    ap.add_argument("-o", "--out", type=Path, default=Path("findings.json"))
    args = ap.parse_args()

    areas = [a.strip() for a in args.areas.split(",")] if args.areas else list(AREAS)
    blocked = [a.strip() for a in args.blocked.split(",")] if args.blocked else []
    unknown = [a for a in areas + blocked if a not in AREAS]
    if unknown:
        print(f"unknown area(s): {', '.join(unknown)}\nknown: {', '.join(AREAS)}", file=sys.stderr)
        return 1

    areas = [a for a in areas if a not in blocked]
    if not areas:
        print("every area is blocked — arrange access before auditing, there is nothing to run",
              file=sys.stderr)
        return 1
    if args.scenarios - len(blocked) < len(areas):
        print(f"-n {args.scenarios} leaves fewer than {len(areas)} reachable scenarios after "
              f"{len(blocked)} blocked area(s); raise it or narrow --areas", file=sys.stderr)
        return 1

    data = build(args.product, args.scenarios - len(blocked), args.kind, areas, blocked)
    if blocked:
        print(f"  note: {len(blocked)} area(s) marked unreachable: {', '.join(blocked)}. "
              f"Each gets one NOT TESTABLE stub — say in it what would make the area auditable.",
              file=sys.stderr)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    spread = {}
    for s in data["scenarios"]:
        spread[s["area"]] = spread.get(s["area"], 0) + 1
    print(f"{args.out}  —  {len(data['scenarios'])} scenarios to fill in")
    for area, c in spread.items():
        print(f"    {c:2}  {area}")
    print(f"\nFill in every TODO, then:\n"
          f"    python3 {Path(__file__).parent}/build_report.py {args.out} -o audit/report.html")
    return 0


if __name__ == "__main__":
    sys.exit(main())
