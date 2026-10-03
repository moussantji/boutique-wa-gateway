# Passerelle WhatsApp 100 % gratuite (ton numéro)

Envoie les codes OTP du site **depuis ton propre numéro WhatsApp**, sans
payer ni Meta ni une passerelle externe. Logiciel libre (Baileys), coût 0 F.

**Quatre façons de l'héberger (au choix) :**
- **A. Pilote automatique GitHub (recommandé si aucun appareil dispo)** : voir
  **`GITHUB_ACTIONS.md`** — GitHub relance la passerelle toute seule toutes
  les 4 h, session conservée, adresse fixe. 0 F, sans carte, sans appareil allumé.
- **B. Smartphone Android (0 F, 24h/24)** : voir **`TERMUX.md`**
  (téléphone branché + Termux + jumelage par code, redémarrage auto au boot).
- **C. Google Colab (gratuit, relance ~1/jour)** : ouvre
  **`Boutique_OTP_Colab.ipynb`** dans Colab et exécute les cellules — tout
  est automatisé (Node, tunnel public, QR affiché dans le notebook, session
  gardée sur Drive). Gratuit, session ~12 h max, onglet à garder ouvert.
- **D. Machine à toi** (PC, Raspberry...) : voir §1 ci-dessous.

## Principe

```
[Site Laravel] --POST /send {to, body, token}--> [cette passerelle] --WhatsApp--> [client]
```

## 1. Lancer 24h/24 SANS relance (machine à toi, 0 F/mois) ⭐

C'est ça qui évite les relances quotidiennes de Colab : un PC à toi allumé
en permanence (vieux portable branché, PC du bureau... — l'écran peut
s'éteindre, mais pas de mise en veille).

```bash
cp .env.example .env   # puis mets ton GATEWAY_TOKEN (+ tunnel fixe, voir plus bas)
./start.sh             # Linux (installe tout, lance passerelle + tunnel, affiche l'URL)
```

Windows : `powershell -ExecutionPolicy Bypass -File start.ps1`
(même chose : Node → passerelle → tunnel → URL affichée).

**Démarrage auto au boot :**
- Linux : `npm i -g pm2 && pm2 startup` (le script utilise pm2 tout seul s'il existe).
- Windows : `Win+R > shell:startup` > clic droit > Nouveau raccourci vers `start.ps1`.
- Le scan QR n'est à faire **qu'une fois** (session dans `./auth/`).

Avec le **tunnel fixe** (voir plus bas), l'adresse ne change jamais : tu ne
touches plus jamais ni au script ni au `.env` Laravel. Zéro relance. 0 F.

## 2. Lancer sur Google Colab (gratuit, relance ~1/jour)

## 2. Lancer sur Google Colab (gratuit, relance ~1/jour)

Ouvre **`Boutique_OTP_Colab.ipynb`** dans Colab et exécute les cellules :
Node + tunnel + QR affiché dans le notebook + session gardée sur Drive.
Rappel : onglet ouvert, ~12 h max par session (limite Google, pas de solution
gratuite pour l'éviter — voir §1 pour zéro relance).

```bash
cd wa-gateway
npm install
cp .env.example .env   # puis mets un vrai GATEWAY_TOKEN
npm start
```

## 2. Lier ton numéro (une seule fois)

- Scanne le QR affiché dans le terminal (ou ouvre `http://localhost:3001/qr`)
  avec WhatsApp : **Paramètres > Appareils liés > Lier un appareil**.
- Alternative sans écran : `PAIR_NUMBER=22382019583` dans `.env`, le code de
  jumelage s'affiche dans le terminal.
- La session est gardée dans `./auth/` : pas besoin de rescanner au redémarrage
  (sauf si tu dissocies l'appareil côté WhatsApp).

## 3. Brancher le site

`.env` de Laravel :

```dotenv
WHATSAPP_OTP_DRIVER=gateway
WHATSAPP_GATEWAY_URL=http://127.0.0.1:3001/send   # dev (même machine)
WHATSAPP_GATEWAY_FORMAT=json
WHATSAPP_GATEWAY_TO=to
WHATSAPP_GATEWAY_TEXT=body
WHATSAPP_GATEWAY_TOKEN=le-meme-jeton-que-GATEWAY_TOKEN
```

## 4. Production (site sur LWS, passerelle chez toi)

Le site (LWS) doit joindre ta machine : expose la passerelle avec un tunnel
gratuit [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) :

```bash
cloudflared tunnel --url http://localhost:3001
# => https://xxxx.trycloudflare.com  (ou un domaine fixe, gratuit)
```

puis côté Laravel : `WHATSAPP_GATEWAY_URL=https://xxxx.../send`
(+ `GATEWAY_TOKEN` **obligatoire**, c'est exposé sur internet).

Pour le redémarrage auto : `pm2 start server.js --name wa-gateway` (+ `pm2 startup`).

## Tunnel FIXE (adresse qui ne change plus, gratuit)

Par défaut le tunnel Cloudflare change d'adresse à chaque lancement (il faut
mettre à jour `WHATSAPP_GATEWAY_URL`). Pour une adresse **stable et gratuite** :

1. Crée un compte gratuit sur [dash.cloudflare.com](https://dash.cloudflare.com).
2. Va dans **Zero Trust > Networks > Tunnels > Create a tunnel** (type
   Cloudflared), donne-lui un nom, copie le **token** affiché.
3. Ajoute un hostname public, ex `wa.maboutique.com` → service
   `http://localhost:3001` (le domaine doit utiliser les DNS Cloudflare,
   gratuit aussi).
4. Dans le notebook : renseigne `CLOUDFLARE_TOKEN` + `CLOUDFLARE_HOSTNAME`
   (ou `cloudflared tunnel --no-autoupdate run --token ...` en local).

Résultat : `WHATSAPP_GATEWAY_URL=https://wa.maboutique.com/send` **pour
toujours** — les relances Colab ne touchent plus au `.env`.

## Endpoints

- `GET /status` → `{ connected, qrAvailable }` (supervision)
- `GET /qr` → page du QR à scanner
- `POST /send` `{ to: "2237...", body: "...", token: "..." }`
  → `{ sent: true, id }` ou `{ sent: false, error }` (401/422/502/503)

## Avertissements honnêtes

- Protocole **non officiel** : WhatsApp peut restreindre/bannir un numéro qui
  spamme. Ici on n'envoie que des **codes OTP attendus par le client**
  (faible volume, sollicité) : risque faible, mais **préfère un numéro
  dédié** au business plutôt que ton numéro perso si possible.
- Si WhatsApp change son protocole, une mise à jour (`npm update`) peut être
  nécessaire.
