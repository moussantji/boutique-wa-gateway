# 📱 Passerelle OTP sur smartphone Android (Termux) — 0 F, 24h/24

Ton téléphone branché = un mini-serveur toujours allumé. **Zéro relance** :
une fois lancé, ça tourne tout seul (même écran éteint).

> Astuce clé : on lie ton numéro avec un **code de jumelage** (pas de QR),
> donc **pas besoin d'un 2ᵉ appareil** — tout se fait sur le téléphone lui-même.

## Ce qu'il faut

- Smartphone Android + chargeur branché (de préférence) + WiFi ou données mobiles
- ~200 Mo libres
- 15 minutes de setup, une seule fois

## 1. Copier le dossier sur le téléphone

- **Via USB** : branche le téléphone au PC, copie le dossier `wa-gateway/`
  du projet vers `Téléchargement/` du téléphone.
- *Alternative* : `git clone` du projet (si déjà sur GitHub), ou via Google Drive.

## 2. Installer Termux (+ démarrage auto)

1. Installe **Termux** depuis **F-Droid** (pas le Play Store, version obsolète) :
   https://f-droid.org/packages/com.termux/
2. Installe aussi **Termux:Boot** (même site, pour relancer tout seul au
   redémarrage du téléphone).
3. Ouvre Termux et prépare l'accès au stockage :
   ```bash
   termux-setup-storage
   ```
   (accepte l'autorisation, puis copie le dossier :)
   ```bash
   cp -r /sdcard/Download/wa-gateway ~/wa-gateway
   cd ~/wa-gateway
   ```

## 3. Installer et configurer

```bash
pkg update && pkg install -y nodejs nano
npm install --no-audit --no-fund
cp .env.example .env
nano .env
```

Dans `.env`, renseigne au minimum :

```dotenv
PORT=3001
GATEWAY_TOKEN=un-jeton-long-que-tu-inventes
PAIR_NUMBER=22382019583
```

(`PAIR_NUMBER` = ton numéro qui envoie les codes, sans `+`.
Laisse `CLOUDFLARE_*` vide pour l'instant — voir §6.)

> Si `npm install` échoue, envoie-moi l'erreur affichée.

## 4. Lancer

```bash
chmod +x start.sh
./start.sh
```

Le script installe le tunnel, démarre la passerelle et affiche un
**code de jumelage** (ex : `A1B2-C3D4`). Dans WhatsApp sur le téléphone :
**Paramètres > Appareils liés > Lier avec un code** → saisis le code.

Vérif : ouvre dans le navigateur du téléphone
`http://127.0.0.1:3001/status` → `{"connected":true,...}` ✅

Note l'**adresse du tunnel** affichée (ex `https://xxx.trycloudflare.com/send`)
et mets-la dans le `.env` Laravel :

```dotenv
WHATSAPP_OTP_DRIVER=gateway
WHATSAPP_GATEWAY_URL=https://xxx.trycloudflare.com/send
WHATSAPP_GATEWAY_TOKEN=le-meme-jeton-que-GATEWAY_TOKEN
```

puis `php artisan config:cache`. Teste avec une vraie création de compte vendeur.

## 5. Garder ça vivant 24h/24 (important)

1. Dans Termux : `termux-wake-lock` (met une notif persistante qui empêche
   Android d'endormir la passerelle ; à refaire après chaque redémarrage —
   le script de boot ci-dessous le fait tout seul).
2. Android : **Paramètres > Applis > Termux > Batterie > Sans restriction**
   (sinon Android tue la passerelle en arrière-plan).
3. Téléphone **branché** de préférence (un téléphone allumé consomme très peu).

## 6. Redémarrage tout seul au boot (+ adresse fixe conseillée)

Crée `~/.termux/boot/start-gateway.sh` (Termux:Boot le lance au démarrage) :

```bash
#!/data/data/com.termux/files/usr/bin/sh
termux-wake-lock
cd ~/wa-gateway
./start.sh > boot.log 2>&1
```

```bash
chmod +x ~/.termux/boot/start-gateway.sh
```

**Adresse qui ne change plus (conseillé)** : crée un tunnel fixe gratuit sur
[dash.cloudflare.com](https://dash.cloudflare.com) (Zero Trust > Networks >
Tunnels, voir `README.md` § Tunnel FIXE), puis renseigne dans le `.env`
du téléphone :

```dotenv
CLOUDFLARE_TOKEN=ton-token-de-tunnel
CLOUDFLARE_HOSTNAME=wa.maboutique.com
```

Avec ça : `WHATSAPP_GATEWAY_URL=https://wa.maboutique.com/send` **pour
toujours** — pannes de courant, redémarrages, tout repart seul, rien à
retoucher côté site.

## Dépannage

- `WhatsApp non connecté` : le jumelage a sauté → relance `./start.sh`,
  nouveau code, re-saisis-le dans WhatsApp.
- Codes non reçus : vérifie `/status` (`connected:true`), le solde data/WiFi,
  et que `WHATSAPP_GATEWAY_URL` côté Laravel pointe bien vers l'adresse
  affichée par le tunnel.
- Le téléphone reste utilisable normalement : WhatsApp continue de marcher
  (la passerelle est juste un « appareil lié », comme WhatsApp Web).
