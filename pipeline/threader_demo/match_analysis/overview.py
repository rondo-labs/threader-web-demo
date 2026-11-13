"""The overview chapter: the two teams side by side, the match timeline, the line-up, the goals."""

from __future__ import annotations

from threader_demo.formations import FORMATIONS, POSITIONS

from .football import REGAIN, RESTART, SHOT_TYPES, THIRD, TOUCH_TYPES, end_xy, in_box, parse_ts, shot_info, third_name


def compare_section(m, t, o):
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
        ("recoveries", "抢回球权", lambda e: e["event_uid"] in m.regain_starts, "dot"),
        ("fouls", "犯规", lambda e: e["type_id"] == 4 and e["outcome"] == 0, "dot"),
        ("corners", "角球", lambda e: e["type_id"] == 1 and 6 in e["q"], "arrow"),
    ]
    pt = [e for e in m.team_events(t) if e["type_id"] == 1 and 107 not in e["q"]]
    po = [e for e in m.team_events(o) if e["type_id"] == 1 and 107 not in e["q"]]
    metrics = [
        {**m.metric("possession", "控球率", pt, po, "按两队传球数估算"), "format": "share", "noPlay": True},
        {**m.rate("pass_rate", "传球成功率", [e for e in pt if e["outcome"] == 1], pt, [e for e in po if e["outcome"] == 1], po), "noPlay": True},
    ]
    marks = {}
    for key, label, test, kind in rows:
        lt = [e for e in m.team_events(t) if test(e)]
        lo = [e for e in m.team_events(o) if test(e)]
        metrics.append(m.metric(key, label, lt, lo))
        for side, lst in (("team", lt), ("opp", lo)):
            for e in lst:
                if m.eid(e) not in marks:
                    use_arrow = kind == "arrow" and end_xy(e)[0] is not None
                    marks[m.eid(e)] = m.arrow_mark(e, side) if use_arrow else m.dot_mark(e, side, goal=e["type_id"] == 16)
    shots_t = sum(1 for e in m.team_events(t) if shot(e))
    shots_o = sum(1 for e in m.team_events(o) if shot(e))
    return {
        "key": "match",
        "title": "关键数据",
        "question": "两队在哪些地方拉开了差距？",
        "pitch": "full",
        "bothTeams": True,
        "marks": list(marks.values()),
        "metrics": metrics,
        "leadersLabel": "",
        "leaders": [],
        "readings": [
            f"{m.name(t)}射门 {shots_t} 次，{m.name(o)} {shots_o} 次；按传球数估算，{m.name(t)}控球约 {round(100 * len(pt) / max(1, len(pt) + len(po)))}%。"
        ],
        "legend": ["us", "them"],
        "legendText": {"us": m.name(t), "them": m.name(o)},
    }


def timeline_section(m, t, o):
    def bins():
        cuts1 = list(range(0, 46, 5)) + ([m.h1] if m.h1 > 45 else [])
        cuts2 = [round(m.h1 + k, 2) for k in range(0, 46, 5)] + ([m.end] if m.end > m.h1 + 45 else [])
        return list(zip(cuts1, cuts1[1:])) + list(zip(cuts2, cuts2[1:]))

    def front(tid):
        return [m.timeline_minute(e) for e in m.team_events(tid) if e["type_id"] == 1 and e["x"] >= THIRD]

    ft, fo = front(t), front(o)
    goals_ = [e for e in m.events if e["type_id"] == 16]
    tests = [
        ("goals", "进球", "goal", lambda tid: [e for e in goals_ if m.scored_by(e) == tid]),
        ("shots", "射门", "shot", lambda tid: [e for e in m.team_events(tid) if e["type_id"] in SHOT_TYPES and 28 not in e["q"]]),
        (
            "box",
            "传进禁区",
            "box",
            lambda tid: [
                e
                for e in m.team_events(tid)
                if e["type_id"] == 1 and e["outcome"] == 1 and 6 not in e["q"] and in_box(*end_xy(e)) and not in_box(e["x"], e["y"])
            ],
        ),
        ("cards", "红黄牌", "card", lambda tid: [e for e in m.team_events(tid) if e["type_id"] == 17]),
        ("subs", "换人", "sub", lambda tid: [e for e in m.team_events(tid) if e["type_id"] == 19]),
    ]
    metrics, marks = [], []
    for key, label, kind, pick in tests:
        lt, lo = pick(t), pick(o)
        metrics.append(m.metric(key, label, lt, lo))
        for side, lst in (("team", lt), ("opp", lo)):
            for e in lst:
                card = "red" if kind == "card" and (32 in e["q"] or 33 in e["q"]) else "yellow" if kind == "card" else None
                marks.append({"kind": "tick", "eid": m.eid(e), "side": side, "tx": m.timeline_minute(e), "type": kind, "card": card})
    return {
        "key": "timeline",
        "kind": "timeline",
        "title": "比赛走势",
        "question": "比赛是怎么走下来的，谁在什么时候占上风？",
        "h1": m.h1,
        "end": m.end,
        "bins": [{"start": a, "end": b, "team": sum(a <= x < b for x in ft), "opp": sum(a <= x < b for x in fo)} for a, b in bins()],
        "marks": marks,
        "metrics": metrics,
        "legendText": {"us": m.name(t), "them": m.name(o)},
        "readings": [f"柱子是每 5 分钟两队在前场三分之一的传球占比：{m.name(t)}在上、{m.name(o)}在下。"],
    }


def lineup_section(m, t, o):
    setup = next(e for e in m.events if e["type_id"] == 34 and e["contestant_id"] == t)
    shape = FORMATIONS.get(int(setup["q"].get(130) or 0), ("未知",))[0]
    changes = [
        {"clock": f"{e['time_min']}:{e['time_sec']:02d}", "shape": FORMATIONS.get(int(e["q"].get(130) or 0), ("未知",))[0]}
        for e in m.events
        if e["type_id"] == 40 and e["contestant_id"] == t
    ]
    on_at = {e["player_id"]: m.timeline_minute(e) for e in m.team_events(t) if e["type_id"] == 19 and e["player_id"]}
    off_at = {e["player_id"]: m.timeline_minute(e) for e in m.team_events(t) if e["type_id"] == 18 and e["player_id"]}
    rows = []
    for pid, p in m.players.items():
        if p["teamId"] != t:
            continue
        start = 0 if p["starter"] else on_at.get(pid)
        if start is None:
            continue  # stayed on the bench
        end = off_at.get(pid, m.end)
        touches = [e for e in m.team_events(t) if e["player_id"] == pid and e["type_id"] in TOUCH_TYPES]
        key = [
            e
            for e in touches
            if e["type_id"] in SHOT_TYPES
            or e.get("key_pass") == 1
            or e.get("assist") == 1
            or (e["type_id"] == 3 and e["outcome"] == 1)
            or (e["type_id"] == 7 and e["outcome"] == 1)
            or e["type_id"] == 8
        ]
        pos = POSITIONS.get(p.get("position") or "")
        rows.append(
            {
                "playerId": pid,
                "starter": p["starter"],
                "slot": p.get("slot") or 0,
                "position": p.get("position"),
                "positionZh": pos[0] if pos else ("替补" if not p["starter"] else ""),
                "slotX": pos[1] if pos else None,
                "slotY": pos[2] if pos else None,
                "avgX": round(sum(e["x"] for e in touches) / len(touches), 1) if touches else None,
                "avgY": round(sum(e["y"] for e in touches) / len(touches), 1) if touches else None,
                "minutes": round(end - start),
                "on": round(start, 1) if not p["starter"] else None,
                "touches": m.count(touches),
                "keyActions": m.count(key),
            }
        )
    rows.sort(key=lambda r: (not r["starter"], r["slot"] if r["starter"] else r["on"] or 0))
    return {
        "key": "lineup",
        "kind": "lineup",
        "title": "谁在场上",
        "question": "摆什么阵型，每个人实际站在哪？",
        "shape": shape,
        "changes": changes,
        "rows": rows,
        "readings": [f"开场阵型 {shape}" + ("；" + "，".join(f"{c['clock']} 变 {c['shape']}" for c in changes) if changes else "，全场没有变阵") + "。"],
    }


def goal_sequence(m, g):
    if 28 in g["q"]:
        return [g]
    team, idx, t_goal = g["contestant_id"], m.events.index(g), parse_ts(g["timestamp"])
    seq = [g]
    for e in reversed(m.events[:idx]):
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


def goals_section(m, t, o):
    items = []
    for g in [e for e in m.events if e["type_id"] == 16]:
        side = "team" if m.scored_by(g) == t else "opp"
        seq = goal_sequence(m, g)
        marks = [m.arrow_mark(e, side) if e["type_id"] == 1 and end_xy(e)[0] is not None else m.dot_mark(e, side, goal=e is g) for e in seq]
        v0, v1 = m.used[m.eid(seq[0])]["vt"], m.used[m.eid(g)]["vt"]
        items.append(
            {
                "goalEid": m.eid(g),
                "side": side,
                "teamId": m.scored_by(g),
                "scorerId": g["player_id"] or None,
                "clock": f"{g['time_min']}:{g['time_sec']:02d}",
                "source": goal_source(g, seq),
                "passes": sum(e["type_id"] == 1 for e in seq),
                "seconds": round(parse_ts(g["timestamp"]) - parse_ts(seq[0]["timestamp"])),
                "startZone": third_name(seq[0]["x"]),
                "eids": [m.eid(e) for e in seq],
                "marks": marks,
                "span": {"start": round(v0 - 4, 2), "end": round(v1 + 5, 2)} if v0 is not None and v1 is not None else None,
            }
        )
    return {
        "key": "goals",
        "kind": "goals",
        "title": "进球是怎么来的",
        "question": "每个进球和失球从哪开始，经过了谁？",
        "items": items,
        "readings": [
            f"{m.name(t)}进 {sum(i['side'] == 'team' for i in items)} 个，丢 {sum(i['side'] == 'opp' for i in items)} 个。"
            "回合从这次控球的开始算：本队的死球开出、或抢回球权的那一下。"
        ],
    }
