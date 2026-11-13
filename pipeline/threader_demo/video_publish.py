"""Cut and transcode a match recording into the file the site serves.

The published file keeps each half plus PAD seconds either side and drops the pre-match,
half-time and post-match footage (README, 视频). It is encoded to the confirmed spec: 720p,
about 2 Mbps, a keyframe every 2 seconds, AAC 96 kbps, moov atom first.

Where each half sits in the published file follows from the confirmed anchors of the source
file (data/video-sync.json) and the cut, so `published_anchors` is the single place that
knows it; the analysis pipeline and the cut both call it.

    cd pipeline && uv run python -m threader_demo.video_publish 1p2hk9rohal69v3gav7y11nh0

Source folder: FEILU_VIDEO_DIR (default ~/Dev/threader-test/飞鹭demo).
Output: THREADER_MEDIA_DIR (default media/ in the repo; ~/videos on the server), laid out like the
lake's events: <competition_slug>/<date>_<home>_<score>_<away>.mp4.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

from threader_demo import lake

REPO = Path(__file__).resolve().parents[2]
SYNC_FILE = REPO / "data" / "video-sync.json"
PAD = 20.0  # seconds kept before each half starts and after it ends
SPEC = [
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-profile:v",
    "high",
    "-pix_fmt",
    "yuv420p",
    "-b:v",
    "2000k",
    "-maxrate",
    "2500k",
    "-bufsize",
    "4000k",
    "-force_key_frames",
    "expr:gte(t,n_forced*2)",
    "-sc_threshold",
    "0",
    "-c:a",
    "aac",
    "-b:a",
    "96k",
    "-ac",
    "2",
    "-movflags",
    "+faststart",
]


def media_dir() -> Path:
    """THREADER_MEDIA_DIR, else media/ in the repo (this Mac), else ~/videos (the server)."""
    if "THREADER_MEDIA_DIR" in os.environ:
        return Path(os.environ["THREADER_MEDIA_DIR"])
    local = REPO / "media"
    return local if local.is_dir() else Path.home() / "videos"


def source_dir() -> Path:
    return Path(os.environ.get("FEILU_VIDEO_DIR", Path.home() / "Dev" / "threader-test" / "飞鹭demo"))


def relative_path(match_id: str) -> str:
    """Where the match's published file sits under the media folder, mirroring the lake's events file."""
    events = Path(lake.match_row(match_id)["events_path"])
    return f"{events.parent.name}/{events.stem}.mp4"


def published_path(match_id: str) -> Path:
    return media_dir() / relative_path(match_id)


def sync_entry(match_id: str) -> dict | None:
    return json.loads(SYNC_FILE.read_text(encoding="utf-8")).get(match_id)


def cuts(anchors: dict[int, tuple[float, float]]) -> list[tuple[float, float]]:
    """The stretch of the source kept for each half, in source seconds."""
    return [(max(0.0, anchors[p][0] - PAD), anchors[p][1] + PAD) for p in (1, 2)]


def published_anchors(anchors: dict[int, tuple[float, float]]) -> dict[int, tuple[float, float]]:
    """Where each half starts and ends in the published file, given where it does in the source."""
    out, offset = {}, 0.0
    for p, (a, b) in zip((1, 2), cuts(anchors)):
        s, e = anchors[p]
        out[p] = (round(offset + s - a, 3), round(offset + e - a, 3))
        offset += b - a
    return out


def source_anchors(entry: dict) -> dict[int, tuple[float, float]]:
    return {int(p): (a["start"], a["end"]) for p, a in entry["anchors"].items()}


def publish(match_id: str) -> Path:
    entry = sync_entry(match_id)
    if not entry:
        raise SystemExit(f"{match_id} has no anchors in {SYNC_FILE.name}")
    src = source_dir() / entry["file"]
    if not src.is_file():
        raise SystemExit(f"找不到视频：{src}（用 FEILU_VIDEO_DIR 指定目录）")
    out = published_path(match_id)
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_suffix(".part.mp4")
    inputs = []
    for a, b in cuts(source_anchors(entry)):
        inputs += ["-ss", f"{a:.3f}", "-t", f"{b - a:.3f}", "-i", str(src)]
    graph = "[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[vc][a];[vc]scale=-2:720[v]"
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "warning", "-stats", "-y", *inputs, "-filter_complex", graph, "-map", "[v]", "-map", "[a]", *SPEC, str(tmp)]
    subprocess.run(cmd, check=True)
    tmp.replace(out)
    return out


if __name__ == "__main__":
    for mid in sys.argv[1:]:
        path = publish(mid)
        print(f"wrote {path} ({path.stat().st_size / 1e9:.2f} GB)")
