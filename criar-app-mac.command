#!/bin/bash
# ============================================================
# bebet — cria um aplicativo "bebet.app" para o Mac.
# Rode UMA vez (duplo clique). Ele gera o bebet.app na mesma
# pasta; depois arraste o bebet.app para a pasta Aplicativos.
# Abrir o app inicia o servidor e abre o navegador — sem terminal.
# ============================================================
set -e
cd "$(dirname "$0")"
PROJ="$(pwd)"
APP="$PROJ/bebet.app"
PORT="${BEBET_PORT:-8000}"

echo "Criando bebet.app em: $PROJ"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

# --- Info.plist ---
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>bebet</string>
  <key>CFBundleDisplayName</key><string>bebet</string>
  <key>CFBundleIdentifier</key><string>com.bebet.local</string>
  <key>CFBundleVersion</key><string>1.0</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>bebet</string>
  <key>CFBundleIconFile</key><string>bebet</string>
  <key>LSMinimumSystemVersion</key><string>10.13</string>
  <key>LSUIElement</key><true/>
</dict>
</plist>
PLIST

# --- executável do app ---
# Guarda o caminho do projeto para o app saber onde estão os arquivos.
cat > "$APP/Contents/MacOS/bebet" <<LAUNCHER
#!/bin/bash
PROJ="$PROJ"
PORT="$PORT"
cd "\$PROJ" || exit 1
# se o servidor já estiver no ar, só abre o navegador
if curl -s -o /dev/null "http://localhost:\$PORT/"; then
  open "http://localhost:\$PORT"
  exit 0
fi
# sobe o servidor em background e abre o navegador
nohup python3 "\$PROJ/server.py" >/tmp/bebet.log 2>&1 &
sleep 1.5
open "http://localhost:\$PORT"
LAUNCHER
chmod +x "$APP/Contents/MacOS/bebet"

# --- ícone (gera um .icns simples a partir de um emoji via sips/SF) ---
# tenta criar um ícone a partir de um PNG desenhado; se falhar, segue sem ícone.
ICONSET="$PROJ/.bebet.iconset"
rm -rf "$ICONSET"; mkdir -p "$ICONSET"
python3 - "$ICONSET" <<'PY' || true
import sys, struct, zlib, os
# gera um PNG 1024x1024 verde-escuro com um circulo (placeholder de icone)
d=sys.argv[1]; W=1024
def png(path, w, h, rgba):
    def chunk(t,data):
        c=t+data; return struct.pack(">I",len(data))+c+struct.pack(">I",zlib.crc32(c)&0xffffffff)
    raw=bytearray()
    for y in range(h):
        raw.append(0)
        for x in range(w):
            raw+=bytes(rgba(x,y,w,h))
    comp=zlib.compress(bytes(raw),9)
    sig=b"\x89PNG\r\n\x1a\n"
    ihdr=struct.pack(">IIBBBBB",w,h,8,6,0,0,0)
    open(path,"wb").write(sig+chunk(b"IHDR",ihdr)+chunk(b"IDAT",comp)+chunk(b"IEND",b""))
def pix(x,y,w,h):
    cx,cy=w/2,h/2; r=w*0.42
    import math; dist=math.hypot(x-cx,y-cy)
    if dist<r:
        t=dist/r
        return (int(30+20*t),int(120+40*(1-t)),int(70+30*t),255)
    return (14,21,48,255 if dist<r*1.08 else 0)
for s in (16,32,64,128,256,512,1024):
    png(os.path.join(d,f"icon_{s}x{s}.png"),s,s,pix)
    png(os.path.join(d,f"icon_{s//2}x{s//2}@2x.png"),s,s,pix)
print("icones gerados")
PY
if command -v iconutil >/dev/null 2>&1 && [ -d "$ICONSET" ]; then
  iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/bebet.icns" 2>/dev/null || true
fi
rm -rf "$ICONSET"

# remove atributo de quarentena para abrir sem bloqueio
xattr -dr com.apple.quarantine "$APP" 2>/dev/null || true

echo
echo "=============================================="
echo "  Pronto! Criado: $APP"
echo
echo "  Agora:"
echo "   1) Arraste 'bebet.app' para a pasta Aplicativos"
echo "   2) Abra pelo Launchpad ou Finder (1 clique)"
echo "   3) Na 1a vez: botao direito no app > Abrir > Abrir"
echo "=============================================="
