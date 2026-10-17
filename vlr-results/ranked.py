"""
Ranked por jugador: rango actual + RR (puntos de ranked) y últimas
partidas competitivas de un Riot ID (nombre#tag).

Datos: HenrikDev API (https://api.henrikdev.xyz) — requiere API key gratis
(https://discord.gg/henrikdev). Sin key funciona en modo demo (datos de
ejemplo) para ver la UI.

Endpoints usados:
  GET /valorant/v1/account/{name}/{tag}        -> puuid, nivel de cuenta
  GET /valorant/v1/mmr/{region}/{name}/{tag}    -> rango actual, RR, historial
  GET /valorant/v3/match/{region}/pc/{puuid}?mode=competitive -> partidas
"""

import os
from urllib.parse import quote

import httpx
from flask import Blueprint, render_template_string, request

HENRIK_API = "https://api.henrikdev.xyz"
# Consigue una gratis en el Discord de HenrikDev (bot #api-access)
HENRIK_KEY = os.environ.get("HENRIK_API_KEY", "")  # ej: HSD-xxxxxxxx
REGIONS = ["na", "eu", "ap", "kr", "latam", "br"]

ranked_bp = Blueprint("ranked", __name__)


def is_demo() -> bool:
    return not HENRIK_KEY


# --- modo demo (sin API key): datos de ejemplo -----------------------
DEMO_MMR = {
    "current": {"tier": {"name": "Diamond 1"}, "rr": 47},
    "last_change": 18, "peak_tier": "Diamond 2",
    "wins": 112, "losses": 98,
}
DEMO_MATCHES = [
    {"meta": {"map": {"name": "Ascent"}, "started_at": "2026-10-16T20:00Z"},
     "teams": {"blue": {"rounds_won": 13}, "red": {"rounds_won": 8}},
     "players": {"all_players": [
         {"puuid": "demo", "team_id": "Blue", "agent": {"name": "Jett"},
          "stats": {"kills": 24, "deaths": 14, "assists": 6}}]}},
    {"meta": {"map": {"name": "Bind"}, "started_at": "2026-10-16T21:00Z"},
     "teams": {"blue": {"rounds_won": 9}, "red": {"rounds_won": 13}},
     "players": {"all_players": [
         {"puuid": "demo", "team_id": "Red", "agent": {"name": "Reyna"},
          "stats": {"kills": 17, "deaths": 19, "assists": 4}}]}},
    {"meta": {"map": {"name": "Lotus"}, "started_at": "2026-10-15T22:00Z"},
     "teams": {"blue": {"rounds_won": 13}, "red": {"rounds_won": 11}},
     "players": {"all_players": [
         {"puuid": "demo", "team_id": "Blue", "agent": {"name": "Raze"},
          "stats": {"kills": 22, "deaths": 16, "assists": 9}}]}},
]
DEMO_PUUID = "demo"


def fetch_player(name: str, tag: str, region: str) -> dict:
    """Cuenta + MMR + últimas 5 competitivas vía HenrikDev API."""
    headers = {"Authorization": HENRIK_KEY}
    with httpx.Client(timeout=20) as client:
        acct = client.get(
            f"{HENRIK_API}/valorant/v1/account/{quote(name)}/{quote(tag)}",
            headers=headers)
        acct.raise_for_status()
        puuid = acct.json()["data"]["puuid"]

        mmr = client.get(
            f"{HENRIK_API}/valorant/v1/mmr/{region}/{quote(name)}/{quote(tag)}",
            headers=headers)
        mmr.raise_for_status()

        matches = client.get(
            f"{HENRIK_API}/valorant/v3/match/{region}/pc/{puuid}"
            f"?mode=competitive&size=5", headers=headers)
        matches.raise_for_status()

    return {"puuid": puuid, "mmr": mmr.json()["data"], "matches": matches.json()}


def render_matches(matches: list, puuid: str) -> str:
    rows = []
    for m in matches[:5]:
        meta = m.get("metadata") or {}
        players = (m.get("players") or {}).get("all_players") or []
        me = next((p for p in players if p.get("puuid") == puuid), {}) or {}
        team = (me.get("team_id") or "").lower()  # "blue" / "red"
        teams = m.get("teams") or {}
        mine = (teams.get(team) or {}).get("rounds_won", 0) or 0
        other_key = "red" if team == "blue" else "blue"
        other = (teams.get(other_key) or {}).get("rounds_won", 0) or 0
        won = mine > other
        st = me.get("stats") or {}
        rows.append(
            f'<tr><td>{(meta.get("map") or {}).get("name", "?")}</td>'
            f'<td>{(me.get("agent") or {}).get("name", "?")}</td>'
            f'<td style="color:{"#7CFC98" if won else "#f85149"};'
            f'font-weight:bold">{"VICTORIA" if won else "DERROTA"}</td>'
            f'<td>{mine}-{other}</td>'
            f'<td>{st.get("kills", 0)}/{st.get("deaths", 0)}/{st.get("assists", 0)}</td>'
            f'<td><small>{str(meta.get("started_at", "?"))[:10]}</small></td></tr>')
    if not rows:
        return "<p>Sin partidas competitivas recientes.</p>"
    head = ("<tr><th>Mapa</th><th>Agente</th><th>Resultado</th>"
            "<th>Rondas</th><th>K/D/A</th><th>Fecha</th></tr>")
    return ('<table border=1 cellpadding=6 cellspacing=0 '
            'style="border-collapse:collapse;font-size:.9rem;margin-top:1rem">'
            + head + "".join(rows) + "</table>")


RANKED_PAGE = """<!doctype html><html lang=es><meta charset=utf-8>
<meta name=viewport content="width=device-width,initial-scale=1">
<title>Ranked del jugador</title>
<style>body{font-family:sans-serif;background:#0f1923;color:#ece8e1;max-width:760px;margin:2rem auto;padding:0 1rem}
input,select{background:#1f2933;color:#ece8e1;border:1px solid #333;padding:.4rem;border-radius:4px}
button{background:#ff4655;color:#fff;border:0;padding:.45rem 1rem;border-radius:4px;cursor:pointer}
a{color:#ff4655}</style>
<nav style="margin-bottom:1rem"><a href="/">&larr; Torneos</a></nav>
<h1>Ranked del jugador (RR)</h1>
{% if demo %}<p style="background:#bd3b3f22;padding:.6rem;border-left:3px solid #ff4655">
<b>Modo demo</b>: sin <code>HENRIK_API_KEY</code> se muestran datos de ejemplo.
Pedí una key gratis en el Discord de HenrikDev y corre la app con
<code>HENRIK_API_KEY=HSD-xxx</code> para datos reales.</p>{% endif %}
<form method=get action="/ranked" style="margin-bottom:1rem">
<input name=name placeholder="Nombre" value="{{ name }}" required>
<input name=tag placeholder="#TAG" value="{{ tag }}" size=6 required>
<select name=region>{% for r in regions %}
<option value="{{ r }}" {% if r == region %}selected{% endif %}>{{ r|upper }}</option>
{% endfor %}</select>
<button>Buscar</button></form>
{% if error %}<p style="color:#f85149">{{ error }}</p>{% endif %}
{% if mmr_html %}{{ mmr_html|safe }}{% endif %}
{% if matches_html %}{{ matches_html|safe }}{% endif %}
</html>"""


@ranked_bp.route("/ranked")
def ranked():
    name = request.args.get("name", "").strip()
    tag = request.args.get("tag", "").strip().lstrip("#")
    region = request.args.get("region", "eu").strip().lower()

    def page(**kw):
        base = dict(demo=is_demo(), name=name, tag=tag, region=region,
                    regions=REGIONS, error="", mmr_html="", matches_html="")
        base.update(kw)
        return render_template_string(RANKED_PAGE, **base)

    if not (name and tag):
        return page()

    if is_demo():
        return page(mmr_html=render_mmr(DEMO_MMR),
                    matches_html=render_matches(DEMO_MATCHES, DEMO_PUUID))
    try:
        data = fetch_player(name, tag, region)
    except httpx.HTTPStatusError as e:
        code = e.response.status_code
        msg = ("Jugador no encontrado: revisá nombre#TAG y región."
               if code == 404 else f"Error HTTP {code} (¿key válida?)")
        return page(error=msg)
    except httpx.HTTPError as e:
        return page(error=f"Error de red: {e}")

    return page(mmr_html=render_mmr(data["mmr"]),
                matches_html=render_matches(data["matches"], data["puuid"]))
def render_mmr(d: dict) -> str:
    cur = d.get("current") or {}
    tier = (cur.get("tier") or {}).get("name", "Unranked")
    rr = cur.get("rr", 0)
    last = d.get("last_change") or 0
    wins = d.get("wins") or 0
    losses = d.get("losses") or 0
    peak = d.get("peak_tier") or "-"
    return (f'<h2 style="margin:.3rem 0;color:#ff4655">{tier} · {rr} RR</h2>'
            f'<small>Racha máxima: {peak} · Último cambio: {last:+d} RR · '
            f'{wins}V / {losses}D</small>')