#!/usr/bin/env bash
# Lancement 24h/24 de la passerelle OTP (machine à toi : PC, Raspberry...).
# Usage : ./start.sh   (lit la config dans .env — voir .env.example)
# Zéro relance quotidienne : laisse la machine allumée + tunnel fixe Cloudflare.
set -u
cd "$(dirname "$0")"

if [ -f .env ]; then
    set -a
    # shellcheck disable=SC1091
    . ./.env
    set +a
fi
PORT="${PORT:-3001}"

if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 18 ]; then
    echo "ERREUR : Node 18+ requis : https://nodejs.org (prends la LTS)."
    exit 1
fi

if [ ! -d node_modules ]; then
    echo "Installation des dépendances..."
    npm install --no-audit --no-fund || exit 1
fi

CF="./cloudflared"
if [ ! -x "$CF" ]; then
    ARCH="$(uname -m)"
    case "$ARCH" in
        aarch64|arm64) CF_ASSET="cloudflared-linux-arm64" ;;   # Android/Termux 64 bits
        armv7l|armv6l|arm) CF_ASSET="cloudflared-linux-arm" ;; # Android 32 bits
        x86_64|amd64) CF_ASSET="cloudflared-linux-amd64" ;;
        i386|i686) CF_ASSET="cloudflared-linux-386" ;;
        *) CF_ASSET="cloudflared-linux-amd64" ;;
    esac
    echo "Téléchargement de cloudflared ($CF_ASSET, tunnel gratuit)..."
    curl -fsSL -o "$CF" "https://github.com/cloudflare/cloudflared/releases/latest/download/$CF_ASSET" || exit 1
    chmod +x "$CF"
fi

if [ -n "${CLOUDFLARE_TOKEN:-}" ]; then
    "$CF" tunnel --no-autoupdate run --token "$CLOUDFLARE_TOKEN" > tunnel.log 2>&1 &
    echo "Tunnel FIXE : https://${CLOUDFLARE_HOSTNAME:-ton-domaine}/send"
    echo "(mets cette adresse dans WHATSAPP_GATEWAY_URL côté Laravel, une fois pour toutes)"
else
    "$CF" tunnel --url "http://127.0.0.1:$PORT" > tunnel.log 2>&1 &
    echo "Tunnel rapide (adresse change à chaque lancement) :"
    for _ in $(seq 1 20); do
        sleep 1
        URL=$(grep -oE 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' tunnel.log 2>/dev/null | head -1)
        if [ -n "$URL" ]; then echo "$URL/send"; break; fi
    done
fi

if command -v pm2 >/dev/null; then
    pm2 start server.js --name wa-gateway --update-env >/dev/null && pm2 save >/dev/null
    echo "Passerelle gérée par pm2 (redémarre toute seule en cas de crash)."
else
    nohup node server.js > gateway.log 2>&1 &
    echo "Passerelle lancée (PID $!). Astuce redémarrage auto : npm i -g pm2 && pm2 startup"
fi

echo "QR à scanner : http://127.0.0.1:$PORT/qr?token=${GATEWAY_TOKEN:-...}"
echo "Statut : http://127.0.0.1:$PORT/status"
