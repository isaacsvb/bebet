#!/bin/bash
# bebet — atalho clicável para Mac.
# Dê um duplo clique neste arquivo para iniciar o bebet e abrir o navegador.
# (se o Mac reclamar na 1ª vez, veja o README: botão direito > Abrir)

# vai para a pasta onde este arquivo está (funciona de qualquer lugar)
cd "$(dirname "$0")" || exit 1

PORT="${BEBET_PORT:-8000}"

# abre o navegador depois de um instante, já com o servidor subindo
( sleep 1.5; open "http://localhost:${PORT}" ) &

echo "Iniciando o bebet... o navegador vai abrir sozinho."
echo "Para PARAR: feche esta janela ou aperte Ctrl+C."
echo

# usa python3 do sistema
exec python3 server.py
