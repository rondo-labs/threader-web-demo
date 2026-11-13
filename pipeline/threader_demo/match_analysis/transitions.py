"""Both transition chapters, read from the possessions (possession.py)."""

from __future__ import annotations

from .football import SHOT_TYPES, THIRD, direction, end_xy, flip, lane, length_m, parse_ts, zone

SKIP_FIRST = {7, 8, 10, 11, 44, 54, 74, 49, 52}  # winning the ball is not yet doing something with it


def regains_of(m, tid):
    return [p for p in m.regains if p["team"] == tid]


def losses_of(m, tid):
    """The other side's regains are this side's losses."""
    return [p for p in m.regains if p["team"] == m.other[tid]]


def regain_kind(m, p):
    s, t = p["start"], p["start"]["type_id"]
    if t == 7:
        return "tackle"
    if t in (8, 74) or (t == 10 and 94 in s["q"]):
        return "interception"
    if t in (10, 11, 52, 54) or (t == 49 and s["player_id"] in m.gk_ids):
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


def regains_section(m, t, o):
    rt, ro = regains_of(m, t), regains_of(m, o)
    starts = lambda lst: [p["start"] for p in lst]  # noqa: E731
    by_zone = lambda lst, z: [p["start"] for p in lst if zone(p["start"]["x"]) == z]  # noqa: E731
    by_kind = lambda lst, k: [p["start"] for p in lst if regain_kind(m, p) == k]  # noqa: E731
    marks = []
    for p in rt:
        mark = m.dot_mark(p["start"])
        mark["key"] = "shot" in p["facts"]
        marks.append(mark)
    zones = {"front": "在前场", "mid": "在中场", "back": "在后场"}
    return {
        "key": "regains",
        "title": "在哪抢回来",
        "question": "在哪里把球抢回来，用的什么方式？",
        "pitch": "full",
        "keyLabel": "这次抢回后形成射门",
        "marks": marks,
        "summary": {"kind": "thirds", "metrics": ["all"], "drill": {z: f"zone_{z}" for z in zones}},
        "metrics": [
            m.metric("all", "全部抢回球权", starts(rt), starts(ro), "运动战中从对手脚下把球拿回来"),
            *[m.metric(f"zone_{z}", label, by_zone(rt, z), by_zone(ro, z)) for z, label in zones.items()],
            *[m.metric(k, label, by_kind(rt, k), by_kind(ro, k), hint) for k, label, hint in REGAIN_KINDS],
        ],
        "leadersLabel": "抢回最多",
        "leaders": m.leaders(starts(rt)),
        "readings": [
            f"{m.name(t)}抢回球权 {len(rt)} 次：前场 {len(by_zone(rt, 'front'))}、中场 {len(by_zone(rt, 'mid'))}、后场 {len(by_zone(rt, 'back'))}；"
            f"其中 {sum('shot' in p['facts'] for p in rt)} 次最后形成射门。"
        ],
        "legend": ["us", "key_dot"],
        "legendText": {"us": "抢回球权的位置"},
    }


def first_action_section(m, t, o):
    def rows(tid):
        out = []
        for p in regains_of(m, tid):
            a = first_action(p)
            out.append((p, a, a or p["start"]))
        return out

    rt, ro = rows(t), rows(o)
    pick = lambda lst, test: [ev for p, a, ev in lst if test(p, a)]  # noqa: E731
    marks = []
    for p, a, ev in rt:
        key = "shot" in p["facts"]
        if a is not None and a["type_id"] == 1 and end_xy(a)[0] is not None:
            marks.append(m.arrow_mark(a, key=key))
        else:
            mark = m.dot_mark(ev, ok=not first_lost(p, a))
            mark["key"] = key
            marks.append(mark)
    return {
        "key": "first_action",
        "title": "抢回后的第一脚",
        "question": "抢回来以后，第一时间怎么处理球？",
        "pitch": "full",
        "keyLabel": "这次抢回后形成射门",
        "marks": marks,
        "metrics": [
            m.metric("all", "全部抢回球权", pick(rt, lambda p, a: True), pick(ro, lambda p, a: True), "图上画抢回后的第一个动作"),
            *[
                m.metric(k, label, pick(rt, lambda p, a, k=k: first_kind(a) == k), pick(ro, lambda p, a, k=k: first_kind(a) == k), hint)
                for k, label, hint in FIRST_KINDS
            ],
            m.metric("lost", "第一脚就丢", pick(rt, first_lost), pick(ro, first_lost), "传球失误、过人失败、被抢或解围出去，球又回到对手脚下"),
        ],
        "leadersLabel": "出第一脚最多",
        "leaders": m.leaders([ev for _, _, ev in rt]),
        "readings": [
            f"{m.name(t)}抢回球后，第一脚向前 {sum(first_kind(a) in ('forward', 'long') for _, a, _ in rt)} 次（其中长传 {sum(first_kind(a) == 'long' for _, a, _ in rt)}）、"
            f"横传 {sum(first_kind(a) == 'side' for _, a, _ in rt)}、回传 {sum(first_kind(a) == 'back' for _, a, _ in rt)}；第一脚就丢 {sum(first_lost(p, a) for p, a, _ in rt)} 次。"
        ],
        "legend": ["ok", "fail", "key", "act_ok"],
        "legendText": {"act_ok": "过人、解围等不是传球的动作（空心：这一下就丢了）"},
    }


def counter_section(m, t, o):
    def stage(tid, fact, post=4):
        return [(p["start"], m.span(p["start"], p["facts"][fact][0], pre=2, post=post)) for p in regains_of(m, tid) if fact in p["facts"]]

    def timed(tid, lo, hi):
        return [
            (p["start"], m.span(p["start"], p["facts"]["shot"][0], pre=2))
            for p in regains_of(m, tid)
            if "shot" in p["facts"] and lo <= p["facts"]["shot"][1] < hi
        ]

    def everything(tid):
        return [(p["start"], m.span(p["start"], p["start"], post=5)) for p in regains_of(m, tid)]

    rt = regains_of(m, t)
    n = lambda fact: sum(fact in p["facts"] for p in rt)  # noqa: E731
    return {
        "key": "counter",
        "title": "反击打成了什么",
        "question": "抢回球以后，打进前场、禁区，射门、进球各多少次，用了多久？",
        "pitch": "full",
        "marks": [],
        "funnel": {
            "groups": [
                {"title": "抢回以后打到了哪一步", "base": "all", "rows": ["all", "third", "box", "shots", "goals"]},
                {"title": "射门离抢回多久", "base": "shots", "rows": ["fast", "mid", "slow"]},
            ]
        },
        "metrics": [
            m.span_metric("all", "全部抢回球权", everything(t), everything(o)),
            m.span_metric("third", "打进前场", stage(t, "third", 3), stage(o, "third", 3), "球到了对方三分之一，抢回就在前场的也算"),
            m.span_metric("box", "打进禁区", stage(t, "box", 3), stage(o, "box", 3)),
            m.span_metric("shots", "形成射门", stage(t, "shot"), stage(o, "shot")),
            m.span_metric("goals", "进球", stage(t, "goal", 6), stage(o, "goal", 6)),
            m.span_metric("fast", "6 秒内射门", timed(t, 0, 6), timed(o, 0, 6), "从抢回到射门"),
            m.span_metric("mid", "6–15 秒射门", timed(t, 6, 15), timed(o, 6, 15)),
            m.span_metric("slow", "15 秒以上射门", timed(t, 15, 1e9), timed(o, 15, 1e9), "多是抢回后控了一阵球"),
        ],
        "leadersLabel": "",
        "leaders": [],
        "readings": [f"{m.name(t)}抢回球权 {len(rt)} 次：打进前场 {n('third')}、禁区 {n('box')}，射门 {n('shot')}，进球 {n('goal')}。"],
        "legend": [],
    }


def losses_section(m, t, o):
    lt, lo = losses_of(m, t), losses_of(m, o)
    evs = lambda lst: [loss_event(p) for p in lst]  # noqa: E731
    by_zone = lambda lst, z: [loss_event(p) for p in lst if zone(loss_xy(p)[0]) == z]  # noqa: E731
    by_kind = lambda lst, k: [loss_event(p) for p in lst if loss_kind(p) == k]  # noqa: E731
    marks = []
    for p in lt:
        x, y = loss_xy(p)
        marks.append(
            {
                "kind": "dot",
                "eid": m.eid(loss_event(p)),
                "x": x,
                "y": y,
                "side": "team",
                "period": p["start"]["period_id"],
                "goal": False,
                "ok": True,
                "key": "shot" in p["facts"],
            }
        )
    zones = {"front": "在前场", "mid": "在中场", "back": "在后场"}
    return {
        "key": "losses",
        "title": "在哪丢的",
        "question": "在哪里丢球，怎么丢的？",
        "pitch": "full",
        "keyLabel": "这次丢球后对手射门",
        "marks": marks,
        "summary": {"kind": "thirds", "metrics": ["all"], "drill": {z: f"zone_{z}" for z in zones}},
        "metrics": [
            m.metric("all", "全部丢球", evs(lt), evs(lo), "运动战中球权到了对手脚下（不含出界、犯规）"),
            *[m.metric(f"zone_{z}", label, by_zone(lt, z), by_zone(lo, z)) for z, label in zones.items()],
            *[m.metric(k, label, by_kind(lt, k), by_kind(lo, k), hint) for k, label, hint in LOSS_KINDS],
        ],
        "leadersLabel": "丢球最多",
        "leaders": m.leaders([p["loss"] for p in lt if p["loss"]]),
        "readings": [
            f"{m.name(t)}丢球 {len(lt)} 次：前场 {len(by_zone(lt, 'front'))}、中场 {len(by_zone(lt, 'mid'))}、后场 {len(by_zone(lt, 'back'))}；"
            f"传球被断 {len(by_kind(lt, 'pass'))} 次；其中 {sum('shot' in p['facts'] for p in lt)} 次被对手打成射门。"
        ],
        "legend": ["us", "key_dot"],
        "legendText": {"us": "丢球的位置"},
    }


def opp_after_loss_section(m, t, o):
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

    lt, lo = losses_of(m, t), losses_of(m, o)
    et, eo = [e for e in map(entry, lt) if e], [e for e in map(entry, lo) if e]
    shot_poss = {m.eid(p["start"]) for p in lt if "shot" in p["facts"] and p["facts"]["shot"][1] <= WINDOW}
    marks = {}
    for p in lt:
        e = entry(p)
        if e:
            mark = m.arrow_mark(e, side="opp", key=m.eid(p["start"]) in shot_poss)
            mark.update({"entry": True, "lane": our_lane(e)})
            marks[m.eid(e)] = mark
    for e in within(lt, "shot"):
        marks[m.eid(e)] = m.dot_mark(e, side="opp", goal=e["type_id"] == 16)
    lanes = {"left": "从我们左路", "center": "从中路", "right": "从我们右路"}
    return {
        "key": "opp_after_loss",
        "title": "对手拿到球之后",
        "question": "我们丢球以后，对手往哪里打？（10 秒内）",
        "pitch": "full",
        "keyLabel": "10 秒内打成射门",
        "marks": list(marks.values()),
        "summary": {"kind": "lanes-defending", "metrics": ["entries"], "drill": {k: f"from_{k}" for k in lanes}, "badge": "box"},
        "tableNote": "每一列是这支队丢球后，对手 10 秒内打成了什么",
        "metrics": [
            m.metric("entries", "10 秒内打进我们后场", et, eo, "成功传进我们后场三分之一；在我们后场丢的不算"),
            *[m.metric(f"from_{k}", label, [e for e in et if our_lane(e) == k], [e for e in eo if our_lane(e) == k]) for k, label in lanes.items()],
            m.metric("box", "10 秒内进我们禁区", within(lt, "box"), within(lo, "box")),
            m.metric("shots", "10 秒内射门", within(lt, "shot"), within(lo, "shot")),
            m.metric("goals", "10 秒内进球", within(lt, "goal"), within(lo, "goal")),
        ],
        "leadersLabel": "对手谁打进来最多",
        "leaders": m.leaders(et),
        "readings": [
            f"{m.name(t)}丢球 {len(lt)} 次，{m.name(o)} 10 秒内打进{m.name(t)}后场 {len(et)} 次：从{m.name(t)}左路 {sum(our_lane(e) == 'left' for e in et)}、"
            f"中路 {sum(our_lane(e) == 'center' for e in et)}、右路 {sum(our_lane(e) == 'right' for e in et)}；10 秒内射门 {len(within(lt, 'shot'))} 次。"
        ],
        "legend": ["them_pass", "key", "them_shot"],
    }


def counterpress_section(m, t, o):
    def rewon(p, limit):
        n = p["next"]
        return p["end_reason"] == "lost" and n is not None and n["kind"] == "regain" and n["t0"] - p["t0"] <= limit

    def fouled(p, tid):
        return p["end_reason"] == "foul" and p["foul_by"] == tid and parse_ts(p["end"]["timestamp"]) - p["t0"] <= 10

    def rows(tid):
        lst = losses_of(m, tid)
        return {
            "all": [(loss_event(p), m.span(loss_event(p), p["start"], post=5)) for p in lst],
            "won5": [(loss_event(p), m.span(loss_event(p), p["next"]["start"], pre=2)) for p in lst if rewon(p, 5)],
            "won10": [(loss_event(p), m.span(loss_event(p), p["next"]["start"], pre=2)) for p in lst if rewon(p, 10)],
            "fouls": [(loss_event(p), m.span(loss_event(p), p["end"], pre=2)) for p in lst if fouled(p, tid)],
            "opp_shots": [(loss_event(p), m.span(loss_event(p), p["facts"]["shot"][0], pre=2)) for p in lst if "shot" in p["facts"]],
            "opp_goals": [(loss_event(p), m.span(loss_event(p), p["facts"]["goal"][0], pre=2, post=6)) for p in lst if "goal" in p["facts"]],
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
        "key": "counterpress",
        "title": "反抢有没有用",
        "question": "丢球后多少次马上抢回来？没抢回来的，变成了什么？",
        "pitch": "full",
        "marks": [],
        "funnel": {
            "groups": [
                {"title": "丢球以后我们", "base": "all", "rows": ["all", "won5", "won10", "fouls"]},
                {"title": "没抢回来，对手打成了", "base": "all", "rows": ["opp_shots", "opp_goals"], "side": "opp"},
            ]
        },
        "metrics": [m.span_metric(k, label, rt[k], ro[k], hint) for k, label, hint in labels],
        "leadersLabel": "",
        "leaders": [],
        "readings": [
            f"{m.name(t)}丢球 {len(rt['all'])} 次：5 秒内抢回 {len(rt['won5'])}、10 秒内抢回 {len(rt['won10'])}、犯规中断 {len(rt['fouls'])}；"
            f"对手打成射门 {len(rt['opp_shots'])} 次、进球 {len(rt['opp_goals'])} 个。"
        ],
        "legend": [],
    }
