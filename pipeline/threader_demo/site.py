"""Build the site's data: one file per match of the focus teams, plus the match list.

    cd pipeline && uv run python -m threader_demo.site

Writes site-data/index.json and site-data/matches/<match_id>.json (only analysis, never the
raw feed: docs/adr/0002), and data/names/missing-on-site.csv, the players the site shows
without a Chinese name (the page falls back to Opta's name for them).
"""

from __future__ import annotations

import csv
import json
import os
import sys
import time
from pathlib import Path

import pyarrow.parquet as pq

from threader_demo import lake
from threader_demo.match_analysis import build
from threader_demo.match_analysis.match import team_names

REPO = Path(__file__).resolve().parents[1].parent
OUT = Path(os.environ.get("THREADER_SITE_DATA", REPO / "site-data"))
# Focus teams on the site now: contestant id → the name the lake's match index uses.
FOCUS = {"4zx5qt414dn1x6nxpbtu2ni8k": "Xiamen Feilu"}


def focus_matches(team_id: str) -> list[str]:
    name = FOCUS[team_id]
    rows = pq.read_table(lake.lake_root() / "index.parquet", columns=["match_id", "match_date", "home_name", "away_name"]).to_pylist()
    return [r["match_id"] for r in sorted(rows, key=lambda r: r["match_date"]) if name in (r["home_name"], r["away_name"])]


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    tmp.replace(path)


def run(only: list[str] | None = None) -> None:
    teams = team_names()
    index = {"focusTeams": [], "matches": []}
    missing: dict[str, dict] = {}
    for team_id in FOCUS:
        index["focusTeams"].append({"id": team_id, "nameZh": teams[team_id]["name_zh"], "competition": teams[team_id]["league"]})
        for match_id in focus_matches(team_id):
            if only and match_id not in only:
                continue
            t0 = time.perf_counter()
            data, m = build(match_id)
            if team_id not in (m.home_id, m.away_id):
                raise SystemExit(f"{match_id}: {FOCUS[team_id]} is not playing in this match")
            data["focusTeamId"] = team_id  # the side the page opens on
            write_json(OUT / "matches" / f"{match_id}.json", data)
            mt = data["match"]
            index["matches"].append(
                {
                    "id": match_id,
                    "date": mt["date"],
                    "competition": mt["competition"],
                    "stage": mt["stage"],
                    "homeId": mt["homeId"],
                    "awayId": mt["awayId"],
                    "score": mt["score"],
                    "teams": {tid: t["nameZh"] for tid, t in data["teams"].items()},
                    "focusTeamId": team_id,
                    "video": data["video"]["available"],
                }
            )
            for p in data["players"].values():
                shown = any(r["playerId"] == p["id"] for secs in data["overview"].values() for s in secs if s["key"] == "lineup" for r in s["rows"])
                if shown and not p["nameZh"]:
                    row = missing.setdefault(
                        p["id"],
                        {"opta_player_id": p["id"], "team": data["teams"][p["teamId"]]["nameZh"], "name_en": p["nameEn"], "number": p["number"], "matches": 0},
                    )
                    row["matches"] += 1
            print(
                f"{mt['date']} {data['teams'][mt['homeId']]['nameZh']} {mt['score'][0]}–{mt['score'][1]} {data['teams'][mt['awayId']]['nameZh']}"
                f"  {len(data['events'])} events, {(OUT / 'matches' / f'{match_id}.json').stat().st_size / 1024:.0f} KB,"
                f" {'video' if data['video']['available'] else 'no video'}, {time.perf_counter() - t0:.1f}s"
            )
    if only:
        return
    write_json(OUT / "index.json", index)
    with open(REPO / "data" / "names" / "missing-on-site.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["opta_player_id", "team", "name_en", "number", "matches"], lineterminator="\n")
        w.writeheader()
        w.writerows(sorted(missing.values(), key=lambda r: (r["team"], -r["matches"])))
    print(f"{len(index['matches'])} matches → {OUT}; {len(missing)} players on the site have no Chinese name (data/names/missing-on-site.csv)")


if __name__ == "__main__":
    run(sys.argv[1:] or None)
