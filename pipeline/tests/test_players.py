"""Player seasons (threader_demo/players.py) on two real matches: the readings split by player add back up to the
team's, minutes by position add up to the match page's minutes, substitutes and sendings-off land where they should."""

from __future__ import annotations

import pytest

from threader_demo import match_analysis
from threader_demo.formations import FORMATIONS
from threader_demo.match_analysis.match import Match
from threader_demo.players import GROUPS, PLACES, TAKER, LeaguePlayers, minutes_by_place, place

SLUG = "chinese-football-league-2-2026"
VIDEO_MATCH = "1p2hk9rohal69v3gav7y11nh0"  # 2026-09-19 厦门飞鹭 3–0 北京理工
RED_CARD_MATCH = "bsnrp2snxp0zvo0yo41zwo3ys"  # 2026-06-13: 刘子铭 sent off straight after half-time
FEILU = "4zx5qt414dn1x6nxpbtu2ni8k"
LIU_ZIMING = "7nmzfh8zrpkoow2wvj0aehvqh"
SUB_55 = "31z3xphdb3xa8puaecjnk9xm2"  # came on for 飞鹭 at 55′ into slot 8 of a 4-4-2


@pytest.fixture(scope="module")
def monkeypatch_module():
    mp = pytest.MonkeyPatch()
    yield mp
    mp.undo()


@pytest.fixture(scope="module")
def one_match(monkeypatch_module):
    monkeypatch_module.setattr(Match, "_clock", lambda self: None)  # same numbers whether or not the video is published
    data, m = match_analysis.build(VIDEO_MATCH)
    events_before = len(data["events"])
    lp = LeaguePlayers(SLUG, "中乙")
    lp.add(data, m)
    return data, m, lp, events_before


def team_count(lp: LeaguePlayers, key: str, tid: str) -> int:
    """How many of the team's actions in a reading went to its players."""
    return sum(1 for p in lp.players.values() for i in p.ev.get(key, []) if p.apps[p.events[i][4]]["t"] == tid)


def test_every_position_has_one_group():
    for fid, (_, slots) in FORMATIONS.items():
        for code in slots.values():
            group, name = place(fid, code)
            assert PLACES[name][2] == group, (fid, code)
    assert {g for _, _, g in PLACES.values()} == set(GROUPS)


def test_the_formation_decides_the_job():
    assert place(8, "RAM") == ("边路", "右边锋")  # 4-2-3-1: a winger
    assert place(9, "RAM") == ("中场", "右前腰")  # 4-3-2-1: behind the striker
    assert place(17, "RF") == ("中场", "右前腰")  # 3-4-2-1
    assert place(12, "RM") == ("边后卫", "右翼卫")  # 3-5-2: a wing-back
    assert place(4, "RM") == ("中场", "右中场")  # 4-3-3: a side central midfielder
    assert place(2, "RM") == ("边路", "右前卫")  # 4-4-2
    assert place(8, "CAM") == ("中场", "前腰")


def test_minutes_by_position_add_up_to_the_lineup(one_match):
    data, m, lp, _ = one_match
    for p in lp.players.values():
        for a in p.apps:
            assert abs(sum(a["places"].values()) - a["min"]) <= 1, a
    sub = lp.players[SUB_55].apps[0]
    assert not sub["st"] and list(sub["places"]) == ["左中场"]


def test_player_counts_add_up_to_the_team(one_match):
    data, m, lp, _ = one_match
    checked = 0
    for x in lp.metrics:
        key = x["key"]
        if x["format"] != "int" or key in TAKER or key.startswith("overview.personal."):
            continue
        chapter, section, metric = key.split(".")
        src = {"overview": "overview", "attack": "sections", "defence": "defence", "attack-transition": "attackTransition",
               "defence-transition": "defenceTransition", "set-pieces": "setpieces"}[chapter]
        for tid in (m.home_id, m.away_id):
            sec = next(s for s in data[src][tid] if s["key"] == section)
            team = next(mt for mt in sec["metrics"] if mt["key"] == metric)["team"]["value"]
            players = team_count(lp, key, tid)
            assert players == team, (key, tid)
            checked += 1
    assert checked > 150


def test_a_shot_after_a_set_piece_goes_to_the_taker(one_match):
    data, m, lp, _ = one_match
    corners = next(s for s in data["setpieces"][FEILU] if s["key"] == "corners")
    led = sum(1 for mk in corners["marks"] if mk.get("key"))
    taker = team_count(lp, "set-pieces.corners.shots", FEILU)
    assert taker == led


def test_splitting_leaves_the_match_page_alone(one_match):
    data, _, _, before = one_match
    assert len(data["events"]) == before


def test_export_lines_up(one_match):
    _, _, lp, _ = one_match
    out = lp.export()
    n = len(out["meta"]["stints"])
    assert all(len(rows) == n for rows in out["filters"].values())
    assert all(len(s[3]) == len(out["meta"]["metrics"]) for s in out["filters"]["all"])
    liu = dict(lp.details())[LIU_ZIMING]
    assert len(liu["metrics"]["attack.shots.shots"]["e"]) == liu["metrics"]["attack.shots.shots"]["n"][0]
    assert "dob" not in out["meta"]["players"][LIU_ZIMING]  # the age is published, not the birth date


def test_a_sending_off_ends_the_match(monkeypatch_module):
    monkeypatch_module.setattr(Match, "_clock", lambda self: None)
    data, m = match_analysis.build(RED_CARD_MATCH)
    lineup = next(s for s in data["overview"][FEILU] if s["key"] == "lineup")
    row = next(r for r in lineup["rows"] if r["playerId"] == LIU_ZIMING)
    red = next(e for e in m.team_events(FEILU) if e["type_id"] == 17 and e["player_id"] == LIU_ZIMING and 33 in e["q"])
    assert row["minutes"] == round(m.timeline_minute(red)) < 60
    assert abs(sum(minutes_by_place(m, FEILU)[LIU_ZIMING].values()) - row["minutes"]) <= 1
