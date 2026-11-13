"""Chinese names for every team and player in the demo, from 网易彩票.

网易 lists each side's starters and substitutes with shirt numbers on every match page;
Opta's "Team set up" event lists the same matchday squad with shirt numbers. Joining the
two on side + shirt number, match by match, names each Opta player, and agreement across
matches makes the name trustworthy. Teams are matched first, by date and score.

网易 only keeps line-ups for matches from September 2026 on (checked 2026-11-12), so players
who only played earlier are named from their team's current roster page instead: same shirt
number, confirmed by pinyin when the name is Han Chinese; a number-only match goes to review.

    cd pipeline && uv run python -m threader_demo.names

Writes data/names/teams.csv, players.csv and review.csv (everything a person should look at).
网易 pages are cached under pipeline/.cache/netease/, so a rerun only fetches what is new.
"""

from __future__ import annotations

import csv
import json
import re
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

import pyarrow.parquet as pq
from pypinyin import lazy_pinyin

from threader_demo import lake, netease

LEAGUES = {  # opta slug: (网易 league id, competition label on 网易 team pages)
    "chinese-super-league-2026": ("542", "中超"),
    "chinese-football-league-1-2026": ("543", "中甲"),
    "chinese-football-league-2-2026": ("544", "中乙"),
}
OUT = lake.REPO / "data" / "names"


def days_apart(a: str, b: str) -> int:
    return abs((date.fromisoformat(a) - date.fromisoformat(b)).days)


def opta_matches(slug: str) -> list[dict]:
    files = sorted((lake.lake_root() / "events" / slug).glob("*.parquet"))
    cols = ["match_id", "match_date", "home_id", "home_name", "away_id", "away_name", "home_score", "away_score", "type_id", "contestant_id", "qualifiers"]
    matches: dict[str, dict] = {}
    for f in files:
        rows = pq.read_table(f, columns=cols).to_pylist()
        m = {k: rows[0][k] for k in cols[:8]}
        m["setups"] = [r for r in rows if r["type_id"] == 34]
        matches[m["match_id"]] = m
    return list(matches.values())


def squad_names(slug: str) -> dict[str, str]:
    names = {}
    for f in (lake.lake_root() / "squads" / slug).glob("*.json"):
        for team in json.loads(f.read_text(encoding="utf-8")).get("squad", []):
            names[team["contestantId"]] = team.get("contestantName", "")
            for p in team.get("person", []):
                names[p["id"]] = p.get("matchName") or p.get("knownName") or ""
    return names


def squad_by_number(setup: dict) -> dict[int, str]:
    q = {x["qualifier_id"]: x["value"] for x in setup["qualifiers"] or []}
    ids = [s.strip() for s in q.get(30, "").split(",") if s.strip()]
    nums = [s.strip() for s in q.get(59, "").split(",")]
    return {int(n): pid for pid, n in zip(ids, nums) if n.isdigit()}


def same_pinyin(zh: str, en: str) -> bool:
    """'张帅' vs 'Zhang Shuai' (either word order)."""
    py = "".join(lazy_pinyin(zh)).lower()
    words = re.findall(r"[a-z]+", en.lower())
    return bool(words) and py in ("".join(words), "".join(reversed(words)))


def safe_fetch(path: str) -> str | None:
    try:
        return netease.fetch(path)
    except Exception as exc:  # one bad page must not stop the run
        print(f"  ! {path}: {exc}")
        return None


def run() -> None:
    team_rows, votes, seen_in = [], defaultdict(Counter), defaultdict(set)
    all_players: dict[str, str] = {}
    numbers: dict[str, Counter] = defaultdict(Counter)  # opta player -> (opta team, shirt number) counts
    netease_team: dict[str, str] = {}  # opta contestant -> 网易 team id
    en: dict[str, str] = {}
    for slug, (league_id, label) in LEAGUES.items():
        en.update(squad_names(slug))
        matches = opta_matches(slug)
        for m in matches:
            for s in m["setups"]:
                for number, pid in squad_by_number(s).items():
                    all_players[pid] = s["contestant_id"]
                    numbers[pid][(s["contestant_id"], number)] += 1

        league_html = safe_fetch(f"/league/football/{league_id}") or ""
        fixtures = {}
        for team_id in netease.parse_team_links(league_html):
            html = safe_fetch(f"/team/football/{team_id}")
            for f in netease.parse_team_fixtures(html or ""):
                if f.competition == label and f.score is not None:
                    fixtures[f.match_id] = f

        # teams: date within a day and the same score
        tvotes: dict[str, Counter] = defaultdict(Counter)
        tname: dict[str, str] = {}
        for f in fixtures.values():
            tname[f.home_id], tname[f.away_id] = f.home_name, f.away_name
            for m in matches:
                if days_apart(f.date, m["match_date"]) <= 1 and f.score == (m["home_score"], m["away_score"]):
                    tvotes[f.home_id][m["home_id"]] += 1
                    tvotes[f.away_id][m["away_id"]] += 1
        team_map = {}
        for nid, c in tvotes.items():
            (best, n), *rest = c.most_common()
            if n >= 3 and (not rest or n >= 2 * rest[0][1]):
                team_map[nid] = best
                netease_team[best] = nid
                team_rows.append(
                    {"league": label, "opta_contestant_id": best, "name_en": en.get(best, ""), "name_zh": tname[nid], "netease_team_id": nid, "votes": n}
                )

        # matches, then players by side + shirt number
        by_pair = defaultdict(list)
        for m in matches:
            by_pair[(m["home_id"], m["away_id"])].append(m)
        pairs = []
        for f in fixtures.values():
            cands = [m for m in by_pair.get((team_map.get(f.home_id), team_map.get(f.away_id)), []) if days_apart(f.date, m["match_date"]) <= 2]
            if len(cands) == 1:
                pairs.append((f, cands[0]))
        print(f"{label}: 网易 {len(fixtures)} 场, 对上 Opta {len(pairs)}/{len(matches)} 场, 球队 {len(team_map)} 支")
        for i, (f, m) in enumerate(pairs, 1):
            html = safe_fetch(f"/match/{f.match_id}")
            if not html:
                continue
            lineup = {(p.side, p.number): p for p in netease.parse_lineups(html)}
            for s in m["setups"]:
                side = "home" if s["contestant_id"] == m["home_id"] else "away"
                for number, pid in squad_by_number(s).items():
                    p = lineup.get((side, number))
                    if p:
                        votes[pid][(p.name, p.netease_id)] += 1
                        seen_in[pid].add(m["match_id"])
            if i % 50 == 0:
                print(f"  {label} {i}/{len(pairs)}")

    OUT.mkdir(parents=True, exist_ok=True)
    players, review = [], []
    taken = {nid for c in votes.values() for (_, nid), _ in c.most_common(1)}
    rosters: dict[str, list] = {}

    def roster(opta_team: str) -> list:
        nid = netease_team.get(opta_team)
        if nid and nid not in rosters:
            rosters[nid] = netease.parse_roster(safe_fetch(f"/team/football/{nid}/roster") or "")
        return rosters.get(nid, []) if nid else []

    for pid, team in sorted(all_players.items()):
        name_en = en.get(pid, "")
        row = {"opta_player_id": pid, "opta_contestant_id": team, "name_en": name_en}
        c = votes.get(pid)
        if c:
            (name, nid), top = c.most_common(1)[0]
            total = sum(c.values())
            players.append(
                {**row, "name_zh": name, "netease_player_id": nid, "method": "逐场名单", "matches": len(seen_in[pid]), "agreement": round(top / total, 2)}
            )
            if top / total < 0.8 or len({n for n, _ in c}) > 1:
                review.append(
                    {"opta_player_id": pid, "name_en": name_en, "reason": "名字不一致", "candidates": " / ".join(f"{n}×{k}" for (n, _), k in c.most_common())}
                )
            continue
        # Fallback: the team's current roster, same shirt number, pinyin as confirmation.
        found = None
        for (opta_team, number), _ in numbers[pid].most_common():
            squad = [p for p in roster(opta_team) if p.netease_id not in taken]
            by_number = [p for p in squad if p.number == number]
            pinyin = [p for p in squad if same_pinyin(p.name, name_en)]
            if len(by_number) == 1 and same_pinyin(by_number[0].name, name_en):
                found = (by_number[0], "阵容·号码+拼音", None)
            elif len(pinyin) == 1:
                found = (pinyin[0], "阵容·拼音", f"号码不同：Opta {number}，网易 {pinyin[0].number}")
            elif len(by_number) == 1:
                found = (by_number[0], "阵容·仅号码", "只靠号码对上，请确认")
            if found:
                break
        if found:
            p, method, note = found
            taken.add(p.netease_id)
            players.append({**row, "name_zh": p.name, "netease_player_id": p.netease_id, "method": method, "matches": 0, "agreement": ""})
            if note:
                review.append({"opta_player_id": pid, "name_en": name_en, "reason": note, "candidates": p.name})
        else:
            review.append({"opta_player_id": pid, "name_en": name_en, "reason": "没有对上", "candidates": ""})
    write(OUT / "teams.csv", team_rows)
    write(OUT / "players.csv", players)
    write(OUT / "review.csv", review)
    print(f"球员 {len(all_players)}: 有中文名 {len(players)}, 待核对 {len(review)}; 球队 {len(team_rows)}")


def write(path: Path, rows: list[dict]) -> None:
    with path.open("w", newline="", encoding="utf-8") as fh:
        if not rows:
            fh.write("")
            return
        w = csv.DictWriter(fh, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)


if __name__ == "__main__":
    run()
