#!/usr/bin/env python3
"""Render user-scenario-audit findings into a self-contained HTML report.

    python3 build_report.py findings.json -o audit/report.html
    python3 build_report.py findings.json --previous audit/last.json -o audit/report.html

Validates the findings against the rules in SKILL.md, marks the delta against a previous
run, and writes one HTML file with no external dependencies.
"""

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

STATUSES = {"VERIFIED", "PARTIAL", "MOCK", "BROKEN", "NOT TESTABLE", "UX-HYPOTHESIS"}
PRIORITIES = {"P0", "P1", "P2", "P3"}
REQUIRED = ["id", "title", "status", "priority", "area", "viewport",
            "persona_goal", "path", "expected", "actual", "problems", "fix", "evidence"]


def validate(data):
    """Return (errors, warnings). Errors block the build; warnings are printed."""
    errors, warnings = [], []
    scenarios = data.get("scenarios") or []
    if not scenarios:
        return ["findings contain no scenarios"], []

    seen_ids, seen_paths = set(), {}
    for i, s in enumerate(scenarios, 1):
        where = f"scenario {i} ({s.get('id', 'no id')})"
        for field in REQUIRED:
            if not s.get(field):
                errors.append(f"{where}: missing '{field}'")
        if s.get("status") not in STATUSES:
            errors.append(f"{where}: status {s.get('status')!r} is not one of {sorted(STATUSES)}")
        if s.get("priority") not in PRIORITIES:
            errors.append(f"{where}: priority {s.get('priority')!r} is not one of {sorted(PRIORITIES)}")
        if not s.get("evidence"):
            errors.append(f"{where}: no evidence — cite a file:line, route or log, or demote to UX-HYPOTHESIS")
        if s.get("id") in seen_ids:
            errors.append(f"{where}: duplicate id {s['id']!r} — ids must be unique so re-runs can match")
        seen_ids.add(s.get("id"))
        key = (s.get("path", "").strip().lower(), s.get("viewport"))
        if key in seen_paths:
            warnings.append(f"{where}: same click path and viewport as {seen_paths[key]!r} — the grid is too narrow")
        else:
            seen_paths[key] = s.get("id")

    n = len(scenarios)
    status = Counter(s.get("status") for s in scenarios)
    prio = Counter(s.get("priority") for s in scenarios)
    view = Counter(s.get("viewport") for s in scenarios)

    if status["UX-HYPOTHESIS"] > n / 3:
        warnings.append(
            f"{status['UX-HYPOTHESIS']}/{n} scenarios are UX-HYPOTHESIS — that is a source review, "
            "not a product audit. Run the UI and re-verify.")
    if prio["P0"] > n / 3:
        warnings.append(f"{prio['P0']}/{n} scenarios are P0 — if everything blocks, nothing does. Re-rank.")
    if view["Mobile"] < n / 3:
        warnings.append(f"only {view['Mobile']}/{n} scenarios are Mobile — that is where layout breaks. Add more.")
    if len(data.get("blockers") or []) == 0:
        warnings.append("no blockers listed — most readers only read that section")
    if not data.get("frame"):
        warnings.append("no audit frame — the reader cannot tell how much weight the findings carry")

    return errors, warnings


def mark_delta(scenarios, previous):
    """Tag each scenario fixed / new / still open / regressed against a previous run."""
    bad = {"BROKEN", "PARTIAL", "MOCK"}
    was = {s["id"]: s for s in previous.get("scenarios", [])}
    now_ids = set()

    for s in scenarios:
        now_ids.add(s["id"])
        old = was.get(s["id"])
        if old is None:
            s["delta"] = "new"
            continue
        broke_then = old.get("status") in bad or old.get("priority") in {"P0", "P1"}
        broke_now = s.get("status") in bad or s.get("priority") in {"P0", "P1"}
        if broke_then and not broke_now:
            s["delta"] = "fixed"
        elif not broke_then and broke_now:
            s["delta"] = "regressed"
        elif broke_now:
            s["delta"] = "still open"
        else:
            s["delta"] = "stable"

    gone = [s for s in previous.get("scenarios", []) if s["id"] not in now_ids]
    return gone


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("findings", type=Path, help="findings JSON (see findings.schema.json)")
    ap.add_argument("-o", "--out", type=Path, default=Path("audit/report.html"))
    ap.add_argument("-p", "--previous", type=Path, help="findings JSON of an earlier run")
    ap.add_argument("-t", "--template", type=Path,
                    default=Path(__file__).parent.parent / "references" / "report-template.html")
    ap.add_argument("--force", action="store_true", help="write the report even if validation fails")
    args = ap.parse_args()

    data = json.loads(args.findings.read_text(encoding="utf-8"))

    errors, warnings = validate(data)
    for w in warnings:
        print(f"  warning: {w}", file=sys.stderr)
    if errors:
        for e in errors:
            print(f"  error:   {e}", file=sys.stderr)
        if not args.force:
            print(f"\n{len(errors)} error(s). Fix them, or pass --force.", file=sys.stderr)
            return 1

    if args.previous:
        gone = mark_delta(data["scenarios"], json.loads(args.previous.read_text(encoding="utf-8")))
        if gone:
            print(f"  note:    {len(gone)} scenario(s) from the previous run are missing: "
                  f"{', '.join(s['id'] for s in gone[:5])}", file=sys.stderr)

    html = args.template.read_text(encoding="utf-8")
    payload = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")
    html = html.replace("__DATA__", payload).replace("__TITLE__", data.get("product", "Audit"))

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(html, encoding="utf-8")

    st = Counter(s["status"] for s in data["scenarios"])
    print(f"{args.out}  —  {len(data['scenarios'])} scenarios, "
          f"{st['BROKEN']} broken, {st['VERIFIED']} verified, "
          f"{len(data.get('blockers') or [])} blockers, {args.out.stat().st_size // 1024} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
