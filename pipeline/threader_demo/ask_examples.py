"""The home page's example answers, until the Q&A backend exists.

Four questions, one of each kind the Q&A will take (a league ranking, one team over several matches, one match,
players), answered the way the real answers will be: every number, point and clip comes from the data; only the
sentences are templated here instead of worded by the model. The page labels them as examples.
"""

from __future__ import annotations

from .season import LeagueSeason

FEILU = "4zx5qt414dn1x6nxpbtu2ni8k"
VIDEO_MATCH = "1p2hk9rohal69v3gav7y11nh0"  # 2026-09-19 厦门飞鹭 3–0 北京理工, the match with video


def short(date: str) -> str:
    return f"{int(date[5:7])}/{int(date[8:10])}"


def team_href(team_id: str, tab: str | None = None) -> str:
    return f"/team/{team_id}/" + (f"?tab={tab}" if tab else "")


def metric(sections: list[dict], section: str, key: str) -> dict | None:
    sec = next((s for s in sections if s["key"] == section), None)
    return next((m for m in sec.get("metrics", []) if m["key"] == key), None) if sec else None


def move(item: dict) -> str:
    return f"{item['passes']} 脚传递、{item['seconds']} 秒" if item["passes"] else "没有传递"


def examples(cl2: LeagueSeason, matches: dict[str, dict]) -> list[dict]:
    return [fast_breaks(cl2, matches), corners(cl2, matches), goals(cl2, matches), squad(cl2)]


def fast_breaks(cl2: LeagueSeason, matches: dict[str, dict]) -> dict:
    key = "attack.shots.fast_break"
    name = lambda t: cl2.teams[t]["nameZh"]  # noqa: E731
    rows = []
    for t in cl2.teams:
        n, games = cl2.season_sums(t, "all").get(key, [0, 0, 0, 0])[:2]
        rows.append((t, int(n), n / games if games else 0.0))
    rows.sort(key=lambda r: (-r[1], -r[2], name(r[0])))
    total = sum(r[1] for r in rows)
    played = len([r for r in cl2.results if not r.awarded])
    fe = next(i for i, r in enumerate(rows) if r[0] == FEILU)
    a, b, c = rows[:3]
    video = matches[VIDEO_MATCH]
    eids = [e for tid in video["teams"] for e in (metric(video["sections"][tid], "shots", "fast_break") or {"team": {"eids": []}})["team"]["eids"]]
    q = "中乙哪支队反击射门最多？"
    return {
        "kind": "联赛排名",
        "question": q,
        "answer": {
            "question": q,
            "subject": None,
            "scope": f"2026 中乙 · 全部 {played} 场",
            "steps": [
                "听懂问题：中乙 2026 · 反击射门（Opta 标为快速反击的射门）· 按球队排名",
                f"查询事件：射门 + 快速反击 · {played} 场 · 共 {total} 次",
                f"按球队汇总：{len(rows)} 支队",
            ],
            "paragraphs": [
                f"2026 赛季中乙一共有 {total} 次反击射门。最多的是{name(a[0])}，{a[1]} 次（场均 {a[2]:.1f}），其次是{name(b[0])}（{b[1]} 次）和{name(c[0])}（{c[1]} 次）。",
                f"厦门飞鹭 {rows[fe][1]} 次，排第 {fe + 1}。",
                "反击射门按 Opta 的「快速反击」标记统计。每支队踢的场次差不多，总数和场均的排序基本一致。",
            ],
            "cards": [
                {"kind": "figures", "items": [
                    {"label": "中乙反击射门", "value": f"{total}", "sub": f"{played} 场"},
                    {"label": name(a[0]), "value": f"{a[1]}", "sub": f"场均 {a[2]:.1f} · 第 1"},
                    {"label": "厦门飞鹭", "value": f"{rows[fe][1]}", "sub": f"场均 {rows[fe][2]:.1f} · 第 {fe + 1}"},
                ]},
                {"kind": "ranking", "title": "反击射门 · 按球队", "rows": [
                    {"key": t, "label": name(t), "v": n, "sub": f"场均 {pm:.1f}", "mark": t == FEILU, "href": team_href(t)} for t, n, pm in rows
                ]},
            ],
            "clips": {"title": "9/19 厦门飞鹭 3–0 北京理工 · 反击射门", "matchId": VIDEO_MATCH, "eids": eids, "count": len(eids)} if eids else None,
            "videoNote": f"{played} 场里只有 1 场有比赛视频（9/19 厦门飞鹭 3–0 北京理工），那场有 {len(eids)} 次反击射门{'，可以看画面' if eids else ''}；其余的没有视频。",
            "links": [{"label": f"去看{name(a[0])}的球队页", "href": team_href(a[0])}, {"label": "去看厦门飞鹭的球队页", "href": team_href(FEILU)}],
            "followUps": ["这些反击射门有几次进了？", "厦门飞鹭的反击都是从哪抢回球开始的？", "只看冲甲组的比赛呢？"],
        },
    }


def corners(cl2: LeagueSeason, matches: dict[str, dict]) -> dict:
    name = lambda t: cl2.teams[t]["nameZh"]  # noqa: E731
    last = [r for r, _ in cl2.played[FEILU] if r.id in matches][-5:]
    n = shots = goals_ = 0
    zones: dict[str, int] = {}
    dots, table = [], []
    for r in last:
        d = matches[r.id]
        sec = next(s for s in d["setpieces"][FEILU] if s["key"] == "corners")
        v = {m["key"]: m["team"]["value"] for m in sec["metrics"]}
        n, shots, goals_ = n + v["corners"], shots + v["shots"], goals_ + v["goals"]
        for m in sec["metrics"]:
            if m["key"].startswith("zone_"):
                zones[m["label"].removeprefix("落在")] = zones.get(m["label"].removeprefix("落在"), 0) + m["team"]["value"]
        for eid in next(m for m in sec["metrics"] if m["key"] == "corners")["team"]["eids"]:
            e = d["events"].get(eid)
            if e and e.get("ex") is not None:
                dots.append({"x": e["ex"], "y": e["ey"], "label": f"{short(r.date)} {e['clock']} {e['label']}"})
        home = r.home == FEILU
        table.append({
            "cells": [short(r.date), name(r.away if home else r.home), "主" if home else "客", f"{v['corners']}", f"{v['shots']}", f"{v['goals']}"],
            "href": f"/match/{r.id}/?team={FEILU}&chapter=set-pieces",
        })
    z = sorted(zones.items(), key=lambda kv: -kv[1])
    season = cl2.season_sums(FEILU, "all")["set-pieces.corners.corners"]
    per = {t: (s["set-pieces.corners.corners"][0] / s["set-pieces.corners.corners"][1]) for t in cl2.teams if (s := cl2.season_sums(t, "all")).get("set-pieces.corners.corners", [0, 0])[1]}
    rank = sorted(per, key=lambda t: -per[t]).index(FEILU) + 1
    span = f"{short(last[0].date)}–{short(last[-1].date)}"
    with_video = len([r for r in last if r.video])
    q = "厦门飞鹭最近 5 场的角球都落在哪？"
    return {
        "kind": "一支队的多场",
        "question": q,
        "answer": {
            "question": q,
            "subject": "厦门飞鹭",
            "scope": f"厦门飞鹭 · 最近 5 场（{span}）",
            "steps": ["听懂问题：分析对象 厦门飞鹭 · 最近 5 场 · 本队的角球 · 落点", f"查询事件：角球 · 5 场 · 共 {n} 个", "按落点区域和比赛拆开"],
            "paragraphs": [
                f"最近 5 场（{span}）厦门飞鹭一共踢了 {n} 个角球，场均 {n / 5:.1f} 个。落点最多的是「{z[0][0]}」（{z[0][1]} 个），其次是「{z[1][0]}」（{z[1][1]} 个）。",
                f"这些角球之后形成了 {shots} 次射门，进了 {goals_} 个。整个赛季飞鹭场均 {season[0] / season[1]:.1f} 个角球，在中乙排第 {rank}。",
            ],
            "cards": [
                {"kind": "figures", "items": [
                    {"label": "角球", "value": f"{n}", "sub": f"场均 {n / 5:.1f}"},
                    {"label": f"落在{z[0][0]}", "value": f"{z[0][1]}"},
                    {"label": "角球后射门", "value": f"{shots}"},
                    {"label": "角球进球", "value": f"{goals_}"},
                ]},
                {"kind": "dots", "title": "落点（朝右进攻）", "dots": dots, "caption": f"{len(dots)} 个角球的第一落点；短角球落在禁区外"},
                {"kind": "table", "title": "逐场", "columns": ["日期", "对手", "主客", "角球", "角球后射门", "进球"], "rows": table},
            ],
            "clips": None,
            "videoNote": f"5 场里 {with_video} 场有视频。" if with_video else "这 5 场都没有比赛视频，看不了画面。",
            "links": [{"label": "去看厦门飞鹭整季的定位球", "href": team_href(FEILU, "set-pieces")}],
            "followUps": ["整个赛季呢？", "对手的角球都落在哪？", "哪几个角球形成了射门？"],
        },
    }


def goals(cl2: LeagueSeason, matches: dict[str, dict]) -> dict:
    d = matches[VIDEO_MATCH]
    sec = next(s for s in d["overview"][FEILU] if s["key"] == "goals")
    items = [it for it in sec["items"] if it["side"] == "team"]
    opp = next(t for t in d["teams"] if t != FEILU)
    shots = {t: metric(d["overview"][t], "match", "shots")["team"]["value"] for t in d["teams"]}
    pname = lambda pid: (d["players"][pid]["nameZh"] or d["players"][pid]["nameEn"]) if pid in d["players"] else ""  # noqa: E731
    q = "9 月 19 日厦门飞鹭 3–0 北京理工，三个进球是怎么打出来的？"
    return {
        "kind": "单场",
        "question": q,
        "answer": {
            "question": q,
            "subject": "厦门飞鹭",
            "scope": f"{d['match']['date']} 厦门飞鹭 3–0 北京理工 · 中乙{d['match']['stage']}",
            "steps": ["听懂问题：分析对象 厦门飞鹭 · 9/19 对北京理工 · 进球的回合", "查询：这场的 3 个进球，每个从这次控球开始算起", "这场有视频：3 个回合都能看"],
            "paragraphs": [
                f"厦门飞鹭这场射门 {shots[FEILU]} 次，北京理工 {shots[opp]} 次。3 个进球：",
                *[f"{it['clock']} {pname(it['scorerId'])}：{it['source']}，{move(it)}，从{it['startZone']}开始。" for it in items],
                "回合从这次控球的开始算：本队的死球开出、或抢回球权的那一下。",
            ],
            "cards": [
                {"kind": "figures", "items": [
                    {"label": "比分", "value": "3–0"},
                    {"label": "射门", "value": f"{shots[FEILU]}–{shots[opp]}"},
                    {"label": "进球回合", "value": f"{len(items)}"},
                ]},
                {"kind": "goals", "title": "3 个进球的回合", "matchId": VIDEO_MATCH, "teamId": FEILU},
            ],
            "clips": {
                "title": "9/19 厦门飞鹭的 3 个进球",
                "matchId": VIDEO_MATCH,
                "spans": [{"start": it["span"]["start"], "end": it["span"]["end"], "eids": it["eids"]} for it in items if it["span"]],
                "count": len(items),
            },
            "videoNote": "这场有比赛视频，每个回合都能看。",
            "links": [{"label": "去看这场比赛的完整分析", "href": f"/match/{VIDEO_MATCH}/?team={FEILU}&chapter=overview"}],
            "followUps": ["北京理工的射门都在哪？", "这场飞鹭的反击呢？", "刘子铭这场踢得怎么样？"],
        },
    }


def squad(cl2: LeagueSeason) -> dict:
    ps = list(cl2.players[FEILU].values())
    by_min = sorted(ps, key=lambda p: -p["minutes"])
    by_goals = sorted(ps, key=lambda p: (-p["goals"], -p["minutes"]))
    m, g = by_min[0], by_goals[0]
    n = len(cl2.played[FEILU])
    q = "厦门飞鹭谁出场时间最多？谁进球最多？"
    second = f"他也是进球最多的，{g['goals']} 个；其次是{by_goals[1]['nameZh']}（{by_goals[1]['goals']} 个）。" if g["id"] == m["id"] else f"进球最多的是{g['nameZh']}，{g['goals']} 个。"
    return {
        "kind": "球员",
        "question": q,
        "answer": {
            "question": q,
            "subject": "厦门飞鹭",
            "scope": f"厦门飞鹭 · 2026 赛季 {n} 场",
            "steps": ["听懂问题：分析对象 厦门飞鹭 · 整季 · 球员出场和进球", f"查询：{n} 场的首发、换人和进球"],
            "paragraphs": [f"出场时间最多的是{m['nameZh']}（{m['apps']} 场、首发 {m['starts']} 场，共 {m['minutes']} 分钟）。", second],
            "cards": [
                {"kind": "figures", "items": [
                    {"label": f"{m['nameZh']} · 出场时间", "value": f"{m['minutes']}", "sub": f"{m['apps']} 场 · 首发 {m['starts']}"},
                    {"label": f"{g['nameZh']} · 进球", "value": f"{g['goals']}"},
                ]},
                {"kind": "table", "title": "出场时间前 10", "columns": ["球员", "位置", "出场", "首发", "分钟", "进球"], "rows": [
                    {"cells": [f"{'#' + str(p['number']) + ' ' if p['number'] is not None else ''}{p['nameZh']}", p["position"], f"{p['apps']}", f"{p['starts']}", f"{p['minutes']}", f"{p['goals']}"]}
                    for p in by_min[:10]
                ]},
            ],
            "clips": None,
            "videoNote": f"{n} 场里只有 1 场有比赛视频（9/19 对北京理工），球员跨场的画面暂时看不全。",
            "links": [{"label": "去看厦门飞鹭的球员", "href": team_href(FEILU, "players")}],
            "followUps": [f"{g['nameZh']}的进球都是怎么来的？", "谁的关键传球最多？", "首发阵容这个赛季变过几次？"],
        },
    }
