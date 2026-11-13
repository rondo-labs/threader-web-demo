"""Who has the ball: the match cut into possessions.

An Opta-native take on threader-desktop's transition engine (threader-core/src/domain/transitions):
a dead ball ends a possession; in open play the ball changes hands when the other side makes an
on-ball action, and the change is dated back to the tackle, interception or save that won it.
Unlike desktop, a regain counts even when the next touch loses the ball again (the 「第一脚就丢」
row), and an intercepted throw-in or goal kick counts.
"""

from __future__ import annotations

from .football import DEAD_BALL, ON_BALL, SHOT_TYPES, THIRD, end_xy, in_box, is_restart, keeps_ball, parse_ts, takes_ball, wins_ball


def build_possessions(m):
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
        cur = {
            "team": team,
            "kind": kind,
            "start": begin,
            "first": first_ev,
            "loss": loss,
            "events": [begin] + ([first_ev] if first_ev is not begin else []),
            "t0": parse_ts(begin["timestamp"]),
        }

    for e in m.events:
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
                foul_by = (tid if e["outcome"] == 0 else m.other[tid]) if t == 4 else None
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


def attach(m) -> None:
    """Cut the match into possessions and keep what the chapters read on the match."""
    m.possessions = build_possessions(m)
    for p in m.possessions:
        p["facts"] = possession_facts(p)
    m.regains = [p for p in m.possessions if p["kind"] == "regain"]
    m.regain_starts = {p["start"]["event_uid"] for p in m.regains}
