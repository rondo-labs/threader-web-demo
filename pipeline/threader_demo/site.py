"""Build the site's data.

    cd pipeline && uv run python -m threader_demo.site

Every 2026 match of the three leagues goes through the match analysis once (about a minute). Writes, under
site-data/ (THREADER_SITE_DATA):

    leagues/<slug>.json   per league: teams, results, standings by stage, every team's season readings
    teams/<id>.json       per team: its readings match by match, its squad
    matches/<id>.json     the match pages, every analysed match (video only where published)
    ask/examples.json     the home page's example answers, until the Q&A backend exists
    index.json            the leagues and the focus teams
    pages.txt             every page path the static server needs a copy of index.html at

and data/names/missing-on-site.csv, the players the match pages show without a Chinese name. Only analysis,
never the raw feed (docs/adr/0002).
"""

from __future__ import annotations

import csv
import json
import os
import time
from pathlib import Path

import pyarrow.parquet as pq

from threader_demo import lake
from threader_demo.ask_examples import examples
from threader_demo.match_analysis import build
from threader_demo.match_analysis.match import team_names
from threader_demo.season import LEAGUES, LeagueSeason

REPO = Path(__file__).resolve().parents[1].parent
OUT = Path(os.environ.get("THREADER_SITE_DATA", REPO / "site-data"))
# Focus teams: their match pages open on their side, and the home page's example answers are about them.
FOCUS = {"4zx5qt414dn1x6nxpbtu2ni8k"}  # 厦门飞鹭


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    tmp.replace(path)


def run() -> None:
    t0 = time.perf_counter()
    names = team_names()
    index = pq.read_table(lake.lake_root() / "index.parquet", columns=["match_id", "competition_slug", "match_date"]).to_pylist()
    focus_data: dict[str, dict] = {}
    missing: dict[str, dict] = {}
    pages = ["teams", "players", "review"]
    summary = {"leagues": [], "focusTeams": [{"id": t, "nameZh": names[t]["name_zh"], "league": names[t]["league"]} for t in FOCUS]}
    seasons: dict[str, LeagueSeason] = {}
    for slug, name_zh in LEAGUES:
        t1 = time.perf_counter()
        season = seasons[slug] = LeagueSeason(slug, name_zh)
        for row in sorted((r for r in index if r["competition_slug"] == slug), key=lambda r: (r["match_date"], r["match_id"])):
            data, m = build(row["match_id"])
            season.add(data, m, page=True)
            if focus := FOCUS & {m.home_id, m.away_id}:
                data["focusTeamId"] = next(iter(focus))  # the side the page opens on without ?team=
                focus_data[m.id] = data
            write_json(OUT / "matches" / f"{m.id}.json", data)
            pages.append(f"match/{m.id}")
            note_missing(data, missing)
        season.add_awarded()
        league, teams = season.export()
        write_json(OUT / "leagues" / f"{slug}.json", league)
        for tid, team in teams.items():
            write_json(OUT / "teams" / f"{tid}.json", team)
            pages.append(f"team/{tid}")
        played = [r for r in season.results if not r.awarded]
        summary["leagues"].append(
            {"slug": slug, "nameZh": name_zh, "teams": len(teams), "matches": len(played), "video": sum(r.video for r in played)}
        )
        print(f"{name_zh}: {len(played)} matches analysed, {len(season.results) - len(played)} awarded, {len(teams)} teams, {time.perf_counter() - t1:.0f}s")
    write_json(OUT / "ask" / "examples.json", {"examples": examples(seasons["chinese-football-league-2-2026"], focus_data)})
    write_json(OUT / "index.json", summary)
    (OUT / "pages.txt").write_text("\n".join(pages) + "\n", encoding="utf-8")
    with open(REPO / "data" / "names" / "missing-on-site.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["opta_player_id", "team", "name_en", "number", "matches"], lineterminator="\n")
        w.writeheader()
        w.writerows(sorted(missing.values(), key=lambda r: (r["team"], -r["matches"])))
    print(f"{sum(p.startswith('match/') for p in pages)} match pages, {len(pages)} pages → {OUT} in {time.perf_counter() - t0:.0f}s; "
          f"{len(missing)} players on match pages have no Chinese name (data/names/missing-on-site.csv)")


def note_missing(data: dict, missing: dict[str, dict]) -> None:
    for p in data["players"].values():
        shown = any(r["playerId"] == p["id"] for secs in data["overview"].values() for s in secs if s["key"] == "lineup" for r in s["rows"])
        if shown and not p["nameZh"]:
            row = missing.setdefault(
                p["id"],
                {"opta_player_id": p["id"], "team": data["teams"][p["teamId"]]["nameZh"], "name_en": p["nameEn"], "number": p["number"], "matches": 0},
            )
            row["matches"] += 1


if __name__ == "__main__":
    run()
