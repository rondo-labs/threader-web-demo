"""Player seasons (threader_demo/players.py) on two real matches: the readings split by player add back up to the
team's, minutes by position add up to the match page's minutes, substitutes and sendings-off land where they should."""

from __future__ import annotations

import pytest

from threader_demo import match_analysis
from threader_demo.formations import FORMATIONS
from threader_demo.match_analysis.match import Match
from threader_demo.players import (
    AERIAL_RATE,
    CLAIM_RATE,
    CONVERSION,
    DUEL_RATE,
    EXTRA,
    GROUPS,
    LONG_RATE,
    PLACES,
    SAVE_RATE,
    TAKER,
    LeaguePlayers,
    high_balls,
    keeper_at,
    minutes_by_place,
    place,
)

SLUG = "chinese-football-league-2-2026"
VIDEO_MATCH = "1p2hk9rohal69v3gav7y11nh0"  # 2026-09-19 厦门飞鹭 3–0 北京理工
RED_CARD_MATCH = "bsnrp2snxp0zvo0yo41zwo3ys"  # 2026-06-13: 刘子铭 sent off straight after half-time
FEILU = "4zx5qt414dn1x6nxpbtu2ni8k"
LIU_ZIMING = "7nmzfh8zrpkoow2wvj0aehvqh"
SUB_55 = "31z3xphdb3xa8puaecjnk9xm2"  # came on for 飞鹭 at 55′ into slot 8 of a 4-4-2
KEEPER_SWAP_MATCH = "c8fkt4e7j8st88wyh9ipuke1g"  # 2026-07-04 上海海港 B 5–1 北京理工: 北京理工 changed keepers at half-time
BIT = "241n9vhil35ur016gjjcwk6o3"  # 北京理工


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


# ---------------------------------------------------------------- the rates only the player pages have


@pytest.fixture(scope="module")
def fresh(one_match):
    """The same match split again, with the rates made from other readings filled in (details() hands players over)."""
    data, m, _, _ = one_match
    lp = LeaguePlayers(SLUG, "中乙")
    lp.add(data, m)
    for p in lp.players.values():
        lp._values(p)
    return data, m, lp


def rows(lp: LeaguePlayers, key: str, tid: str) -> list[tuple]:
    """(player, action) for each of the team's players' actions in a reading."""
    return [(p, i) for p in lp.players.values() for i in p.ev.get(key, []) if p.apps[p.events[i][4]]["t"] == tid]


def test_each_extra_rate_follows_its_match_reading(fresh):
    _, _, lp = fresh
    keys = [x["key"] for x in lp.metrics]
    for after, (key, _, _) in EXTRA.items():
        assert keys.index(key) == keys.index(after) + 1, key
    duel = next(x for x in lp.metrics if x["key"] == DUEL_RATE)
    assert duel["format"] == "pct" and duel["min"] == 10
    assert all("min" not in x for x in lp.metrics if x["key"] != DUEL_RATE)


def test_rates_made_from_his_other_readings(fresh):
    _, _, lp = fresh
    n = lambda p, k: len(p.ev.get(k, []))  # noqa: E731
    for p in lp.players.values():
        assert n(p, DUEL_RATE) == n(p, "defence.def_actions.tackles") + n(p, "defence.def_actions.dribbled_past")
        assert sorted(p.ok.get(DUEL_RATE, [])) == sorted(p.ev.get("defence.def_actions.tackles", []))
        assert n(p, CONVERSION) == n(p, "attack.shots.shots")
        assert sorted(p.ok.get(CONVERSION, [])) == sorted(p.ev.get("attack.shots.goals", []))
        assert n(p, LONG_RATE) == n(p, "attack.build_up.long")
        assert len(p.ok.get(LONG_RATE, [])) == sum(p.events[i][5] for i in p.ev.get("attack.build_up.long", []))
        assert n(p, "overview.personal.takeons_won") == len(p.ok.get("overview.personal.takeon_rate", []))
    assert sum(n(p, CONVERSION) for p in lp.players.values()) > 0


def test_aerial_duels_won_and_lost(fresh):
    _, m, lp = fresh
    for tid in (m.home_id, m.away_id):
        duels = [e for e in m.team_events(tid) if e["type_id"] == 44]
        assert len(rows(lp, AERIAL_RATE, tid)) == len(duels) > 0
        assert sum(1 for p, i in rows(lp, AERIAL_RATE, tid) if i in p.ok[AERIAL_RATE]) == sum(e["outcome"] == 1 for e in duels)
        assert len(rows(lp, "defence.def_actions.aerials_won", tid)) == sum(e["outcome"] == 1 for e in duels)


def test_the_save_rate_counts_his_saves_and_the_goals_he_let_in(fresh):
    _, m, lp = fresh
    for tid in (m.home_id, m.away_id):
        conceded = [g for g in m.shots_of(m.other[tid]) if g["type_id"] == 16]
        saves = len(rows(lp, "defence.box_defence.saves", tid))
        mine = rows(lp, SAVE_RATE, tid)
        assert len(mine) == saves + len(conceded)
        assert sum(1 for p, i in mine if i in p.ok[SAVE_RATE]) == saves
        assert all(p.events[i][5] == (1 if i in p.ok[SAVE_RATE] else 0) for p, i in mine)
        assert all(p.events[i][0] < 50 for p, i in mine)  # the goals are turned round: drawn at his own goal
    assert len([g for g in m.shots_of(m.home_id) if g["type_id"] == 16]) == 3  # 飞鹭 scored three


def test_high_balls_into_his_box_go_to_the_keeper(fresh):
    _, m, lp = fresh
    for tid in (m.home_id, m.away_id):
        balls = high_balls(m, m.other[tid])
        mine = rows(lp, CLAIM_RATE, tid)
        assert len(mine) == len(balls) > 0  # one keeper in goal all match
        caught = sum(1 for p, i in mine if i in p.ok[CLAIM_RATE])
        assert caught == sum(c for _, c in balls) <= sum(1 for e in m.team_events(tid) if e["type_id"] in (11, 41))
        assert all(p.events[i][2] is not None and p.events[i][2] <= 17 for p, i in mine)  # ending in his own box
        keepers = {p for p, _ in mine}
        assert len(keepers) == 1 and next(iter(keepers)).apps[-1]["places"] == {"门将": round(m.end)}


def test_goals_go_to_whoever_was_in_goal(monkeypatch_module):
    monkeypatch_module.setattr(Match, "_clock", lambda self: None)
    data, m = match_analysis.build(KEEPER_SWAP_MATCH)
    lp = LeaguePlayers(SLUG, "中乙")
    lp.add(data, m)
    first = next(pid for pid, p in m.players.items() if p["teamId"] == BIT and p["starter"] and p["slot"] == 1)
    at = keeper_at(m, BIT)
    second = at(80.0)
    assert at(10.0) == first and second not in (None, first)
    let_in = {pid: sum(1 for i in lp.players[pid].ev[SAVE_RATE] if i not in lp.players[pid].ok[SAVE_RATE]) for pid in (first, second)}
    assert let_in == {first: 4, second: 1}
