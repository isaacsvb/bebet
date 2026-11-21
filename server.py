#!/usr/bin/env python3
"""
bebet — backend local (o "bot").

O que faz:
  - serve a interface (index.html, js, css) em http://localhost:8000
  - expõe /api/live  -> lista de jogos AO VIVO (fonte: ESPN, grátis, sem chave)
  - expõe /api/match?league=..&id=.. -> estatísticas ao vivo de um jogo
  Como a página e a API ficam na MESMA origem (localhost:8000), não há
  problema de CORS: o navegador pode buscar /api/... à vontade.

Uso:
  python3 server.py
  depois abra http://localhost:8000 no navegador.

Nada é enviado para fora: o backend só busca dados públicos da ESPN e
repassa para a sua página local.
"""
import json
import os
import urllib.request
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get("BEBET_PORT", "8000"))
ROOT = os.path.dirname(os.path.abspath(__file__))
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"

# ligas de futebol que o /api/live varre (ESPN slugs)
LEAGUES = [
    "bra.1", "bra.2", "eng.1", "eng.2", "esp.1", "esp.2", "ita.1", "ger.1",
    "fra.1", "por.1", "ned.1", "usa.1", "mex.1", "arg.1", "tur.1", "sau.1",
    "jpn.1", "uefa.champions", "uefa.europa", "conmebol.libertadores",
    "conmebol.sudamericana", "fifa.world", "fifa.worldq.conmebol",
]

ESPN = "https://site.api.espn.com/apis/site/v2/sports/soccer/{lg}/scoreboard"
ESPN_SUM = "https://site.api.espn.com/apis/site/v2/sports/soccer/{lg}/summary?event={eid}"


def http_get_json(url, timeout=15):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def coletar_ao_vivo():
    """Varre as ligas e devolve só os jogos em andamento (estado 'in')."""
    jogos = []
    for lg in LEAGUES:
        try:
            d = http_get_json(ESPN.format(lg=lg))
        except Exception:
            continue
        for e in d.get("events", []):
            st = e.get("status", {}).get("type", {})
            if st.get("state") != "in":
                continue
            comp = (e.get("competitions") or [{}])[0]
            home = away = None
            for c in comp.get("competitors", []):
                side = {"team": c.get("team", {}).get("displayName"),
                        "score": c.get("score")}
                if c.get("homeAway") == "home":
                    home = side
                else:
                    away = side
            jogos.append({
                "id": e.get("id"),
                "league": lg,
                "name": e.get("name"),
                "minute": st.get("detail"),
                "home": home,
                "away": away,
            })
    return jogos


# mapeia as chaves da ESPN para nomes amigáveis usados pela nossa página
STAT_MAP = {
    "possessionPct": "posse",
    "totalShots": "chutes",
    "shotsOnTarget": "chutesNoGol",
    "wonCorners": "escanteios",
    "foulsCommitted": "faltas",
    "yellowCards": "amarelos",
    "redCards": "vermelhos",
    "offsides": "impedimentos",
    "saves": "defesas",
    "bigChanceCreated": "grandesChances",
}


def _to_num(v):
    try:
        return float(str(v).replace("%", ""))
    except (TypeError, ValueError):
        return None


def coletar_estatisticas(league, eid):
    """Busca o boxscore de um jogo e devolve stats normalizadas por lado."""
    d = http_get_json(ESPN_SUM.format(lg=league, eid=eid))
    header = d.get("header", {})
    comp = (header.get("competitions") or [{}])[0]
    status = comp.get("status", {}).get("type", {})

    # placar e lado (home/away) a partir do header
    sides = {"home": {}, "away": {}}
    for c in comp.get("competitors", []):
        ha = c.get("homeAway")
        if ha in sides:
            sides[ha]["team"] = (c.get("team", {}) or {}).get("displayName")
            sides[ha]["score"] = _to_num(c.get("score"))

    # estatísticas do boxscore
    box = d.get("boxscore", {})
    for t in box.get("teams", []):
        ha = t.get("homeAway")
        if ha not in sides:
            # fallback: casa o nome do time
            nome = (t.get("team", {}) or {}).get("displayName")
            ha = "home" if sides["home"].get("team") == nome else "away"
        stats = {}
        for st in t.get("statistics", []):
            key = STAT_MAP.get(st.get("name"))
            if key:
                stats[key] = _to_num(st.get("displayValue"))
        sides[ha]["stats"] = stats

    return {
        "id": eid,
        "league": league,
        "minute": status.get("detail"),
        "state": status.get("state"),
        "clock": status.get("displayClock") or comp.get("status", {}).get("displayClock"),
        "home": sides["home"],
        "away": sides["away"],
    }


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body, ctype="application/json"):
        data = body if isinstance(body, (bytes, bytearray)) else body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _json(self, code, obj):
        self._send(code, json.dumps(obj, ensure_ascii=False))

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        # --- API ---
        if path == "/api/live":
            try:
                self._json(200, {"jogos": coletar_ao_vivo()})
            except Exception as ex:
                self._json(502, {"erro": "Falha ao buscar jogos ao vivo: %s" % ex})
            return

        if path == "/api/match":
            q = urllib.parse.parse_qs(parsed.query)
            league = (q.get("league") or [""])[0]
            eid = (q.get("id") or [""])[0]
            if not league or not eid:
                self._json(400, {"erro": "Informe league e id."})
                return
            try:
                self._json(200, coletar_estatisticas(league, eid))
            except Exception as ex:
                self._json(502, {"erro": "Falha ao buscar estatísticas: %s" % ex})
            return

        # --- arquivos estáticos ---
        rel = path.lstrip("/") or "index.html"
        rel = rel.split("?")[0]
        full = os.path.normpath(os.path.join(ROOT, rel))
        if not full.startswith(ROOT) or not os.path.isfile(full):
            self._send(404, "Not found", "text/plain")
            return
        ctype = {
            ".html": "text/html; charset=utf-8",
            ".js": "application/javascript; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".json": "application/json",
            ".svg": "image/svg+xml",
            ".ico": "image/x-icon",
        }.get(os.path.splitext(full)[1], "application/octet-stream")
        with open(full, "rb") as f:
            self._send(200, f.read(), ctype)

    def log_message(self, *args):
        pass  # silencia o log por requisição


def main():
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print("=" * 56)
    print("  bebet rodando — abra no navegador:")
    print("     http://localhost:%d" % PORT)
    print("  Fonte de dados ao vivo: ESPN (gratis, sem chave)")
    print("  Pressione Ctrl+C para parar.")
    print("=" * 56)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nparando...")
        srv.shutdown()


if __name__ == "__main__":
    main()
