"""Read the opta-scraper parquet lake directly (Opta-native, no CDF: docs/adr/0001)."""

from __future__ import annotations

import os
from pathlib import Path

import pyarrow.parquet as pq

REPO = Path(__file__).resolve().parents[2]
# This Mac: the opta-scraper checkout next to the repo. The server: ~/data/opta.
DEFAULT_LAKES = [REPO.parent / "opta-scraper" / "data" / "opta", Path.home() / "data" / "opta"]


def lake_root() -> Path:
    if "OPTA_LAKE_ROOT" in os.environ:
        return Path(os.environ["OPTA_LAKE_ROOT"])
    return next((p for p in DEFAULT_LAKES if (p / "index.parquet").is_file()), DEFAULT_LAKES[0])


def match_row(match_id: str) -> dict:
    rows = pq.read_table(lake_root() / "index.parquet", filters=[("match_id", "=", match_id)]).to_pylist()
    if not rows:
        raise KeyError(f"match {match_id} is not in the lake")
    return rows[0]


def load_events(match_id: str) -> list[dict]:
    """All events of one match, in feed order, with qualifiers as {qualifier_id: value}."""
    rows = pq.read_table(lake_root() / match_row(match_id)["events_path"]).to_pylist()
    for row in rows:
        row["q"] = {q["qualifier_id"]: q["value"] for q in row["qualifiers"] or []}
    return rows
