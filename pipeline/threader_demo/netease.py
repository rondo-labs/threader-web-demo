"""Chinese names from 网易彩票 (sports.163.com/caipiao).

The pages are server-rendered HTML. We fetch politely (at least 2 s apart), cache every
page on disk, and parse with regexes. Only names and shirt numbers are used: they label
Opta players and teams in Chinese, matched per match by side + shirt number.
"""

from __future__ import annotations

import re
import time
import urllib.request
from dataclasses import dataclass
from pathlib import Path

BASE = "https://sports.163.com/caipiao"
CACHE = Path(__file__).resolve().parents[1] / ".cache" / "netease"
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
MIN_INTERVAL = 2.0
_last_request = 0.0


def fetch(path: str, refresh: bool = False) -> str:
    """GET BASE + path, cached under .cache/netease/."""
    global _last_request
    cached = CACHE / (path.strip("/").replace("/", "_") + ".html")
    if cached.exists() and not refresh:
        return cached.read_text(encoding="utf-8")
    wait = MIN_INTERVAL - (time.monotonic() - _last_request)
    if wait > 0:
        time.sleep(wait)
    request = urllib.request.Request(BASE + path, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=30) as response:
        html = response.read().decode("utf-8")
    _last_request = time.monotonic()
    cached.parent.mkdir(parents=True, exist_ok=True)
    cached.write_text(html, encoding="utf-8")
    return html


@dataclass(frozen=True)
class LineupPlayer:
    side: str  # "home" | "away"
    number: int
    name: str
    netease_id: str


_PLAYER = re.compile(
    r'href="/caipiao/player/football/(\d+)" title="([^"]+)"[^>]*>'
    r"(?:(?!</a>).)*?_uniform-(home|guest|away)_[^\"]*\"[^>]*><span[^>]*>(\d+)</span>",
    re.S,
)


def parse_lineups(html: str) -> list[LineupPlayer]:
    """Starters and substitutes of both sides from a match page."""
    seen: dict[tuple[str, int], LineupPlayer] = {}
    for netease_id, name, side, number in _PLAYER.findall(html):
        side = "away" if side == "guest" else side
        player = LineupPlayer(side, int(number), name.strip(), netease_id)
        seen.setdefault((side, player.number), player)
    return list(seen.values())


@dataclass(frozen=True)
class Fixture:
    date: str
    competition: str
    home_id: str
    home_name: str
    away_id: str
    away_name: str
    score: tuple[int, int] | None
    match_id: str


_ROW = re.compile(r'<tr class="hover text-center.*?</tr>', re.S)
_TEAM = re.compile(r'href="/caipiao/team/football/(\d+)"[^>]*title="([^"]+)"')


@dataclass(frozen=True)
class RosterPlayer:
    number: int | None
    nationality: str
    name: str
    netease_id: str


_CELL = re.compile(r"<td[^>]*><!--\[-->([^<]*)<!--\]--></td>")
_ROSTER_LINK = re.compile(r'href="/caipiao/player/football/(\d+)" title="([^"]+)"')


def parse_roster(html: str) -> list[RosterPlayer]:
    """A team's whole current squad from /team/football/<id>/roster (number, nationality, name per row)."""
    players = []
    for row in html.split("<tr")[1:]:
        link = _ROSTER_LINK.search(row)
        cells = _CELL.findall(row[: link.start()]) if link else []
        if not link or len(cells) < 2:
            continue
        number = cells[0].strip()
        players.append(RosterPlayer(int(number) if number.isdigit() else None, cells[1].strip(), link.group(2).strip(), link.group(1)))
    return players


def parse_team_links(html: str) -> dict[str, str]:
    """{team id: name} for every team linked on a page (a league page lists its whole table)."""
    return dict(_TEAM.findall(html))


_SCORE = re.compile(r"<span[^>]*>(\d+) : (\d+)</span>")


def parse_team_fixtures(html: str) -> list[Fixture]:
    """Fixtures listed on a team page (the page shows at most 30)."""
    fixtures = []
    for row in _ROW.findall(html):
        date = re.search(r"(\d{4}-\d{2}-\d{2})", row)
        teams = _TEAM.findall(row)
        match = re.search(r"/caipiao/match/(\d+)", row)
        comp = re.search(r"<span[^>]*>([^<]+)</span>", row)
        if not (date and len(teams) >= 2 and match):
            continue
        score = _SCORE.search(row)
        fixtures.append(
            Fixture(
                date=date.group(1),
                competition=comp.group(1) if comp else "",
                home_id=teams[0][0],
                home_name=teams[0][1],
                away_id=teams[1][0],
                away_name=teams[1][1],
                score=(int(score.group(1)), int(score.group(2))) if score else None,
                match_id=match.group(1),
            )
        )
    return fixtures
