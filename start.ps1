# Lancement 24h/24 de la passerelle OTP sur Windows (PC à toi, 0 F/mois).
# Usage : clic droit > Exécuter avec PowerShell, ou :
#   powershell -ExecutionPolicy Bypass -File start.ps1
# Config dans .env (voir .env.example). Laisse le PC allumé + tunnel fixe Cloudflare.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$Port = 3001
if (Test-Path .env) {
    Get-Content .env | ForEach-Object {
        $l = $_.Trim()
        if ($l -match '^(PORT|GATEWAY_TOKEN|PAIR_NUMBER|CLOUDFLARE_TOKEN|CLOUDFLARE_HOSTNAME)=(.*)$') {
            $k = $Matches[1]; $v = $Matches[2].Trim()
            Set-Item "env:$k" $v
            if ($k -eq 'PORT') { $script:Port = [int]$v }
        }
    }
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { Write-Host "ERREUR : installe Node LTS : https://nodejs.org"; exit 1 }
$major = (node -p 'process.versions.node.split(".")[0]')
if ([int]$major -lt 18) { Write-Host "ERREUR : Node 18+ requis (trouvé : $(node -v))"; exit 1 }

if (-not (Test-Path node_modules)) {
    Write-Host "Installation des dépendances..."
    npm install --no-audit --no-fund
}

$cf = Join-Path $PSScriptRoot 'cloudflared.exe'
if (-not (Test-Path $cf)) {
    Write-Host "Téléchargement de cloudflared (tunnel gratuit)..."
    Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile $cf
}

$token = $env:CLOUDFLARE_TOKEN
if ($token) {
    Start-Process -FilePath $cf -ArgumentList @('tunnel', '--no-autoupdate', 'run', '--token', $token) -WindowStyle Minimized
    Write-Host "Tunnel FIXE : https://$($env:CLOUDFLARE_HOSTNAME)/send"
    Write-Host "(mets cette adresse dans WHATSAPP_GATEWAY_URL côté Laravel, une fois pour toutes)"
} else {
    Start-Process -FilePath $cf -ArgumentList @('tunnel', '--url', "http://127.0.0.1:$Port") -RedirectStandardOutput tunnel.log -WindowStyle Minimized
    Write-Host "Tunnel rapide (adresse change à chaque lancement) :"
    for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep 1
        if (Test-Path tunnel.log) {
            $m = Select-String -Path tunnel.log -Pattern 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' | Select-Object -First 1
            if ($m) { Write-Host "$($m.Matches[0].Value)/send"; break }
        }
    }
}

$gwToken = $env:GATEWAY_TOKEN
Start-Process -FilePath node -ArgumentList @('server.js') -WindowStyle Minimized
Write-Host "Passerelle lancée dans une fenêtre réduite."
Write-Host "QR à scanner : http://127.0.0.1:$Port/qr?token=$gwToken"
Write-Host "Statut : http://127.0.0.1:$Port/status"
Write-Host ""
Write-Host "Démarrage auto avec Windows : Win+R > shell:startup > mets un raccourci vers ce script."
