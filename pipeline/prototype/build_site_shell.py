"""PROTOTYPE (throwaway): season data for the site-shell prototype (/prototype/home/ and /prototype/team/).

Every 2026 match of 中超 / 中甲 / 中乙 goes through match_analysis.build; each team's readings are summed over
the season (both its own side and what its opponents did against it), so a season number is the sum of the
match numbers the match pages show. Standings are per stage; 中乙's regular-season groups are not named in the
data, so they are inferred from who plays whom. Points count only that stage's matches (a stand-in: the real
rules may carry points over). Squads come from the lineup sections.

    cd pipeline && uv run python prototype/build_site_shell.py

Writes web/public/prototype-data/league-<slug>.json, one file per league.
"""

from __future__ import annotations

import json
import sys
import time
from collections import defaultdict
from pathlib import Path

import pyarrow.parquet as pq

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from threader_demo import lake  # noqa: E402
from threader_demo.match_analysis import build  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
OUT = REPO / "web" / "public" / "prototype-data"
SITE_MATCHES = REPO / "site-data" / "matches"
LEAGUES = [
    ("chinese-super-league-2026", "中超"),
    ("chinese-football-league-1-2026", "中甲"),
    ("chinese-football-league-2-2026", "中乙"),
]
# Chapter keys as the match page's URL uses them, in the page's order.
CHAPTERS = [
    ("overview", "overview", "概览"),
    ("sections", "attack", "进攻"),
    ("defence", "defence", "防守"),
    ("attackTransition", "attack-transition", "进攻转换"),
    ("defenceTransition", "defence-transition", "防守转换"),
    ("setpieces", "set-pieces", "定位球"),
]
STAGE_ORDER = {"常规赛": 0, "升级组": 1, "保级组": 2}


def parts(metric: dict, side: str) -> tuple[float, float] | None:
    """A reading as (numerator, denominator), so seasons add up: per match, rate, share, ratio, weighted mean."""
    c = metric.get(side)
    if not c:
        return None
    f = metric["format"]
    if f == "int":
        return float(c["value"]), 1.0
    if f == "pct":
        return float(len(c.get("okEids") or [])), float(len(c["eids"]))
    if f == "ratio":
        return float(len(c.get("numEids") or [])), float(len(c["eids"]))
    if f == "meters":
        n = len(c["eids"])
        return float(c["value"]) * n, float(n)
    return float(c["value"]), 0.0  # share: denominator filled in with the opponent's value below


def season_parts(data: dict, team_id: str, opp_id: str):
    """Yield (key, meta, team parts, opp parts) for every reading of the team's side of this match."""
    for src, chapter, _ in CHAPTERS:
        for sec in data[src][team_id]:
            for mt in sec.get("metrics") or []:
                if mt["key"].startswith("combo_"):
                    continue
                key = f"{chapter}.{sec['key']}.{mt['key']}"
                t, o = parts(mt, "team"), parts(mt, "opp")
                if mt["format"] == "meters":
                    # The match page's "height" value is the action count (production bug); the chart line has the mean.
                    line = next((ln for ln in sec.get("lines") or [] if ln.get("metric") == mt["key"]), None)
                    n = len(mt["team"]["eids"])
                    t, o = ((line["x"] * 1.05 * n, float(n)) if line and n else None), None
                if mt["format"] == "share" and t and o:
                    total = t[0] + o[0]
                    t, o = (t[0], total), (o[0], total)
                meta = {
                    "key": key,
                    "chapter": chapter,
                    "section": sec["key"],
                    "sectionTitle": sec["title"],
                    "question": sec.get("question"),
                    "label": mt["label"],
                    "format": mt["format"],
                    "hint": mt.get("hint"),
                }
                yield key, meta, t, o


def groups_of(matches: list[dict]) -> list[set[str]]:
    parent: dict[str, str] = {}

    def find(a):
        parent.setdefault(a, a)
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    for m in matches:
        parent[find(m["homeId"])] = find(m["awayId"])
    comps: dict[str, set[str]] = defaultdict(set)
    for t in list(parent):
        comps[find(t)].add(t)
    return sorted(comps.values(), key=lambda s: -len(s))


def table(team_ids, matches):
    rows = {t: {"teamId": t, "p": 0, "w": 0, "d": 0, "l": 0, "gf": 0, "ga": 0, "pts": 0} for t in team_ids}
    for m in matches:
        h, a = m["score"]
        for tid, gf, ga in ((m["homeId"], h, a), (m["awayId"], a, h)):
            r = rows[tid]
            r["p"] += 1
            r["gf"] += gf
            r["ga"] += ga
            if gf > ga:
                r["w"] += 1
                r["pts"] += 3
            elif gf == ga:
                r["d"] += 1
                r["pts"] += 1
            else:
                r["l"] += 1
    ordered = sorted(rows.values(), key=lambda r: (-r["pts"], -(r["gf"] - r["ga"]), -r["gf"]))
    for i, r in enumerate(ordered):
        r["rank"] = i + 1
    return ordered


def run_league(slug: str, name_zh: str, rows: list[dict]) -> dict:
    t0 = time.perf_counter()
    teams: dict[str, dict] = {}
    matches: list[dict] = []
    metrics: dict[str, dict] = {}
    season: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(lambda: [0.0, 0.0, 0.0, 0.0]))
    series: dict[str, dict[str, list]] = defaultdict(lambda: defaultdict(list))
    players: dict[str, dict[str, dict]] = defaultdict(dict)
    for r in sorted(rows, key=lambda r: r["match_date"]):
        data, m = build(r["match_id"])
        mt = data["match"]
        for tid, t in data["teams"].items():
            teams[tid] = {"id": tid, "nameZh": t["nameZh"], "nameEn": t["nameEn"]}
        week = m.first.get("week")
        match = {
            "id": mt["id"],
            "date": mt["date"],
            "week": int(week) if week not in (None, "") else None,
            "stage": mt["stage"],
            "homeId": mt["homeId"],
            "awayId": mt["awayId"],
            "score": mt["score"],
            "video": data["video"]["available"],
            "page": (SITE_MATCHES / f"{mt['id']}.json").exists(),
        }
        matches.append(match)
        for tid in (mt["homeId"], mt["awayId"]):
            oid = mt["awayId"] if tid == mt["homeId"] else mt["homeId"]
            for key, meta, tp, op in season_parts(data, tid, oid):
                metrics.setdefault(key, meta)
                acc = season[tid][key]
                if tp:
                    acc[0] += tp[0]
                    acc[1] += tp[1]
                if op:
                    acc[2] += op[0]
                    acc[3] += op[1]
                if meta["format"] == "int":
                    series[tid][key].append(tp[0] if tp else None)
            lineup = next(s for s in data["overview"][tid] if s["key"] == "lineup")
            for row in lineup["rows"]:
                pid = row["playerId"]
                p = data["players"][pid]
                acc = players[tid].setdefault(
                    pid,
                    {"id": pid, "nameZh": p["nameZh"] or p["nameEn"], "number": p["number"], "position": row["positionZh"],
                     "apps": 0, "starts": 0, "minutes": 0, "goals": 0, "touches": 0, "keyActions": 0},
                )
                if row["minutes"] > 0:
                    acc["apps"] += 1
                acc["starts"] += 1 if row["starter"] else 0
                acc["minutes"] += row["minutes"]
                acc["touches"] += row["touches"]["value"]
                acc["keyActions"] += row["keyActions"]["value"]
                acc["position"] = row["positionZh"] or acc["position"]
                acc["number"] = p["number"] if p["number"] is not None else acc["number"]
        for g in data["goals"]:
            if g["playerId"] and not g["ownGoal"] and g["playerId"] in players[g["teamId"]]:
                players[g["teamId"]][g["playerId"]]["goals"] += 1

    # Standings: per stage, per group inferred from who plays whom.
    stages = []
    by_stage: dict[str, list[dict]] = defaultdict(list)
    for mt in matches:
        by_stage[mt["stage"]].append(mt)
    for stage, ms in sorted(by_stage.items(), key=lambda kv: STAGE_ORDER.get(kv[0], 9)):
        comps = groups_of(ms)
        groups = []
        for i, comp in enumerate(comps):
            gms = [mt for mt in ms if mt["homeId"] in comp]
            for mt in gms:
                mt["group"] = i if len(comps) > 1 else None
            weeks = sorted({mt["week"] for mt in gms if mt["week"] is not None})
            history: dict[str, list] = defaultdict(list)
            for w in weeks:
                for r in table(comp, [mt for mt in gms if mt["week"] is not None and mt["week"] <= w]):
                    history[r["teamId"]].append([w, r["rank"], r["pts"]])
            groups.append({"name": f"第 {i + 1} 组" if len(comps) > 1 else None, "rows": table(comp, gms), "history": history})
        stages.append({"name": stage, "groups": groups})

    out = {
        "slug": slug,
        "nameZh": name_zh,
        "teams": teams,
        "matches": matches,
        "stages": stages,
        "chapters": [{"key": c, "zh": zh} for _, c, zh in CHAPTERS],
        "metrics": list(metrics.values()),
        # teamId → metric key → [team numerator, team denominator, opp numerator, opp denominator]
        "season": {tid: {k: [round(v, 3) for v in vals] for k, vals in ks.items()} for tid, ks in season.items()},
        # teamId → int metric key → the team's value in each of its matches, in date order
        "series": {tid: dict(ks) for tid, ks in series.items()},
        "players": {tid: sorted(ps.values(), key=lambda p: -p["minutes"]) for tid, ps in players.items()},
    }
    print(f"{name_zh}: {len(matches)} matches, {len(teams)} teams, {len(metrics)} readings, {time.perf_counter() - t0:.0f}s")
    return out


def main() -> None:
    index = pq.read_table(lake.lake_root() / "index.parquet", columns=["match_id", "competition_slug", "match_date"]).to_pylist()
    OUT.mkdir(parents=True, exist_ok=True)
    for slug, name_zh in LEAGUES:
        data = run_league(slug, name_zh, [r for r in index if r["competition_slug"] == slug])
        path = OUT / f"league-{slug}.json"
        path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"  → {path.relative_to(REPO)} ({path.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
