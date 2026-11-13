"""Football definitions on raw Opta events: pure functions, no match state.

Coordinates are Opta's: 0–100 both ways, the team in possession attacking left to right,
y = 100 on the attacking team's left. Qualifier ids are noted where they are used.
"""

from __future__ import annotations

import math
from datetime import datetime

BOX_X, BOX_Y0, BOX_Y1 = 83.0, 21.1, 78.9  # Opta penalty area
THIRD = 66.7
SHOT_TYPES = {13, 14, 15, 16}
TOUCH_TYPES = {1, 2, 3, 7, 8, 10, 11, 12, 13, 14, 15, 16, 41, 42, 44, 45, 49, 50, 52, 54, 59, 61, 74}
STAGE_ZH = {"Regular Season": "常规赛", "Relegation Round": "保级组", "Promotion Group": "升级组"}

RESTART = (5, 6, 107, 124, 279)  # free kick, corner, throw-in, goal kick, kick-off
REGAIN = (49, 8, 11, 52, 54)  # recovery, interception, claim, keeper pick-up, smother
ON_BALL = {1, 3, 13, 14, 15, 16, 49, 50, 51, 52, 61}  # pass, take-on, shots, recovery, dispossessed, error, pick-up, touch
DEAD_BALL = {2, 4, 5, 6, 27, 28, 30, 55, 68}  # offside pass, foul, out, corner awarded, delays, end, offside provoked, drop ball


def parse_ts(value: str) -> float:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()


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
    2: "越位传球",
    7: "抢断",
    8: "拦截",
    11: "门将摘球",
    12: "解围",
    18: "换下",
    19: "换上",
    41: "门将击球",
    45: "被过",
    49: "抢第二落点",
    50: "被抢断",
    51: "失误",
    52: "门将拿球",
    54: "门将扑脚下球",
    55: "制造越位",
    56: "护球出界",
    59: "门将出球解围",
    61: "停球失误",
    74: "封堵传球",
}


def describe(e):
    q, t = e["q"], e["type_id"]
    if t in SHOT_TYPES:
        s = shot_info(e)
        what = "进球" if s["goal"] else "射门被封堵" if s["blocked"] else "射正被扑" if t == 15 else "击中门框" if t == 14 else "射偏"
        body = "头球" if 15 in q else "左脚" if 72 in q else "右脚" if 20 in q else ""
        situation = (
            "点球"
            if 9 in q
            else "直接任意球"
            if 26 in q
            else "角球后"
            if 25 in q
            else "定位球后"
            if 24 in q
            else "界外球后"
            if 160 in q
            else "反击"
            if 23 in q
            else ""
        )
        return " · ".join(x for x in (what, situation, body, "绝佳机会" if s["big"] else "") if x)
    if t == 1:
        kind = (
            "角球"
            if 6 in q
            else "任意球"
            if 5 in q
            else "界外球"
            if 107 in q
            else "球门球"
            if 124 in q
            else "传中"
            if 2 in q
            else "直塞"
            if 4 in q
            else "长传"
            if 1 in q
            else "传球"
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


def length_m(e):
    try:
        return float(e["q"][212])
    except (KeyError, ValueError, TypeError):
        return None


def flip(x, y):
    return (100 - x, 100 - y) if x is not None else (None, None)


def third_name(x):
    return "后场" if x < 33.3 else "中场" if x < 66.7 else "前场"


def zone(x):
    return "front" if x >= THIRD else "mid" if x >= 33.3 else "back"


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


def direction(e):
    ex, ey = end_xy(e)
    ang = math.degrees(math.atan2((ey - e["y"]) * 0.68, (ex - e["x"]) * 1.05))
    return "forward" if abs(ang) < 45 else "back" if abs(ang) > 135 else "side"
