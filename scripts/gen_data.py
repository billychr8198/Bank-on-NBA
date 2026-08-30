#!/usr/bin/env python3
"""Build js/data/teams.js and js/data/legends.js from the source markdown + asset folders."""
import json, os, re, shutil, unicodedata

SRC = "/home/claude/nba_assets/NBA"
OUT = "/home/claude/bon"


def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return s


def key(s):
    """Loose match key: lowercase alphanumerics only."""
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]", "", s.lower())


# ---------------------------------------------------------------- teams
DIVISIONS = [
    ("East", "Atlantic", ["Boston Celtics", "Brooklyn Nets", "New York Knicks",
                          "Philadelphia 76ers", "Toronto Raptors"]),
    ("East", "Central", ["Chicago Bulls", "Cleveland Cavaliers", "Detroit Pistons",
                         "Indiana Pacers", "Milwaukee Bucks"]),
    ("East", "Southeast", ["Atlanta Hawks", "Charlotte Hornets", "Miami Heat",
                           "Orlando Magic", "Washington Wizards"]),
    ("West", "Northwest", ["Denver Nuggets", "Minnesota Timberwolves", "Oklahoma City Thunder",
                           "Portland Trail Blazers", "Utah Jazz"]),
    ("West", "Pacific", ["Golden State Warriors", "LA Clippers", "Los Angeles Lakers",
                         "Phoenix Suns", "Sacramento Kings"]),
    ("West", "Southwest", ["Dallas Mavericks", "Houston Rockets", "Memphis Grizzlies",
                           "New Orleans Pelicans", "San Antonio Spurs"]),
]

# titles, founded year, home arena city — used for the collection cards
TEAM_FACTS = {
    "Boston Celtics": (18, 1946, "Boston, MA"),
    "Brooklyn Nets": (0, 1967, "Brooklyn, NY"),
    "New York Knicks": (2, 1946, "New York, NY"),
    "Philadelphia 76ers": (3, 1949, "Philadelphia, PA"),
    "Toronto Raptors": (1, 1995, "Toronto, ON"),
    "Chicago Bulls": (6, 1966, "Chicago, IL"),
    "Cleveland Cavaliers": (1, 1970, "Cleveland, OH"),
    "Detroit Pistons": (3, 1941, "Detroit, MI"),
    "Indiana Pacers": (0, 1967, "Indianapolis, IN"),
    "Milwaukee Bucks": (2, 1968, "Milwaukee, WI"),
    "Atlanta Hawks": (1, 1946, "Atlanta, GA"),
    "Charlotte Hornets": (0, 1988, "Charlotte, NC"),
    "Miami Heat": (3, 1988, "Miami, FL"),
    "Orlando Magic": (0, 1989, "Orlando, FL"),
    "Washington Wizards": (1, 1961, "Washington, DC"),
    "Denver Nuggets": (1, 1967, "Denver, CO"),
    "Minnesota Timberwolves": (0, 1989, "Minneapolis, MN"),
    "Oklahoma City Thunder": (2, 1967, "Oklahoma City, OK"),
    "Portland Trail Blazers": (1, 1970, "Portland, OR"),
    "Utah Jazz": (0, 1974, "Salt Lake City, UT"),
    "Golden State Warriors": (7, 1946, "San Francisco, CA"),
    "LA Clippers": (0, 1970, "Los Angeles, CA"),
    "Los Angeles Lakers": (17, 1947, "Los Angeles, CA"),
    "Phoenix Suns": (0, 1968, "Phoenix, AZ"),
    "Sacramento Kings": (1, 1945, "Sacramento, CA"),
    "Dallas Mavericks": (1, 1980, "Dallas, TX"),
    "Houston Rockets": (2, 1967, "Houston, TX"),
    "Memphis Grizzlies": (0, 1995, "Memphis, TN"),
    "New Orleans Pelicans": (0, 2002, "New Orleans, LA"),
    "San Antonio Spurs": (5, 1967, "San Antonio, TX"),
}

# Team primary / secondary colours (official brand hexes)
TEAM_COLORS = {
    "Boston Celtics": ("#007A33", "#BA9653"),
    "Brooklyn Nets": ("#000000", "#FFFFFF"),
    "New York Knicks": ("#006BB6", "#F58426"),
    "Philadelphia 76ers": ("#006BB6", "#ED174C"),
    "Toronto Raptors": ("#CE1141", "#000000"),
    "Chicago Bulls": ("#CE1141", "#000000"),
    "Cleveland Cavaliers": ("#860038", "#FDBB30"),
    "Detroit Pistons": ("#C8102E", "#1D42BA"),
    "Indiana Pacers": ("#002D62", "#FDBB30"),
    "Milwaukee Bucks": ("#00471B", "#EEE1C6"),
    "Atlanta Hawks": ("#E03A3E", "#C1D32F"),
    "Charlotte Hornets": ("#1D1160", "#00788C"),
    "Miami Heat": ("#98002E", "#F9A01B"),
    "Orlando Magic": ("#0077C0", "#C4CED4"),
    "Washington Wizards": ("#002B5C", "#E31837"),
    "Denver Nuggets": ("#0E2240", "#FEC524"),
    "Minnesota Timberwolves": ("#0C2340", "#236192"),
    "Oklahoma City Thunder": ("#007AC1", "#EF3B24"),
    "Portland Trail Blazers": ("#E03A3E", "#000000"),
    "Utah Jazz": ("#002B5C", "#F9A01B"),
    "Golden State Warriors": ("#1D428A", "#FFC72C"),
    "LA Clippers": ("#C8102E", "#1D428A"),
    "Los Angeles Lakers": ("#552583", "#FDB927"),
    "Phoenix Suns": ("#1D1160", "#E56020"),
    "Sacramento Kings": ("#5A2D81", "#63727A"),
    "Dallas Mavericks": ("#00538C", "#002B5E"),
    "Houston Rockets": ("#CE1141", "#000000"),
    "Memphis Grizzlies": ("#5D76A9", "#12173F"),
    "New Orleans Pelicans": ("#0C2340", "#C8102E"),
    "San Antonio Spurs": ("#C4CED4", "#000000"),
}

teams_md = open(os.path.join(SRC, "nba_30_teams.md"), encoding="utf-8").read()
team_blurbs = {}
for m in re.finditer(r"^#### ([^\n]+)\n\n([^\n]+)", teams_md, re.M):
    team_blurbs[key(m.group(1))] = " ".join(m.group(2).split())

# match asset files
team_files = os.listdir(os.path.join(OUT, "assets/teams"))
team_file_map = {key(os.path.splitext(f)[0]): f for f in team_files}

teams = []
order = 0
for conf, div, names in DIVISIONS:
    for name in names:
        k = key(name)
        f = team_file_map.get(k)
        if f is None:  # e.g. "Portland Trailblazers" vs "Portland Trail Blazers"
            cands = [kk for kk in team_file_map if kk.startswith(k[:10])]
            f = team_file_map[cands[0]] if cands else None
        assert f, f"no logo for {name}"
        new = slug(name) + os.path.splitext(f)[1]
        if f != new:
            shutil.move(os.path.join(OUT, "assets/teams", f), os.path.join(OUT, "assets/teams", new))
        titles, founded, city = TEAM_FACTS[name]
        pri, sec = TEAM_COLORS[name]
        blurb = team_blurbs.get(k) or next(
            (v for kk, v in team_blurbs.items() if kk.startswith(k[:10])), "")
        order += 1
        teams.append({
            "id": slug(name), "name": name, "conference": conf, "division": div,
            "order": order, "titles": titles, "founded": founded, "city": city,
            "primary": pri, "secondary": sec, "logo": "assets/teams/" + new,
            "blurb": blurb,
        })

# ---------------------------------------------------------------- legends
legends_md = open(os.path.join(SRC, "nba_55_legends.md"), encoding="utf-8").read()

TIER_META = {
    1: ("GOAT", "The Mount Rushmore"),
    2: ("Iconic", "Iconic Top-10 Legends"),
    3: ("Superstar", "All-Time Superstars & Innovators"),
    4: ("Elite", "Elite Hall-of-Famers & Pioneers"),
    5: ("Legend", "Legendary All-Stars & Game-Changers"),
}

RATING_KEYS = {
    "Shooting": "shooting",
    "Dribbling": "dribbling",
    "Strength": "strength",
    "Playmaking & Ball Control": "playmaking",
    "Rebounding & Interior Play": "rebounding",
    "Defense & Versatility": "defense",
}

legend_files = os.listdir(os.path.join(OUT, "assets/legends"))
legend_file_map = {key(os.path.splitext(f)[0]): f for f in legend_files}
ALIASES = {"wiltchamberlain": "wittchamberlain", "kareemabduljabbar": "kareemabduljabbar"}

# split into tier sections
tier_sections = re.split(r"^## Tier (\d):", legends_md, flags=re.M)[1:]
legends = []
for i in range(0, len(tier_sections), 2):
    tier = int(tier_sections[i])
    body = tier_sections[i + 1]
    for m in re.finditer(
            r"^### (\d+)\. ([^\n]+)\n\n(.+?)\n\n\*\*Skill Ratings\*\*\n((?:-[^\n]+\n?)+)",
            body, re.M | re.S):
        rank = int(m.group(1)); name = m.group(2).strip()
        paras = [" ".join(p.split()) for p in m.group(3).split("\n\n")]
        ratings = {}
        for line in m.group(4).strip().split("\n"):
            lm = re.match(r"- (.+?): (\d+)/100", line.strip())
            if lm:
                ratings[RATING_KEYS[lm.group(1)]] = int(lm.group(2))
        k = key(name)
        f = legend_file_map.get(k) or legend_file_map.get(ALIASES.get(k, ""))
        if f is None:
            cands = [kk for kk in legend_file_map if kk[-8:] == k[-8:] or kk[:8] == k[:8]]
            f = legend_file_map[cands[0]] if cands else None
        assert f, f"no portrait for {name}"
        new = slug(name) + os.path.splitext(f)[1]
        if f != new:
            shutil.move(os.path.join(OUT, "assets/legends", f), os.path.join(OUT, "assets/legends", new))
        ov = round(sum(ratings.values()) / len(ratings))
        legends.append({
            "id": slug(name), "rank": rank, "name": name, "tier": tier,
            "tierName": TIER_META[tier][0], "tierLabel": TIER_META[tier][1],
            "overall": ov, "ratings": ratings,
            "portrait": "assets/legends/" + new,
            "blurb": paras[0], "blurb2": paras[1] if len(paras) > 1 else "",
        })

legends.sort(key=lambda x: x["rank"])
assert len(legends) == 55, len(legends)
assert len(teams) == 30, len(teams)

# unlock order: tier 5 -> tier 1, and inside a tier from the lowest rank upward,
# so the final unlock on day 365 is Michael Jordan.
unlock = sorted(legends, key=lambda x: (-x["tier"], -x["rank"]))
for i, l in enumerate(unlock):
    l["unlockOrder"] = i + 1

banner = "// Generated from the source markdown by scripts/gen_data.py — do not edit by hand.\n"
with open(os.path.join(OUT, "js/data/teams.js"), "w", encoding="utf-8") as fh:
    fh.write(banner + "window.NBA_TEAMS = " + json.dumps(teams, indent=1, ensure_ascii=False) + ";\n")
with open(os.path.join(OUT, "js/data/legends.js"), "w", encoding="utf-8") as fh:
    fh.write(banner + "window.NBA_LEGENDS = " + json.dumps(
        sorted(legends, key=lambda x: x["unlockOrder"]), indent=1, ensure_ascii=False) + ";\n")

print("teams:", len(teams), "legends:", len(legends))
print("tier counts:", {t: sum(1 for l in legends if l["tier"] == t) for t in range(1, 6)})
print("first 3 unlocks:", [l["name"] for l in unlock[:3]])
print("last 3 unlocks:", [l["name"] for l in unlock[-3:]])
print("first 3 teams:", [t["name"] for t in teams[:3]])
