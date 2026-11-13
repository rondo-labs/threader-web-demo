"""One match loaded from the lake, with everything the chapters share.

Every number the page shows carries the ids of the events behind it, so the page can turn any
click into a video playlist without asking the server. `Match.eid` registers an event the
first time a section uses it; only registered events are written to the page's data.
"""

from __future__ import annotations

import csv
from collections import defaultdict
from functools import cache
from pathlib import Path
from urllib.parse import quote

from threader_demo import lake, video_publish
from threader_demo.formations import slot_position
from threader_demo.video_sync import VideoClock

from .football import (
    SHOT_TYPES,
    clip_kind,
    describe,
    end_xy,
    flip,
    how,
    lane,
    match_seconds,
    parse_ts,
)

NAMES = Path(__file__).resolve().parents[3] / "data" / "names"


@cache
def team_names() -> dict[str, dict]:
    with open(NAMES / "teams.csv", encoding="utf-8") as f:
        return {r["opta_contestant_id"]: r for r in csv.DictReader(f)}


@cache
def player_names() -> dict[str, str]:
    with open(NAMES / "players.csv", encoding="utf-8") as f:
        return {r["opta_player_id"]: r["name_zh"] for r in csv.DictReader(f) if r["name_zh"]}


class Match:
    def __init__(self, match_id: str):
        self.id = match_id
        events = [e for e in lake.load_events(match_id) if e["type_id"] != 43]
        events.sort(key=lambda e: (e["period_id"], parse_ts(e["timestamp"])))
        self.events = events
        self.pos = {e["event_uid"]: i for i, e in enumerate(events)}
        first = events[0]
        self.first = first
        self.home_id, self.away_id = first["home_id"], first["away_id"]
        self.other = {self.home_id: self.away_id, self.away_id: self.home_id}
        names = team_names()
        self.teams = {
            tid: {"id": tid, "side": side, "nameEn": first[f"{side}_name"], "nameZh": names.get(tid, {}).get("name_zh") or first[f"{side}_name"]}
            for tid, side in ((self.home_id, "home"), (self.away_id, "away"))
        }
        self.competition = names.get(self.home_id, {}).get("league", "")
        self.players = self._players()
        self.video_src = "/media/" + quote(video_publish.relative_path(match_id))
        self.clock = self._clock()
        self._score_and_timeline()
        self.used: dict[str, dict] = {}
        self._team_events: dict[str, list] = {}
        # set by possession.attach
        self.possessions: list[dict] = []
        self.regains: list[dict] = []
        self.regain_starts: set = set()
        self.gk_ids = {pid for pid, p in self.players.items() if p.get("position") == "GK"}

    # ------------------------------------------------------------------ loading

    def _players(self) -> dict[str, dict]:
        zh = player_names()
        en = {e["player_id"]: e["player_name"] for e in self.events if e["player_id"]}
        players: dict[str, dict] = {}
        for e in self.events:
            if e["type_id"] != 34:  # team set-up: the matchday squad with shirt numbers and formation slots
                continue
            tid = e["contestant_id"]
            ids = [s.strip() for s in e["q"].get(30, "").split(",") if s.strip()]
            nums = [s.strip() for s in e["q"].get(59, "").split(",")]
            pos = [s.strip() for s in e["q"].get(44, "").split(",")]
            slots = [s.strip() for s in e["q"].get(131, "").split(",")]
            formation = int(e["q"].get(130) or 0)
            for i, pid in enumerate(ids):
                slot = int(slots[i]) if i < len(slots) and slots[i].isdigit() else 0
                players[pid] = {
                    "id": pid,
                    "teamId": tid,
                    "number": int(nums[i]) if i < len(nums) and nums[i].isdigit() else None,
                    "starter": i < len(pos) and pos[i] != "5",
                    "slot": slot,
                    "position": slot_position(formation, slot) if slot else None,
                    "nameEn": en.get(pid, ""),
                    "nameZh": zh.get(pid, ""),
                }
        return players

    def _clock(self) -> VideoClock | None:
        """Only matches whose published file exists get a clock; events are placed on that file."""
        entry = video_publish.sync_entry(self.id)
        if not entry or not video_publish.published_path(self.id).is_file():
            return None
        anchors = video_publish.published_anchors(video_publish.source_anchors(entry))
        return VideoClock.from_anchors(anchors, self.events)

    def _score_and_timeline(self) -> None:
        """Score before each event (home, away), and the timeline where the second half starts
        right after the first half's real length."""
        self.score_before: dict[int, tuple[int, int]] = {}
        home = away = 0
        for e in self.events:
            self.score_before[e["event_uid"]] = (home, away)
            if e["type_id"] == 16:
                home_scored = (e["contestant_id"] == self.home_id) != (28 in e["q"])
                home, away = (home + 1, away) if home_scored else (home, away + 1)
        self.h1 = round(max(match_seconds(e) for e in self.events if e["period_id"] == 1) / 60, 2)
        self.end = round(self.h1 + max(match_seconds(e) - 2700 for e in self.events if e["period_id"] == 2) / 60, 2)

    # ------------------------------------------------------------------ shared helpers

    def timeline_minute(self, e) -> float:
        m = match_seconds(e) / 60
        return round(m if e["period_id"] == 1 else self.h1 + m - 45, 2)

    def eid(self, e) -> str:
        key = str(e["event_uid"])
        if key not in self.used:
            ex, ey = end_xy(e)
            self.used[key] = {
                "id": key,
                "teamId": e["contestant_id"],
                "playerId": e["player_id"] or None,
                "label": describe(e),
                "period": e["period_id"],
                "clock": f"{e['time_min']}:{e['time_sec']:02d}",
                "x": e["x"],
                "y": e["y"],
                "ex": ex,
                "ey": ey,
                "vt": self.clock.video_time(e["period_id"], e["timestamp"]) if self.clock else None,
                "kind": clip_kind(e),
                "score": list(self.score_before[e["event_uid"]]),
                "tx": self.timeline_minute(e),
            }
        return key

    def team_events(self, tid: str) -> list[dict]:
        if tid not in self._team_events:
            self._team_events[tid] = [e for e in self.events if e["contestant_id"] == tid and e["period_id"] in (1, 2)]
        return self._team_events[tid]

    def name(self, tid: str) -> str:
        return self.teams[tid]["nameZh"]

    def scored_by(self, g) -> str:
        return self.other[g["contestant_id"]] if 28 in g["q"] else g["contestant_id"]

    def count(self, lst) -> dict:
        return {"value": len(lst), "eids": [self.eid(e) for e in lst]}

    def metric(self, key, label, team, opp, hint=None) -> dict:
        return {"key": key, "label": label, "format": "int", "hint": hint, "team": self.count(team), "opp": self.count(opp)}

    def rate(self, key, label, ok_t, all_t, ok_o, all_o, hint=None) -> dict:
        def r(ok, total):
            return {"value": round(len(ok) / len(total), 3) if total else 0, "eids": [self.eid(e) for e in total], "okEids": [self.eid(e) for e in ok]}

        return {"key": key, "label": label, "format": "pct", "hint": hint, "team": r(ok_t, all_t), "opp": r(ok_o, all_o)}

    def leaders(self, lst, value=len, extra=None) -> list[dict]:
        by_player = defaultdict(list)
        for e in lst:
            if e["player_id"]:
                by_player[e["player_id"]].append(e)
        rows = [
            {"playerId": pid, "value": value(evs), "eids": [self.eid(e) for e in evs], "extra": extra(evs) if extra else None} for pid, evs in by_player.items()
        ]
        return sorted(rows, key=lambda r: -r["value"])[:6]

    def arrow_mark(self, e, side="team", key=False) -> dict:
        x, y = e["x"], e["y"]
        ex, ey = end_xy(e)
        if side == "opp":
            (x, y), (ex, ey) = flip(x, y), flip(ex, ey)
        return {
            "kind": "arrow",
            "eid": self.eid(e),
            "x": x,
            "y": y,
            "ex": ex,
            "ey": ey,
            "ok": e["outcome"] == 1,
            "key": key,
            "lane": lane(ey),
            "how": how(e),
            "entry": False,
            "period": e["period_id"],
            "side": side,
        }

    def dot_mark(self, e, side="team", goal=False, ok=True) -> dict:
        x, y = (e["x"], e["y"]) if side == "team" else flip(e["x"], e["y"])
        return {"kind": "dot", "eid": self.eid(e), "x": x, "y": y, "side": side, "period": e["period_id"], "goal": goal, "ok": ok}

    def shots_of(self, tid) -> list[dict]:
        return [e for e in self.team_events(tid) if e["type_id"] in SHOT_TYPES and 28 not in e["q"]]

    def led_to_shot(self, e, shots, window=20) -> bool:
        t0 = parse_ts(e["timestamp"])
        return any(s["period_id"] == e["period_id"] and 0 < parse_ts(s["timestamp"]) - t0 <= window for s in shots)

    # ------------------------------------------------------------------ whole moves (transitions)

    def vt_of(self, e):
        return self.used[self.eid(e)]["vt"]

    def span(self, begin, end, pre=3, post=4, longest=30):
        """One clip from just before `begin` to just after `end`, at most `longest` seconds before `end`."""
        a, b = self.vt_of(begin), self.vt_of(end)
        if a is None or b is None:
            return None
        return {"start": round(max(a - pre, b - longest - pre, 0), 2), "end": round(b + post, 2), "eids": list(dict.fromkeys([self.eid(begin), self.eid(end)]))}

    def span_metric(self, key, label, team_rows, opp_rows, hint=None) -> dict:
        """Rows are (anchor event, clip span). The anchor dates the row for the half and score filters.
        Without video every row still counts; there are just no clips to play."""

        def c(rows):
            if self.clock is None:
                return {"value": len(rows), "eids": [self.eid(a) for a, _ in rows]}
            rows = [(a, sp) for a, sp in rows if sp]
            return {"value": len(rows), "eids": [self.eid(a) for a, _ in rows], "spans": [sp for _, sp in rows]}

        return {"key": key, "label": label, "format": "int", "hint": hint, "team": c(team_rows), "opp": c(opp_rows)}
