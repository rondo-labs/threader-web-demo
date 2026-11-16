"""PROTOTYPE (throwaway): data for the 球员 prototype (/prototype/players/).

Every 2026 match of 中超 / 中甲 / 中乙 goes through match_analysis.build, as on the site. A player's readings are the
match page's readings split by who did each counted action (the event's player), so player, team and match numbers
agree. Readings that belong to the whole team (possession, PPDA, what the opponent did) are left out. Set-piece
follow-ups (a shot after a corner) are credited to the taker. On top come a few readings only a player has (goals,
assists, key passes, touches, take-ons, fouls won, cards), the minutes he played in each formation position
(substitutes' slots come from the sub-on event's qualifier 145, re-shapes from the formation-change events), and
what the Opta squad files say about him (birth date, height, weight, foot, nationality, join date, earlier clubs).

    cd pipeline && uv run python prototype/build_players.py

Writes web/public/prototype-data/players/:
    league-<slug>.json  every player's season sums per team and filter (rankings, the quadrant chart, team pages)
    p/<slug>/<id>.json  one player's matches and counted actions (his page: bars per match, pitch maps, video)
    search.json         names of every player in the three leagues
"""

from __future__ import annotations

import glob
import json
import sys
import time
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

import pyarrow.parquet as pq

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pypinyin import lazy_pinyin  # noqa: E402

from threader_demo import lake  # noqa: E402
from threader_demo.formations import POSITIONS, slot_position  # noqa: E402
from threader_demo.match_analysis import build  # noqa: E402
from threader_demo.match_analysis.match import team_names  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
SITE = REPO / "site-data"
OUT = REPO / "web" / "public" / "prototype-data" / "players"
SQUADS = lake.lake_root() / "squads"
LEAGUES = [
    ("chinese-super-league-2026", "中超"),
    ("chinese-football-league-1-2026", "中甲"),
    ("chinese-football-league-2-2026", "中乙"),
]
LEAGUE_ZH = {"chinese-super-league": "中超", "chinese-football-league-1": "中甲", "chinese-football-league-2": "中乙"}
FOCUS = {"chinese-football-league-2-2026": "4zx5qt414dn1x6nxpbtu2ni8k"}  # 厦门飞鹭
TODAY = date(2026, 11, 16)

# ---------------------------------------------------------------- positions

GROUPS = ["门将", "中卫", "边后卫", "中场", "边路", "前锋"]
BACK_THREE = {12, 13, 16, 17, 18, 19, 20, 24, 25}  # three centre-backs: RM/LM are wing-backs
CENTRAL_SIDES = {3, 4, 9, 23}  # 4-1-2-1-2, 4-3-3, 4-3-2-1, 4-3-1-2: RM/LM are the side central midfielders
# Display name -> (x, y, group) for the depth chart. x from our goal (0) to theirs; y = 100 is our left.
PLACES: dict[str, tuple[float, float, str]] = {}
for _code, (_zh, _x, _y) in POSITIONS.items():
    PLACES[_zh] = (_x, _y, "")
PLACES["中前卫"] = PLACES.pop("中场")
PLACES.update({"右翼卫": (36, 9, ""), "左翼卫": (36, 91, "")})


def place(fid: int, code: str) -> tuple[str, str]:
    """(group, display name) of a formation slot. 前腰 counts as 中场; wing-backs as 边后卫; wide midfielders and
    wingers as 边路. The same code means different jobs in different shapes, so the formation decides."""
    zh = POSITIONS[code][0]
    if code == "GK":
        return "门将", zh
    if code in ("RCB", "CB", "LCB"):
        return "中卫", zh
    if code in ("RB", "LB"):
        return "边后卫", (("右翼卫" if code == "RB" else "左翼卫") if fid in (10, 11) else zh)
    if code in ("RM", "LM"):
        if fid in BACK_THREE:
            return "边后卫", "右翼卫" if code == "RM" else "左翼卫"
        if fid in CENTRAL_SIDES:
            return "中场", "右中场" if code == "RM" else "左中场"
        return "边路", zh
    if code in ("RAM", "LAM"):
        if fid == 8:  # 4-2-3-1: the two wide attacking midfielders
            return "边路", "右边锋" if code == "RAM" else "左边锋"
        return "中场", zh
    if code in ("RW", "LW"):
        return "边路", zh
    if code in ("RF", "LF"):
        if fid == 17:  # 3-4-2-1: the two behind the striker
            return "中场", "右前腰" if code == "RF" else "左前腰"
        return "前锋", zh
    if code == "ST":
        return "前锋", zh
    return "中场", "中前卫" if code == "CM" else zh


GROUP_OF_PLACE = {}
for _fid in list(range(2, 26)):
    for _code in POSITIONS:
        _g, _zh = place(_fid, _code)
        GROUP_OF_PLACE[_zh] = _g
for _zh, (_x, _y, _) in list(PLACES.items()):
    PLACES[_zh] = (_x, _y, GROUP_OF_PLACE.get(_zh, ""))
PLACES = {k: v for k, v in PLACES.items() if v[2]}


def minutes_by_place(m, tid: str) -> dict[str, Counter]:
    """Minutes each player of the team spent in each position: the set-up's slots, then substitutions (the player
    coming on takes slot q145), formation changes (a new shape and slot list) and sendings-off."""
    setup = next(e for e in m.events if e["type_id"] == 34 and e["contestant_id"] == tid)

    def slots_of(e) -> dict[str, int]:
        ids = [s.strip() for s in e["q"].get(30, "").split(",") if s.strip()]
        slots = [s.strip() for s in e["q"].get(131, "").split(",")]
        return {pid: int(slots[i]) for i, pid in enumerate(ids) if i < len(slots) and slots[i].isdigit() and int(slots[i]) > 0}

    fid = int(setup["q"].get(130) or 0)
    state = slots_of(setup)
    out: dict[str, Counter] = defaultdict(Counter)
    now = 0.0

    def flush(until: float) -> None:
        nonlocal now
        if until <= now:
            return
        for pid, slot in state.items():
            code = slot_position(fid, slot) if slot else None
            out[pid][place(fid, code)[1] if code else "未知"] += until - now
        now = until

    for e in m.events:
        if e["contestant_id"] != tid or e["period_id"] not in (1, 2) or e["type_id"] not in (17, 18, 19, 40):
            continue
        if e["type_id"] == 17 and not (32 in e["q"] or 33 in e["q"]):
            continue  # only second yellows and reds take a player off
        flush(m.timeline_minute(e))
        if e["type_id"] == 40:
            fid = int(e["q"].get(130) or fid)
            state = slots_of(e) or state
        elif e["type_id"] in (17, 18):
            state.pop(e["player_id"], None)
        else:
            slot = (e["q"].get(145) or "").strip()
            state[e["player_id"]] = int(slot) if slot.isdigit() else 0
    flush(m.end)
    return out


# ---------------------------------------------------------------- readings

CHAPTER_OF = {
    "overview": "overview", "sections": "attack", "defence": "defence",
    "attackTransition": "attack-transition", "defenceTransition": "defence-transition", "setpieces": "set-pieces",
}
# Team readings, or the opponent's actions: nothing to split by player.
SKIP = {
    "overview.match.possession", "defence.pressing.ppda", "defence.pressing.opp_pass",
    "defence.box_defence.crosses_in", "defence.box_defence.shots_in",
    "set-pieces.corners.goals", "set-pieces.free_kicks.goals",
}
# 传球网络 only covers the stretch before the first substitution: a player gets full-match passes instead.
SKIP_SECTIONS = {"overview.timeline", "attack.network", "defence.opp_access", "defence-transition.opp_after_loss"}
# Shots after a set piece go to the taker: his deliveries that led to a shot.
TAKER_AFTER = {
    "set-pieces.corners.shots": "corners",
    "set-pieces.free_kicks.shots_after": "all",
    "set-pieces.throw_ins.shots_after": "all",
}
PERSONAL = [
    ("goals", "进球", "int", "不含乌龙球"),
    ("assists", "助攻", "int", "传完队友直接进球"),
    ("key_passes", "关键传球", "int", "传完队友直接射门（含助攻）"),
    ("touches", "触球", "int", None),
    ("passes", "传球", "int", "全场所有传球，含传中"),
    ("takeons", "过人", "int", "尝试次数"),
    ("takeon_rate", "过人成功率", "pct", None),
    ("fouled", "被犯规", "int", None),
    ("yellow", "黄牌", "int", None),
    ("red", "红牌", "int", "含两黄变一红"),
]
KINDS = ["pass", "cross", "shot", "goal"]


def player_metrics(league_metrics: list[dict]) -> list[dict]:
    out: list[dict] = []
    for m in league_metrics:
        if m["key"] in SKIP or f"{m['chapter']}.{m['section']}" in SKIP_SECTIONS:
            continue
        if m["chapter"] == "overview" and not any(x["section"] == "personal" for x in out):
            out += [
                {"key": f"overview.personal.{k}", "chapter": "overview", "section": "personal", "sectionTitle": "个人",
                 "question": "他自己做成了什么？", "label": label, "format": fmt, "hint": hint}
                for k, label, fmt, hint in PERSONAL
            ]
        d = {k: m[k] for k in ("key", "chapter", "section", "sectionTitle", "question", "label", "format", "hint")}
        if m["key"] in TAKER_AFTER:
            d["hint"] = "他罚出的球，之后形成射门"
        if m["key"] == "attack-transition.first_action.all":
            d["label"], d["hint"] = "抢回后他出的第一脚", "球队抢回球权后，第一个动作是他做的"
        out.append(d)
        if m["key"] == "attack.build_up.gk_long":
            out.append({**d, "key": "attack.build_up.gk_long_share", "label": "球门球长传占比", "format": "pct", "hint": "长传 ÷ 全部球门球"})
    return out


class Player:
    def __init__(self, pid: str):
        self.id = pid
        self.apps: list[dict] = []
        self.events: list[list] = []
        self.ev_index: dict[str, int] = {}
        self.labels: list[str] = []
        self.label_index: dict[str, int] = {}
        self.names: Counter = Counter()
        self.name_en = ""

    def event(self, ev: dict, raw: dict | None, app: int) -> int:
        key = ev["id"]
        if key in self.ev_index:
            return self.ev_index[key]
        lab = ev["label"]
        if lab not in self.label_index:
            self.label_index[lab] = len(self.labels)
            self.labels.append(lab)
        r1 = lambda v: None if v is None else round(v, 1)  # noqa: E731
        self.events.append([
            r1(ev["x"]), r1(ev["y"]), r1(ev["ex"]), r1(ev["ey"]), app,
            1 if raw is None or raw["outcome"] == 1 else 0,
            self.label_index[lab], ev["clock"], ev["vt"], KINDS.index(ev["kind"]),
        ])
        self.ev_index[key] = len(self.events) - 1
        return self.ev_index[key]


def take_match(data: dict, m, tid: str, metrics: list[dict], players: dict[str, Player], match_row: dict) -> None:
    """Split one team's readings in one match by player."""
    mkeys = {x["key"]: x for x in metrics}
    raw = {str(e["event_uid"]): e for e in m.events}
    lineup = next(s for s in data["overview"][tid] if s["key"] == "lineup")
    places = minutes_by_place(m, tid)
    oid = m.other[tid]
    home = tid == m.home_id
    gf, ga = (data["match"]["score"] if home else data["match"]["score"][::-1])
    team_total: Counter = Counter()
    apps: dict[str, tuple[Player, dict, int]] = {}
    for r in lineup["rows"]:
        pid = r["playerId"]
        mins = round(sum(places.get(pid, {}).values())) or r["minutes"]
        if mins <= 0:
            continue
        p = players.setdefault(pid, Player(pid))
        info = data["players"].get(pid, {})
        if info.get("nameZh"):
            p.names[info["nameZh"]] += 1
        p.name_en = info.get("nameEn") or p.name_en
        app = {
            "m": m.id, "d": data["match"]["date"], "t": tid, "o": oid, "h": home, "s": [gf, ga], "st": r["starter"],
            "min": mins, "num": info.get("number"),
            "pos": {k: round(v) for k, v in places.get(pid, {}).items() if round(v) > 0},
            "src": data["video"]["src"] if data["video"]["available"] else None,
            "c": {}, "ev": defaultdict(list), "ok": defaultdict(list), "tt": team_total, "fs": [0, 0],
        }
        p.apps.append(app)
        apps[pid] = (p, app, len(p.apps) - 1)

    def credit(pid: str | None, key: str, eid: str, ok: bool | None = None, x: float | None = None) -> None:
        if pid not in apps:
            return
        p, app, ai = apps[pid]
        ev = data["events"][eid]
        i = p.event(ev, raw.get(eid), ai)
        app["ev"][key].append(i)
        if ok:
            app["ok"][key].append(i)
        fmt = mkeys[key]["format"]
        if fmt == "int":
            app["c"][key] = app["c"].get(key, 0) + 1
        elif fmt == "pct":
            a, b = app["c"].get(key, [0, 0])
            app["c"][key] = [a + (1 if ok else 0), b + 1]
        else:  # meters: metres from our own goal
            a, b = app["c"].get(key, [0, 0])
            app["c"][key] = [round(a + (x or 0) * 1.05, 1), b + 1]

    for grp, chap in CHAPTER_OF.items():
        for sec in data[grp][tid]:
            by_key = {mt["key"]: mt for mt in sec.get("metrics") or []}
            keyed = {mk["eid"] for mk in sec.get("marks") or [] if mk.get("kind") == "arrow" and mk.get("key")}
            for mk_key, mt in by_key.items():
                key = f"{chap}.{sec['key']}.{mk_key}"
                if key not in mkeys:
                    continue
                if key in TAKER_AFTER:
                    base = by_key[TAKER_AFTER[key]]["team"]["eids"]
                    for eid in base:
                        if eid in keyed:
                            team_total[key] += 1
                            credit(data["events"][eid]["playerId"], key, eid)
                    continue
                c = mt["team"]
                own = [eid for eid in c["eids"] if data["events"][eid]["teamId"] == tid]
                if mt["format"] == "int":
                    team_total[key] += len(own)
                okset = set(c.get("okEids") or [])
                for eid in own:
                    ev = data["events"][eid]
                    credit(ev["playerId"], key, eid, ok=eid in okset if mt["format"] == "pct" else None, x=ev["x"])
                    if key == "overview.match.pass_rate":
                        team_total["overview.personal.passes"] += 1
                        credit(ev["playerId"], "overview.personal.passes", eid)

    # 球门球长传占比: long goal kicks out of all goal kicks
    for pid, (p, app, ai) in apps.items():
        short, long_ = app["ev"].get("attack.build_up.gk_short", []), app["ev"].get("attack.build_up.gk_long", [])
        if short or long_:
            app["c"]["attack.build_up.gk_long_share"] = [len(long_), len(short) + len(long_)]
            app["ev"]["attack.build_up.gk_long_share"] = short + long_
            app["ok"]["attack.build_up.gk_long_share"] = list(long_)

    # readings only a player has
    for r in lineup["rows"]:
        for eid in r["touches"]["eids"]:
            team_total["overview.personal.touches"] += 1
            credit(r["playerId"], "overview.personal.touches", eid)
    for e in m.team_events(tid):
        pid, ty, q = e["player_id"], e["type_id"], e["q"]
        hits = []
        if ty == 16 and 28 not in q:
            hits.append(("goals", None))
        if e.get("assist") == 1:
            hits.append(("assists", None))
        if e.get("key_pass") == 1 or e.get("assist") == 1:
            hits.append(("key_passes", None))
        if ty == 3:
            hits += [("takeons", None), ("takeon_rate", e["outcome"] == 1)]
        if ty == 4 and e["outcome"] == 1:
            hits.append(("fouled", None))
        if ty == 17 and 31 in q:
            hits.append(("yellow", None))
        if ty == 17 and (32 in q or 33 in q):
            hits.append(("red", None))
        if ty in (13, 14, 15, 16) and pid in apps:
            fs = apps[pid][1]["fs"]
            if 72 in q:
                fs[0] += 1
            elif 20 in q:
                fs[1] += 1
        for k, ok in hits:
            key = f"overview.personal.{k}"
            if mkeys[key]["format"] == "int":
                team_total[key] += 1
            credit(pid, key, m.eid(e), ok=ok)


# ---------------------------------------------------------------- squads

NATION_ZH = {
    "China PR": "中国", "Brazil": "巴西", "Hong Kong, China": "中国香港", "Chinese Taipei": "中国台北", "Romania": "罗马尼亚",
    "Portugal": "葡萄牙", "France": "法国", "Serbia": "塞尔维亚", "Spain": "西班牙", "Cameroon": "喀麦隆", "Netherlands": "荷兰",
    "Ghana": "加纳", "Colombia": "哥伦比亚", "Angola": "安哥拉", "England": "英格兰", "Georgia": "格鲁吉亚", "Norway": "挪威",
    "Bosnia and Herzegovina": "波黑", "Congo DR": "刚果（金）", "Senegal": "塞内加尔", "Mali": "马里", "Congo": "刚果（布）",
    "Croatia": "克罗地亚", "Venezuela": "委内瑞拉", "Sweden": "瑞典", "Morocco": "摩洛哥", "Madagascar": "马达加斯加",
    "Guinea": "几内亚", "Costa Rica": "哥斯达黎加", "Suriname": "苏里南", "Austria": "奥地利", "Kosovo": "科索沃", "Syria": "叙利亚",
    "Lebanon": "黎巴嫩", "Italy": "意大利", "Nigeria": "尼日利亚", "Bulgaria": "保加利亚", "Zimbabwe": "津巴布韦",
    "Burkina Faso": "布基纳法索", "Russia": "俄罗斯", "Sierra Leone": "塞拉利昂", "Belgium": "比利时", "Albania": "阿尔巴尼亚",
    "Israel": "以色列", "Guadeloupe": "瓜德罗普", "Togo": "多哥", "Korea Republic": "韩国", "Equatorial Guinea": "赤道几内亚",
    "Switzerland": "瑞士", "North Macedonia": "北马其顿", "Japan": "日本", "Germany": "德国", "Mexico": "墨西哥",
    "Côte d'Ivoire": "科特迪瓦", "USA": "美国", "Uruguay": "乌拉圭", "Chile": "智利", "Finland": "芬兰", "Belarus": "白俄罗斯",
    "New Zealand": "新西兰", "Mozambique": "莫桑比克", "Guinea-Bissau": "几内亚比绍",
}
FOOT_ZH = {"left": "左脚", "right": "右脚", "both": "双脚"}


def load_squads(names: dict) -> dict[str, list[dict]]:
    """Every listing of a player in a 2024–2026 Chinese league squad, oldest first."""
    out: dict[str, list[dict]] = defaultdict(list)
    for season in ("2024", "2025", "2026"):
        for prefix, lg_zh in LEAGUE_ZH.items():
            for f in sorted(glob.glob(str(SQUADS / f"{prefix}-{season}" / "*.json"))):
                sq = json.loads(Path(f).read_text(encoding="utf-8"))["squad"][0]
                tid = sq["contestantId"]
                team = names.get(tid, {}).get("name_zh") or sq.get("contestantShortName") or sq["contestantName"]
                for p in sq["person"]:
                    if p.get("type") == "player":
                        out[p["id"]].append({"season": season, "league": lg_zh, "teamId": tid, "team": team, "p": p})
    return out


def bio(pid: str, listings: list[dict], apps: list[dict]) -> dict:
    now = [x for x in listings if x["season"] == "2026"]
    cur = next((x for x in reversed(now) if x["p"].get("active") == "yes"), None) or (now[-1] if now else (listings[-1] if listings else None))
    out: dict = {}
    if cur:
        p = cur["p"]
        if p.get("dateOfBirth"):
            y, mo, d = (int(v) for v in p["dateOfBirth"][:10].split("-"))
            out["dob"] = p["dateOfBirth"][:10]
            out["age"] = TODAY.year - y - ((TODAY.month, TODAY.day) < (mo, d))
        for k in ("height", "weight"):
            if p.get(k):
                out[k] = int(p[k])
        if p.get("foot") in FOOT_ZH:
            out["foot"] = FOOT_ZH[p["foot"]]
        nat = p.get("nationality")
        if nat:
            out["nat"] = NATION_ZH.get(nat, nat)
        if p.get("secondNationality"):
            out["nat2"] = NATION_ZH.get(p["secondNationality"], p["secondNationality"])
        if p.get("startDate"):
            out["joined"] = p["startDate"][:7]
        out["optaPos"] = {"Goalkeeper": "门将", "Defender": "后卫", "Midfielder": "中场", "Attacker": "前锋"}.get(p.get("position") or "", "")
    seen = set()
    hist = []
    for x in listings:
        k = (x["season"], x["teamId"])
        if k in seen:
            continue
        seen.add(k)
        hist.append({"season": x["season"], "league": x["league"], "team": x["team"], "teamId": x["teamId"], "left": bool(x["p"].get("endDate")) and x["p"].get("active") == "no"})
    out["history"] = hist
    fs = [sum(a["fs"][0] for a in apps), sum(a["fs"][1] for a in apps)]
    if sum(fs):
        out["footShots"] = fs
    return out


# ---------------------------------------------------------------- season sums

def vector(apps: list[dict], metrics: list[dict]) -> tuple[list, list]:
    """Sums over these appearances, aligned with the metric list: a count, or [ok, attempts], or [metres, actions];
    and the team's count in the same matches (counts only), for the player's share."""
    vals, team = [], []
    for x in metrics:
        k, f = x["key"], x["format"]
        if f == "int":
            vals.append(sum(a["c"].get(k, 0) for a in apps))
            team.append(sum(a["tt"].get(k, 0) for a in apps))
        else:
            a1 = sum(a["c"].get(k, [0, 0])[0] for a in apps)
            b1 = sum(a["c"].get(k, [0, 0])[1] for a in apps)
            vals.append([round(a1, 1), b1] if b1 else 0)
            team.append(0)
    return vals, team


def summary(apps: list[dict], metrics: list[dict]) -> list:
    vals, team = vector(apps, metrics)
    return [sum(a["min"] for a in apps), len(apps), sum(1 for a in apps if a["st"]), vals, team]


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def run() -> None:
    t0 = time.perf_counter()
    names = team_names()
    squads = load_squads(names)
    index = pq.read_table(lake.lake_root() / "index.parquet", columns=["match_id", "competition_slug", "match_date"]).to_pylist()
    search = []
    for slug, name_zh in LEAGUES:
        t1 = time.perf_counter()
        lg = json.loads((SITE / "leagues" / f"{slug}.json").read_text(encoding="utf-8"))
        metrics = player_metrics(lg["metrics"])
        players: dict[str, Player] = {}
        team_matches: dict[str, list[str]] = defaultdict(list)
        rows = sorted((r for r in index if r["competition_slug"] == slug), key=lambda r: (r["match_date"], r["match_id"]))
        for row in rows:
            data, m = build(row["match_id"])
            for tid in (m.home_id, m.away_id):
                team_matches[tid].append(m.id)
                take_match(data, m, tid, metrics, players, row)

        stints = []
        out_players = {}
        for pid, p in players.items():
            last5 = {a["m"] for a in p.apps[-5:]}
            by_team: dict[str, list[dict]] = defaultdict(list)
            for a in p.apps:
                by_team[a["t"]].append(a)
            for tid, apps in by_team.items():
                tl5 = set(team_matches[tid][-5:])
                place_min: Counter = Counter()
                for a in apps:
                    place_min.update(a["pos"])
                stints.append({
                    "p": pid, "t": tid, "pos": dict(place_min.most_common()),
                    "goals": sum(a["c"].get("overview.personal.goals", 0) for a in apps),
                    "f": {
                        "all": summary(apps, metrics),
                        "home": summary([a for a in apps if a["h"]], metrics),
                        "away": summary([a for a in apps if not a["h"]], metrics),
                        "last5": summary([a for a in apps if a["m"] in last5], metrics),
                        "tlast5": summary([a for a in apps if a["m"] in tl5], metrics),
                    },
                })
            place_min = Counter()
            for a in p.apps:
                place_min.update(a["pos"])
            group_min: Counter = Counter()
            for zh, mins in place_min.items():
                if zh in PLACES:
                    group_min[PLACES[zh][2]] += mins
            pname = p.names.most_common(1)[0][0] if p.names else ""
            info = bio(pid, squads.get(pid, []), p.apps)
            out_players[pid] = {
                "nameZh": pname, "nameEn": p.name_en, "number": p.apps[-1]["num"],
                "teams": list(dict.fromkeys(a["t"] for a in p.apps)),
                "group": group_min.most_common(1)[0][0] if group_min else (info.get("optaPos") or "中场").replace("后卫", "中卫"),
                "groupMin": dict(group_min.most_common()), "pos": dict(place_min.most_common()), **info,
            }
            apps_out = [
                {"m": a["m"], "d": a["d"], "t": a["t"], "o": a["o"], "h": a["h"], "s": a["s"], "st": a["st"], "min": a["min"], "pos": a["pos"], "src": a["src"], "num": a["num"]}
                for a in p.apps
            ]
            series = {}
            for x in metrics:
                k = x["key"]
                if not any(k in a["c"] for a in p.apps):
                    continue
                series[k] = {
                    "n": [a["c"].get(k, 0) for a in p.apps],
                    "e": [i for a in p.apps for i in a["ev"].get(k, [])],
                    "k": [i for a in p.apps for i in a["ok"].get(k, [])] if x["format"] == "pct" else None,
                }
            write_json(OUT / "p" / slug / f"{pid}.json", {"id": pid, "league": slug, "apps": apps_out, "metrics": series, "events": p.events, "labels": p.labels})
            py = lazy_pinyin(pname) if pname else []
            search.append({
                "id": pid, "zh": pname, "en": p.name_en, "py": "".join(py), "ini": "".join(s[0] for s in py if s),
                "num": p.apps[-1]["num"], "team": lg["teams"][p.apps[-1]["t"]]["nameZh"], "lg": slug, "lgZh": name_zh,
                "group": out_players[pid]["group"], "min": sum(a["min"] for a in p.apps),
            })
        write_json(OUT / f"league-{slug}.json", {
            "slug": slug, "nameZh": name_zh, "focusTeam": FOCUS.get(slug),
            "groups": GROUPS, "places": PLACES, "metrics": metrics,
            "teams": {tid: {"nameZh": t["nameZh"]} for tid, t in lg["teams"].items()},
            "teamMatches": {tid: len(v) for tid, v in team_matches.items()},
            "thresholds": {"all": 900, "home": 450, "away": 450, "last5": 150},
            "players": out_players, "stints": stints,
        })
        print(f"{name_zh}: {len(rows)} matches, {len(players)} players, {len(stints)} stints, {time.perf_counter() - t1:.0f}s")
    write_json(OUT / "search.json", search)
    print(f"done in {time.perf_counter() - t0:.0f}s → {OUT}")


if __name__ == "__main__":
    run()
