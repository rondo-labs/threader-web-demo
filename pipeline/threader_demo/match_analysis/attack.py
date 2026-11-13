"""The attack chapter: build-up, passing network, entries into the final third, shots, crosses."""

from __future__ import annotations

from collections import Counter, defaultdict

from .football import SHOT_TYPES, THIRD, TOUCH_TYPES, end_xy, how, in_box, lane, length_m, match_seconds, parse_ts, shot_info


def shots_section(m, t, o):
    def shots(tid):
        return [e for e in m.team_events(tid) if e["type_id"] in SHOT_TYPES and 28 not in e["q"]]

    st, so = shots(t), shots(o)

    def where(lst, key):
        return [e for e in lst if shot_info(e)[key]]

    in_box_t = where(st, "inBox")
    return {
        "key": "shots",
        "title": "射门",
        "question": "他们从哪里射门，射得怎么样？",
        "pitch": "half",
        "marks": [{"kind": "shot", "eid": m.eid(e), "x": e["x"], "y": e["y"], "period": e["period_id"], **shot_info(e)} for e in st],
        "metrics": [
            m.metric("shots", "射门", st, so),
            m.metric("on_target", "射正", where(st, "onTarget"), where(so, "onTarget")),
            m.metric("goals", "进球", where(st, "goal"), where(so, "goal")),
            m.metric("big", "绝佳机会", where(st, "big"), where(so, "big"), "Opta 标注的绝佳机会"),
            m.metric("in_box", "禁区内射门", in_box_t, where(so, "inBox")),
            m.metric("headers", "头球射门", where(st, "header"), where(so, "header")),
            m.metric("set_piece", "定位球射门", where(st, "setPiece"), where(so, "setPiece")),
            m.metric("fast_break", "反击射门", where(st, "fastBreak"), where(so, "fastBreak")),
        ],
        "leadersLabel": "射门最多",
        "leaders": m.leaders(st, extra=lambda evs: f"进球 {sum(e['type_id'] == 16 for e in evs)}"),
        "readings": [
            f"{m.name(t)}射门 {len(st)} 次，射正 {len(where(st, 'onTarget'))} 次，进球 {len(where(st, 'goal'))} 个；{m.name(o)}射门 {len(so)} 次。",
            f"{len(in_box_t)} 次射门在禁区内，{len(where(st, 'big'))} 次是 Opta 标注的绝佳机会。",
        ],
        "legend": ["goal", "on", "off", "blocked", "big"],
    }


def entries_section(m, t, o):
    def attempts(tid):
        out = []
        for e in m.team_events(tid):
            ex, _ = end_xy(e)
            if e["type_id"] == 1 and ex is not None and e["x"] < THIRD <= ex and not any(k in e["q"] for k in (107, 6, 124)):
                out.append(e)
        return out

    def box(tid):
        return [
            e for e in m.team_events(tid) if e["type_id"] == 1 and e["outcome"] == 1 and 6 not in e["q"] and in_box(*end_xy(e)) and not in_box(e["x"], e["y"])
        ]

    def ok(lst):
        return [e for e in lst if e["outcome"] == 1]

    at, ao = attempts(t), attempts(o)
    bt, bo = box(t), box(o)
    box_ids = {m.eid(e) for e in bt}
    lanes_t = {k: [e for e in ok(at) if lane(end_xy(e)[1]) == k] for k in ("left", "center", "right")}
    lanes_o = {k: [e for e in ok(ao) if lane(end_xy(e)[1]) == k] for k in ("left", "center", "right")}
    drawn = {m.eid(e): e for e in at + bt}
    marks = []
    for key, e in drawn.items():
        ex, ey = end_xy(e)
        marks.append(
            {
                "kind": "arrow",
                "eid": key,
                "x": e["x"],
                "y": e["y"],
                "ex": ex,
                "ey": ey,
                "ok": e["outcome"] == 1,
                "key": key in box_ids,
                "lane": lane(ey),
                "how": how(e),
                "entry": e["x"] < THIRD <= ex,
                "period": e["period_id"],
            }
        )
    lane_zh = {"left": "左路", "center": "中路", "right": "右路"}
    return {
        "key": "entries",
        "title": "前场推进",
        "question": "他们怎么把球推进到前场？",
        "pitch": "full",
        "marks": marks,
        "lanes": [{"lane": k, "label": lane_zh[k], **m.count(v)} for k, v in lanes_t.items()],
        "metrics": [
            m.metric("entries", "进入前场", ok(at), ok(ao), "成功的传球，从前场三分之一线外传到线内"),
            m.rate("entry_rate", "进入成功率", ok(at), at, ok(ao), ao),
            *[m.metric(f"lane_{k}", f"从{lane_zh[k]}进入", lanes_t[k], lanes_o[k]) for k in ("left", "center", "right")],
            m.metric("box", "传进禁区", bt, bo, "成功的传球，从禁区外传到禁区内，不含角球"),
            m.metric("long", "长传进入前场", [e for e in ok(at) if 1 in e["q"]], [e for e in ok(ao) if 1 in e["q"]]),
        ],
        "leadersLabel": "送球进前场最多",
        "leaders": m.leaders(ok(at)),
        "readings": [
            f"{m.name(t)}有 {len(ok(at))} 次把球传进前场（尝试 {len(at)} 次），{m.name(o)} {len(ok(ao))} 次。",
            "左路 {0} 次、中路 {1} 次、右路 {2} 次；传进禁区 {3} 次。".format(len(lanes_t["left"]), len(lanes_t["center"]), len(lanes_t["right"]), len(bt)),
        ],
        "legend": ["ok", "fail", "key"],
    }


def network_section(m, t, o):
    tev = m.team_events(t)
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
        for nxt in touches[order[id(p)] + 1 :]:
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
        if not m.players.get(pid, {}).get("starter"):
            continue
        nodes.append(
            {
                "kind": "node",
                "playerId": pid,
                "x": round(sum(x for x, _ in pts) / len(pts), 1),
                "y": round(sum(y for _, y in pts) / len(pts), 1),
                "count": made[pid],
                "eids": [m.eid(p) for p in passes if p["player_id"] == pid],
            }
        )
    node_ids = {n["playerId"] for n in nodes}
    edges = [
        {"kind": "edge", "a": a, "b": b, "count": len(lst), "eids": [m.eid(p) for p in lst]}
        for pair, lst in pair_passes.items()
        if len(lst) >= 2 and (a := sorted(pair)[0]) in node_ids and (b := sorted(pair)[1]) in node_ids
    ]
    edges.sort(key=lambda d: -d["count"])
    ok = [p for p in passes if p["outcome"] == 1]
    o_passes = [e for e in m.team_events(o) if e["type_id"] == 1 and 107 not in e["q"] and (cut is None or match_seconds(e) < cut)]

    def label(pid):
        p = m.players.get(pid, {})
        return f"#{p.get('number')} {p.get('nameZh') or p.get('nameEn')}"

    combos = [
        {
            "key": f"combo_{i}",
            "label": f"{label(d['a'])} ↔ {label(d['b'])}",
            "format": "int",
            "hint": None,
            "team": {"value": d["count"], "eids": d["eids"]},
            "opp": None,
        }
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
            m.metric("passes", "传球", passes, o_passes, "同一时间段内，不含界外球"),
            m.rate("pass_rate", "传球成功率", ok, passes, [e for e in o_passes if e["outcome"] == 1], o_passes),
            *combos,
        ],
        "leadersLabel": "传球最多",
        "leaders": m.leaders(passes),
        "readings": [
            f"开场到第一次换人，{m.name(t)}传球 {len(passes)} 次，成功 {len(ok)} 次。",
            f"连线最多的是 {combos[0]['label']}，{combos[0]['team']['value']} 次。" if combos else "",
        ],
        "legend": ["node", "edge"],
    }


def crosses_section(m, t, o):
    def crosses(tid):
        return [e for e in m.team_events(tid) if e["type_id"] == 1 and 2 in e["q"] and 5 not in e["q"] and 6 not in e["q"]]

    ct, co = crosses(t), crosses(o)

    def ok(lst):
        return [e for e in lst if e["outcome"] == 1]

    def led(lst):
        return [e for e in lst if e.get("key_pass") == 1 or e.get("assist") == 1]

    marks = []
    for e in ct:
        ex, ey = end_xy(e)
        marks.append(
            {
                "kind": "arrow",
                "eid": m.eid(e),
                "x": e["x"],
                "y": e["y"],
                "ex": ex,
                "ey": ey,
                "ok": e["outcome"] == 1,
                "key": e in led(ct),
                "lane": "left" if e["y"] > 50 else "right",
                "how": "cross",
                "entry": False,
                "period": e["period_id"],
            }
        )
    return {
        "key": "crosses",
        "title": "传中",
        "question": "传中从哪里来，落到哪里？",
        "pitch": "final-third",
        "marks": marks,
        "metrics": [
            m.metric("crosses", "运动战传中", ct, co, "不含角球和任意球"),
            m.metric("cross_ok", "传中成功", ok(ct), ok(co)),
            m.rate("cross_rate", "传中成功率", ok(ct), ct, ok(co), co),
            m.metric("cross_left", "左路传中", [e for e in ct if e["y"] > 50], [e for e in co if e["y"] > 50]),
            m.metric("cross_right", "右路传中", [e for e in ct if e["y"] <= 50], [e for e in co if e["y"] <= 50]),
            m.metric("cross_shot", "传中形成射门", led(ct), led(co)),
        ],
        "leadersLabel": "传中最多",
        "leaders": m.leaders(ct, extra=lambda evs: f"成功 {sum(e['outcome'] == 1 for e in evs)}"),
        "readings": [
            f"{m.name(t)}运动战传中 {len(ct)} 次，成功 {len(ok(ct))} 次，{len(led(ct))} 次形成射门；{m.name(o)}传中 {len(co)} 次。",
        ],
        "legend": ["ok", "fail", "key"],
    }


def buildup_section(m, t, o):
    def own_third(tid):
        return [e for e in m.team_events(tid) if e["type_id"] == 1 and e["x"] < 33.3 and end_xy(e)[0] is not None and not any(k in e["q"] for k in (107, 6, 5))]

    pt, po = own_third(t), own_third(o)
    gks = {pid for pid, p in m.players.items() if p.get("position") == "GK"}

    def exits(lst):
        return [e for e in lst if e["outcome"] == 1 and end_xy(e)[0] >= 33.3]

    def lost(lst):
        return [e for e in lst if e["outcome"] != 1]

    def goal_kicks(lst, short):
        return [e for e in lst if 124 in e["q"] and ((length_m(e) or 99) < 32) == short]

    def keeper(lst):
        return [e for e in lst if e["player_id"] in gks and 124 not in e["q"]]

    exit_ids = {m.eid(e) for e in exits(pt)}
    return {
        "key": "build_up",
        "title": "后场出球",
        "question": "他们怎么把球从后场传出来？",
        "pitch": "full",
        "keyLabel": "传出后场",
        "marks": [m.arrow_mark(e, key=m.eid(e) in exit_ids) for e in pt],
        "metrics": [
            m.metric("exits", "传出后场", exits(pt), exits(po), "从本方后场三分之一传到线外的成功传球"),
            m.metric("lost", "后场丢球", lost(pt), lost(po), "从后场传出的失败传球"),
            m.metric("long", "后场长传", [e for e in pt if 1 in e["q"]], [e for e in po if 1 in e["q"]]),
            m.metric("gk_short", "球门球短传", goal_kicks(pt, True), goal_kicks(po, True), "传球距离 32 米以内"),
            m.metric("gk_long", "球门球长传", goal_kicks(pt, False), goal_kicks(po, False)),
            m.metric("keeper", "门将传球", keeper(pt), keeper(po), "球门球以外"),
            m.metric("own_third", "后场传球（全部）", pt, po, "不含界外球和定位球"),
        ],
        "leadersLabel": "传出后场最多",
        "leaders": m.leaders(exits(pt)),
        "readings": [
            f"{m.name(t)}从后场传球 {len(pt)} 次，成功传出后场 {len(exits(pt))} 次，丢球 {len(lost(pt))} 次；{m.name(o)}成功传出后场 {len(exits(po))} 次。"
        ],
        "legend": ["ok", "fail", "key"],
    }
