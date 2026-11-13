"""The defence chapter: defensive actions, pressing, where the opponent gets in, box defence."""

from __future__ import annotations

from .football import BOX_Y0, BOX_Y1, SHOT_TYPES, THIRD, end_xy, in_box, lane, zone
from .transitions import regains_of

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


def defensive_actions(m, tid):
    return [e for e in m.team_events(tid) if def_kind(e)]


def def_actions_section(m, t, o):
    at, ao = defensive_actions(m, t), defensive_actions(m, o)
    zones = {"front": "在前场", "mid": "在中场", "back": "在后场"}
    by_zone = lambda lst, z: [e for e in lst if zone(e["x"]) == z]  # noqa: E731
    by_kind = lambda lst, k: [e for e in lst if def_kind(e) == k]  # noqa: E731
    return {
        "key": "def_actions",
        "title": "防守动作",
        "question": "在哪里、用什么方式把球断下来？",
        "pitch": "full",
        "marks": [m.dot_mark(e, ok=DEF_OK[def_kind(e)]) for e in at],
        "summary": {
            "kind": "thirds",
            "metrics": ["all_actions"],
            "drill": {"front": "zone_front", "mid": "zone_mid", "back": "zone_back"},
            "okLabel": "断下球",
        },
        "metrics": [
            m.metric("all_actions", "全部防守动作", at, ao),
            *[m.metric(f"zone_{z}", label, by_zone(at, z), by_zone(ao, z)) for z, label in zones.items()],
            *[m.metric(k, label, by_kind(at, k), by_kind(ao, k)) for k, label, _, _ in DEF_KINDS],
        ],
        "leadersLabel": "防守动作最多",
        "leaders": m.leaders(at),
        "readings": [
            f"{m.name(t)}防守动作 {len(at)} 次：前场 {len(by_zone(at, 'front'))}、中场 {len(by_zone(at, 'mid'))}、后场 {len(by_zone(at, 'back'))}；"
            f"抢断 {len(by_kind(at, 'tackles'))}、拦截 {len(by_kind(at, 'interceptions'))}、被过 {len(by_kind(at, 'dribbled_past'))}。"
        ],
        "legend": ["act_ok", "act_fail"],
        "legendText": {"act_ok": "断下球、解围、争顶成功", "act_fail": "被过、犯规（空心）"},
    }


def pressing_section(m, t, o):
    def ppda(presser, passer):
        actions = [e for e in m.team_events(presser) if PRESS(e) and e["x"] > 40]
        passes = [e for e in m.team_events(passer) if e["type_id"] == 1 and e["x"] < 60 and not any(k in e["q"] for k in (107, 5, 6, 124))]
        return actions, passes

    at, pt = ppda(t, o)
    ao, po = ppda(o, t)
    all_t, all_o = defensive_actions(m, t), defensive_actions(m, o)
    won = lambda tid: [p["start"] for p in regains_of(m, tid) if p["start"]["x"] >= THIRD]  # noqa: E731
    offside = lambda tid: [e for e in m.team_events(tid) if e["type_id"] == 55]  # noqa: E731
    own_half = lambda tid: [e for e in m.team_events(tid) if e["type_id"] == 1 and e["x"] < 50 and not any(k in e["q"] for k in (107, 5, 6, 124))]  # noqa: E731
    ht, ho = own_half(o), own_half(t)  # passes the pressing team faced
    avg_m = lambda lst: round(sum(e["x"] for e in lst) / len(lst) * 1.05, 1) if lst else 0  # noqa: E731
    marks = {}
    for e in at + won(t) + offside(t):
        marks[m.eid(e)] = m.dot_mark(e, ok=e["type_id"] != 45 and e["type_id"] != 4)
    for e in ht:
        marks[m.eid(e)] = m.arrow_mark(e, side="opp")
    return {
        "key": "pressing",
        "title": "防线高度与压迫",
        "question": "压得有多高、有多凶？（按防守动作估算）",
        "pitch": "full",
        "marks": list(marks.values()),
        "lines": [
            {"x": 40, "label": "PPDA 计算区"},
            {"x": round(sum(e["x"] for e in all_t) / max(1, len(all_t)), 1), "label": "防守动作平均位置", "key": True, "metric": "height"},
        ],
        "metrics": [
            {
                "key": "ppda",
                "label": "PPDA",
                "format": "ratio",
                "hint": "对手在后场 60% 区域内传几脚球，我们才做一次防守动作；越低压得越凶",
                "team": {"value": round(len(pt) / max(1, len(at)), 1), "eids": [m.eid(e) for e in at], "numEids": [m.eid(e) for e in pt]},
                "opp": {"value": round(len(po) / max(1, len(ao)), 1), "eids": [m.eid(e) for e in ao], "numEids": [m.eid(e) for e in po]},
            },
            {**m.metric("height", "防守动作平均位置", all_t, all_o, "离本方球门多少米（估算防线高度）"), "format": "meters", "noPlay": True},
            m.metric("front_won", "前场抢回球权", won(t), won(o)),
            m.metric("offside", "制造越位", offside(t), offside(o)),
            m.rate(
                "opp_pass",
                "对手后场传球成功率",
                [e for e in ht if e["outcome"] == 1],
                ht,
                [e for e in ho if e["outcome"] == 1],
                ho,
                "我们压迫时，对手从他们半场传球的成功率",
            ),
        ],
        "leadersLabel": "压迫最多",
        "leaders": m.leaders(at),
        "readings": [
            f"{m.name(t)} PPDA {round(len(pt) / max(1, len(at)), 1)}，{m.name(o)} {round(len(po) / max(1, len(ao)), 1)}；"
            f"{m.name(t)}防守动作平均离本方球门 {avg_m(all_t)} 米，{m.name(o)} {avg_m(all_o)} 米。"
        ],
        "legend": ["act_ok", "act_fail", "them_pass"],
        "legendText": {"act_ok": "我们的压迫动作", "act_fail": "被过、犯规（空心）", "them_pass": "对手后场传球"},
    }


def opp_access_section(m, t, o):
    def entries_by(attacker):
        out = []
        for e in m.team_events(attacker):
            ex, _ = end_xy(e)
            if e["type_id"] == 1 and ex is not None and e["x"] < THIRD <= ex and not any(k in e["q"] for k in (107, 6, 124)):
                out.append(e)
        return out

    def box_by(attacker):
        return [
            e
            for e in m.team_events(attacker)
            if e["type_id"] == 1 and e["outcome"] == 1 and 6 not in e["q"] and in_box(*end_xy(e)) and not in_box(e["x"], e["y"])
        ]

    def shots_by(attacker):
        return [e for e in m.team_events(attacker) if e["type_id"] in SHOT_TYPES and 28 not in e["q"]]

    def our_lane(e):  # the attacker's right is our left
        return lane(100 - end_xy(e)[1])

    ok = lambda lst: [e for e in lst if e["outcome"] == 1]  # noqa: E731
    ea, eo = entries_by(o), entries_by(t)  # team column: what the opponent did against the analysed team
    box_ids = {m.eid(e) for e in box_by(o)}
    marks = {}
    for e in ea + box_by(o):
        mark = m.arrow_mark(e, side="opp", key=m.eid(e) in box_ids)
        mark.update({"entry": e in ea, "lane": our_lane(e)})
        marks[m.eid(e)] = mark
    for e in shots_by(o):
        marks[m.eid(e)] = m.dot_mark(e, side="opp", goal=e["type_id"] == 16)
    lanes = {"left": "从我们左路", "center": "从中路", "right": "从我们右路"}
    return {
        "key": "opp_access",
        "title": "对手从哪打进来",
        "question": "对手主要从我们哪一侧打进来？",
        "pitch": "full",
        "marks": list(marks.values()),
        "keyLabel": "传进我们禁区",
        "summary": {"kind": "lanes-defending", "metrics": ["opp_entries"], "drill": {k: f"from_{k}" for k in lanes}, "badge": "opp_box"},
        "tableNote": "每一列是这支队防守时，对手打进来的次数",
        "metrics": [
            m.metric("opp_entries", "对手进入我们后场", ok(ea), ok(eo), "成功传进我们后场三分之一"),
            *[m.metric(f"from_{k}", label, [e for e in ok(ea) if our_lane(e) == k], [e for e in ok(eo) if our_lane(e) == k]) for k, label in lanes.items()],
            m.metric("opp_box", "传进我们禁区", box_by(o), box_by(t)),
            m.metric("opp_shots", "对手射门", shots_by(o), shots_by(t)),
            m.metric("opp_big", "对手绝佳机会", [e for e in shots_by(o) if 214 in e["q"]], [e for e in shots_by(t) if 214 in e["q"]]),
            m.metric("opp_fast", "对手反击射门", [e for e in shots_by(o) if 23 in e["q"]], [e for e in shots_by(t) if 23 in e["q"]]),
        ],
        "leadersLabel": "对手谁打进来最多",
        "leaders": m.leaders(ok(ea)),
        "readings": [
            f"{m.name(o)}成功打进{m.name(t)}后场 {len(ok(ea))} 次：从{m.name(t)}左路 {sum(our_lane(e) == 'left' for e in ok(ea))}、"
            f"中路 {sum(our_lane(e) == 'center' for e in ok(ea))}、右路 {sum(our_lane(e) == 'right' for e in ok(ea))}；射门 {len(shots_by(o))} 次。"
        ],
        "legend": ["them_pass", "key", "them_shot"],
        "legendText": {"them_pass": "对手的推进", "them_shot": "对手射门"},
    }


def box_defence_section(m, t, o):
    def own_box(e):
        return e["x"] <= 17 and BOX_Y0 <= e["y"] <= BOX_Y1

    def parts(defender, attacker):
        d = m.team_events(defender)
        return {
            "crosses_in": [e for e in m.team_events(attacker) if e["type_id"] == 1 and 2 in e["q"] and in_box(*end_xy(e))],
            "box_clear": [e for e in d if e["type_id"] == 12 and own_box(e)],
            "blocks": [e for e in d if e["type_id"] == 10 and 94 in e["q"]],
            "aerial_won": [e for e in d if e["type_id"] == 44 and e["outcome"] == 1 and own_box(e)],
            "aerial_lost": [e for e in d if e["type_id"] == 44 and e["outcome"] == 0 and own_box(e)],
            "saves": [e for e in d if e["type_id"] == 10 and 94 not in e["q"]],
            "keeper_out": [e for e in d if e["type_id"] in (11, 41, 54, 59)],
            "shots_in": [e for e in m.team_events(attacker) if e["type_id"] in SHOT_TYPES and 28 not in e["q"] and in_box(e["x"], e["y"])],
        }

    pt, po = parts(t, o), parts(o, t)
    labels = {
        "crosses_in": ("对手传中进禁区", None),
        "box_clear": ("禁区内解围", None),
        "blocks": ("封堵射门", "后卫挡出的射门"),
        "aerial_won": ("禁区内争顶赢", None),
        "aerial_lost": ("禁区内争顶输", None),
        "saves": ("门将扑救", None),
        "keeper_out": ("门将出击", "摘球、击球、出击解围"),
        "shots_in": ("对手禁区内射门", None),
    }
    marks = {}
    for key, lst in pt.items():
        for e in lst:
            if key == "crosses_in":
                marks[m.eid(e)] = m.arrow_mark(e, side="opp")
            elif key == "shots_in":
                marks[m.eid(e)] = m.dot_mark(e, side="opp", goal=e["type_id"] == 16)
            else:
                marks[m.eid(e)] = m.dot_mark(e, ok=key != "aerial_lost")
    return {
        "key": "box_defence",
        "title": "禁区防守",
        "question": "球进了我们禁区，守不守得住？",
        "pitch": "half-own",
        "marks": list(marks.values()),
        "metrics": [m.metric(k, label, pt[k], po[k], hint) for k, (label, hint) in labels.items()],
        "leadersLabel": "禁区里谁最多",
        "leaders": m.leaders(pt["box_clear"] + pt["aerial_won"] + pt["blocks"]),
        "readings": [
            f"{m.name(o)}传中进禁区 {len(pt['crosses_in'])} 次、禁区内射门 {len(pt['shots_in'])} 次；"
            f"{m.name(t)}禁区内解围 {len(pt['box_clear'])} 次，争顶 {len(pt['aerial_won'])} 赢 {len(pt['aerial_lost'])} 输。"
        ],
        "legend": ["act_ok", "act_fail", "them_pass", "them_shot"],
        "legendText": {"act_ok": "我们的解围、封堵、扑救", "act_fail": "争顶输（空心）", "them_pass": "对手传中", "them_shot": "对手射门"},
    }
