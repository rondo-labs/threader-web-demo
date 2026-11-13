#!/usr/bin/env python3
"""PROTOTYPE: builds the data for the match-analysis UI prototype (web/prototype/match-analysis/).

Throwaway. The football definitions below are first drafts so the three layouts can be
judged on a real match; they are not the production metrics. Run from the repo root:

    uv run --project pipeline python pipeline/prototype/build_match_analysis.py

Every number and every mark carries the ids of the events behind it, so the page can
turn any click into a video playlist without asking the server.
"""

from __future__ import annotations

import json
import math
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from threader_demo import lake, netease  # noqa: E402
from threader_demo.formations import FORMATIONS, POSITIONS, slot_position  # noqa: E402
from threader_demo.video_sync import VideoClock, parse_ts  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
MATCH_ID = "1p2hk9rohal69v3gav7y11nh0"  # 2026-09-19 厦门飞鹭 3–0 北京理工
NETEASE_MATCH = "5508081"
NETEASE_TEAM_ZH = {"home": "厦门飞鹭", "away": "北京理工"}
VIDEO_SRC = "/media/prototype/20260919-xiamen-bit.mp4"
OUT = REPO / "web" / "public" / "prototype-data" / f"match-{MATCH_ID}.json"

BOX_X, BOX_Y0, BOX_Y1 = 83.0, 21.1, 78.9  # Opta penalty area
THIRD = 66.7
SHOT_TYPES = {13, 14, 15, 16}
TOUCH_TYPES = {1, 2, 3, 7, 8, 10, 11, 12, 13, 14, 15, 16, 41, 42, 44, 45, 49, 50, 52, 54, 59, 61, 74}
STAGE_ZH = {"Regular Season": "常规赛", "Relegation Round": "保级组", "Promotion Group": "升级组"}

# --------------------------------------------------------------------------- load

events = [e for e in lake.load_events(MATCH_ID) if e["type_id"] != 43]
events.sort(key=lambda e: (e["period_id"], parse_ts(e["timestamp"])))
clock = VideoClock.for_match(MATCH_ID, events)
first = events[0]
home_id, away_id = first["home_id"], first["away_id"]
teams = {
    home_id: {"id": home_id, "side": "home", "nameEn": first["home_name"], "nameZh": NETEASE_TEAM_ZH["home"]},
    away_id: {"id": away_id, "side": "away", "nameEn": first["away_name"], "nameZh": NETEASE_TEAM_ZH["away"]},
}
other = {home_id: away_id, away_id: home_id}

# --------------------------------------------------------------------------- players, Chinese names by side + shirt number

zh_by_number = {(p.side, p.number): p.name for p in netease.parse_lineups(netease.fetch(f"/match/{NETEASE_MATCH}"))}
en_names = {e["player_id"]: e["player_name"] for e in events if e["player_id"]}
players: dict[str, dict] = {}
for e in events:
    if e["type_id"] != 34:
        continue
    tid = e["contestant_id"]
    ids = [s.strip() for s in e["q"].get(30, "").split(",") if s.strip()]
    nums = [s.strip() for s in e["q"].get(59, "").split(",")]
    pos = [s.strip() for s in e["q"].get(44, "").split(",")]
    slots = [s.strip() for s in e["q"].get(131, "").split(",")]
    formation = int(e["q"].get(130) or 0)
    for i, pid in enumerate(ids):
        number = int(nums[i]) if i < len(nums) and nums[i].isdigit() else None
        slot = int(slots[i]) if i < len(slots) and slots[i].isdigit() else 0
        players[pid] = {
            "id": pid,
            "teamId": tid,
            "number": number,
            "starter": i < len(pos) and pos[i] != "5",
            "slot": slot,
            "position": slot_position(formation, slot) if slot else None,
            "nameEn": en_names.get(pid, ""),
            "nameZh": zh_by_number.get((teams[tid]["side"], number), ""),
        }

# --------------------------------------------------------------------------- helpers


def end_xy(e):
    try:
        return float(e["q"][140]), float(e["q"][141])
    except (KeyError, ValueError):
        return None, None


def in_box(x, y):
    return x is not None and x >= BOX_X and BOX_Y0 <= y <= BOX_Y1


def lane(y):  # attacking perspective: Opta y = 100 is the attacking team's left touchline
    return "left" if y > 66.7 else "right" if y < 33.3 else "center"


def how(e):
    q = e["q"]
    return "cross" if 2 in q else "through" if 4 in q else "long" if 1 in q else "pass"


def match_seconds(e):
    return e["time_min"] * 60 + e["time_sec"]


def shot_info(e):
    q, t = e["q"], e["type_id"]
    return {
        "goal": t == 16,
        "onTarget": t == 16 or (t == 15 and 82 not in q),
        "blocked": t == 15 and 82 in q,
        "big": 214 in q,
        "header": 15 in q,
        "setPiece": any(k in q for k in (24, 25, 26, 9, 160)),
        "fastBreak": 23 in q,
        "inBox": in_box(e["x"], e["y"]),
    }


TYPE_ZH = {
    2: "越位传球", 7: "抢断", 8: "拦截", 11: "门将摘球", 12: "解围", 18: "换下", 19: "换上", 41: "门将击球", 45: "被过",
    49: "抢第二落点", 50: "被抢断", 51: "失误", 52: "门将拿球", 54: "门将扑脚下球", 55: "制造越位", 56: "护球出界",
    59: "门将出球解围", 61: "停球失误", 74: "封堵传球",
}


def describe(e):
    q, t = e["q"], e["type_id"]
    if t in SHOT_TYPES:
        s = shot_info(e)
        what = "进球" if s["goal"] else "射门被封堵" if s["blocked"] else "射正被扑" if t == 15 else "击中门框" if t == 14 else "射偏"
        body = "头球" if 15 in q else "左脚" if 72 in q else "右脚" if 20 in q else ""
        situation = (
            "点球" if 9 in q else "直接任意球" if 26 in q else "角球后" if 25 in q else "定位球后" if 24 in q
            else "界外球后" if 160 in q else "反击" if 23 in q else ""
        )
        return " · ".join(x for x in (what, situation, body, "绝佳机会" if s["big"] else "") if x)
    if t == 1:
        kind = (
            "角球" if 6 in q else "任意球" if 5 in q else "界外球" if 107 in q else "球门球" if 124 in q
            else "传中" if 2 in q else "直塞" if 4 in q else "长传" if 1 in q else "传球"
        )
        result = "成功" if e["outcome"] == 1 else "失败"
        extra = "助攻" if e.get("assist") == 1 else "形成射门" if e.get("key_pass") == 1 else ""
        return " · ".join(x for x in (kind, result, extra) if x)
    ok = e["outcome"] == 1
    if t == 4:
        return "犯规" if not ok else "被犯规"
    if t == 44:
        return "争顶 · " + ("成功" if ok else "失败")
    if t == 3:
        return "过人 · " + ("成功" if ok else "失败")
    if t == 10:
        return "封堵射门" if 94 in q else "门将扑救"
    if t == 17:
        return "红牌" if 33 in q else "两黄变红" if 32 in q else "黄牌"
    return TYPE_ZH.get(t, e["type_name"])


def clip_kind(e):
    if e["type_id"] == 16:
        return "goal"
    if e["type_id"] in SHOT_TYPES:
        return "shot"
    if e["type_id"] == 1 and 2 in e["q"]:
        return "cross"
    return "pass"


# score before each event (home, away) and the event's place on a match timeline in minutes,
# where the second half starts right after the first half's real length
score_before: dict[int, tuple[int, int]] = {}
_home = _away = 0
for e in events:
    score_before[e["event_uid"]] = (_home, _away)
    if e["type_id"] == 16:
        home_scored = (e["contestant_id"] == home_id) != (28 in e["q"])
        _home, _away = (_home + 1, _away) if home_scored else (_home, _away + 1)
H1_MINUTES = round(max(match_seconds(e) for e in events if e["period_id"] == 1) / 60, 2)
END_MINUTES = round(H1_MINUTES + max(match_seconds(e) - 2700 for e in events if e["period_id"] == 2) / 60, 2)


def timeline_minute(e):
    m = match_seconds(e) / 60
    return round(m if e["period_id"] == 1 else H1_MINUTES + m - 45, 2)


used: dict[str, dict] = {}


def eid(e) -> str:
    key = str(e["event_uid"])
    if key not in used:
        ex, ey = end_xy(e)
        used[key] = {
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
            "vt": clock.video_time(e["period_id"], e["timestamp"]) if clock else None,
            "kind": clip_kind(e),
            "score": list(score_before[e["event_uid"]]),
            "tx": timeline_minute(e),
        }
    return key


def count(lst):
    return {"value": len(lst), "eids": [eid(e) for e in lst]}


def metric(key, label, team, opp, hint=None):
    return {"key": key, "label": label, "format": "int", "hint": hint, "team": count(team), "opp": count(opp)}


def rate(key, label, ok_t, all_t, ok_o, all_o, hint=None):
    def r(ok, total):
        return {"value": round(len(ok) / len(total), 3) if total else 0, "eids": [eid(e) for e in total], "okEids": [eid(e) for e in ok]}

    return {"key": key, "label": label, "format": "pct", "hint": hint, "team": r(ok_t, all_t), "opp": r(ok_o, all_o)}


def leaders(lst, value=len, extra=None):
    by_player = defaultdict(list)
    for e in lst:
        if e["player_id"]:
            by_player[e["player_id"]].append(e)
    rows = [
        {"playerId": pid, "value": value(evs), "eids": [eid(e) for e in evs], "extra": extra(evs) if extra else None}
        for pid, evs in by_player.items()
    ]
    return sorted(rows, key=lambda r: -r["value"])[:6]


def team_events(tid):
    return [e for e in events if e["contestant_id"] == tid and e["period_id"] in (1, 2)]


def name(tid):
    return teams[tid]["nameZh"]


# --------------------------------------------------------------------------- sections


def shots_section(t, o):
    def shots(tid):
        return [e for e in team_events(tid) if e["type_id"] in SHOT_TYPES and 28 not in e["q"]]

    st, so = shots(t), shots(o)

    def where(lst, key):
        return [e for e in lst if shot_info(e)[key]]

    in_box_t = where(st, "inBox")
    return {
        "key": "shots",
        "title": "射门",
        "question": "他们从哪里射门，射得怎么样？",
        "pitch": "half",
        "marks": [{"kind": "shot", "eid": eid(e), "x": e["x"], "y": e["y"], "period": e["period_id"], **shot_info(e)} for e in st],
        "metrics": [
            metric("shots", "射门", st, so),
            metric("on_target", "射正", where(st, "onTarget"), where(so, "onTarget")),
            metric("goals", "进球", where(st, "goal"), where(so, "goal")),
            metric("big", "绝佳机会", where(st, "big"), where(so, "big"), "Opta 标注的绝佳机会"),
            metric("in_box", "禁区内射门", in_box_t, where(so, "inBox")),
            metric("headers", "头球射门", where(st, "header"), where(so, "header")),
            metric("set_piece", "定位球射门", where(st, "setPiece"), where(so, "setPiece")),
            metric("fast_break", "反击射门", where(st, "fastBreak"), where(so, "fastBreak")),
        ],
        "leadersLabel": "射门最多",
        "leaders": leaders(st, extra=lambda evs: f"进球 {sum(e['type_id'] == 16 for e in evs)}"),
        "readings": [
            f"{name(t)}射门 {len(st)} 次，射正 {len(where(st, 'onTarget'))} 次，进球 {len(where(st, 'goal'))} 个；"
            f"{name(o)}射门 {len(so)} 次。",
            f"{len(in_box_t)} 次射门在禁区内，{len(where(st, 'big'))} 次是 Opta 标注的绝佳机会。",
        ],
        "legend": ["goal", "on", "off", "blocked", "big"],
    }


def entries_section(t, o):
    def attempts(tid):
        out = []
        for e in team_events(tid):
            ex, _ = end_xy(e)
            if e["type_id"] == 1 and ex is not None and e["x"] < THIRD <= ex and not any(k in e["q"] for k in (107, 6, 124)):
                out.append(e)
        return out

    def box(tid):
        return [
            e for e in team_events(tid)
            if e["type_id"] == 1 and e["outcome"] == 1 and 6 not in e["q"]
            and in_box(*end_xy(e)) and not in_box(e["x"], e["y"])
        ]

    def ok(lst):
        return [e for e in lst if e["outcome"] == 1]

    at, ao = attempts(t), attempts(o)
    bt, bo = box(t), box(o)
    box_ids = {eid(e) for e in bt}
    lanes_t = {k: [e for e in ok(at) if lane(end_xy(e)[1]) == k] for k in ("left", "center", "right")}
    lanes_o = {k: [e for e in ok(ao) if lane(end_xy(e)[1]) == k] for k in ("left", "center", "right")}
    drawn = {eid(e): e for e in at + bt}
    marks = []
    for key, e in drawn.items():
        ex, ey = end_xy(e)
        marks.append({"kind": "arrow", "eid": key, "x": e["x"], "y": e["y"], "ex": ex, "ey": ey,
                      "ok": e["outcome"] == 1, "key": key in box_ids, "lane": lane(ey), "how": how(e),
                      "entry": e["x"] < THIRD <= ex, "period": e["period_id"]})
    lane_zh = {"left": "左路", "center": "中路", "right": "右路"}
    return {
        "key": "entries",
        "title": "前场推进",
        "question": "他们怎么把球推进到前场？",
        "pitch": "full",
        "marks": marks,
        "lanes": [{"lane": k, "label": lane_zh[k], **count(v)} for k, v in lanes_t.items()],
        "metrics": [
            metric("entries", "进入前场", ok(at), ok(ao), "成功的传球，从前场三分之一线外传到线内"),
            rate("entry_rate", "进入成功率", ok(at), at, ok(ao), ao),
            *[metric(f"lane_{k}", f"从{lane_zh[k]}进入", lanes_t[k], lanes_o[k]) for k in ("left", "center", "right")],
            metric("box", "传进禁区", bt, bo, "成功的传球，从禁区外传到禁区内，不含角球"),
            metric("long", "长传进入前场", [e for e in ok(at) if 1 in e["q"]], [e for e in ok(ao) if 1 in e["q"]]),
        ],
        "leadersLabel": "送球进前场最多",
        "leaders": leaders(ok(at)),
        "readings": [
            f"{name(t)}有 {len(ok(at))} 次把球传进前场（尝试 {len(at)} 次），{name(o)} {len(ok(ao))} 次。",
            "左路 {0} 次、中路 {1} 次、右路 {2} 次；传进禁区 {3} 次。".format(
                len(lanes_t["left"]), len(lanes_t["center"]), len(lanes_t["right"]), len(bt)
            ),
        ],
        "legend": ["ok", "fail", "key"],
    }


def network_section(t, o):
    tev = team_events(t)
    breaks = [e for e in tev if e["type_id"] == 18 or (e["type_id"] == 17 and (32 in e["q"] or 33 in e["q"]))]
    cut = min((match_seconds(e) for e in breaks), default=None)
    cut_label = next((f"{e['time_min']}:{e['time_sec']:02d}" for e in breaks if match_seconds(e) == cut), None)
    window = [e for e in tev if cut is None or match_seconds(e) < cut]
    passes = [e for e in window if e["type_id"] == 1 and 107 not in e["q"]]
    touches = [e for e in window if e["player_id"] and (e["type_id"] in TOUCH_TYPES or (e["type_id"] == 4 and e["outcome"] == 1))]
    order = {id(e): i for i, e in enumerate(touches)}
    pair_passes: dict[frozenset, list] = defaultdict(list)
    positions: dict[str, list] = defaultdict(list)
    for p in passes:
        positions[p["player_id"]].append((p["x"], p["y"]))
        if p["outcome"] != 1 or id(p) not in order:
            continue
        for nxt in touches[order[id(p)] + 1:]:
            if nxt["period_id"] != p["period_id"] or parse_ts(nxt["timestamp"]) - parse_ts(p["timestamp"]) > 10:
                break
            if nxt["player_id"] != p["player_id"]:
                pair_passes[frozenset((p["player_id"], nxt["player_id"]))].append(p)
                ex, ey = end_xy(p)
                if ex is not None:
                    positions[nxt["player_id"]].append((ex, ey))
                break
    made = Counter(p["player_id"] for p in passes)
    nodes = []
    for pid, pts in positions.items():
        if not players.get(pid, {}).get("starter"):
            continue
        nodes.append({
            "kind": "node", "playerId": pid,
            "x": round(sum(x for x, _ in pts) / len(pts), 1), "y": round(sum(y for _, y in pts) / len(pts), 1),
            "count": made[pid], "eids": [eid(p) for p in passes if p["player_id"] == pid],
        })
    node_ids = {n["playerId"] for n in nodes}
    edges = [
        {"kind": "edge", "a": a, "b": b, "count": len(lst), "eids": [eid(p) for p in lst]}
        for pair, lst in pair_passes.items() if len(lst) >= 2 and (a := sorted(pair)[0]) in node_ids and (b := sorted(pair)[1]) in node_ids
    ]
    edges.sort(key=lambda d: -d["count"])
    ok = [p for p in passes if p["outcome"] == 1]
    o_passes = [e for e in team_events(o) if e["type_id"] == 1 and 107 not in e["q"] and (cut is None or match_seconds(e) < cut)]

    def label(pid):
        p = players.get(pid, {})
        return f"#{p.get('number')} {p.get('nameZh') or p.get('nameEn')}"

    combos = [
        {"key": f"combo_{i}", "label": f"{label(d['a'])} ↔ {label(d['b'])}", "format": "int", "hint": None,
         "team": {"value": d["count"], "eids": d["eids"]}, "opp": None}
        for i, d in enumerate(edges[:3])
    ]
    return {
        "key": "network",
        "title": "传球网络",
        "question": "谁和谁之间传得最多？",
        "pitch": "full",
        "marks": edges + nodes,
        "note": f"只统计到 {cut_label} 第一次换人之前" if cut_label else None,
        "metrics": [
            metric("passes", "传球", passes, o_passes, "同一时间段内，不含界外球"),
            rate("pass_rate", "传球成功率", ok, passes, [e for e in o_passes if e["outcome"] == 1], o_passes),
            *combos,
        ],
        "leadersLabel": "传球最多",
        "leaders": leaders(passes),
        "readings": [
            f"开场到第一次换人，{name(t)}传球 {len(passes)} 次，成功 {len(ok)} 次。",
            f"连线最多的是 {combos[0]['label']}，{combos[0]['team']['value']} 次。" if combos else "",
        ],
        "legend": ["node", "edge"],
    }


def crosses_section(t, o):
    def crosses(tid):
        return [e for e in team_events(tid) if e["type_id"] == 1 and 2 in e["q"] and 5 not in e["q"] and 6 not in e["q"]]

    ct, co = crosses(t), crosses(o)

    def ok(lst):
        return [e for e in lst if e["outcome"] == 1]

    def led(lst):
        return [e for e in lst if e.get("key_pass") == 1 or e.get("assist") == 1]

    marks = []
    for e in ct:
        ex, ey = end_xy(e)
        marks.append({"kind": "arrow", "eid": eid(e), "x": e["x"], "y": e["y"], "ex": ex, "ey": ey,
                      "ok": e["outcome"] == 1, "key": e in led(ct), "lane": "left" if e["y"] > 50 else "right",
                      "how": "cross", "entry": False, "period": e["period_id"]})
    return {
        "key": "crosses",
        "title": "传中",
        "question": "传中从哪里来，落到哪里？",
        "pitch": "final-third",
        "marks": marks,
        "metrics": [
            metric("crosses", "运动战传中", ct, co, "不含角球和任意球"),
            metric("cross_ok", "传中成功", ok(ct), ok(co)),
            rate("cross_rate", "传中成功率", ok(ct), ct, ok(co), co),
            metric("cross_left", "左路传中", [e for e in ct if e["y"] > 50], [e for e in co if e["y"] > 50]),
            metric("cross_right", "右路传中", [e for e in ct if e["y"] <= 50], [e for e in co if e["y"] <= 50]),
            metric("cross_shot", "传中形成射门", led(ct), led(co)),
        ],
        "leadersLabel": "传中最多",
        "leaders": leaders(ct, extra=lambda evs: f"成功 {sum(e['outcome'] == 1 for e in evs)}"),
        "readings": [
            f"{name(t)}运动战传中 {len(ct)} 次，成功 {len(ok(ct))} 次，{len(led(ct))} 次形成射门；{name(o)}传中 {len(co)} 次。",
        ],
        "legend": ["ok", "fail", "key"],
    }


# --------------------------------------------------------------------------- round 4: build-up and the overview chapter

RESTART = (5, 6, 107, 124, 279)  # free kick, corner, throw-in, goal kick, kick-off
REGAIN = (49, 8, 11, 52, 54)  # recovery, interception, claim, keeper pick-up, smother


def length_m(e):
    try:
        return float(e["q"][212])
    except (KeyError, ValueError, TypeError):
        return None


def flip(x, y):
    return (100 - x, 100 - y) if x is not None else (None, None)


def third_name(x):
    return "后场" if x < 33.3 else "中场" if x < 66.7 else "前场"


def arrow_mark(e, side="team", key=False):
    x, y = e["x"], e["y"]
    ex, ey = end_xy(e)
    if side == "opp":
        (x, y), (ex, ey) = flip(x, y), flip(ex, ey)
    return {"kind": "arrow", "eid": eid(e), "x": x, "y": y, "ex": ex, "ey": ey, "ok": e["outcome"] == 1, "key": key,
            "lane": lane(ey), "how": how(e), "entry": False, "period": e["period_id"], "side": side}


def dot_mark(e, side="team", goal=False, ok=True):
    x, y = (e["x"], e["y"]) if side == "team" else flip(e["x"], e["y"])
    return {"kind": "dot", "eid": eid(e), "x": x, "y": y, "side": side, "period": e["period_id"], "goal": goal, "ok": ok}


def buildup_section(t, o):
    def own_third(tid):
        return [e for e in team_events(tid) if e["type_id"] == 1 and e["x"] < 33.3 and end_xy(e)[0] is not None
                and not any(k in e["q"] for k in (107, 6, 5))]

    pt, po = own_third(t), own_third(o)
    gks = {pid for pid, p in players.items() if p.get("position") == "GK"}

    def exits(lst):
        return [e for e in lst if e["outcome"] == 1 and end_xy(e)[0] >= 33.3]

    def lost(lst):
        return [e for e in lst if e["outcome"] != 1]

    def goal_kicks(lst, short):
        return [e for e in lst if 124 in e["q"] and ((length_m(e) or 99) < 32) == short]

    def keeper(lst):
        return [e for e in lst if e["player_id"] in gks and 124 not in e["q"]]

    exit_ids = {eid(e) for e in exits(pt)}
    return {
        "key": "build_up", "title": "后场出球", "question": "他们怎么把球从后场传出来？", "pitch": "full", "keyLabel": "传出后场",
        "marks": [arrow_mark(e, key=eid(e) in exit_ids) for e in pt],
        "metrics": [
            metric("exits", "传出后场", exits(pt), exits(po), "从本方后场三分之一传到线外的成功传球"),
            metric("lost", "后场丢球", lost(pt), lost(po), "从后场传出的失败传球"),
            metric("long", "后场长传", [e for e in pt if 1 in e["q"]], [e for e in po if 1 in e["q"]]),
            metric("gk_short", "球门球短传", goal_kicks(pt, True), goal_kicks(po, True), "传球距离 32 米以内"),
            metric("gk_long", "球门球长传", goal_kicks(pt, False), goal_kicks(po, False)),
            metric("keeper", "门将传球", keeper(pt), keeper(po), "球门球以外"),
            metric("own_third", "后场传球（全部）", pt, po, "不含界外球和定位球"),
        ],
        "leadersLabel": "传出后场最多",
        "leaders": leaders(exits(pt)),
        "readings": [f"{name(t)}从后场传球 {len(pt)} 次，成功传出后场 {len(exits(pt))} 次，丢球 {len(lost(pt))} 次；"
                     f"{name(o)}成功传出后场 {len(exits(po))} 次。"],
        "legend": ["ok", "fail", "key"],
    }


def compare_section(t, o):
    def shot(e):
        return e["type_id"] in SHOT_TYPES and 28 not in e["q"]

    def entry(e):
        ex, _ = end_xy(e)
        return e["type_id"] == 1 and e["outcome"] == 1 and ex is not None and e["x"] < THIRD <= ex and not any(k in e["q"] for k in (107, 6, 124))

    def box_in(e):
        return e["type_id"] == 1 and e["outcome"] == 1 and 6 not in e["q"] and in_box(*end_xy(e)) and not in_box(e["x"], e["y"])

    rows = [
        ("shots", "射门", shot, "dot"),
        ("on_target", "射正", lambda e: shot(e) and shot_info(e)["onTarget"], "dot"),
        ("entries", "进入前场", entry, "arrow"),
        ("box", "传进禁区", box_in, "arrow"),
        ("recoveries", "抢回球权", lambda e: e["event_uid"] in REGAIN_STARTS, "dot"),
        ("fouls", "犯规", lambda e: e["type_id"] == 4 and e["outcome"] == 0, "dot"),
        ("corners", "角球", lambda e: e["type_id"] == 1 and 6 in e["q"], "arrow"),
    ]
    pt = [e for e in team_events(t) if e["type_id"] == 1 and 107 not in e["q"]]
    po = [e for e in team_events(o) if e["type_id"] == 1 and 107 not in e["q"]]
    metrics = [
        {**metric("possession", "控球率", pt, po, "按两队传球数估算"), "format": "share", "noPlay": True},
        {**rate("pass_rate", "传球成功率", [e for e in pt if e["outcome"] == 1], pt, [e for e in po if e["outcome"] == 1], po), "noPlay": True},
    ]
    marks = {}
    for key, label, test, kind in rows:
        lt = [e for e in team_events(t) if test(e)]
        lo = [e for e in team_events(o) if test(e)]
        metrics.append(metric(key, label, lt, lo))
        for side, lst in (("team", lt), ("opp", lo)):
            for e in lst:
                if eid(e) not in marks:
                    use_arrow = kind == "arrow" and end_xy(e)[0] is not None
                    marks[eid(e)] = arrow_mark(e, side) if use_arrow else dot_mark(e, side, goal=e["type_id"] == 16)
    shots_t = sum(1 for e in team_events(t) if shot(e))
    shots_o = sum(1 for e in team_events(o) if shot(e))
    return {
        "key": "match", "title": "关键数据", "question": "两队在哪些地方拉开了差距？", "pitch": "full", "bothTeams": True,
        "marks": list(marks.values()), "metrics": metrics, "leadersLabel": "", "leaders": [],
        "readings": [f"{name(t)}射门 {shots_t} 次，{name(o)} {shots_o} 次；按传球数估算，{name(t)}控球约 {round(100 * len(pt) / max(1, len(pt) + len(po)))}%。"],
        "legend": ["us", "them"], "legendText": {"us": name(t), "them": name(o)},
    }


def scored_by(g):
    return other[g["contestant_id"]] if 28 in g["q"] else g["contestant_id"]


def timeline_section(t, o):
    def bins():
        cuts1 = list(range(0, 46, 5)) + ([H1_MINUTES] if H1_MINUTES > 45 else [])
        cuts2 = [round(H1_MINUTES + m, 2) for m in range(0, 46, 5)] + ([END_MINUTES] if END_MINUTES > H1_MINUTES + 45 else [])
        return list(zip(cuts1, cuts1[1:])) + list(zip(cuts2, cuts2[1:]))

    def front(tid):
        return [timeline_minute(e) for e in team_events(tid) if e["type_id"] == 1 and e["x"] >= THIRD]

    ft, fo = front(t), front(o)
    goals_ = [e for e in events if e["type_id"] == 16]
    tests = [
        ("goals", "进球", "goal", lambda tid: [e for e in goals_ if scored_by(e) == tid]),
        ("shots", "射门", "shot", lambda tid: [e for e in team_events(tid) if e["type_id"] in SHOT_TYPES and 28 not in e["q"]]),
        ("box", "传进禁区", "box", lambda tid: [e for e in team_events(tid) if e["type_id"] == 1 and e["outcome"] == 1 and 6 not in e["q"]
                                             and in_box(*end_xy(e)) and not in_box(e["x"], e["y"])]),
        ("cards", "红黄牌", "card", lambda tid: [e for e in team_events(tid) if e["type_id"] == 17]),
        ("subs", "换人", "sub", lambda tid: [e for e in team_events(tid) if e["type_id"] == 19]),
    ]
    metrics, marks = [], []
    for key, label, kind, pick in tests:
        lt, lo = pick(t), pick(o)
        metrics.append(metric(key, label, lt, lo))
        for side, lst in (("team", lt), ("opp", lo)):
            for e in lst:
                card = "red" if kind == "card" and (32 in e["q"] or 33 in e["q"]) else "yellow" if kind == "card" else None
                marks.append({"kind": "tick", "eid": eid(e), "side": side, "tx": timeline_minute(e), "type": kind, "card": card})
    return {
        "key": "timeline", "kind": "timeline", "title": "比赛走势", "question": "比赛是怎么走下来的，谁在什么时候占上风？",
        "h1": H1_MINUTES, "end": END_MINUTES,
        "bins": [{"start": a, "end": b, "team": sum(a <= m < b for m in ft), "opp": sum(a <= m < b for m in fo)} for a, b in bins()],
        "marks": marks, "metrics": metrics,
        "legendText": {"us": name(t), "them": name(o)},
        "readings": [f"柱子是每 5 分钟两队在前场三分之一的传球占比：{name(t)}在上、{name(o)}在下。"],
    }


def lineup_section(t, o):
    setup = next(e for e in events if e["type_id"] == 34 and e["contestant_id"] == t)
    shape = FORMATIONS.get(int(setup["q"].get(130) or 0), ("未知",))[0]
    changes = [{"clock": f"{e['time_min']}:{e['time_sec']:02d}", "shape": FORMATIONS.get(int(e["q"].get(130) or 0), ("未知",))[0]}
               for e in events if e["type_id"] == 40 and e["contestant_id"] == t]
    on_at = {e["player_id"]: timeline_minute(e) for e in team_events(t) if e["type_id"] == 19 and e["player_id"]}
    off_at = {e["player_id"]: timeline_minute(e) for e in team_events(t) if e["type_id"] == 18 and e["player_id"]}
    rows = []
    for pid, p in players.items():
        if p["teamId"] != t:
            continue
        start = 0 if p["starter"] else on_at.get(pid)
        if start is None:
            continue  # stayed on the bench
        end = off_at.get(pid, END_MINUTES)
        touches = [e for e in team_events(t) if e["player_id"] == pid and e["type_id"] in TOUCH_TYPES]
        key = [e for e in touches if e["type_id"] in SHOT_TYPES or e.get("key_pass") == 1 or e.get("assist") == 1
               or (e["type_id"] == 3 and e["outcome"] == 1) or (e["type_id"] == 7 and e["outcome"] == 1) or e["type_id"] == 8]
        pos = POSITIONS.get(p.get("position") or "")
        rows.append({
            "playerId": pid, "starter": p["starter"], "slot": p.get("slot") or 0, "position": p.get("position"),
            "positionZh": pos[0] if pos else ("替补" if not p["starter"] else ""),
            "slotX": pos[1] if pos else None, "slotY": pos[2] if pos else None,
            "avgX": round(sum(e["x"] for e in touches) / len(touches), 1) if touches else None,
            "avgY": round(sum(e["y"] for e in touches) / len(touches), 1) if touches else None,
            "minutes": round(end - start), "on": round(start, 1) if not p["starter"] else None,
            "touches": count(touches), "keyActions": count(key),
        })
    rows.sort(key=lambda r: (not r["starter"], r["slot"] if r["starter"] else r["on"] or 0))
    return {
        "key": "lineup", "kind": "lineup", "title": "谁在场上", "question": "摆什么阵型，每个人实际站在哪？",
        "shape": shape, "changes": changes, "rows": rows,
        "readings": [f"开场阵型 {shape}" + ("；" + "，".join(f"{c['clock']} 变 {c['shape']}" for c in changes) if changes else "，全场没有变阵") + "。"],
    }


def goal_sequence(g):
    if 28 in g["q"]:
        return [g]
    team, idx, t_goal = g["contestant_id"], events.index(g), parse_ts(g["timestamp"])
    seq = [g]
    for e in reversed(events[:idx]):
        if e["period_id"] != g["period_id"] or t_goal - parse_ts(e["timestamp"]) > 60:
            break
        if not e["player_id"]:
            continue
        if e["contestant_id"] == team:
            if e["type_id"] in TOUCH_TYPES or e["type_id"] == 4:
                seq.append(e)
            if (e["type_id"] == 1 and any(k in e["q"] for k in RESTART)) or e["type_id"] in REGAIN or (e["type_id"] == 7 and e["outcome"] == 1):
                break
        elif (e["type_id"] in (1, 3) and e["outcome"] == 1) or e["type_id"] in (49, 8, 12, 10, 11, 52):
            break  # the other side had the ball or cleared it: our move starts after this
    seq.reverse()
    return seq


def goal_source(g, seq):
    q, first_ = g["q"], seq[0]
    if 28 in q:
        return "乌龙"
    if 9 in q:
        return "点球"
    if 26 in q:
        return "直接任意球"
    restart = None
    if first_["type_id"] == 1:
        restart = "角球" if 6 in first_["q"] else "任意球" if 5 in first_["q"] else "界外球" if 107 in first_["q"] else None
    if restart:
        # Like Opta and the desktop app: a goal long after the restart is open play, not a set piece.
        quick = parse_ts(g["timestamp"]) - parse_ts(first_["timestamp"]) <= 10 or sum(e["type_id"] == 1 for e in seq) <= 3
        return restart if quick else f"运动战（{restart}开始）"
    if 23 in q:
        return "反击"
    if first_["type_id"] in REGAIN or first_["type_id"] == 7:
        return "抢断后"
    return "运动战"


def goals_section(t, o):
    items = []
    for g in [e for e in events if e["type_id"] == 16]:
        side = "team" if scored_by(g) == t else "opp"
        seq = goal_sequence(g)
        marks = [arrow_mark(e, side) if e["type_id"] == 1 and end_xy(e)[0] is not None else dot_mark(e, side, goal=e is g) for e in seq]
        v0, v1 = used[eid(seq[0])]["vt"], used[eid(g)]["vt"]
        items.append({
            "goalEid": eid(g), "side": side, "teamId": scored_by(g), "scorerId": g["player_id"] or None,
            "clock": f"{g['time_min']}:{g['time_sec']:02d}", "source": goal_source(g, seq),
            "passes": sum(e["type_id"] == 1 for e in seq),
            "seconds": round(parse_ts(g["timestamp"]) - parse_ts(seq[0]["timestamp"])),
            "startZone": third_name(seq[0]["x"]), "eids": [eid(e) for e in seq], "marks": marks,
            "span": {"start": round(v0 - 4, 2), "end": round(v1 + 5, 2)} if v0 is not None and v1 is not None else None,
        })
    return {
        "key": "goals", "kind": "goals", "title": "进球是怎么来的", "question": "每个进球和失球从哪开始，经过了谁？", "items": items,
        "readings": [f"{name(t)}进 {sum(i['side'] == 'team' for i in items)} 个，丢 {sum(i['side'] == 'opp' for i in items)} 个。"
                     "回合从这次控球的开始算：本队的死球开出、或抢回球权的那一下。"],
    }


# --------------------------------------------------------------------------- round 5: the defence chapter

DEF_KINDS = [  # key, label, test, won the ball / cleared it
    ("tackles", "抢断", lambda e: e["type_id"] == 7, True),
    ("interceptions", "拦截", lambda e: e["type_id"] == 8, True),
    ("recoveries", "抢第二落点", lambda e: e["type_id"] == 49, True),
    ("clearances", "解围", lambda e: e["type_id"] == 12, True),
    ("blocked_passes", "封堵传球", lambda e: e["type_id"] == 74, True),
    ("aerials_won", "争顶成功", lambda e: e["type_id"] == 44 and e["outcome"] == 1, True),
    ("dribbled_past", "被过", lambda e: e["type_id"] == 45, False),
    ("fouls", "犯规", lambda e: e["type_id"] == 4 and e["outcome"] == 0, False),
]
DEF_OK = {k: ok for k, _, _, ok in DEF_KINDS}
PRESS = lambda e: e["type_id"] in (7, 8, 45) or (e["type_id"] == 4 and e["outcome"] == 0)  # noqa: E731


def def_kind(e):
    return next((k for k, _, test, _ in DEF_KINDS if test(e)), None)


def defensive_actions(tid):
    return [e for e in team_events(tid) if def_kind(e)]


def zone(x):
    return "front" if x >= THIRD else "mid" if x >= 33.3 else "back"


def def_actions_section(t, o):
    at, ao = defensive_actions(t), defensive_actions(o)
    zones = {"front": "在前场", "mid": "在中场", "back": "在后场"}
    by_zone = lambda lst, z: [e for e in lst if zone(e["x"]) == z]  # noqa: E731
    by_kind = lambda lst, k: [e for e in lst if def_kind(e) == k]  # noqa: E731
    return {
        "key": "def_actions", "title": "防守动作", "question": "在哪里、用什么方式把球断下来？", "pitch": "full",
        "marks": [dot_mark(e, ok=DEF_OK[def_kind(e)]) for e in at],
        "summary": {"kind": "thirds", "metrics": ["all_actions"], "drill": {"front": "zone_front", "mid": "zone_mid", "back": "zone_back"}, "okLabel": "断下球"},
        "metrics": [
            metric("all_actions", "全部防守动作", at, ao),
            *[metric(f"zone_{z}", label, by_zone(at, z), by_zone(ao, z)) for z, label in zones.items()],
            *[metric(k, label, by_kind(at, k), by_kind(ao, k)) for k, label, _, _ in DEF_KINDS],
        ],
        "leadersLabel": "防守动作最多", "leaders": leaders(at),
        "readings": [f"{name(t)}防守动作 {len(at)} 次：前场 {len(by_zone(at, 'front'))}、中场 {len(by_zone(at, 'mid'))}、后场 {len(by_zone(at, 'back'))}；"
                     f"抢断 {len(by_kind(at, 'tackles'))}、拦截 {len(by_kind(at, 'interceptions'))}、被过 {len(by_kind(at, 'dribbled_past'))}。"],
        "legend": ["act_ok", "act_fail"],
        "legendText": {"act_ok": "断下球、解围、争顶成功", "act_fail": "被过、犯规（空心）"},
    }


def pressing_section(t, o):
    def ppda(presser, passer):
        actions = [e for e in team_events(presser) if PRESS(e) and e["x"] > 40]
        passes = [e for e in team_events(passer) if e["type_id"] == 1 and e["x"] < 60 and not any(k in e["q"] for k in (107, 5, 6, 124))]
        return actions, passes

    at, pt = ppda(t, o)
    ao, po = ppda(o, t)
    all_t, all_o = defensive_actions(t), defensive_actions(o)
    won = lambda tid: [p["start"] for p in regains_of(tid) if p["start"]["x"] >= THIRD]  # noqa: E731
    offside = lambda tid: [e for e in team_events(tid) if e["type_id"] == 55]  # noqa: E731
    own_half = lambda tid: [e for e in team_events(tid) if e["type_id"] == 1 and e["x"] < 50 and not any(k in e["q"] for k in (107, 5, 6, 124))]  # noqa: E731
    ht, ho = own_half(o), own_half(t)  # passes the pressing team faced
    avg_m = lambda lst: round(sum(e["x"] for e in lst) / len(lst) * 1.05, 1) if lst else 0  # noqa: E731
    marks = {}
    for e in at + won(t) + offside(t):
        marks[eid(e)] = dot_mark(e, ok=e["type_id"] != 45 and e["type_id"] != 4)
    for e in ht:
        marks[eid(e)] = arrow_mark(e, side="opp")
    return {
        "key": "pressing", "title": "防线高度与压迫", "question": "压得有多高、有多凶？（按防守动作估算）", "pitch": "full",
        "marks": list(marks.values()),
        "lines": [{"x": 40, "label": "PPDA 计算区"}, {"x": round(sum(e["x"] for e in all_t) / max(1, len(all_t)), 1), "label": "防守动作平均位置", "key": True, "metric": "height"}],
        "metrics": [
            {"key": "ppda", "label": "PPDA", "format": "ratio", "hint": "对手在后场 60% 区域内传几脚球，我们才做一次防守动作；越低压得越凶",
             "team": {"value": round(len(pt) / max(1, len(at)), 1), "eids": [eid(e) for e in at], "numEids": [eid(e) for e in pt]},
             "opp": {"value": round(len(po) / max(1, len(ao)), 1), "eids": [eid(e) for e in ao], "numEids": [eid(e) for e in po]}},
            {**metric("height", "防守动作平均位置", all_t, all_o, "离本方球门多少米（估算防线高度）"), "format": "meters", "noPlay": True},
            metric("front_won", "前场抢回球权", won(t), won(o)),
            metric("offside", "制造越位", offside(t), offside(o)),
            rate("opp_pass", "对手后场传球成功率", [e for e in ht if e["outcome"] == 1], ht, [e for e in ho if e["outcome"] == 1], ho,
                 "我们压迫时，对手从他们半场传球的成功率"),
        ],
        "leadersLabel": "压迫最多", "leaders": leaders(at),
        "readings": [f"{name(t)} PPDA {round(len(pt) / max(1, len(at)), 1)}，{name(o)} {round(len(po) / max(1, len(ao)), 1)}；"
                     f"{name(t)}防守动作平均离本方球门 {avg_m(all_t)} 米，{name(o)} {avg_m(all_o)} 米。"],
        "legend": ["act_ok", "act_fail", "them_pass"],
        "legendText": {"act_ok": "我们的压迫动作", "act_fail": "被过、犯规（空心）", "them_pass": "对手后场传球"},
    }


def opp_access_section(t, o):
    def entries_by(attacker):
        out = []
        for e in team_events(attacker):
            ex, _ = end_xy(e)
            if e["type_id"] == 1 and ex is not None and e["x"] < THIRD <= ex and not any(k in e["q"] for k in (107, 6, 124)):
                out.append(e)
        return out

    def box_by(attacker):
        return [e for e in team_events(attacker) if e["type_id"] == 1 and e["outcome"] == 1 and 6 not in e["q"]
                and in_box(*end_xy(e)) and not in_box(e["x"], e["y"])]

    def shots_by(attacker):
        return [e for e in team_events(attacker) if e["type_id"] in SHOT_TYPES and 28 not in e["q"]]

    def our_lane(e):  # the attacker's right is our left
        return lane(100 - end_xy(e)[1])

    ok = lambda lst: [e for e in lst if e["outcome"] == 1]  # noqa: E731
    ea, eo = entries_by(o), entries_by(t)  # team column: what the opponent did against the analysed team
    box_ids = {eid(e) for e in box_by(o)}
    marks = {}
    for e in ea + box_by(o):
        m = arrow_mark(e, side="opp", key=eid(e) in box_ids)
        m.update({"entry": e in ea, "lane": our_lane(e)})
        marks[eid(e)] = m
    for e in shots_by(o):
        marks[eid(e)] = dot_mark(e, side="opp", goal=e["type_id"] == 16)
    lanes = {"left": "从我们左路", "center": "从中路", "right": "从我们右路"}
    return {
        "key": "opp_access", "title": "对手从哪打进来", "question": "对手主要从我们哪一侧打进来？", "pitch": "full",
        "marks": list(marks.values()), "keyLabel": "传进我们禁区",
        "summary": {"kind": "lanes-defending", "metrics": ["opp_entries"], "drill": {k: f"from_{k}" for k in lanes}, "badge": "opp_box"},
        "tableNote": "每一列是这支队防守时，对手打进来的次数",
        "metrics": [
            metric("opp_entries", "对手进入我们后场", ok(ea), ok(eo), "成功传进我们后场三分之一"),
            *[metric(f"from_{k}", label, [e for e in ok(ea) if our_lane(e) == k], [e for e in ok(eo) if our_lane(e) == k]) for k, label in lanes.items()],
            metric("opp_box", "传进我们禁区", box_by(o), box_by(t)),
            metric("opp_shots", "对手射门", shots_by(o), shots_by(t)),
            metric("opp_big", "对手绝佳机会", [e for e in shots_by(o) if 214 in e["q"]], [e for e in shots_by(t) if 214 in e["q"]]),
            metric("opp_fast", "对手反击射门", [e for e in shots_by(o) if 23 in e["q"]], [e for e in shots_by(t) if 23 in e["q"]]),
        ],
        "leadersLabel": "对手谁打进来最多", "leaders": leaders(ok(ea)),
        "readings": [f"{name(o)}成功打进{name(t)}后场 {len(ok(ea))} 次：从{name(t)}左路 {sum(our_lane(e) == 'left' for e in ok(ea))}、"
                     f"中路 {sum(our_lane(e) == 'center' for e in ok(ea))}、右路 {sum(our_lane(e) == 'right' for e in ok(ea))}；射门 {len(shots_by(o))} 次。"],
        "legend": ["them_pass", "key", "them_shot"],
        "legendText": {"them_pass": "对手的推进", "them_shot": "对手射门"},
    }


def box_defence_section(t, o):
    def own_box(e):
        return e["x"] <= 17 and BOX_Y0 <= e["y"] <= BOX_Y1

    def parts(defender, attacker):
        d = team_events(defender)
        return {
            "crosses_in": [e for e in team_events(attacker) if e["type_id"] == 1 and 2 in e["q"] and in_box(*end_xy(e))],
            "box_clear": [e for e in d if e["type_id"] == 12 and own_box(e)],
            "blocks": [e for e in d if e["type_id"] == 10 and 94 in e["q"]],
            "aerial_won": [e for e in d if e["type_id"] == 44 and e["outcome"] == 1 and own_box(e)],
            "aerial_lost": [e for e in d if e["type_id"] == 44 and e["outcome"] == 0 and own_box(e)],
            "saves": [e for e in d if e["type_id"] == 10 and 94 not in e["q"]],
            "keeper_out": [e for e in d if e["type_id"] in (11, 41, 54, 59)],
            "shots_in": [e for e in team_events(attacker) if e["type_id"] in SHOT_TYPES and 28 not in e["q"] and in_box(e["x"], e["y"])],
        }

    pt, po = parts(t, o), parts(o, t)
    labels = {"crosses_in": ("对手传中进禁区", None), "box_clear": ("禁区内解围", None), "blocks": ("封堵射门", "后卫挡出的射门"),
              "aerial_won": ("禁区内争顶赢", None), "aerial_lost": ("禁区内争顶输", None), "saves": ("门将扑救", None),
              "keeper_out": ("门将出击", "摘球、击球、出击解围"), "shots_in": ("对手禁区内射门", None)}
    marks = {}
    for key, lst in pt.items():
        for e in lst:
            if key == "crosses_in":
                marks[eid(e)] = arrow_mark(e, side="opp")
            elif key == "shots_in":
                marks[eid(e)] = dot_mark(e, side="opp", goal=e["type_id"] == 16)
            else:
                marks[eid(e)] = dot_mark(e, ok=key != "aerial_lost")
    return {
        "key": "box_defence", "title": "禁区防守", "question": "球进了我们禁区，守不守得住？", "pitch": "half-own",
        "marks": list(marks.values()),
        "metrics": [metric(k, label, pt[k], po[k], hint) for k, (label, hint) in labels.items()],
        "leadersLabel": "禁区里谁最多", "leaders": leaders(pt["box_clear"] + pt["aerial_won"] + pt["blocks"]),
        "readings": [f"{name(o)}传中进禁区 {len(pt['crosses_in'])} 次、禁区内射门 {len(pt['shots_in'])} 次；"
                     f"{name(t)}禁区内解围 {len(pt['box_clear'])} 次，争顶 {len(pt['aerial_won'])} 赢 {len(pt['aerial_lost'])} 输。"],
        "legend": ["act_ok", "act_fail", "them_pass", "them_shot"],
        "legendText": {"act_ok": "我们的解围、封堵、扑救", "act_fail": "争顶输（空心）", "them_pass": "对手传中", "them_shot": "对手射门"},
    }


# --------------------------------------------------------------------------- round 6: set pieces

EVENT_POS = {e["event_uid"]: i for i, e in enumerate(events)}


def shots_of(tid):
    return [e for e in team_events(tid) if e["type_id"] in SHOT_TYPES and 28 not in e["q"]]


def led_to_shot(e, shots, window=20):
    t0 = parse_ts(e["timestamp"])
    return any(s["period_id"] == e["period_id"] and 0 < parse_ts(s["timestamp"]) - t0 <= window for s in shots)


def is_short_corner(e):
    return 2 not in e["q"] and 1 not in e["q"]  # Opta: neither the cross nor the long-ball qualifier, so played short


def corner_zone(e):
    """Where the delivery really landed, from the attacking side (left = the attackers' left).
    Short corners count beside the flag they were taken from; other deliveries by where they landed."""
    if is_short_corner(e):
        return "short_left" if e["y"] > 50 else "short_right"
    ex, ey = end_xy(e)
    if ex is None or not in_box(ex, ey):
        return "outside"
    return "left" if ey > 55.8 else "central" if ey >= 44.2 else "right"


def corners_section(t, o):
    def corners(tid):
        return [e for e in team_events(tid) if e["type_id"] == 1 and 6 in e["q"] and end_xy(e)[0] is not None]

    ct, co = corners(t), corners(o)
    st, so = [x for x in shots_of(t) if 25 in x["q"]], [x for x in shots_of(o) if 25 in x["q"]]
    zones = {"left": "落在禁区左侧", "central": "落在禁区中路", "right": "落在禁区右侧", "outside": "落在禁区外"}
    hints = {"central": "两根门柱之间", "outside": "不含短角球"}
    short = lambda lst: [e for e in lst if is_short_corner(e)]  # noqa: E731
    marks = []
    for e in ct:
        m = arrow_mark(e, key=led_to_shot(e, st))
        m.update({"zone": corner_zone(e), "cornerSide": "left" if e["y"] > 50 else "right"})
        marks.append(m)
    marks += [dot_mark(x, goal=x["type_id"] == 16) for x in st]
    in_zone = lambda lst, z: [e for e in lst if corner_zone(e) == z]  # noqa: E731
    return {
        "key": "corners", "title": "角球", "question": "角球往哪里发，各自打成了什么？", "pitch": "final-third", "keyLabel": "形成射门",
        "marks": marks,
        "summary": {"kind": "corners", "metrics": ["corners"], "drill": {**{z: f"zone_{z}" for z in zones}, "short_left": "short", "short_right": "short"},
                    "okLabel": "争到第一点"},
        "metrics": [
            metric("corners", "全部角球", ct, co),
            metric("left", "左侧角球", [e for e in ct if e["y"] > 50], [e for e in co if e["y"] > 50]),
            metric("right", "右侧角球", [e for e in ct if e["y"] <= 50], [e for e in co if e["y"] <= 50]),
            *[metric(f"zone_{z}", label, in_zone(ct, z), in_zone(co, z), hints.get(z)) for z, label in zones.items() if z != "outside"],
            metric("short", "短角球", short(ct), short(co), "没有传中、长传标记，画在开球的那一侧"),
            metric("zone_outside", zones["outside"], in_zone(ct, "outside"), in_zone(co, "outside"), hints["outside"]),
            metric("first_contact", "争到第一点", [e for e in ct if e["outcome"] == 1], [e for e in co if e["outcome"] == 1], "第一个碰到球的是自己人"),
            metric("shots", "角球后射门", st, so),
            metric("goals", "角球进球", [x for x in st if x["type_id"] == 16], [x for x in so if x["type_id"] == 16]),
        ],
        "leadersLabel": "主罚最多", "leaders": leaders(ct),
        "readings": [f"{name(t)}角球 {len(ct)} 个（左侧 {sum(e['y'] > 50 for e in ct)}、右侧 {sum(e['y'] <= 50 for e in ct)}）："
                     f"落在禁区左侧 {len(in_zone(ct, 'left'))}、中路 {len(in_zone(ct, 'central'))}、右侧 {len(in_zone(ct, 'right'))}，"
                     f"短角球 {len(short(ct))}，其他落在禁区外 {len(in_zone(ct, 'outside'))}；争到第一点 {sum(e['outcome'] == 1 for e in ct)} 次，形成射门 {len(st)} 次。"],
        "legend": ["ok", "fail", "key"],
    }


def free_kicks_section(t, o):
    def fk_all(tid):
        return [e for e in team_events(tid) if e["type_id"] == 1 and 5 in e["q"] and end_xy(e)[0] is not None]

    def fk(tid):
        # The breakdown looks at the opponent's half: a 40-metre delivery into the box is an attacking free kick too.
        return [e for e in fk_all(tid) if e["x"] >= 50]

    def direct(tid):
        return [x for x in shots_of(tid) if 26 in x["q"]]

    def after(tid):
        return [x for x in shots_of(tid) if 24 in x["q"]]

    def pens(tid):
        return [x for x in shots_of(tid) if 9 in x["q"]]

    at, ao = fk_all(t), fk_all(o)
    ft, fo = fk(t), fk(o)
    into_box = lambda lst: [e for e in lst if in_box(*end_xy(e))]  # noqa: E731
    short = lambda lst: [e for e in lst if not in_box(*end_xy(e))]  # noqa: E731
    goals = lambda tid: [x for x in after(tid) + direct(tid) + pens(tid) if x["type_id"] == 16]  # noqa: E731
    marks = [arrow_mark(e, key=led_to_shot(e, after(t))) for e in at]
    seen = set()
    for x in direct(t) + after(t) + pens(t):
        if eid(x) not in seen:
            seen.add(eid(x))
            marks.append(dot_mark(x, goal=x["type_id"] == 16))
    return {
        "key": "free_kicks", "title": "任意球", "question": "任意球在哪里踢，到了对方半场是直接打门还是传进禁区？", "pitch": "full", "keyLabel": "形成射门",
        "marks": marks,
        "metrics": [
            metric("all", "全部任意球", at + direct(t), ao + direct(o), "传球开出的，加上直接射门"),
            metric("half", "对方半场任意球", ft + direct(t), fo + direct(o)),
            metric("direct", "直接射门", direct(t), direct(o)),
            metric("into_box", "传进禁区", into_box(ft), into_box(fo)),
            metric("short", "短传配合", short(ft), short(fo), "对方半场开出，没有直接传进禁区"),
            metric("shots_after", "任意球后射门", after(t), after(o)),
            metric("goals", "任意球和点球进球", goals(t), goals(o)),
            metric("penalties", "点球", pens(t), pens(o)),
        ],
        "leadersLabel": "主罚最多", "leaders": leaders(at + direct(t)),
        "readings": [f"{name(t)}任意球 {len(at) + len(direct(t))} 次，其中对方半场 {len(ft) + len(direct(t))} 次：直接射门 {len(direct(t))}、传进禁区 {len(into_box(ft))}、"
                     f"短传配合 {len(short(ft))}；任意球和点球进球 {len(goals(t))} 个。"],
        "legend": ["ok", "fail", "key", "goal"],
    }


def throw_ins_section(t, o):
    def throws(tid):
        return [e for e in team_events(tid) if e["type_id"] == 1 and 107 in e["q"] and end_xy(e)[0] is not None]

    def kept(e):
        if e["outcome"] != 1:
            return False
        t0 = parse_ts(e["timestamp"])
        for x in events[EVENT_POS[e["event_uid"]] + 1:]:
            if x["period_id"] != e["period_id"] or parse_ts(x["timestamp"]) - t0 > 5:
                break
            if x["contestant_id"] != e["contestant_id"] and x["player_id"] and (
                    (x["type_id"] in (1, 3) and x["outcome"] == 1) or x["type_id"] in (49, 8, 12) or (x["type_id"] == 7 and x["outcome"] == 1)):
                return False
        return True

    tt, to_ = throws(t), throws(o)
    sh_t, sh_o = [x for x in shots_of(t) if 160 in x["q"]], [x for x in shots_of(o) if 160 in x["q"]]
    by_zone = lambda lst, z: [e for e in lst if zone(e["x"]) == z]  # noqa: E731
    zones = {"front": "在前场", "mid": "在中场", "back": "在后场"}
    marks = [arrow_mark(e, key=led_to_shot(e, sh_t)) for e in tt] + [dot_mark(x, goal=x["type_id"] == 16) for x in sh_t]
    return {
        "key": "throw_ins", "title": "界外球", "question": "界外球扔给谁，扔完还控得住球吗？", "pitch": "full", "keyLabel": "形成射门",
        "marks": marks,
        "summary": {"kind": "thirds", "metrics": ["all"], "drill": {z: f"zone_{z}" for z in zones}, "okLabel": "扔到队友"},
        "metrics": [
            metric("all", "全部界外球", tt, to_),
            *[metric(f"zone_{z}", label, by_zone(tt, z), by_zone(to_, z)) for z, label in zones.items()],
            metric("long_box", "长界外球进禁区", [e for e in tt if in_box(*end_xy(e))], [e for e in to_ if in_box(*end_xy(e))]),
            metric("kept", "扔完 5 秒内还控着球", [e for e in tt if kept(e)], [e for e in to_ if kept(e)], "扔到队友，5 秒内对手没拿到球"),
            metric("lost", "扔完 5 秒内丢了球", [e for e in tt if not kept(e)], [e for e in to_ if not kept(e)], "没扔到队友，或被对手拿到"),
            metric("shots_after", "界外球后射门", sh_t, sh_o),
        ],
        "leadersLabel": "扔界外球最多", "leaders": leaders(tt),
        "readings": [f"{name(t)}界外球 {len(tt)} 个：前场 {len(by_zone(tt, 'front'))}、中场 {len(by_zone(tt, 'mid'))}、后场 {len(by_zone(tt, 'back'))}；"
                     f"扔完 5 秒内还控着球 {sum(kept(e) for e in tt)} 次，形成射门 {len(sh_t)} 次。"],
        "legend": ["ok", "fail", "key"],
    }


# --------------------------------------------------------------------------- round 7: who has the ball (transitions)
#
# An Opta-native take on threader-desktop's transition engine (threader-core/src/domain/transitions): a dead ball
# ends a possession; in open play the ball changes hands when the other side makes an on-ball action, and the
# change is dated back to the tackle, interception or save that won it. Unlike desktop, a regain counts even when
# the next touch loses the ball again (that is the "第一脚就丢" row), and an intercepted throw-in or goal kick counts.

ON_BALL = {1, 3, 13, 14, 15, 16, 49, 50, 51, 52, 61}  # pass, take-on, shots, recovery, dispossessed, error, pick-up, touch
DEAD_BALL = {2, 4, 5, 6, 27, 28, 30, 55, 68}  # offside pass, foul, out, corner awarded, delays, end, offside provoked, drop ball


def wins_ball(e):
    """Contests that can win the ball; they only count when the same side's on-ball action follows."""
    t = e["type_id"]
    return t in (8, 10, 11, 54, 74) or (t in (7, 44) and e["outcome"] == 1)


def keeps_ball(e):
    """The side with the ball still controls it, so an earlier interception attempt did not win it.
    (A ball touch with outcome 1 only means the ball hit the player.)"""
    t = e["type_id"]
    return (t in (1, 3) and e["outcome"] == 1) or t in (13, 14, 15, 16, 49, 52)


def takes_ball(e):
    """On-ball actions that show the side really had the ball, without a tackle or interception before them.
    A miskicked header or a deflection is a contested ball, not a change of possession."""
    t = e["type_id"]
    return (t == 1 and e["outcome"] == 1) or t in (3, 13, 14, 15, 16, 49, 50, 52)


def is_restart(e):
    return (e["type_id"] == 1 and any(k in e["q"] for k in RESTART)) or (e["type_id"] in SHOT_TYPES and (26 in e["q"] or 9 in e["q"]))


def build_possessions():
    out, cur, pending, period = [], None, {}, None

    def close(reason, ev=None, foul_by=None):
        nonlocal cur
        if cur is not None:
            cur.update(end_reason=reason, end=ev, foul_by=foul_by)
            out.append(cur)
        cur = None

    def start(team, kind, first_ev, win_ev=None, loss=None):
        nonlocal cur
        begin = win_ev or first_ev
        cur = {"team": team, "kind": kind, "start": begin, "first": first_ev, "loss": loss,
               "events": [begin] + ([first_ev] if first_ev is not begin else []), "t0": parse_ts(begin["timestamp"])}

    for e in events:
        if e["period_id"] not in (1, 2):
            continue
        if e["period_id"] != period:
            close("period")
            period, pending = e["period_id"], {}
        tid, t = e["contestant_id"], e["type_id"]
        if not tid or t in (17, 18, 19, 34, 40, 70):
            continue
        if is_restart(e):
            close("dead")
            start(tid, "restart", e)
            pending = {}
            if t == 16:
                close("goal", e)
            continue
        if t in DEAD_BALL:
            if cur is not None:
                foul_by = (tid if e["outcome"] == 0 else other[tid]) if t == 4 else None
                close("foul" if t == 4 else "dead", e, foul_by)
            pending = {}
            continue
        if wins_ball(e):
            if cur is None or tid != cur["team"]:
                pending.setdefault(tid, e)
            else:
                cur["events"].append(e)
            continue
        if t not in ON_BALL:
            if cur is not None and tid == cur["team"]:
                cur["events"].append(e)
            continue
        if cur is None:
            start(tid, "loose", e, pending.get(tid))
        elif tid != cur["team"] and tid not in pending and not takes_ball(e):
            continue  # contested: the side with the ball has not lost it yet
        elif tid != cur["team"]:
            lost_by = cur["team"]
            loss = next((x for x in reversed(cur["events"]) if x["contestant_id"] == lost_by and x["type_id"] in ON_BALL), None)
            close("lost", e)
            start(tid, "regain", e, pending.get(tid), loss)
        else:
            cur["events"].append(e)
        if keeps_ball(e):
            pending = {}
        else:
            pending.pop(tid, None)
        if t == 16:
            close("goal", e)
    close("period")
    for i, p in enumerate(out):
        p["next"] = out[i + 1] if i + 1 < len(out) and out[i + 1]["start"]["period_id"] == p["start"]["period_id"] else None
    return out


def possession_facts(p):
    """When a possession first reached the final third, the box, a shot and a goal (seconds after it was won)."""
    facts = {}
    for x in p["events"]:
        if x["contestant_id"] != p["team"]:
            continue
        dt = parse_ts(x["timestamp"]) - p["t0"]
        ex, ey = end_xy(x)
        on = x["type_id"] in ON_BALL or x is p["start"]
        passed = x["type_id"] == 1 and x["outcome"] == 1 and ex is not None
        if "third" not in facts and ((on and x["x"] >= THIRD) or (passed and ex >= THIRD)):
            facts["third"] = (x, dt)
        if "box" not in facts and ((on and in_box(x["x"], x["y"])) or (passed and in_box(ex, ey))):
            facts["box"] = (x, dt)
        if "shot" not in facts and x["type_id"] in SHOT_TYPES and 28 not in x["q"]:
            facts["shot"] = (x, dt)
        if "goal" not in facts and x["type_id"] == 16 and 28 not in x["q"]:
            facts["goal"] = (x, dt)
    return facts


POSSESSIONS = build_possessions()
REGAINS = [p for p in POSSESSIONS if p["kind"] == "regain"]
for _p in POSSESSIONS:
    _p["facts"] = possession_facts(_p)


GK_IDS = {pid for pid, pl in players.items() if pl.get("position") == "GK"}
REGAIN_STARTS = {p["start"]["event_uid"] for p in REGAINS}
SKIP_FIRST = {7, 8, 10, 11, 44, 54, 74, 49, 52}  # winning the ball is not yet doing something with it


def vt_of(e):
    return used[eid(e)]["vt"]


def span(begin, end, pre=3, post=4, longest=30):
    """One clip from just before `begin` to just after `end`, at most `longest` seconds before `end`."""
    a, b = vt_of(begin), vt_of(end)
    if a is None or b is None:
        return None
    return {"start": round(max(a - pre, b - longest - pre, 0), 2), "end": round(b + post, 2), "eids": list(dict.fromkeys([eid(begin), eid(end)]))}


def span_metric(key, label, team_rows, opp_rows, hint=None):
    """Rows are (anchor event, clip span). The anchor dates the row for the half and score filters."""
    def c(rows):
        rows = [(a, sp) for a, sp in rows if sp]
        return {"value": len(rows), "eids": [eid(a) for a, _ in rows], "spans": [sp for _, sp in rows]}

    return {"key": key, "label": label, "format": "int", "hint": hint, "team": c(team_rows), "opp": c(opp_rows)}


def regains_of(tid):
    return [p for p in REGAINS if p["team"] == tid]


def losses_of(tid):
    """The other side's regains are this side's losses."""
    return [p for p in REGAINS if p["team"] == other[tid]]


def regain_kind(p):
    s, t = p["start"], p["start"]["type_id"]
    if t == 7:
        return "tackle"
    if t in (8, 74) or (t == 10 and 94 in s["q"]):
        return "interception"
    if t in (10, 11, 52, 54) or (t == 49 and s["player_id"] in GK_IDS):
        return "keeper"
    if t in (49, 44):
        return "loose"
    return "other"


REGAIN_KINDS = [
    ("tackle", "抢断", None),
    ("interception", "拦截", "含封堵"),
    ("loose", "抢第二落点", "捡到没人控制的球，或争顶赢下"),
    ("keeper", "门将拿球", "扑救、接住或捡起"),
    ("other", "其他", "多是对手传球失误，直接到了我们脚下"),
]


def loss_event(p):
    """Where the losing side lost it: its last on-ball event, or the winner's first touch turned round."""
    return p["loss"] or p["start"]


def loss_xy(p):
    if p["loss"]:
        return p["loss"]["x"], p["loss"]["y"]
    return flip(p["start"]["x"], p["start"]["y"])


def loss_kind(p):
    lo, st = p["loss"], p["start"]
    lt = lo["type_id"] if lo else None
    if lt == 3 and lo["outcome"] == 0:
        return "dribble"
    if st["type_id"] == 7 or lt == 50:
        return "tackled"
    if lt == 1 and lo["outcome"] == 0:
        return "pass"
    if lt in (51, 61):
        return "touch"
    if lt in SHOT_TYPES:
        return "shot"
    return "other"


LOSS_KINDS = [
    ("pass", "传球被断", "传球没到队友脚下，被对手拿到"),
    ("tackled", "被抢断", None),
    ("dribble", "过人失败", None),
    ("touch", "停球失误", None),
    ("shot", "射门后", "射门被扑住或被封堵，对手拿到球"),
    ("other", "其他", None),
]


def first_action(p):
    for x in p["events"]:
        t = x["type_id"]
        if x["contestant_id"] != p["team"] or t in SKIP_FIRST or (t == 61 and x["outcome"] == 1):
            continue
        if t in (1, 3, 12, 13, 14, 15, 16, 50, 51, 61):
            return x
    return None


def direction(e):
    ex, ey = end_xy(e)
    ang = math.degrees(math.atan2((ey - e["y"]) * 0.68, (ex - e["x"]) * 1.05))
    return "forward" if abs(ang) < 45 else "back" if abs(ang) > 135 else "side"


def first_kind(a):
    if a is None or (a["type_id"] == 1 and end_xy(a)[0] is None):
        return "other"
    if a["type_id"] == 1:
        d = direction(a)
        return "long" if d == "forward" and (1 in a["q"] or (length_m(a) or 0) >= 32) else d
    return "dribble" if a["type_id"] == 3 else "other"


def first_lost(p, a):
    if a is None:
        return p["end_reason"] in ("lost", "dead")
    t = a["type_id"]
    return (t in (1, 3) and a["outcome"] == 0) or t in (12, 50, 51, 61)


FIRST_KINDS = [
    ("forward", "向前", "不含长传"),
    ("side", "横传", None),
    ("back", "回传", None),
    ("long", "长传找前面", "向前的长传"),
    ("dribble", "过人", None),
    ("other", "其他", "解围、射门，或还没出脚就被犯规、出界"),
]


def seconds_to(p, fact):
    f = p["facts"].get(fact)
    return f[1] if f else None


def regains_section(t, o):
    rt, ro = regains_of(t), regains_of(o)
    starts = lambda lst: [p["start"] for p in lst]  # noqa: E731
    by_zone = lambda lst, z: [p["start"] for p in lst if zone(p["start"]["x"]) == z]  # noqa: E731
    by_kind = lambda lst, k: [p["start"] for p in lst if regain_kind(p) == k]  # noqa: E731
    marks = []
    for p in rt:
        m = dot_mark(p["start"])
        m["key"] = "shot" in p["facts"]
        marks.append(m)
    zones = {"front": "在前场", "mid": "在中场", "back": "在后场"}
    return {
        "key": "regains", "title": "在哪抢回来", "question": "在哪里把球抢回来，用的什么方式？", "pitch": "full", "keyLabel": "这次抢回后形成射门",
        "marks": marks,
        "summary": {"kind": "thirds", "metrics": ["all"], "drill": {z: f"zone_{z}" for z in zones}},
        "metrics": [
            metric("all", "全部抢回球权", starts(rt), starts(ro), "运动战中从对手脚下把球拿回来"),
            *[metric(f"zone_{z}", label, by_zone(rt, z), by_zone(ro, z)) for z, label in zones.items()],
            *[metric(k, label, by_kind(rt, k), by_kind(ro, k), hint) for k, label, hint in REGAIN_KINDS],
        ],
        "leadersLabel": "抢回最多", "leaders": leaders(starts(rt)),
        "readings": [f"{name(t)}抢回球权 {len(rt)} 次：前场 {len(by_zone(rt, 'front'))}、中场 {len(by_zone(rt, 'mid'))}、后场 {len(by_zone(rt, 'back'))}；"
                     f"其中 {sum('shot' in p['facts'] for p in rt)} 次最后形成射门。"],
        "legend": ["us", "key_dot"],
        "legendText": {"us": "抢回球权的位置"},
    }


def first_action_section(t, o):
    def rows(tid):
        out = []
        for p in regains_of(tid):
            a = first_action(p)
            out.append((p, a, a or p["start"]))
        return out

    rt, ro = rows(t), rows(o)
    pick = lambda lst, test: [ev for p, a, ev in lst if test(p, a)]  # noqa: E731
    marks = []
    for p, a, ev in rt:
        key = "shot" in p["facts"]
        if a is not None and a["type_id"] == 1 and end_xy(a)[0] is not None:
            marks.append(arrow_mark(a, key=key))
        else:
            m = dot_mark(ev, ok=not first_lost(p, a))
            m["key"] = key
            marks.append(m)
    return {
        "key": "first_action", "title": "抢回后的第一脚", "question": "抢回来以后，第一时间怎么处理球？", "pitch": "full", "keyLabel": "这次抢回后形成射门",
        "marks": marks,
        "metrics": [
            metric("all", "全部抢回球权", pick(rt, lambda p, a: True), pick(ro, lambda p, a: True), "图上画抢回后的第一个动作"),
            *[metric(k, label, pick(rt, lambda p, a, k=k: first_kind(a) == k), pick(ro, lambda p, a, k=k: first_kind(a) == k), hint) for k, label, hint in FIRST_KINDS],
            metric("lost", "第一脚就丢", pick(rt, first_lost), pick(ro, first_lost), "传球失误、过人失败、被抢或解围出去，球又回到对手脚下"),
        ],
        "leadersLabel": "出第一脚最多", "leaders": leaders([ev for _, _, ev in rt]),
        "readings": [f"{name(t)}抢回球后，第一脚向前 {sum(first_kind(a) in ('forward', 'long') for _, a, _ in rt)} 次（其中长传 {sum(first_kind(a) == 'long' for _, a, _ in rt)}）、"
                     f"横传 {sum(first_kind(a) == 'side' for _, a, _ in rt)}、回传 {sum(first_kind(a) == 'back' for _, a, _ in rt)}；第一脚就丢 {sum(first_lost(p, a) for p, a, _ in rt)} 次。"],
        "legend": ["ok", "fail", "key", "act_ok"],
        "legendText": {"act_ok": "过人、解围等不是传球的动作（空心：这一下就丢了）"},
    }


def counter_section(t, o):
    def stage(tid, fact, post=4):
        return [(p["start"], span(p["start"], p["facts"][fact][0], pre=2, post=post)) for p in regains_of(tid) if fact in p["facts"]]

    def timed(tid, lo, hi):
        return [(p["start"], span(p["start"], p["facts"]["shot"][0], pre=2)) for p in regains_of(tid)
                if "shot" in p["facts"] and lo <= p["facts"]["shot"][1] < hi]

    def everything(tid):
        return [(p["start"], span(p["start"], p["start"], post=5)) for p in regains_of(tid)]

    rt = regains_of(t)
    n = lambda fact: sum(fact in p["facts"] for p in rt)  # noqa: E731
    return {
        "key": "counter", "title": "反击打成了什么", "question": "抢回球以后，打进前场、禁区，射门、进球各多少次，用了多久？", "pitch": "full",
        "marks": [],
        "funnel": {"groups": [
            {"title": "抢回以后打到了哪一步", "base": "all", "rows": ["all", "third", "box", "shots", "goals"]},
            {"title": "射门离抢回多久", "base": "shots", "rows": ["fast", "mid", "slow"]},
        ]},
        "metrics": [
            span_metric("all", "全部抢回球权", everything(t), everything(o)),
            span_metric("third", "打进前场", stage(t, "third", 3), stage(o, "third", 3), "球到了对方三分之一，抢回就在前场的也算"),
            span_metric("box", "打进禁区", stage(t, "box", 3), stage(o, "box", 3)),
            span_metric("shots", "形成射门", stage(t, "shot"), stage(o, "shot")),
            span_metric("goals", "进球", stage(t, "goal", 6), stage(o, "goal", 6)),
            span_metric("fast", "6 秒内射门", timed(t, 0, 6), timed(o, 0, 6), "从抢回到射门"),
            span_metric("mid", "6–15 秒射门", timed(t, 6, 15), timed(o, 6, 15)),
            span_metric("slow", "15 秒以上射门", timed(t, 15, 1e9), timed(o, 15, 1e9), "多是抢回后控了一阵球"),
        ],
        "leadersLabel": "", "leaders": [],
        "readings": [f"{name(t)}抢回球权 {len(rt)} 次：打进前场 {n('third')}、禁区 {n('box')}，射门 {n('shot')}，进球 {n('goal')}。"],
        "legend": [],
    }


def losses_section(t, o):
    lt, lo = losses_of(t), losses_of(o)
    evs = lambda lst: [loss_event(p) for p in lst]  # noqa: E731
    by_zone = lambda lst, z: [loss_event(p) for p in lst if zone(loss_xy(p)[0]) == z]  # noqa: E731
    by_kind = lambda lst, k: [loss_event(p) for p in lst if loss_kind(p) == k]  # noqa: E731
    marks = []
    for p in lt:
        x, y = loss_xy(p)
        marks.append({"kind": "dot", "eid": eid(loss_event(p)), "x": x, "y": y, "side": "team", "period": p["start"]["period_id"],
                      "goal": False, "ok": True, "key": "shot" in p["facts"]})
    zones = {"front": "在前场", "mid": "在中场", "back": "在后场"}
    return {
        "key": "losses", "title": "在哪丢的", "question": "在哪里丢球，怎么丢的？", "pitch": "full", "keyLabel": "这次丢球后对手射门",
        "marks": marks,
        "summary": {"kind": "thirds", "metrics": ["all"], "drill": {z: f"zone_{z}" for z in zones}},
        "metrics": [
            metric("all", "全部丢球", evs(lt), evs(lo), "运动战中球权到了对手脚下（不含出界、犯规）"),
            *[metric(f"zone_{z}", label, by_zone(lt, z), by_zone(lo, z)) for z, label in zones.items()],
            *[metric(k, label, by_kind(lt, k), by_kind(lo, k), hint) for k, label, hint in LOSS_KINDS],
        ],
        "leadersLabel": "丢球最多", "leaders": leaders([p["loss"] for p in lt if p["loss"]]),
        "readings": [f"{name(t)}丢球 {len(lt)} 次：前场 {len(by_zone(lt, 'front'))}、中场 {len(by_zone(lt, 'mid'))}、后场 {len(by_zone(lt, 'back'))}；"
                     f"传球被断 {len(by_kind(lt, 'pass'))} 次；其中 {sum('shot' in p['facts'] for p in lt)} 次被对手打成射门。"],
        "legend": ["us", "key_dot"],
        "legendText": {"us": "丢球的位置"},
    }


def opp_after_loss_section(t, o):
    WINDOW = 10

    def entry(p):
        """The pass that took the winners into the losers' defensive third within the window."""
        if zone(p["start"]["x"]) == "front":
            return None  # lost in our own third: they were already there
        for x in p["events"]:
            dt = parse_ts(x["timestamp"]) - p["t0"]
            if dt > WINDOW:
                break
            ex, _ = end_xy(x)
            if x["contestant_id"] == p["team"] and x["type_id"] == 1 and x["outcome"] == 1 and ex is not None and x["x"] < THIRD <= ex:
                return x
        return None

    def our_lane(e):  # the attacker's right is our left
        return lane(100 - end_xy(e)[1])

    def within(lst, fact):
        return [p["facts"][fact][0] for p in lst if fact in p["facts"] and p["facts"][fact][1] <= WINDOW]

    lt, lo = losses_of(t), losses_of(o)
    et, eo = [e for e in map(entry, lt) if e], [e for e in map(entry, lo) if e]
    shot_poss = {eid(p["start"]) for p in lt if "shot" in p["facts"] and p["facts"]["shot"][1] <= WINDOW}
    marks = {}
    for p in lt:
        e = entry(p)
        if e:
            m = arrow_mark(e, side="opp", key=eid(p["start"]) in shot_poss)
            m.update({"entry": True, "lane": our_lane(e)})
            marks[eid(e)] = m
    for e in within(lt, "shot"):
        marks[eid(e)] = dot_mark(e, side="opp", goal=e["type_id"] == 16)
    lanes = {"left": "从我们左路", "center": "从中路", "right": "从我们右路"}
    return {
        "key": "opp_after_loss", "title": "对手拿到球之后", "question": "我们丢球以后，对手往哪里打？（10 秒内）", "pitch": "full", "keyLabel": "10 秒内打成射门",
        "marks": list(marks.values()),
        "summary": {"kind": "lanes-defending", "metrics": ["entries"], "drill": {k: f"from_{k}" for k in lanes}, "badge": "box"},
        "tableNote": "每一列是这支队丢球后，对手 10 秒内打成了什么",
        "metrics": [
            metric("entries", "10 秒内打进我们后场", et, eo, "成功传进我们后场三分之一；在我们后场丢的不算"),
            *[metric(f"from_{k}", label, [e for e in et if our_lane(e) == k], [e for e in eo if our_lane(e) == k]) for k, label in lanes.items()],
            metric("box", "10 秒内进我们禁区", within(lt, "box"), within(lo, "box")),
            metric("shots", "10 秒内射门", within(lt, "shot"), within(lo, "shot")),
            metric("goals", "10 秒内进球", within(lt, "goal"), within(lo, "goal")),
        ],
        "leadersLabel": "对手谁打进来最多", "leaders": leaders(et),
        "readings": [f"{name(t)}丢球 {len(lt)} 次，{name(o)} 10 秒内打进{name(t)}后场 {len(et)} 次：从{name(t)}左路 {sum(our_lane(e) == 'left' for e in et)}、"
                     f"中路 {sum(our_lane(e) == 'center' for e in et)}、右路 {sum(our_lane(e) == 'right' for e in et)}；10 秒内射门 {len(within(lt, 'shot'))} 次。"],
        "legend": ["them_pass", "key", "them_shot"],
    }


def counterpress_section(t, o):
    def rewon(p, limit):
        n = p["next"]
        return p["end_reason"] == "lost" and n is not None and n["kind"] == "regain" and n["t0"] - p["t0"] <= limit

    def fouled(p, tid):
        return p["end_reason"] == "foul" and p["foul_by"] == tid and parse_ts(p["end"]["timestamp"]) - p["t0"] <= 10

    def rows(tid):
        lst = losses_of(tid)
        return {
            "all": [(loss_event(p), span(loss_event(p), p["start"], post=5)) for p in lst],
            "won5": [(loss_event(p), span(loss_event(p), p["next"]["start"], pre=2)) for p in lst if rewon(p, 5)],
            "won10": [(loss_event(p), span(loss_event(p), p["next"]["start"], pre=2)) for p in lst if rewon(p, 10)],
            "fouls": [(loss_event(p), span(loss_event(p), p["end"], pre=2)) for p in lst if fouled(p, tid)],
            "opp_shots": [(loss_event(p), span(loss_event(p), p["facts"]["shot"][0], pre=2)) for p in lst if "shot" in p["facts"]],
            "opp_goals": [(loss_event(p), span(loss_event(p), p["facts"]["goal"][0], pre=2, post=6)) for p in lst if "goal" in p["facts"]],
        }

    rt, ro = rows(t), rows(o)
    labels = [
        ("all", "全部丢球", None),
        ("won5", "5 秒内抢回", None),
        ("won10", "10 秒内抢回", "含 5 秒内"),
        ("fouls", "犯规中断", "丢球后 10 秒内犯规，把对手这一波停下"),
        ("opp_shots", "对手射门", "这次丢球后，对手这一波进攻打成射门"),
        ("opp_goals", "对手进球", None),
    ]
    return {
        "key": "counterpress", "title": "反抢有没有用", "question": "丢球后多少次马上抢回来？没抢回来的，变成了什么？", "pitch": "full",
        "marks": [],
        "funnel": {"groups": [
            {"title": "丢球以后我们", "base": "all", "rows": ["all", "won5", "won10", "fouls"]},
            {"title": "没抢回来，对手打成了", "base": "all", "rows": ["opp_shots", "opp_goals"], "side": "opp"},
        ]},
        "metrics": [span_metric(k, label, rt[k], ro[k], hint) for k, label, hint in labels],
        "leadersLabel": "", "leaders": [],
        "readings": [f"{name(t)}丢球 {len(rt['all'])} 次：5 秒内抢回 {len(rt['won5'])}、10 秒内抢回 {len(rt['won10'])}、犯规中断 {len(rt['fouls'])}；"
                     f"对手打成射门 {len(rt['opp_shots'])} 次、进球 {len(rt['opp_goals'])} 个。"],
        "legend": [],
    }


# --------------------------------------------------------------------------- assemble

sections = {
    tid: [buildup_section(tid, other[tid]), network_section(tid, other[tid]), entries_section(tid, other[tid]),
          shots_section(tid, other[tid]), crosses_section(tid, other[tid])]
    for tid in (home_id, away_id)
}
for secs in sections.values():
    for sec in secs:
        sec.setdefault("keyLabel", {"entries": "传进禁区", "crosses": "形成射门"}.get(sec["key"]))
for secs in sections.values():
    for sec in secs:
        if sec["key"] == "entries":
            sec["summary"] = {"kind": "lanes", "metrics": ["entries", "entry_rate"], "drill": {k: f"lane_{k}" for k in ("left", "center", "right")}, "badge": "box"}
defence = {
    tid: [def_actions_section(tid, other[tid]), pressing_section(tid, other[tid]), opp_access_section(tid, other[tid]), box_defence_section(tid, other[tid])]
    for tid in (home_id, away_id)
}
setpieces = {
    tid: [corners_section(tid, other[tid]), free_kicks_section(tid, other[tid]), throw_ins_section(tid, other[tid])]
    for tid in (home_id, away_id)
}
attack_transition = {
    tid: [regains_section(tid, other[tid]), first_action_section(tid, other[tid]), counter_section(tid, other[tid])]
    for tid in (home_id, away_id)
}
defence_transition = {
    tid: [losses_section(tid, other[tid]), opp_after_loss_section(tid, other[tid]), counterpress_section(tid, other[tid])]
    for tid in (home_id, away_id)
}
overview = {
    tid: [compare_section(tid, other[tid]), timeline_section(tid, other[tid]), lineup_section(tid, other[tid]), goals_section(tid, other[tid])]
    for tid in (home_id, away_id)
}
goals = []
for e in events:
    if e["type_id"] == 16:
        own = 28 in e["q"]
        goals.append({"eid": eid(e), "teamId": other[e["contestant_id"]] if own else e["contestant_id"],
                      "playerId": e["player_id"] or None, "clock": f"{e['time_min']}:{e['time_sec']:02d}", "ownGoal": own})

data = {
    "match": {
        "id": MATCH_ID,
        "date": first["match_date"],
        "competition": "中乙",
        "stage": STAGE_ZH.get(first["stage_name"], first["stage_name"]),
        "homeId": home_id,
        "awayId": away_id,
        "score": [first["home_score"], first["away_score"]],
    },
    "teams": teams,
    "players": players,
    "events": used,
    "goals": goals,
    "sections": sections,
    "overview": overview,
    "defence": defence,
    "setpieces": setpieces,
    "attackTransition": attack_transition,
    "defenceTransition": defence_transition,
    "video": {"src": VIDEO_SRC, "available": clock is not None},
}
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

# --------------------------------------------------------------------------- report
missing = [p for p in players.values() if not p["nameZh"]]
print(f"wrote {OUT.relative_to(REPO)} ({OUT.stat().st_size / 1024:.0f} KB), {len(used)} events")
print(f"players {len(players)}, Chinese names matched {len(players) - len(missing)}; missing: "
      + ", ".join(f"#{p['number']} {p['nameEn'] or p['id'][:6]}" for p in missing))
for g in goals:
    ev = used[g["eid"]]
    print("goal", g["clock"], teams[g["teamId"]]["nameZh"], players.get(g["playerId"], {}).get("nameZh"), "video", ev["vt"])
for tid, secs in sections.items():
    print(teams[tid]["nameZh"], {s["key"]: len(s["marks"]) for s in secs})
for tid, secs in setpieces.items():
    print(teams[tid]["nameZh"], "定位球", " | ".join(sec["readings"][0] for sec in secs))
for tid in (home_id, away_id):
    print(teams[tid]["nameZh"], "转换", " | ".join(sec["readings"][0] for sec in attack_transition[tid] + defence_transition[tid]))
for tid, secs in defence.items():
    print(teams[tid]["nameZh"], "防守", {sec["key"]: len(sec["marks"]) for sec in secs}, "|", secs[1]["readings"][0])
for tid, secs in overview.items():
    lu = secs[2]
    print(teams[tid]["nameZh"], "阵型", lu["shape"], "变阵", lu["changes"], "上场", len(lu["rows"]), "人；进球回合",
          [(i["clock"], i["source"], i["passes"], f"{i['seconds']}秒", i["startZone"]) for i in secs[3]["items"] if i["side"] == "team"])
corner_check = [(e["q"].get(73) is not None, e["q"].get(75) is not None, e["y"]) for e in events if e["type_id"] == 6 and e["outcome"] == 1]
print("corner awarded (left?, right?, y):", corner_check[:6])
