import os
import time
import threading
from flask import Flask, jsonify, render_template_string
import vlrdevapi

from ranked import ranked_bp

app = Flask(__name__)
app.register_blueprint(ranked_bp)

PAGE = """<!doctype html><html lang=es><meta charset=utf-8>
<meta name=viewport content="width=device-width,initial-scale=1">
<title>Resultados Valorant</title>
<style>body{font-family:sans-serif;background:#0f1923;color:#ece8e1;max-width:760px;margin:2rem auto;padding:0 1rem}
.m{background:#1f2933;border-left:4px solid #ff4655;padding:.8rem 1rem;margin:.6rem 0;border-radius:4px}
.s{display:flex;justify-content:space-between}.w{color:#7CFC98;font-weight:bold}small{color:#9aa}</style>
<h1>Resultados de Valorant · torneos</h1>
<nav style="margin-bottom:1rem"><a href="/ranked" style="color:#ff4655">Ranked del jugador (RR) &rarr;</a></nav>
{% if error %}<p>Error: {{ error }}</p>{% endif %}
{% for m in matches %}<div class=m><small>{{ m.event }} - {{ m.stage }} - {{ m.when }}</small>
<div class=s><span class="{{ 'w' if m.w1 }}">{{ m.t1 }}</span><b>{{ m.s1 }} : {{ m.s2 }}</b><span class="{{ 'w' if m.w2 }}">{{ m.t2 }}</span></div></div>{% endfor %}</html>"""


_cache = {"t": 0, "d": []}
_lock = threading.Lock()


def fetch():
    with _lock:
        if time.time() - _cache["t"] > 60 or not _cache["d"]:
            _cache["d"] = _fetch()
            _cache["t"] = time.time()
        return _cache["d"]


def _fetch():
    out = []
    for m in vlrdevapi.matches.completed().matches:
        a, b = m.team1, m.team2
        out.append(dict(
            event=m.event, stage=m.stage,
            when=m.datetime.strftime("%Y-%m-%d %H:%M UTC") if m.datetime else "",
            t1=a.name if a else "TBD", t2=b.name if b else "TBD",
            s1=a.score if a else "-", s2=b.score if b else "-",
            w1=bool(a and a.is_winner), w2=bool(b and b.is_winner)))
    return out


@app.route("/")
def index():
    try:
        return render_template_string(PAGE, matches=fetch(), error=None)
    except Exception as e:
        return render_template_string(PAGE, matches=[], error=str(e)), 502


@app.route("/api/results")
def api():
    return jsonify(fetch())


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
