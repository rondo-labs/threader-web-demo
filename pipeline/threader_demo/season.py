"""Season data for the team pages and the 球队 entry: every 2026 match of a league, summed per team.

A season reading is the sum of what the match pages show, match by match, so a team page never disagrees with
its match pages. Averages, rates and shares are recomputed from summed parts (numerator, denominator), for the
whole season and for home matches, away matches and the last five.

Standings follow each league's format. 中乙 2026 plays a 预赛 in two zones (北区, 南区: double round robin), then a
决赛阶段: each zone's top four make the 冲甲组; the others split into 保级A组 (南区 5/7/9/11, 北区 6/8/10/12) and
保级B组 (the rest), and 预赛 points carry over in full. Teams level on points are separated by the matches between
them (points, goal difference, goals), then overall goal difference and goals: the order the 中乙 rules give.
Results awarded without a match (data/awarded-results.csv) count in the standings and nowhere else.
"""

from __future__ import annotations

import csv
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

from .match_analysis.football import stage_zh

REPO = Path(__file__).resolve().parents[2]
AWARDED = REPO / "data" / "awarded-results.csv"
LEAGUES = [
    ("chinese-super-league-2026", "中超"),
    ("chinese-football-league-1-2026", "中甲"),
    ("chinese-football-league-2-2026", "中乙"),
]
# Chapter keys as the match page's URL uses them, in the page's order (source key in the match data first).
CHAPTERS = [
    ("overview", "overview", "概览"),
    ("sections", "attack", "进攻"),
    ("defence", "defence", "防守"),
    ("attackTransition", "attack-transition", "进攻转换"),
    ("defenceTransition", "defence-transition", "防守转换"),
    ("setpieces", "set-pieces", "定位球"),
]
FILTERS = ("all", "home", "away", "last5")
NORTH_ANCHOR = "241n9vhil35ur016gjjcwk6o3"  # 北京理工 plays in 中乙's 北区
FINAL_STAGES = ("Promotion Group", "Relegation Round")


def parts(metric: dict, side: str) -> tuple[float, float] | None:
    """A reading as (numerator, denominator), so a season adds up: per match, rate, ratio, weighted mean, share."""
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
    return float(c["value"]), 0.0  # share: the denominator is both teams' count, filled in by readings()


def readings(data: dict, team_id: str) -> dict[str, dict]:
    """Every reading on the team's side of one match: key → {meta, team parts, opp parts}."""
    out = {}
    for src, chapter, _ in CHAPTERS:
        for sec in data[src][team_id]:
            for mt in sec.get("metrics") or []:
                if mt["key"].startswith("combo_"):  # pairs of players change from match to match
                    continue
                t, o = parts(mt, "team"), parts(mt, "opp")
                if mt["format"] == "share" and t and o:
                    total = t[0] + o[0]
                    t, o = (t[0], total), (o[0], total)
                meta = {
                    "key": f"{chapter}.{sec['key']}.{mt['key']}",
                    "chapter": chapter,
                    "section": sec["key"],
                    "sectionTitle": sec["title"],
                    "question": sec.get("question"),
                    "label": mt["label"],
                    "format": mt["format"],
                    "hint": mt.get("hint"),
                }
                out[meta["key"]] = {"meta": meta, "team": t, "opp": o}
    return out


@dataclass
class Result:
    id: str
    date: str
    week: int | None
    stage: str  # as the lake names it: Regular Season, Promotion Group, Relegation Round
    home: str
    away: str
    hs: int
    aws: int
    video: bool = False
    page: bool = False
    awarded: str | None = None


def totals(teams, results: list[Result]) -> dict[str, dict]:
    rows = {t: {"teamId": t, "p": 0, "w": 0, "d": 0, "l": 0, "gf": 0, "ga": 0, "pts": 0} for t in teams}
    for r in results:
        for tid, gf, ga in ((r.home, r.hs, r.aws), (r.away, r.aws, r.hs)):
            if tid not in rows:
                continue
            row = rows[tid]
            row["p"] += 1
            row["gf"] += gf
            row["ga"] += ga
            if gf > ga:
                row["w"] += 1
                row["pts"] += 3
            elif gf == ga:
                row["d"] += 1
                row["pts"] += 1
            else:
                row["l"] += 1
    return rows


def rank(teams, results: list[Result], carried: dict[str, dict] | None = None, h2h: list[Result] | None = None, names=None) -> list[dict]:
    """A table, best first. `carried` adds an earlier stage's totals; ties look at the matches between the tied teams
    in `h2h` (default: `results`)."""
    rows = totals(teams, results)
    for t, c in (carried or {}).items():
        if t in rows:
            for k in ("p", "w", "d", "l", "gf", "ga", "pts"):
                rows[t][k] += c[k]
    by_pts: dict[int, list[str]] = defaultdict(list)
    for t, r in rows.items():
        by_pts[r["pts"]].append(t)
    ordered: list[str] = []
    for pts in sorted(by_pts, reverse=True):
        tied = by_pts[pts]
        pool = [r for r in (h2h if h2h is not None else results) if r.home in tied and r.away in tied]
        mini = totals(tied, pool)
        tied.sort(
            key=lambda t: (
                -mini[t]["pts"],
                -(mini[t]["gf"] - mini[t]["ga"]),
                -mini[t]["gf"],
                -(rows[t]["gf"] - rows[t]["ga"]),
                -rows[t]["gf"],
                (names or {}).get(t, t),
            )
        )
        ordered += tied
    return [{**rows[t], "rank": i + 1} for i, t in enumerate(ordered)]


def components(results: list[Result]) -> list[set[str]]:
    """Groups of teams that play each other: a stage's zones or groups."""
    parent: dict[str, str] = {}

    def find(a: str) -> str:
        parent.setdefault(a, a)
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    for r in results:
        parent[find(r.home)] = find(r.away)
    groups: dict[str, set[str]] = defaultdict(set)
    for t in list(parent):
        groups[find(t)].add(t)
    return sorted(groups.values(), key=lambda g: (-len(g), sorted(g)))


class LeagueSeason:
    """One league's season, fed one built match at a time."""

    def __init__(self, slug: str, name_zh: str):
        self.slug, self.name_zh = slug, name_zh
        self.teams: dict[str, dict] = {}
        self.results: list[Result] = []
        self.metrics: dict[str, dict] = {}
        self.played: dict[str, list[tuple[Result, dict]]] = defaultdict(list)  # team → (match, readings), date order
        self.players: dict[str, dict[str, dict]] = defaultdict(dict)
        self.group_of: dict[str, str | None] = {}

    def add(self, data: dict, m, page: bool) -> None:
        mt = data["match"]
        for tid, t in data["teams"].items():
            self.teams[tid] = {"id": tid, "nameZh": t["nameZh"], "nameEn": t["nameEn"]}
        week = m.first.get("week")
        r = Result(
            id=mt["id"], date=mt["date"], week=int(week) if week not in (None, "") else None, stage=m.first["stage_name"],
            home=mt["homeId"], away=mt["awayId"], hs=mt["score"][0], aws=mt["score"][1],
            video=data["video"]["available"], page=page,
        )
        self.results.append(r)
        for tid in (r.home, r.away):
            rd = readings(data, tid)
            for key, x in rd.items():
                self.metrics.setdefault(key, x["meta"])
            self.played[tid].append((r, rd))
            lineup = next(s for s in data["overview"][tid] if s["key"] == "lineup")
            for row in lineup["rows"]:
                p = data["players"][row["playerId"]]
                acc = self.players[tid].setdefault(
                    p["id"],
                    {"id": p["id"], "nameZh": p["nameZh"] or p["nameEn"], "number": p["number"], "position": row["positionZh"],
                     "apps": 0, "starts": 0, "minutes": 0, "goals": 0, "touches": 0, "keyActions": 0},
                )
                acc["apps"] += 1 if row["minutes"] > 0 else 0
                acc["starts"] += 1 if row["starter"] else 0
                acc["minutes"] += row["minutes"]
                acc["touches"] += row["touches"]["value"]
                acc["keyActions"] += row["keyActions"]["value"]
                acc["position"] = row["positionZh"] or acc["position"]
                if p["number"] is not None:
                    acc["number"] = p["number"]
        for g in data["goals"]:
            if g["playerId"] and not g["ownGoal"] and g["playerId"] in self.players[g["teamId"]]:
                self.players[g["teamId"]][g["playerId"]]["goals"] += 1

    def add_awarded(self) -> None:
        if not AWARDED.exists():
            return
        with open(AWARDED, encoding="utf-8") as f:
            for row in csv.DictReader(f):
                if row["competition_slug"] != self.slug:
                    continue
                self.results.append(
                    Result(
                        id=f"awarded-{row['date']}-{row['home_id'][:6]}-{row['away_id'][:6]}", date=row["date"], week=int(row["week"]),
                        stage=row["stage_name"], home=row["home_id"], away=row["away_id"],
                        hs=int(row["home_score"]), aws=int(row["away_score"]), awarded=row["note"],
                    )
                )
        self.results.sort(key=lambda r: (r.date, r.id))

    # ------------------------------------------------------------------ standings

    def stages(self) -> list[dict]:
        names = {t: v["nameZh"] for t, v in self.teams.items()}
        pre = [r for r in self.results if r.stage not in FINAL_STAGES]
        zones = components(pre)
        named: list[tuple[str | None, set[str]]]
        if len(zones) == 2:
            north = next(z for z in zones if NORTH_ANCHOR in z) if any(NORTH_ANCHOR in z for z in zones) else zones[0]
            named = [("北区", north), ("南区", next(z for z in zones if z is not north))]
        else:
            named = [(None, z) for z in zones]
        pre_tables = {}
        groups = []
        for name, zone in named:
            res = [r for r in pre if r.home in zone]
            for r in res:
                self.group_of[r.id] = name
            pre_tables[name] = rank(zone, res, names=names)
            groups.append({"name": name, "rows": pre_tables[name], "history": self._history(zone, res, None, [], names)})
        out = [{"name": stage_zh(self.name_zh, "Regular Season"), "groups": groups}]
        final = [r for r in self.results if r.stage in FINAL_STAGES]
        if not final:
            return out
        carried = {row["teamId"]: row for table in pre_tables.values() for row in table}
        south5 = pre_tables.get("南区", [None] * 5)[4]
        fgroups = []
        for stage in FINAL_STAGES:
            for comp in components([r for r in final if r.stage == stage]):
                if stage == "Promotion Group":
                    name = "冲甲组"
                else:
                    name = "保级A组" if south5 and south5["teamId"] in comp else "保级B组"
                res = [r for r in final if r.stage == stage and r.home in comp]
                for r in res:
                    self.group_of[r.id] = name
                rows = rank(comp, res, carried=carried, h2h=self.results, names=names)
                fgroups.append({"name": name, "rows": rows, "history": self._history(comp, res, carried, pre, names)})
        fgroups.sort(key=lambda g: {"冲甲组": 0, "保级A组": 1, "保级B组": 2}.get(g["name"], 9))
        out.append({"name": "决赛阶段", "note": "积分含预赛带入", "groups": fgroups})
        return out

    def _history(self, teams, res: list[Result], carried, earlier: list[Result], names) -> dict[str, list[list[int]]]:
        """Each team's rank and points after every round of this stage; ties look at `earlier` (finished stages)
        and this stage's matches so far."""
        hist: dict[str, list[list[int]]] = defaultdict(list)
        weeks = sorted({r.week for r in res if r.week is not None})
        for w in weeks:
            upto = [r for r in res if r.week is not None and r.week <= w]
            for row in rank(teams, upto, carried=carried, h2h=earlier + upto, names=names):
                hist[row["teamId"]].append([w, row["rank"], row["pts"]])
        return dict(hist)

    # ------------------------------------------------------------------ export

    def season_sums(self, team_id: str, which: str) -> dict[str, list[float]]:
        rows = self.played[team_id]
        if which == "home":
            rows = [x for x in rows if x[0].home == team_id]
        elif which == "away":
            rows = [x for x in rows if x[0].away == team_id]
        elif which == "last5":
            rows = rows[-5:]
        acc: dict[str, list[float]] = defaultdict(lambda: [0.0, 0.0, 0.0, 0.0])
        for _, rd in rows:
            for key, x in rd.items():
                a = acc[key]
                if x["team"]:
                    a[0] += x["team"][0]
                    a[1] += x["team"][1]
                if x["opp"]:
                    a[2] += x["opp"][0]
                    a[3] += x["opp"][1]
        return {k: [round(v, 2) for v in a] for k, a in acc.items()}

    def export(self) -> tuple[dict, dict[str, dict]]:
        stages = self.stages()
        league = {
            "slug": self.slug,
            "nameZh": self.name_zh,
            "teams": self.teams,
            "matches": [
                {
                    "id": r.id, "date": r.date, "week": r.week, "stage": stage_zh(self.name_zh, r.stage), "group": self.group_of.get(r.id),
                    "homeId": r.home, "awayId": r.away, "score": [r.hs, r.aws], "video": r.video, "page": r.page,
                    **({"awarded": r.awarded} if r.awarded else {}),
                }
                for r in self.results
            ],
            "stages": stages,
            "metrics": list(self.metrics.values()),
            # filter → team → reading → [team numerator, team denominator, opponents' numerator, denominator]
            "season": {f: {t: self.season_sums(t, f) for t in self.teams} for f in FILTERS},
        }
        teams = {}
        for t in self.teams:
            played = self.played[t]
            series: dict[str, list] = defaultdict(list)
            for _, rd in played:
                for key in self.metrics:
                    x = rd.get(key)
                    tp = x["team"] if x else None
                    series[key].append(round(tp[0] / tp[1], 3) if tp and tp[1] else None)
            teams[t] = {
                "id": t,
                "league": self.slug,
                "matches": [r.id for r, _ in played],
                "series": dict(series),
                "players": sorted(self.players[t].values(), key=lambda p: -p["minutes"]),
            }
        return league, teams
