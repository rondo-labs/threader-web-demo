"""The set-piece chapter: corners, free kicks, throw-ins."""

from __future__ import annotations

from .football import corner_zone, end_xy, in_box, is_short_corner, parse_ts, zone


def corners_section(m, t, o):
    def corners(tid):
        return [e for e in m.team_events(tid) if e["type_id"] == 1 and 6 in e["q"] and end_xy(e)[0] is not None]

    ct, co = corners(t), corners(o)
    st, so = [x for x in m.shots_of(t) if 25 in x["q"]], [x for x in m.shots_of(o) if 25 in x["q"]]
    zones = {"left": "落在禁区左侧", "central": "落在禁区中路", "right": "落在禁区右侧", "outside": "落在禁区外"}
    hints = {"central": "两根门柱之间", "outside": "不含短角球"}
    short = lambda lst: [e for e in lst if is_short_corner(e)]  # noqa: E731
    marks = []
    for e in ct:
        mark = m.arrow_mark(e, key=m.led_to_shot(e, st))
        mark.update({"zone": corner_zone(e), "cornerSide": "left" if e["y"] > 50 else "right"})
        marks.append(mark)
    marks += [m.dot_mark(x, goal=x["type_id"] == 16) for x in st]
    in_zone = lambda lst, z: [e for e in lst if corner_zone(e) == z]  # noqa: E731
    return {
        "key": "corners",
        "title": "角球",
        "question": "角球往哪里发，各自打成了什么？",
        "pitch": "final-third",
        "keyLabel": "形成射门",
        "marks": marks,
        "summary": {
            "kind": "corners",
            "metrics": ["corners"],
            "drill": {**{z: f"zone_{z}" for z in zones}, "short_left": "short", "short_right": "short"},
            "okLabel": "争到第一点",
        },
        "metrics": [
            m.metric("corners", "全部角球", ct, co),
            m.metric("left", "左侧角球", [e for e in ct if e["y"] > 50], [e for e in co if e["y"] > 50]),
            m.metric("right", "右侧角球", [e for e in ct if e["y"] <= 50], [e for e in co if e["y"] <= 50]),
            *[m.metric(f"zone_{z}", label, in_zone(ct, z), in_zone(co, z), hints.get(z)) for z, label in zones.items() if z != "outside"],
            m.metric("short", "短角球", short(ct), short(co), "没有传中、长传标记，画在开球的那一侧"),
            m.metric("zone_outside", zones["outside"], in_zone(ct, "outside"), in_zone(co, "outside"), hints["outside"]),
            m.metric("first_contact", "争到第一点", [e for e in ct if e["outcome"] == 1], [e for e in co if e["outcome"] == 1], "第一个碰到球的是自己人"),
            m.metric("shots", "角球后射门", st, so),
            m.metric("goals", "角球进球", [x for x in st if x["type_id"] == 16], [x for x in so if x["type_id"] == 16]),
        ],
        "leadersLabel": "主罚最多",
        "leaders": m.leaders(ct),
        "readings": [
            f"{m.name(t)}角球 {len(ct)} 个（左侧 {sum(e['y'] > 50 for e in ct)}、右侧 {sum(e['y'] <= 50 for e in ct)}）："
            f"落在禁区左侧 {len(in_zone(ct, 'left'))}、中路 {len(in_zone(ct, 'central'))}、右侧 {len(in_zone(ct, 'right'))}，"
            f"短角球 {len(short(ct))}，其他落在禁区外 {len(in_zone(ct, 'outside'))}；争到第一点 {sum(e['outcome'] == 1 for e in ct)} 次，形成射门 {len(st)} 次。"
        ],
        "legend": ["ok", "fail", "key"],
    }


def free_kicks_section(m, t, o):
    def fk_all(tid):
        return [e for e in m.team_events(tid) if e["type_id"] == 1 and 5 in e["q"] and end_xy(e)[0] is not None]

    def fk(tid):
        # The breakdown looks at the opponent's half: a 40-metre delivery into the box is an attacking free kick too.
        return [e for e in fk_all(tid) if e["x"] >= 50]

    def direct(tid):
        return [x for x in m.shots_of(tid) if 26 in x["q"]]

    def after(tid):
        return [x for x in m.shots_of(tid) if 24 in x["q"]]

    def pens(tid):
        return [x for x in m.shots_of(tid) if 9 in x["q"]]

    at, ao = fk_all(t), fk_all(o)
    ft, fo = fk(t), fk(o)
    into_box = lambda lst: [e for e in lst if in_box(*end_xy(e))]  # noqa: E731
    short = lambda lst: [e for e in lst if not in_box(*end_xy(e))]  # noqa: E731
    goals = lambda tid: [x for x in after(tid) + direct(tid) + pens(tid) if x["type_id"] == 16]  # noqa: E731
    marks = [m.arrow_mark(e, key=m.led_to_shot(e, after(t))) for e in at]
    seen = set()
    for x in direct(t) + after(t) + pens(t):
        if m.eid(x) not in seen:
            seen.add(m.eid(x))
            marks.append(m.dot_mark(x, goal=x["type_id"] == 16))
    return {
        "key": "free_kicks",
        "title": "任意球",
        "question": "任意球在哪里踢，到了对方半场是直接打门还是传进禁区？",
        "pitch": "full",
        "keyLabel": "形成射门",
        "marks": marks,
        "metrics": [
            m.metric("all", "全部任意球", at + direct(t), ao + direct(o), "传球开出的，加上直接射门"),
            m.metric("half", "对方半场任意球", ft + direct(t), fo + direct(o)),
            m.metric("direct", "直接射门", direct(t), direct(o)),
            m.metric("into_box", "传进禁区", into_box(ft), into_box(fo)),
            m.metric("short", "短传配合", short(ft), short(fo), "对方半场开出，没有直接传进禁区"),
            m.metric("shots_after", "任意球后射门", after(t), after(o)),
            m.metric("goals", "任意球和点球进球", goals(t), goals(o)),
            m.metric("penalties", "点球", pens(t), pens(o)),
        ],
        "leadersLabel": "主罚最多",
        "leaders": m.leaders(at + direct(t)),
        "readings": [
            f"{m.name(t)}任意球 {len(at) + len(direct(t))} 次，其中对方半场 {len(ft) + len(direct(t))} 次：直接射门 {len(direct(t))}、传进禁区 {len(into_box(ft))}、"
            f"短传配合 {len(short(ft))}；任意球和点球进球 {len(goals(t))} 个。"
        ],
        "legend": ["ok", "fail", "key", "goal"],
    }


def throw_ins_section(m, t, o):
    def throws(tid):
        return [e for e in m.team_events(tid) if e["type_id"] == 1 and 107 in e["q"] and end_xy(e)[0] is not None]

    def kept(e):
        if e["outcome"] != 1:
            return False
        t0 = parse_ts(e["timestamp"])
        for x in m.events[m.pos[e["event_uid"]] + 1 :]:
            if x["period_id"] != e["period_id"] or parse_ts(x["timestamp"]) - t0 > 5:
                break
            if (
                x["contestant_id"] != e["contestant_id"]
                and x["player_id"]
                and ((x["type_id"] in (1, 3) and x["outcome"] == 1) or x["type_id"] in (49, 8, 12) or (x["type_id"] == 7 and x["outcome"] == 1))
            ):
                return False
        return True

    tt, to_ = throws(t), throws(o)
    sh_t, sh_o = [x for x in m.shots_of(t) if 160 in x["q"]], [x for x in m.shots_of(o) if 160 in x["q"]]
    by_zone = lambda lst, z: [e for e in lst if zone(e["x"]) == z]  # noqa: E731
    zones = {"front": "在前场", "mid": "在中场", "back": "在后场"}
    marks = [m.arrow_mark(e, key=m.led_to_shot(e, sh_t)) for e in tt] + [m.dot_mark(x, goal=x["type_id"] == 16) for x in sh_t]
    return {
        "key": "throw_ins",
        "title": "界外球",
        "question": "界外球扔给谁，扔完还控得住球吗？",
        "pitch": "full",
        "keyLabel": "形成射门",
        "marks": marks,
        "summary": {"kind": "thirds", "metrics": ["all"], "drill": {z: f"zone_{z}" for z in zones}, "okLabel": "扔到队友"},
        "metrics": [
            m.metric("all", "全部界外球", tt, to_),
            *[m.metric(f"zone_{z}", label, by_zone(tt, z), by_zone(to_, z)) for z, label in zones.items()],
            m.metric("long_box", "长界外球进禁区", [e for e in tt if in_box(*end_xy(e))], [e for e in to_ if in_box(*end_xy(e))]),
            m.metric("kept", "扔完 5 秒内还控着球", [e for e in tt if kept(e)], [e for e in to_ if kept(e)], "扔到队友，5 秒内对手没拿到球"),
            m.metric("lost", "扔完 5 秒内丢了球", [e for e in tt if not kept(e)], [e for e in to_ if not kept(e)], "没扔到队友，或被对手拿到"),
            m.metric("shots_after", "界外球后射门", sh_t, sh_o),
        ],
        "leadersLabel": "扔界外球最多",
        "leaders": m.leaders(tt),
        "readings": [
            f"{m.name(t)}界外球 {len(tt)} 个：前场 {len(by_zone(tt, 'front'))}、中场 {len(by_zone(tt, 'mid'))}、后场 {len(by_zone(tt, 'back'))}；"
            f"扔完 5 秒内还控着球 {sum(kept(e) for e in tt)} 次，形成射门 {len(sh_t)} 次。"
        ],
        "legend": ["ok", "fail", "key"],
    }
