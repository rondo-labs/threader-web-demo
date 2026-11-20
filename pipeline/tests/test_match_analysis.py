"""Regression check: the 2026-09-19 match's numbers are the ones settled on the prototype.

The digest keeps every metric's value for both teams, how many marks each chart draws and
every reading, for all six chapters. After a deliberate change of definition, rewrite it:

    cd pipeline && UPDATE_GOLDEN=1 uv run pytest
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

from threader_demo import match_analysis
from threader_demo.match_analysis.match import Match

MATCH_ID = "1p2hk9rohal69v3gav7y11nh0"  # 2026-09-19 厦门飞鹭 3–0 北京理工
PENALTY_MATCH = "c8fkt4e7j8st88wyh9ipuke1g"  # 2026-07-04 上海海港 B 5–1 北京理工: a penalty scored and two set-piece goals
GOLDEN = Path(__file__).parent / "golden" / f"{MATCH_ID}.json"
CHAPTERS = ("overview", "sections", "defence", "attackTransition", "defenceTransition", "setpieces")


def digest(data: dict) -> dict:
    out = {}
    for chapter in CHAPTERS:
        for tid, sections in data[chapter].items():
            for s in sections:
                row = {"readings": s["readings"]}
                if "marks" in s:
                    row["marks"] = len(s["marks"])
                for metric in s.get("metrics", []):
                    row[metric["key"]] = [metric["team"]["value"], metric["opp"]["value"] if metric["opp"] else None]
                if s.get("kind") == "lineup":
                    row["rows"] = [[r["playerId"], r["minutes"], r["touches"]["value"], r["keyActions"]["value"]] for r in s["rows"]]
                if s.get("kind") == "goals":
                    row["items"] = [[i["clock"], i["source"], i["passes"], i["seconds"], i["startZone"]] for i in s["items"]]
                out[f"{chapter}/{data['teams'][tid]['nameZh']}/{s['key']}"] = row
    return out


@pytest.fixture(scope="module")
def built(monkeypatch_module):
    monkeypatch_module.setattr(Match, "_clock", lambda self: None)  # same numbers whether or not the video is published
    data, _ = match_analysis.build(MATCH_ID)
    return json.loads(json.dumps(data, ensure_ascii=False))


@pytest.fixture(scope="module")
def monkeypatch_module():
    mp = pytest.MonkeyPatch()
    yield mp
    mp.undo()


def test_numbers_match_the_prototype(built):
    got = digest(built)
    if os.environ.get("UPDATE_GOLDEN"):
        GOLDEN.write_text(json.dumps(got, ensure_ascii=False, indent=1), encoding="utf-8")
    assert got == json.loads(GOLDEN.read_text(encoding="utf-8"))


def test_every_mark_and_number_points_at_known_events(built):
    events = built["events"]
    for chapter in CHAPTERS:
        for sections in built[chapter].values():
            for s in sections:
                for metric in s.get("metrics", []):
                    for side in ("team", "opp"):
                        c = metric[side]
                        if c:
                            assert all(e in events for e in c["eids"] + c.get("okEids", []) + c.get("numEids", [])), metric["key"]
                for mark in s.get("marks", []):
                    assert all(e in events for e in ([mark["eid"]] if "eid" in mark else mark.get("eids", []))), s["key"]


def team_values(sections: list[dict]) -> dict[str, dict[str, float]]:
    return {s["key"]: {mt["key"]: mt["team"]["value"] for mt in s.get("metrics", [])} for s in sections}


def check_set_piece_totals(data: dict) -> None:
    """全部定位球 is corners, free kicks and throw-ins together, penalties apart; 运动战禁区内射门 reads the same from
    the attacking side (射门) and the defending side (禁区防守)."""
    home, away = data["match"]["homeId"], data["match"]["awayId"]
    for tid, opp in ((home, away), (away, home)):
        sp, shots = team_values(data["setpieces"][tid]), team_values(data["sections"][tid])["shots"]
        overall = sp["overall"]
        assert overall["shots"] == overall["from_corners"] + overall["from_free_kicks"] + overall["from_throw_ins"] == shots["set_piece"]
        assert overall["from_corners"] == sp["corners"]["shots"]
        assert overall["from_free_kicks"] == sp["free_kicks"]["direct"] + sp["free_kicks"]["shots_after"]
        assert overall["from_throw_ins"] == sp["throw_ins"]["shots_after"]
        assert overall["goals"] == sp["corners"]["goals"] + sp["free_kicks"]["goals"] + sp["throw_ins"]["goals"]
        assert team_values(data["defence"][opp])["box_defence"]["shots_in_open"] == shots["open_play_box"] <= shots["in_box"]


def test_set_piece_totals_add_up(built):
    check_set_piece_totals(built)


def test_a_penalty_is_not_a_set_piece(monkeypatch_module):
    monkeypatch_module.setattr(Match, "_clock", lambda self: None)
    data, m = match_analysis.build(PENALTY_MATCH)
    data = json.loads(json.dumps(data, ensure_ascii=False))
    check_set_piece_totals(data)
    scored = [tid for tid in data["teams"] if team_values(data["setpieces"][tid])["free_kicks"]["pen_goals"]]
    assert len(scored) == 1
    sp = team_values(data["setpieces"][scored[0]])
    assert sp["free_kicks"]["pen_goals"] == 1 and sp["overall"]["goals"] == 2
    pens = [x for x in m.shots_of(scored[0]) if 9 in x["q"]]
    shots = team_values(data["sections"][scored[0]])["shots"]
    assert len(pens) == sp["free_kicks"]["penalties"] >= 1
    assert shots["open_play_box"] + len(pens) <= shots["in_box"]  # a penalty is neither open play nor a set piece


def test_without_video_the_transition_funnels_still_count(built):
    counter = next(s for s in built["attackTransition"][built["match"]["homeId"]] if s["key"] == "counter")
    total = next(mt for mt in counter["metrics"] if mt["key"] == "all")
    assert total["team"]["value"] == 47 and "spans" not in total["team"]
