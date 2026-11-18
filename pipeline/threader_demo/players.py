"""Players: every player's season, split from the match pages' readings. Definitions: docs/players.md.

Every counted action on a match page is an event, and every event has its player, so a player's reading is the part
of the match reading that is his: player, team and match pages agree. Readings of the whole team (possession, PPDA)
and of what the opponent did are left out; a shot after a set piece goes to the taker. A few readings only a player
has come straight from his events: goals, assists, key passes, touches, passes, take-ons, fouls won, cards, aerial
duels won and lost. A few rates are made from his other readings (EXTRA, DERIVED), and the keeper's save rate and
high-ball rate also count what the opponent did while he was in goal (the goals he let in, the balls into his box).

Minutes are the match page's (谁在场上). Positions follow the formation slots: the team set-up gives the starters
theirs, a substitute takes the slot on his sub-on event (qualifier 145), a formation change re-slots the team, a
sending-off ends a player's match. A slot is a position in that formation (formations.py); every position belongs to
one of six groups, and a player's group is the one he played most minutes in. He is ranked against his group in the
same league, per 90 minutes, once he has played a third of the minutes the filter allows (THRESHOLDS).

The 2026 squad files add what a player page's header shows: age, height, weight, foot, nationality, when he joined.
"""

from __future__ import annotations

import glob
import json
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

from pypinyin import lazy_pinyin

from . import lake
from .formations import FORMATIONS, POSITIONS, slot_position
from .match_analysis.football import end_xy, in_box
from .season import CHAPTERS, readings

GROUPS = ["门将", "中卫", "边后卫", "中场", "边路", "前锋"]
FILTERS = ("all", "home", "away", "last5")
# A third of the minutes a filter allows: 30 matches, 15 at home or away, the player's last 5.
THRESHOLDS = {"all": 900, "home": 450, "away": 450, "last5": 150}
BACK_THREE = {12, 13, 16, 17, 18, 19, 20, 24, 25}  # three centre-backs: RM and LM are the wing-backs
CENTRAL_SIDES = {3, 4, 9, 23}  # 4-1-2-1-2, 4-3-3, 4-3-2-1, 4-3-1-2: RM and LM are the side central midfielders


def place(fid: int, code: str) -> tuple[str, str]:
    """(group, position name) of a slot. One Opta code can mean different jobs in different shapes, so the formation
    decides: wing-backs count as 边后卫; the wide attacking midfielders of a 4-2-3-1 are wingers (边路); the two
    behind the striker in a 3-4-2-1 are attacking midfielders; every attacking midfielder (前腰) counts as 中场."""
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
        if fid == 8:
            return "边路", "右边锋" if code == "RAM" else "左边锋"
        return "中场", zh
    if code in ("RW", "LW"):
        return "边路", zh
    if code in ("RF", "LF"):
        if fid == 17:
            return "中场", "右前腰" if code == "RF" else "左前腰"
        return "前锋", zh
    if code == "ST":
        return "前锋", zh
    return "中场", "中前卫" if code == "CM" else zh  # 中场 is a group's name too


def _places() -> dict[str, list]:
    """Position name → [x, y, group]: where the team page's 阵容 draws it (x from our goal to theirs, y = 100 on our
    left, as in Opta's coordinates) and the group it counts for."""
    xy = {zh: (x, y) for zh, x, y in POSITIONS.values()}
    xy["中前卫"] = xy.pop("中场")
    xy.update({"右翼卫": (36, 9), "左翼卫": (36, 91)})
    group: dict[str, str] = {}
    for fid, (_, slots) in FORMATIONS.items():
        for code in slots.values():
            g, zh = place(fid, code)
            group[zh] = g
    return {zh: [x, y, group[zh]] for zh, (x, y) in xy.items() if zh in group}


PLACES = _places()


def _slots(e) -> dict[str, int]:
    """Player → formation slot, from a set-up or formation-change event (slot 0: not on the pitch)."""
    ids = [s.strip() for s in e["q"].get(30, "").split(",") if s.strip()]
    slots = [s.strip() for s in e["q"].get(131, "").split(",")]
    return {pid: int(slots[i]) for i, pid in enumerate(ids) if i < len(slots) and slots[i].isdigit() and int(slots[i]) > 0}


def lineups(m, tid: str):
    """The team on the pitch, stretch by stretch on the match timeline: (from, to, formation, {player: slot})."""
    setup = next(e for e in m.events if e["type_id"] == 34 and e["contestant_id"] == tid)
    fid = int(setup["q"].get(130) or 0)
    on = _slots(setup)
    changes = [e for e in m.team_events(tid) if e["type_id"] in (18, 19, 40) or (e["type_id"] == 17 and (32 in e["q"] or 33 in e["q"]))]
    now = 0.0
    for e in [*changes, None]:
        t = m.end if e is None else m.timeline_minute(e)
        if t > now:
            yield now, t, fid, dict(on)
            now = t
        if e is None:
            break
        if e["type_id"] == 40:
            fid = int(e["q"].get(130) or fid)
            on = _slots(e) or on
        elif e["type_id"] in (17, 18):
            on.pop(e["player_id"], None)
        else:
            slot = (e["q"].get(145) or "").strip()
            on[e["player_id"]] = int(slot) if slot.isdigit() else 0


def minutes_by_place(m, tid: str) -> dict[str, Counter]:
    """Minutes each of the team's players spent in each position, on the match timeline."""
    out: dict[str, Counter] = defaultdict(Counter)
    for t0, t1, fid, on in lineups(m, tid):
        for pid, slot in on.items():
            code = slot_position(fid, slot) if slot else None
            if code:
                out[pid][place(fid, code)[1]] += t1 - t0
    return out


def keeper_at(m, tid: str):
    """Timeline minute → the team's goalkeeper at that moment: whoever holds slot 1, the goalkeeper's in every Opta
    formation. None while nobody does (the keeper sent off and an outfield player in goal)."""
    spans = [(t0, t1, next((pid for pid, slot in on.items() if slot == 1), None)) for t0, t1, _, on in lineups(m, tid)]

    def at(t: float) -> str | None:
        for t0, t1, pid in spans:
            if t0 <= t < t1:
                return pid
        return spans[-1][2] if spans and t >= spans[-1][1] else None

    return at


# Feed entries that are nobody playing the ball: cards, substitutions, set-ups and formation changes, deleted events,
# injury time, coverage gaps.
NOT_BALL = {17, 18, 19, 20, 21, 22, 23, 24, 25, 27, 28, 30, 32, 34, 35, 36, 37, 40, 43, 47, 58, 65, 70, 71, 75, 77, 79}


def high_balls(m, attacker: str) -> list[tuple[dict, bool]]:
    """The attacker's crosses and long balls that ended in the box, each with whether the keeper caught or punched it
    (Opta claim 11, punch 41): the defending side's first touch after the ball, as long as the attacking side has not
    played it again (pass, take-on, shot). By the order of the feed, not the clock: in 中甲 and 中乙 the catch is often
    logged 4–6 seconds after the cross."""
    defender = m.other[attacker]
    out = []
    for e in m.team_events(attacker):
        if e["type_id"] != 1 or not (1 in e["q"] or 2 in e["q"]) or not in_box(*end_xy(e)):
            continue
        caught = False
        at = m.pos[e["event_uid"]]
        for f in m.events[at + 1:at + 20]:
            if f["period_id"] != e["period_id"]:
                break
            if f["contestant_id"] == attacker:
                if f["type_id"] in (1, 3, 13, 14, 15, 16):
                    break
                continue
            if f["contestant_id"] == defender and f["type_id"] not in NOT_BALL:
                caught = f["type_id"] in (11, 41)
                break
        out.append((e, caught))
    return out


def turned(r: dict) -> dict:
    """An opponent's action as seen from the other end: Opta has each team attacking left to right, so the keeper's
    readings that count what the opponent did draw at his own goal, like his own actions."""
    t = dict(r)
    for a, b in (("x", "y"), ("ex", "ey")):
        if t[a] is not None and t[b] is not None:
            t[a], t[b] = round(100 - t[a], 1), round(100 - t[b], 1)
    return t


# ---------------------------------------------------------------- which readings a player has

# The whole team's readings, or what the opponent did: nothing to split by player.
TEAM_ONLY = {
    "overview.match.possession", "defence.pressing.ppda", "defence.pressing.opp_pass",
    "defence.box_defence.crosses_in", "defence.box_defence.shots_in", "set-pieces.corners.goals", "set-pieces.free_kicks.goals",
}
# 传球网络 only counts the stretch before the first substitution; a player gets the full match's passes instead.
TEAM_ONLY_SECTIONS = {"overview.timeline", "attack.network", "defence.opp_access", "defence-transition.opp_after_loss"}
# A shot after a set piece goes to the taker: his deliveries that led to a shot (reading → the section's deliveries).
TAKER = {"set-pieces.corners.shots": "corners", "set-pieces.free_kicks.shots_after": "all", "set-pieces.throw_ins.shots_after": "all"}
PERSONAL = [
    ("goals", "进球", "int", "不含乌龙球"),
    ("assists", "助攻", "int", "传完队友直接进球"),
    ("key_passes", "关键传球", "int", "传完队友直接射门（含助攻）"),
    ("touches", "触球", "int", None),
    ("passes", "传球", "int", "全场所有传球，含传中"),
    ("takeons", "过人", "int", "尝试次数"),
    ("takeons_won", "成功过人", "int", None),
    ("takeon_rate", "过人成功率", "pct", None),
    ("fouled", "被犯规", "int", None),
    ("yellow", "黄牌", "int", None),
    ("red", "红牌", "int", "含两黄变一红"),
]
GK_SHORT, GK_LONG, GK_SHARE = "attack.build_up.gk_short", "attack.build_up.gk_long", "attack.build_up.gk_long_share"
AERIAL_RATE, DUEL_RATE = "defence.def_actions.aerial_rate", "defence.def_actions.duel_rate"
SAVE_RATE, CLAIM_RATE = "defence.box_defence.save_rate", "defence.box_defence.claim_rate"
CONVERSION, LONG_RATE = "attack.shots.conversion", "attack.build_up.long_rate"
# Rates only the player pages have, each listed right after the match reading it goes with: key, label, hint.
EXTRA = {
    GK_LONG: (GK_SHARE, "球门球长传占比", "长传 ÷ 全部球门球"),
    "attack.build_up.long": (LONG_RATE, "长传成功率", "后场长传（含长传的球门球）到了队友脚下的比例"),
    "attack.shots.goals": (CONVERSION, "进球转化率", "进球 ÷ 射门"),
    "defence.def_actions.aerials_won": (AERIAL_RATE, "争顶成功率", "争顶赢的 ÷ 全部争顶"),
    "defence.def_actions.dribbled_past": (DUEL_RATE, "一对一防守成功率", "抢断 ÷（抢断 + 被过）"),
    "defence.box_defence.saves": (SAVE_RATE, "扑救成功率", "扑救 ÷（扑救 + 失球），只算他守门的时候，不含乌龙球"),
    "defence.box_defence.keeper_out": (CLAIM_RATE, "高空球拦截率", "对手传进禁区的传中和长传，被他摘下或击出的比例；只算他守门的时候"),
}
# Fewer attempts than a rate's usual 20 make it comparable: a centre-back is beaten or tackles only 24–30 times a season.
MIN_TRIES = {DUEL_RATE: 10}
# Rates made from his actions in other readings: attempts, and the reading of the successful ones (None: the action's
# own outcome). Worked out on export.
DERIVED = {
    GK_SHARE: ((GK_SHORT, GK_LONG), GK_LONG),
    LONG_RATE: (("attack.build_up.long",), None),
    CONVERSION: (("attack.shots.shots",), "attack.shots.goals"),
    DUEL_RATE: (("defence.def_actions.tackles", "defence.def_actions.dribbled_past"), "defence.def_actions.tackles"),
}
KINDS = ["pass", "cross", "shot", "goal"]
SHOT_TYPES = (13, 14, 15, 16)


def player_metrics(metas: list[dict]) -> list[dict]:
    """The player's readings, in the match page's order, from a match's reading metadata (season.readings)."""
    out: list[dict] = []
    for m in metas:
        if m["key"] in TEAM_ONLY or f"{m['chapter']}.{m['section']}" in TEAM_ONLY_SECTIONS:
            continue
        if m["chapter"] == "overview" and not any(x["section"] == "personal" for x in out):
            out += [
                {"key": f"overview.personal.{k}", "chapter": "overview", "section": "personal", "sectionTitle": "个人",
                 "question": "他自己做成了什么？", "label": label, "format": fmt, "hint": hint}
                for k, label, fmt, hint in PERSONAL
            ]
        d = dict(m)
        if m["key"] in TAKER:
            d["hint"] = "他罚出的球，之后形成射门"
        if m["key"] == "attack-transition.first_action.all":
            d["label"], d["hint"] = "抢回后他出的第一脚", "球队抢回球权后，第一个动作是他做的"
        out.append(d)
        if m["key"] in EXTRA:
            key, label, hint = EXTRA[m["key"]]
            out.append({**d, "key": key, "label": label, "format": "pct", "hint": hint, **({"min": MIN_TRIES[key]} if key in MIN_TRIES else {})})
    return out


# ---------------------------------------------------------------- squad files

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


def load_squads(slug: str) -> dict[str, list[tuple[str, dict]]]:
    """Player → (team, squad-file person) for every 2026 squad of the league that lists him."""
    out: dict[str, list[tuple[str, dict]]] = defaultdict(list)
    for f in sorted(glob.glob(str(lake.lake_root() / "squads" / slug / "*.json"))):
        sq = json.loads(Path(f).read_text(encoding="utf-8"))["squad"][0]
        for person in sq["person"]:
            if person.get("type") == "player":
                out[person["id"]].append((sq["contestantId"], person))
    return out


def age_on(dob: str, day: date) -> int:
    y, mo, d = (int(v) for v in dob[:10].split("-"))
    return day.year - y - ((day.month, day.day) < (mo, d))


# ---------------------------------------------------------------- the season

class _Player:
    """A player's season so far: his appearances, the actions counted for him (each with the appearance it is in),
    and for every reading the list of those actions. Counts per match are worked out from these on export."""

    def __init__(self) -> None:
        self.apps: list[dict] = []
        self.events: list[list] = []
        self.index: dict[str, int] = {}
        self.labels: list[str] = []
        self.label_index: dict[str, int] = {}
        self.ev: dict[str, list[int]] = defaultdict(list)  # reading → his actions in it
        self.ok: dict[str, list[int]] = defaultdict(list)  # rates: the successful ones
        self.fs = [0, 0]  # shots with the left foot, the right foot
        self.names: Counter = Counter()
        self.name_en = ""

    def event(self, ev: dict, raw: dict | None, app: int, outcome: int | None = None) -> int:
        """The event's row in his list: x, y, end x, end y, appearance, outcome (1 ok), label, clock, video time, kind.
        `outcome` stands in for the feed's when the action is the opponent's (1: it went his way)."""
        if ev["id"] not in self.index:
            if ev["label"] not in self.label_index:
                self.label_index[ev["label"]] = len(self.labels)
                self.labels.append(ev["label"])
            r1 = lambda v: None if v is None else round(v, 1)  # noqa: E731
            self.index[ev["id"]] = len(self.events)
            self.events.append([
                r1(ev["x"]), r1(ev["y"]), r1(ev["ex"]), r1(ev["ey"]), app,
                outcome if outcome is not None else 1 if raw is None or raw["outcome"] == 1 else 0,
                self.label_index[ev["label"]], ev["clock"], ev["vt"], KINDS.index(ev["kind"]),
            ])
        return self.index[ev["id"]]


class LeaguePlayers:
    """One league's players, match by match (add, after match_analysis.build), then the files the pages read
    (export for the league, details for each player)."""

    def __init__(self, slug: str, name_zh: str):
        self.slug, self.name_zh = slug, name_zh
        self.metrics: list[dict] = []
        self.formats: dict[str, str] = {}
        self.players: dict[str, _Player] = {}
        self.team_matches: dict[str, list[str]] = defaultdict(list)
        self.team_names: dict[str, str] = {}
        self.last_date = ""
        self.squads = load_squads(slug)

    def add(self, data: dict, m) -> None:
        if not self.metrics:
            self.metrics = player_metrics([x["meta"] for x in readings(data, m.home_id).values()])
            self.formats = {x["key"]: x["format"] for x in self.metrics}
        raw = {str(e["event_uid"]): e for e in m.events}
        self.last_date = max(self.last_date, data["match"]["date"])
        for tid in (m.home_id, m.away_id):
            self.team_names[tid] = data["teams"][tid]["nameZh"]
            self.team_matches[tid].append(m.id)
            self._take(data, m, tid, raw)

    def _take(self, data: dict, m, tid: str, raw: dict[str, dict]) -> None:
        """Split one team's readings in one match by player. Leaves `data` as it is."""
        lineup = next(s for s in data["overview"][tid] if s["key"] == "lineup")
        places = minutes_by_place(m, tid)
        home = tid == m.home_id
        score = data["match"]["score"] if home else data["match"]["score"][::-1]
        totals: Counter = Counter()  # the team's count of each reading in this match: the players' shares
        apps: dict[str, tuple[_Player, int]] = {}
        for r in lineup["rows"]:
            if r["minutes"] <= 0:
                continue
            pid = r["playerId"]
            p = self.players.setdefault(pid, _Player())
            info = data["players"].get(pid, {})
            if info.get("nameZh"):
                p.names[info["nameZh"]] += 1
            p.name_en = info.get("nameEn") or p.name_en
            p.apps.append({
                "m": m.id, "d": data["match"]["date"], "t": tid, "o": m.other[tid], "h": home, "s": list(score), "st": r["starter"],
                "min": r["minutes"], "num": info.get("number"),
                "places": {k: round(v) for k, v in places.get(pid, {}).items() if round(v) > 0},
                "src": data["video"]["src"] if data["video"]["available"] else None,
                "tt": totals,
            })
            apps[pid] = (p, len(p.apps) - 1)

        def credit(pid: str | None, key: str, ev: dict, ok: bool | None = None, against: bool = False) -> None:
            """Count the action for him. `against`: the opponent's action, for the keeper's readings, drawn at his end."""
            if pid not in apps:
                return
            p, ai = apps[pid]
            i = p.event(turned(ev) if against else ev, raw.get(ev["id"]), ai, outcome=int(bool(ok)) if against else None)
            p.ev[key].append(i)
            if ok:
                p.ok[key].append(i)

        events = data["events"]
        for src, chapter, _ in CHAPTERS:
            for sec in data[src][tid]:
                by_key = {mt["key"]: mt for mt in sec.get("metrics") or []}
                led_to_shot = {mk["eid"] for mk in sec.get("marks") or [] if mk.get("kind") == "arrow" and mk.get("key")}
                for mkey, mt in by_key.items():
                    key = f"{chapter}.{sec['key']}.{mkey}"
                    if key not in self.formats:
                        continue
                    if key in TAKER:
                        for eid in by_key[TAKER[key]]["team"]["eids"]:
                            if eid in led_to_shot:
                                totals[key] += 1
                                credit(events[eid]["playerId"], key, events[eid])
                        continue
                    own = [eid for eid in mt["team"]["eids"] if events[eid]["teamId"] == tid]
                    ok = set(mt["team"].get("okEids") or [])
                    if mt["format"] == "int":
                        totals[key] += len(own)
                    for eid in own:
                        credit(events[eid]["playerId"], key, events[eid], ok=(eid in ok) if mt["format"] == "pct" else None)
                        if key == "overview.match.pass_rate":
                            totals["overview.personal.passes"] += 1
                            credit(events[eid]["playerId"], "overview.personal.passes", events[eid])

        for r in lineup["rows"]:
            for eid in r["touches"]["eids"]:
                totals["overview.personal.touches"] += 1
                credit(r["playerId"], "overview.personal.touches", events[eid])
        rec = lambda e: events.get(str(e["event_uid"])) or m.record(e)  # noqa: E731
        P = "overview.personal."
        for e in m.team_events(tid):
            pid, ty, q = e["player_id"], e["type_id"], e["q"]
            hits: list[tuple[str, bool | None]] = []
            if ty == 16 and 28 not in q:
                hits.append((P + "goals", None))
            if e.get("assist") == 1:
                hits.append((P + "assists", None))
            if e.get("key_pass") == 1 or e.get("assist") == 1:
                hits.append((P + "key_passes", None))
            if ty == 3:
                hits += [(P + "takeons", None), (P + "takeon_rate", e["outcome"] == 1)]
                if e["outcome"] == 1:
                    hits.append((P + "takeons_won", None))
            if ty == 4 and e["outcome"] == 1:
                hits.append((P + "fouled", None))
            if ty == 17 and 31 in q:
                hits.append((P + "yellow", None))
            if ty == 17 and (32 in q or 33 in q):
                hits.append((P + "red", None))
            if ty == 44:
                hits.append((AERIAL_RATE, e["outcome"] == 1))
            if ty == 10 and 94 not in q:  # his saves (门将扑救); the goals he let in are added below
                hits.append((SAVE_RATE, True))
            if ty in SHOT_TYPES and pid in apps and (72 in q or 20 in q):
                apps[pid][0].fs[0 if 72 in q else 1] += 1
            for key, ok in hits:
                if self.formats[key] == "int":
                    totals[key] += 1
                credit(pid, key, rec(e), ok=ok)

        # The keeper's two readings that count what the opponent did while he was in goal: the goals he let in
        # (扑救成功率, with his saves above) and the crosses and long balls into his box (高空球拦截率).
        keeper, opp = keeper_at(m, tid), m.other[tid]
        for g in m.shots_of(opp):
            if g["type_id"] == 16:
                credit(keeper(m.timeline_minute(g)), SAVE_RATE, rec(g), ok=False, against=True)
        for e, caught in high_balls(m, opp):
            credit(keeper(m.timeline_minute(e)), CLAIM_RATE, rec(e), ok=caught, against=True)

    # ------------------------------------------------------------ export

    def _values(self, p: _Player) -> dict[str, list]:
        """Each of his readings appearance by appearance: a count, or [ok, attempts] (rates), or [metres from our own
        goal summed, actions] (average position, Opta's x running over 105 m); 0 where there is none."""
        for k, (parts, won) in DERIVED.items():  # rates made from his actions in other readings
            evs = sorted({i for part in parts for i in p.ev.get(part, [])})
            if evs:
                p.ev[k] = evs
                p.ok[k] = list(p.ev.get(won, [])) if won else [i for i in evs if p.events[i][5] == 1]
        n = len(p.apps)
        out: dict[str, list] = {}
        for k, evs in p.ev.items():
            if not evs:
                continue
            f = self.formats[k]
            if f == "int":
                v = [0] * n
                for i in evs:
                    v[p.events[i][4]] += 1
                out[k] = v
                continue
            ok = set(p.ok.get(k, ()))
            a, b = [0.0] * n, [0] * n
            for i in evs:
                j = p.events[i][4]
                b[j] += 1
                a[j] += (1 if i in ok else 0) if f == "pct" else p.events[i][0] * 1.05
            out[k] = [([int(a[j]), b[j]] if f == "pct" else [round(a[j], 1), b[j]]) if b[j] else 0 for j in range(n)]
        return out

    def export(self) -> dict:
        """What the pages read about this league (each player's own data comes from details()):
        meta       the readings, players (names, squad facts, group, positions), teams, and stints (a player at a team)
        filters    filter → per stint [minutes, appearances, starts, readings], for rankings and the quadrant chart
        squads     team → its players (阵容 on the team page); who: team → filter → reading → the three who did most
        search     names, for the search box"""
        idx = {x["key"]: i for i, x in enumerate(self.metrics)}

        def summary(p: _Player, vals: dict[str, list], js: list[int]) -> list:
            """[minutes, appearances, starts, readings aligned with the metric list] over these appearances."""
            vec: list = [0] * len(self.metrics)
            for k, v in vals.items():
                if self.formats[k] == "int":
                    vec[idx[k]] = sum(v[j] for j in js)
                else:
                    a = sum(v[j][0] for j in js if v[j])
                    b = sum(v[j][1] for j in js if v[j])
                    vec[idx[k]] = [round(a, 1), b] if b else 0
            return [sum(p.apps[j]["min"] for j in js), len(js), sum(1 for j in js if p.apps[j]["st"]), vec]

        season_end = date.fromisoformat(self.last_date)
        stints: list[tuple[str, str, list[int]]] = []  # a player at a team: his appearances there
        filters: dict[str, list] = {f: [] for f in FILTERS}
        team_vectors: dict[str, dict[str, list[tuple[str, list]]]] = defaultdict(lambda: defaultdict(list))
        for pid, p in self.players.items():
            vals = self._values(p)
            by_team: dict[str, list[int]] = defaultdict(list)
            for j, a in enumerate(p.apps):
                by_team[a["t"]].append(j)
            mine_last5 = set(range(max(0, len(p.apps) - 5), len(p.apps)))  # his own last five appearances
            for tid, js in by_team.items():
                stints.append((pid, tid, js))
                subsets = {
                    "all": js,
                    "home": [j for j in js if p.apps[j]["h"]],
                    "away": [j for j in js if not p.apps[j]["h"]],
                    "last5": [j for j in js if j in mine_last5],
                }
                for f, sub in subsets.items():
                    s = summary(p, vals, sub)
                    filters[f].append(s)
                    if f != "last5":
                        team_vectors[tid][f].append((pid, s[3]))
                team_last5 = set(self.team_matches[tid][-5:])  # the team page's 最近 5 场: the team's last five
                team_vectors[tid]["last5"].append((pid, summary(p, vals, [j for j in js if p.apps[j]["m"] in team_last5])[3]))

        players = {}
        for pid, p in self.players.items():
            place_min: Counter = Counter()
            for a in p.apps:
                place_min.update(a["places"])
            group_min: Counter = Counter()
            for name, mins in place_min.items():
                group_min[PLACES[name][2]] += mins
            teams = list(dict.fromkeys(a["t"] for a in p.apps))
            entries = self.squads.get(pid, [])
            person = (
                next((x for t, x in entries if t == teams[-1]), None)
                or next((x for _, x in entries if x.get("active") == "yes"), None)
                or (entries[0][1] if entries else {})
            )
            info: dict = {
                "nameZh": p.names.most_common(1)[0][0] if p.names else "",
                "nameEn": p.name_en,
                "number": p.apps[-1]["num"],
                "teams": teams,
                "group": group_min.most_common(1)[0][0] if group_min else "中场",
                "groupMin": dict(group_min.most_common()),
                "places": dict(place_min.most_common()),
            }
            if person.get("dateOfBirth"):
                info["age"] = age_on(person["dateOfBirth"], season_end)
            for k in ("height", "weight"):
                if person.get(k):
                    info[k] = int(person[k])
            if person.get("foot") in FOOT_ZH:
                info["foot"] = FOOT_ZH[person["foot"]]
            if person.get("nationality"):
                info["nat"] = NATION_ZH.get(person["nationality"], person["nationality"])
            if person.get("startDate"):
                info["joined"] = person["startDate"][:7]
            if sum(p.fs):
                info["footShots"] = list(p.fs)
            players[pid] = info

        squads: dict[str, list] = defaultdict(list)
        goals, assists = idx["overview.personal.goals"], idx["overview.personal.assists"]
        for (pid, tid, js), s in zip(stints, filters["all"]):
            info, apps = players[pid], [self.players[pid].apps[j] for j in js]
            place_min = Counter()
            for a in apps:
                place_min.update(a["places"])
            squads[tid].append({
                "id": pid, "nameZh": info["nameZh"] or info["nameEn"], "number": apps[-1]["num"], "group": info["group"],
                "places": dict(place_min.most_common()), "age": info.get("age"), "height": info.get("height"),
                "apps": s[1], "starts": s[2], "minutes": s[0], "goals": s[3][goals], "assists": s[3][assists],
                "moved": None if len(info["teams"]) == 1 else ("in" if info["teams"][-1] == tid else "out"),
            })
        for rows in squads.values():
            rows.sort(key=lambda r: -r["minutes"])

        who: dict[str, dict] = {}
        counts = [(i, x["key"]) for i, x in enumerate(self.metrics) if x["format"] == "int"]
        for tid, by_filter in team_vectors.items():
            who[tid] = {}
            for f, rows in by_filter.items():
                tops = {}
                for i, k in counts:
                    best = sorted(((v[i], pid) for pid, v in rows if v[i]), reverse=True)[:3]
                    if best:
                        tops[k] = [[pid, c] for c, pid in best]
                who[tid][f] = tops

        search = []
        for pid, info in players.items():
            py = lazy_pinyin(info["nameZh"]) if info["nameZh"] else []
            search.append({
                "id": pid, "zh": info["nameZh"], "en": info["nameEn"], "py": "".join(py), "ini": "".join(s[0] for s in py if s),
                "num": info["number"], "team": self.team_names[info["teams"][-1]], "lg": self.slug, "lgZh": self.name_zh,
                "group": info["group"], "min": sum(a["min"] for a in self.players[pid].apps),
            })

        meta = {
            "slug": self.slug, "nameZh": self.name_zh, "groups": GROUPS, "places": PLACES, "thresholds": THRESHOLDS,
            "metrics": self.metrics, "teams": self.team_names, "players": players, "stints": [[pid, tid] for pid, tid, _ in stints],
        }
        return {"meta": meta, "filters": filters, "squads": dict(squads), "who": who, "search": search}

    def details(self):
        """Player → his page's data (his matches, each reading match by match, the counted actions), one player at a
        time and dropped once handed over: all of them at once would take a lot of memory. Call after export()."""
        for pid in list(self.players):
            p = self.players.pop(pid)
            vals = self._values(p)
            metrics = {}
            for x in self.metrics:
                k = x["key"]
                if k not in vals:
                    continue
                row: dict = {"n": vals[k], "e": p.ev[k]}
                if x["format"] == "pct":
                    row["k"] = p.ok.get(k, [])
                if x["format"] == "int":
                    row["t"] = [a["tt"].get(k, 0) for a in p.apps]  # the team's count in the same match
                metrics[k] = row
            yield pid, {
                "apps": [{k: a[k] for k in ("m", "d", "t", "o", "h", "s", "st", "min", "places", "src", "num")} for a in p.apps],
                "metrics": metrics,
                "events": p.events,
                "labels": p.labels,
            }
