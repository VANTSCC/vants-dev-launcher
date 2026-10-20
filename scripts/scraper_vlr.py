#!/usr/bin/env python3
"""
VANTS · Scraper de agenda VALORANT (vlr.gg) con Python + BeautifulSoup.

Extrae los próximos partidos publicados en https://www.vlr.gg/matches y los
inserta en Neon (tabla vlr_matches, creada idempotentemente) para alimentar
la agenda de la arena. Sin DATABASE_URL o con --dry-run solo imprime lo que
parseó (no toca la base).

Uso:
  python scripts/scraper_vlr.py --dry-run            # solo parse e imprime
  python scripts/scraper_vlr.py --limit 20           # parse + upsert en Neon
  DATABASE_URL="postgresql://...neon.tech/neondb?sslmode=require" python scripts/scraper_vlr.py

Códigos de salida: 0 ok · 2 sin datos parseados · 3 error de red/bloqueo · 4 error DB
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.request

BASE_URL = "https://www.vlr.gg/matches"
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36 VANTS-Scraper/1.0"
)


def robots_permitido() -> bool:
    """Consulta robots.txt de vlr.gg. Falla ABIERTO solo si robots es ilegible
    (red caída al pedirlo = el scrape también fallaría); un Disallow explícito
    para nuestro UA aborta con salida 3 (ética antes que datos)."""
    try:
        import urllib.robotparser

        rp = urllib.robotparser.RobotFileParser()
        rp.set_url("https://www.vlr.gg/robots.txt")
        rp.read()
        return rp.can_fetch(UA, BASE_URL) or rp.can_fetch("*", BASE_URL)
    except Exception:
        return True  # robots.txt inalcanzable: se intenta igual (el fetch real validará)


def fetch_html(timeout: int = 25, reintentos: int = 2) -> str:
    """Descarga con backoff exponencial (2 s, 4 s) entre reintentos."""
    ultimo_err: Exception | None = None
    for intento in range(reintentos + 1):
        if intento:
            espera = 2 ** intento
            print(f"  reintento {intento}/{reintentos} en {espera}s ({ultimo_err})")
            import time

            time.sleep(espera)
        req = urllib.request.Request(BASE_URL, headers={"User-Agent": UA, "Accept-Language": "en"})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                if resp.status != 200:
                    raise RuntimeError(f"HTTP {resp.status}")
                return resp.read().decode("utf-8", "replace")
        except Exception as e:
            ultimo_err = e
    raise ultimo_err if ultimo_err else RuntimeError("fetch fallido")


def parse_matches(html: str, limit: int) -> list[dict]:
    """Parse mínimo y tolerante del listado de próximos partidos de vlr.gg."""
    from bs4 import BeautifulSoup  # import tardío: --help no lo exige

    soup = BeautifulSoup(html, "html.parser")
    out: list[dict] = []
    for card in soup.select("a.wf-module-item.match-item"):
        ev = card.select_one(".match-item-event")
        serie = ev.get_text(" ", strip=True).split("\n")[0] if ev else ""
        event = ""
        ev_ser = card.select_one(".match-item-event-series")
        if ev and ev_ser:
            event = ev.get_text(" ", strip=True).replace(ev_ser.get_text(" ", strip=True), "").strip()
        teams: list[str] = []
        for team in card.select(".match-item-vs-team"):
            name = team.select_one(".match-item-vs-team-name .text-of")
            if name:
                teams.append(name.get_text(strip=True))
        eta = card.select_one(".match-item-vs .eta") or card.select_one(".match-item-time")
        when = eta.get_text(strip=True) if eta else ""
        if len(teams) >= 2:
            out.append(
                {
                    "team_a": teams[0],
                    "team_b": teams[1],
                    "serie": re.sub(r"\s+", " ", serie).strip(),
                    "event": re.sub(r"\s+", " ", event).strip(),
                    "when": when,
                }
            )
        if limit and len(out) >= limit:
            break
    return out


DDL = """
CREATE TABLE IF NOT EXISTS vlr_matches (
  id        bigserial PRIMARY KEY,
  team_a    text NOT NULL,
  team_b    text NOT NULL,
  serie     text NOT NULL DEFAULT '',
  event     text NOT NULL DEFAULT '',
  when_txt  text NOT NULL DEFAULT '',
  fetched_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_a, team_b, serie, when_txt)
);
"""

UPSERT = """
INSERT INTO vlr_matches (team_a, team_b, serie, event, when_txt)
VALUES (%s, %s, %s, %s, %s)
ON CONFLICT (team_a, team_b, serie, when_txt) DO UPDATE
SET event = EXCLUDED.event, fetched_at = now()
"""


def save_to_neon(rows: list[dict], database_url: str) -> int:
    try:
        import psycopg  # type: ignore
    except ImportError:
        print("Falta psycopg: pip install 'psycopg[binary]'", file=sys.stderr)
        return 4
    with psycopg.connect(database_url, autocommit=True) as conn, conn.cursor() as cur:
        cur.execute(DDL)
        n = 0
        for r in rows:
            cur.execute(UPSERT, (r["team_a"], r["team_b"], r["serie"], r["event"], r["when"]))
            n += 1
    return n


def main() -> int:
    ap = argparse.ArgumentParser(description="Scraper VANTS de la agenda VALORANT (vlr.gg)")
    ap.add_argument("--dry-run", action="store_true", help="no escribe en la base")
    ap.add_argument("--limit", type=int, default=30, help="máximo de partidos a procesar")
    args = ap.parse_args()

    try:
        if not robots_permitido():
            print("vlr.gg/robots.txt no permite este scrape (Abortado, salida 3)")
            return 3
        html = fetch_html()
    except Exception as e:  # red, DNS o bloqueo anti-bot
        print(f"NO SE PUDO DESCARGAR {BASE_URL}: {e}", file=sys.stderr)
        return 3

    rows = parse_matches(html, args.limit)
    if not rows:
        print("vlr.gg respondió pero no se parseó ningún partido (¿cambió el HTML?)", file=sys.stderr)
        return 2

    if args.dry_run:
        print(json.dumps(rows, ensure_ascii=False, indent=2))
        print(f"[dry-run] {len(rows)} partidos parseados — nada escrito", file=sys.stderr)
        return 0

    db = os.environ.get("DATABASE_URL", "").strip()
    if not db:
        print("Sin DATABASE_URL: solo parseo. Mostrando lo que se insertaría:", file=sys.stderr)
        print(json.dumps(rows, ensure_ascii=False, indent=2))
        return 0

    n = save_to_neon(rows, db)
    print(f"OK: {n} partidos upserteados en Neon (vlr_matches)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
