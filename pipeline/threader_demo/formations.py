"""Opta formation ids (qualifier 130) and what each numbered slot (qualifier 131) means.

The id → formation and slot → position tables are adapted from kloppy 3.19.1,
kloppy/infra/serializers/event/statsperform/formation_mapping.py
(Copyright (c) 2020, PySport; BSD 3-Clause License, https://github.com/PySport/kloppy).
The MA3 spec's own diagrams (appendix 5) were folded away in our PDF copy.

Checked 2026-11-12 against every 2026 CSL/CL1/CL2 "Team set up": for 99.7% of about
18,200 starters the slot's position agrees with the group Opta gives the player
(qualifier 44: goalkeeper/defender/midfielder/forward). The rest sit on a boundary,
e.g. 4-4-1-1 slot 10 is an attacking midfielder here and a forward to Opta.
Left/right was checked against where each slot's players actually stood in first halves:
128 of 130 sided slots agree; the two that did not are corrected at the bottom of this file.
"""

from __future__ import annotations

# formation id -> (shape, {slot: position code})
FORMATIONS: dict[int, tuple[str, dict[int, str]]] = {
    2: ("4-4-2", {1: "GK", 2: "RB", 3: "LB", 4: "RCM", 5: "RCB", 6: "LCB", 7: "RM", 8: "LCM", 9: "LF", 10: "RF", 11: "LM"}),
    3: ("4-1-2-1-2", {1: "GK", 2: "RB", 3: "LB", 4: "CDM", 5: "RCB", 6: "LCB", 7: "RM", 8: "CAM", 9: "LF", 10: "RF", 11: "LM"}),
    4: ("4-3-3", {1: "GK", 2: "RB", 3: "LB", 4: "CM", 5: "RCB", 6: "LCB", 7: "RM", 8: "LM", 9: "ST", 10: "RW", 11: "LW"}),
    5: ("4-5-1", {1: "GK", 2: "RB", 3: "LB", 4: "RCM", 5: "RCB", 6: "LCB", 7: "RM", 8: "LCM", 9: "ST", 10: "CM", 11: "LM"}),
    6: ("4-4-1-1", {1: "GK", 2: "RB", 3: "LB", 4: "RCM", 5: "RCB", 6: "LCB", 7: "RM", 8: "LCM", 9: "ST", 10: "CAM", 11: "LM"}),
    7: ("4-1-4-1", {1: "GK", 2: "RB", 3: "LB", 4: "CDM", 5: "RCB", 6: "LCB", 7: "RM", 8: "RCM", 9: "ST", 10: "LCM", 11: "LM"}),
    8: ("4-2-3-1", {1: "GK", 2: "RB", 3: "LB", 4: "RCM", 5: "RCB", 6: "LCB", 7: "RAM", 8: "LCM", 9: "ST", 10: "CAM", 11: "LAM"}),
    9: ("4-3-2-1", {1: "GK", 2: "RB", 3: "LB", 4: "CM", 5: "RCB", 6: "LCB", 7: "LM", 8: "RM", 9: "ST", 10: "RAM", 11: "LAM"}),
    10: ("5-3-2", {1: "GK", 2: "RB", 3: "LB", 4: "LCB", 5: "CB", 6: "RCB", 7: "RCM", 8: "CM", 9: "LF", 10: "RF", 11: "LCM"}),
    11: ("5-4-1", {1: "GK", 2: "RB", 3: "LB", 4: "LCB", 5: "CB", 6: "RCB", 7: "RM", 8: "RCM", 9: "ST", 10: "LCM", 11: "LM"}),
    12: ("3-5-2", {1: "GK", 2: "RM", 3: "LM", 4: "LCB", 5: "CB", 6: "RCB", 7: "RCM", 8: "LCM", 9: "LF", 10: "RF", 11: "CM"}),
    13: ("3-4-3", {1: "GK", 2: "RM", 3: "LM", 4: "LCB", 5: "CB", 6: "RCB", 7: "RCM", 8: "LCM", 9: "ST", 10: "RW", 11: "LW"}),
    # 14: 3-1-3-1-2 — kloppy has no slot table for it (never seen in the 2026 data)
    15: ("4-2-2-2", {1: "GK", 2: "RB", 3: "LB", 4: "RDM", 5: "RCB", 6: "LCB", 7: "RCM", 8: "LDM", 9: "LF", 10: "RF", 11: "LCM"}),
    16: ("3-5-1-1", {1: "GK", 2: "RM", 3: "LM", 4: "LCB", 5: "CB", 6: "RCB", 7: "RDM", 8: "LDM", 9: "ST", 10: "CAM", 11: "CDM"}),
    17: ("3-4-2-1", {1: "GK", 2: "RM", 3: "LM", 4: "LCB", 5: "CB", 6: "RCB", 7: "RCM", 8: "LCM", 9: "ST", 10: "RF", 11: "LF"}),
    18: ("3-4-1-2", {1: "GK", 2: "RM", 3: "LM", 4: "LCB", 5: "CB", 6: "RCB", 7: "RCM", 8: "LCM", 9: "CAM", 10: "RF", 11: "LF"}),
    19: ("3-1-4-2", {1: "GK", 2: "RM", 3: "LM", 4: "CB", 5: "RCB", 6: "LCB", 7: "RCM", 8: "CDM", 9: "RF", 10: "LW", 11: "LCM"}),
    20: ("3-1-2-1-3（菱形中场）", {1: "GK", 2: "RM", 3: "LM", 4: "LCB", 5: "CB", 6: "RCB", 7: "CAM", 8: "CDM", 9: "ST", 10: "RW", 11: "LW"}),
    21: ("4-1-3-2", {1: "GK", 2: "RB", 3: "LB", 4: "CDM", 5: "RCB", 6: "LCB", 7: "RW", 8: "CAM", 9: "RF", 10: "LF", 11: "LW"}),
    22: ("4-2-4-0", {1: "GK", 2: "RB", 3: "LB", 4: "RCM", 5: "RCB", 6: "LCB", 7: "RW", 8: "LCM", 9: "RF", 10: "LF", 11: "LW"}),
    23: ("4-3-1-2", {1: "GK", 2: "RB", 3: "LB", 4: "CM", 5: "RCB", 6: "LCB", 7: "RM", 8: "CAM", 9: "RF", 10: "LF", 11: "LM"}),
    24: ("3-2-4-1", {1: "GK", 2: "RDM", 3: "LDM", 4: "LCB", 5: "CB", 6: "RCB", 7: "RCM", 8: "LCM", 9: "ST", 10: "RW", 11: "LW"}),
    25: ("3-3-3-1", {1: "GK", 2: "RDM", 3: "LDM", 4: "LCB", 5: "CB", 6: "RCB", 7: "CAM", 8: "CDM", 9: "ST", 10: "RW", 11: "LW"}),
}

# position code -> (Chinese name, x, y) for drawing a declared shape. x runs from our goal (0)
# to theirs (100); y = 100 is our left touchline, as in Opta's coordinates.
POSITIONS: dict[str, tuple[str, float, float]] = {
    "GK": ("门将", 6, 50),
    "RB": ("右后卫", 24, 12),
    "RCB": ("右中卫", 20, 34),
    "CB": ("中卫", 18, 50),
    "LCB": ("左中卫", 20, 66),
    "LB": ("左后卫", 24, 88),
    "RDM": ("右后腰", 34, 38),
    "CDM": ("后腰", 33, 50),
    "LDM": ("左后腰", 34, 62),
    "RCM": ("右中场", 45, 34),
    "CM": ("中场", 45, 50),
    "LCM": ("左中场", 45, 66),
    "RM": ("右前卫", 50, 12),
    "LM": ("左前卫", 50, 88),
    "RAM": ("右前腰", 62, 30),
    "CAM": ("前腰", 62, 50),
    "LAM": ("左前腰", 62, 70),
    "RW": ("右边锋", 70, 14),
    "LW": ("左边锋", 70, 86),
    "RF": ("右前锋", 78, 38),
    "ST": ("中锋", 80, 50),
    "LF": ("左前锋", 78, 62),
}


# Correction from our own data: in 4-2-3-1, slot 4 stands on the left (mean y 56.2 over 413
# player-matches) and slot 8 on the right (45.3 over 412), the opposite of kloppy's RCM/LCM.
# They are the two holding midfielders, so they are also drawn deeper.
FORMATIONS[8][1].update({4: "LDM", 8: "RDM"})


def slot_position(formation_id: int, slot: int) -> str | None:
    shape = FORMATIONS.get(formation_id)
    return shape[1].get(slot) if shape else None
