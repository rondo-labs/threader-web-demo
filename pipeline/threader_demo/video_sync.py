"""Place Opta events on a match video.

Each half is aligned by two anchors, where it starts and where it ends in the video.
Live-stream recordings lose a few seconds per half (2026-09-19: about 4 s in the first
half, 6 s in the second) and the on-screen clock is not reliable, so an event is placed
by linear interpolation between its half's anchors, never by a single kickoff offset.
"""

from __future__ import annotations

from datetime import datetime


def parse_ts(value: str) -> float:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()


class VideoClock:
    def __init__(self, anchors: dict[int, tuple[float, float]], opta: dict[int, tuple[float, float]]):
        self.anchors = anchors
        self.opta = opta

    @classmethod
    def from_anchors(cls, anchors: dict[int, tuple[float, float]], events: list[dict]) -> VideoClock:
        """`anchors`: where each half starts and ends in the video file, in seconds."""
        starts: dict[int, float] = {}
        ends: dict[int, float] = {}
        for ev in events:
            p = ev["period_id"]
            if ev["type_id"] == 32 and p in (1, 2):
                starts[p] = min(starts.get(p, float("inf")), parse_ts(ev["timestamp"]))
            if ev["type_id"] == 30 and p in (1, 2):
                ends[p] = max(ends.get(p, 0.0), parse_ts(ev["timestamp"]))
        opta = {p: (starts[p], ends[p]) for p in anchors if p in starts and p in ends}
        return cls(anchors, opta)

    @classmethod
    def for_match(cls, match_id: str, events: list[dict]) -> VideoClock | None:
        """The source recording's clock (used by the prototype, which plays the uncut file)."""
        import json
        from pathlib import Path

        sync = json.loads((Path(__file__).resolve().parents[2] / "data" / "video-sync.json").read_text(encoding="utf-8")).get(match_id)
        if not sync:
            return None
        return cls.from_anchors({int(p): (a["start"], a["end"]) for p, a in sync["anchors"].items()}, events)

    def video_time(self, period: int, timestamp: str) -> float | None:
        if period not in self.anchors or period not in self.opta:
            return None
        (v0, v1), (o0, o1) = self.anchors[period], self.opta[period]
        return round(v0 + (parse_ts(timestamp) - o0) * (v1 - v0) / (o1 - o0), 2)
