"""中乙 2026 standings against the published tables (zh.wikipedia.org, 2026年中国足球乙级联赛, read 2026-11-13):
both 预赛 zones in full, and the three 决赛阶段 groups after round 25, the last round that page shows.
Builds the tables from the results alone (no match analysis), so it runs in a few seconds."""

from __future__ import annotations

import pyarrow.parquet as pq
import pytest

from threader_demo import lake
from threader_demo.match_analysis.match import team_names
from threader_demo.season import LeagueSeason, Result

SLUG = "chinese-football-league-2-2026"
PUBLISHED_PRE = {
    "北区": [("山东泰山B队", 41), ("上海海港B队", 40), ("山西崇德荣海", 40), ("大连可为", 37), ("泰安天贶", 31), ("大连英博B队", 28),
             ("海门珂缔缘", 26), ("兰州陇原竞技", 26), ("青岛红狮", 25), ("长春喜都", 20), ("北京理工", 16), ("上海赛更达", 15)],
    "南区": [("贵州贵阳竞技", 42), ("深圳二零二八", 37), ("江西庐山", 35), ("杭州临平吴越", 34), ("湖北青年星", 34), ("厦门飞鹭", 29),
             ("广东铭途", 26), ("赣州瑞狮", 26), ("广州蒲公英", 25), ("成都蓉城B队", 22), ("温州队", 22), ("武汉三镇B队", 19)],
}
PUBLISHED_ROUND_25 = {
    "冲甲组": [("上海海港B队", 46), ("贵州贵阳竞技", 45), ("山东泰山B队", 45), ("山西崇德荣海", 44), ("大连可为", 44), ("深圳二零二八", 41),
             ("江西庐山", 38), ("杭州临平吴越", 36)],
    "保级A组": [("湖北青年星", 38), ("大连英博B队", 32), ("兰州陇原竞技", 32), ("广东铭途", 31), ("广州蒲公英", 26), ("温州队", 26),
              ("长春喜都", 25), ("上海赛更达", 17)],
    "保级B组": [("泰安天贶", 36), ("海门珂缔缘", 33), ("厦门飞鹭", 32), ("赣州瑞狮", 29), ("青岛红狮", 28), ("成都蓉城B队", 24),
              ("武汉三镇B队", 23), ("北京理工", 22)],
}


@pytest.fixture(scope="module")
def stages():
    root = lake.lake_root()
    names = team_names()
    season = LeagueSeason(SLUG, "中乙")
    rows = [r for r in pq.read_table(root / "index.parquet", columns=["competition_slug", "events_path"]).to_pylist() if r["competition_slug"] == SLUG]
    cols = ["match_id", "match_date", "stage_name", "week", "home_id", "away_id", "home_score", "away_score"]
    for r in rows:
        e = pq.read_table(root / r["events_path"], columns=cols).slice(0, 1).to_pylist()[0]
        for tid in (e["home_id"], e["away_id"]):
            season.teams[tid] = {"id": tid, "nameZh": names[tid]["name_zh"], "nameEn": names[tid]["name_en"]}
        season.results.append(
            Result(id=e["match_id"], date=e["match_date"], week=int(e["week"]), stage=e["stage_name"], home=e["home_id"], away=e["away_id"],
                   hs=e["home_score"], aws=e["away_score"])
        )
    season.add_awarded()
    return season, season.stages()


def table(season, group, at_round=None):
    if at_round is None:
        return [(season.teams[r["teamId"]]["nameZh"], r["pts"]) for r in group["rows"]]
    after = sorted((h for t, hs in group["history"].items() for h in [[t, *x] for x in hs] if h[1] == at_round), key=lambda h: h[2])
    return [(season.teams[t]["nameZh"], pts) for t, _, _, pts in after]


def test_preliminary_zones_match_the_published_tables(stages):
    season, st = stages
    pre = {g["name"]: g for g in st[0]["groups"]}
    assert st[0]["name"] == "预赛"
    for zone, published in PUBLISHED_PRE.items():
        assert table(season, pre[zone]) == published, zone


def test_final_stage_after_round_25_matches_the_published_tables(stages):
    season, st = stages
    final = {g["name"]: g for g in st[1]["groups"]}
    assert list(final) == ["冲甲组", "保级A组", "保级B组"]
    for group, published in PUBLISHED_ROUND_25.items():
        assert table(season, final[group], at_round=25) == published, group


def test_the_forfeit_counts_once(stages):
    season, st = stages
    final = {g["name"]: g for g in st[1]["groups"]}
    rows = {season.teams[r["teamId"]]["nameZh"]: r for r in final["保级B组"]["rows"]}
    assert rows["赣州瑞狮"]["p"] == rows["泰安天贶"]["p"] == 30  # 22 + 8, including the 0–3 awarded on 10/31
