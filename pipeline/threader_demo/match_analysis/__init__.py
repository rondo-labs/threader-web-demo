"""The match-analysis page's data for one match: six chapters, each from both teams' side.

Definitions follow docs/match-analysis.md and were settled on the 2026-09-19 prototype.
"""

from __future__ import annotations

from . import attack, defence, overview, possession, set_pieces, transitions
from .football import stage_zh
from .match import Match

ENTRIES_SUMMARY = {"kind": "lanes", "metrics": ["entries", "entry_rate"], "drill": {k: f"lane_{k}" for k in ("left", "center", "right")}, "badge": "box"}
KEY_LABEL = {"entries": "传进禁区", "crosses": "形成射门"}


def build(match_id: str) -> tuple[dict, Match]:
    m = Match(match_id)
    possession.attach(m)

    def per_team(*sections):
        return {tid: [f(m, tid, m.other[tid]) for f in sections] for tid in (m.home_id, m.away_id)}

    attacking = per_team(attack.buildup_section, attack.network_section, attack.entries_section, attack.shots_section, attack.crosses_section)
    for secs in attacking.values():
        for sec in secs:
            sec.setdefault("keyLabel", KEY_LABEL.get(sec["key"]))
            if sec["key"] == "entries":
                sec["summary"] = ENTRIES_SUMMARY
    data = {
        "match": {
            "id": m.id,
            "date": m.first["match_date"],
            "competition": m.competition,
            "stage": stage_zh(m.competition, m.first["stage_name"]),
            "homeId": m.home_id,
            "awayId": m.away_id,
            "score": [m.first["home_score"], m.first["away_score"]],
        },
        "teams": m.teams,
        "players": m.players,
        "events": m.used,
        "goals": [],
        "sections": attacking,
        "overview": per_team(overview.compare_section, overview.timeline_section, overview.lineup_section, overview.goals_section),
        "defence": per_team(defence.def_actions_section, defence.pressing_section, defence.opp_access_section, defence.box_defence_section),
        "setpieces": per_team(set_pieces.corners_section, set_pieces.free_kicks_section, set_pieces.throw_ins_section),
        "attackTransition": per_team(transitions.regains_section, transitions.first_action_section, transitions.counter_section),
        "defenceTransition": per_team(transitions.losses_section, transitions.opp_after_loss_section, transitions.counterpress_section),
        "video": {"src": m.video_src, "available": m.clock is not None},
    }
    for e in m.events:
        if e["type_id"] == 16:
            own = 28 in e["q"]
            data["goals"].append(
                {"eid": m.eid(e), "teamId": m.scored_by(e), "playerId": e["player_id"] or None, "clock": f"{e['time_min']}:{e['time_sec']:02d}", "ownGoal": own}
            )
    return data, m
