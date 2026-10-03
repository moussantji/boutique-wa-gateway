# 🤖 Passerelle OTP en pilote automatique (GitHub, 0 F, sans appareil allumé)

GitHub **relance la passerelle toute seule toutes les 4 h**, avec :
- la **session WhatsApp conservée** (un seul jumelage au début),
- une **adresse publique fixe** (tunnel Cloudflare nommé) : rien à retoucher
  côté Laravel après le setup.

**Coût : 0 F** (comptes gratuits, sans carte bancaire).
**Inconvénient honnête** : micro-coupure de ~2-5 min à chaque relance
(6×/jour). Si un client demande un code pile à ce moment, il voit
« Réessayez » et touche **Renvoyer le code** — couvert par le site.

## Prérequis (comptes gratuits)

1. Compte **GitHub** : https://github.com/signup
2. Compte **Cloudflare** : https://dash.cloudflare.com/sign-up
3. Ton **nom de domaine** (celui de la boutique) + accès à sa **zone DNS chez
   LWS** (pour ajouter une ligne CNAME — tes nameservers ne bougent pas).

## Étape 1 — Cloudflare SANS déplacer tes DNS (5 min)

Tes nameservers restent chez LWS : tu ajoutes juste **une ligne CNAME**.

1. Compte gratuit sur https://dash.cloudflare.com/sign-up, puis **Add a website**
   > ton domaine > plan **Free**. Quand Cloudflare demande de changer les
   nameservers : **ignore** (la zone restera « pending », c'est normal ici).
2. Barre latérale **Zero Trust > Networks > Tunnels > Create a tunnel** >
   type **Cloudflared**, nom ex `boutique-otp` > **copie le TOKEN** affiché
   (long texte) — garde-le pour l'étape 3.
3. Dans le tunnel : **Public Hostnames > Add** : sous-domaine `wa`
   (donne `wa.tondomaine.com`), service `http://localhost:3001` > Save.
   **Note aussi le Tunnel ID** (UUID, ex `a1b2c3d4-...`, visible sur la page
   du tunnel) — il sert juste après.
4. Chez **LWS** (panneau de ton domaine > Zone DNS) : ajoute
   `CNAME | wa | <Tunnel-ID>.cfargotunnel.com` (remplace `<Tunnel-ID>` par
   l'UUID noté ; TTL auto/défaut).
5. Attends la propagation DNS (5 min à 2 h). Tu testeras avec
   `https://wa.tondomaine.com/status` une fois la passerelle lancée (étape 3).

> ⚠️ Si tu obtiens une erreur Cloudflare (ex : 1016), un certificat HTTPS
> invalide, ou si le dashboard refuse le hostname : c'est la limite du plan
> gratuit sans nameservers. **Plan B (toujours gratuit)** : changer les
> nameservers pour ceux de Cloudflare — dis-le-moi, je te guide, ça prend
> 10 min et ne coupe pas le site.

## Étape 2 — Repo GitHub PUBLIC (5 min)

> ⚠️ **Obligatoirement PUBLIC** : c'est ce qui rend les minutes Actions
> illimitées (un repo privé n'aurait que ~33 h/mois, insuffisant).
> Le code de la passerelle ne contient **aucun secret** (jetons dans les
> Secrets GitHub, masqués dans les logs) : aucun risque à le rendre public.

1. GitHub > **New repository** : nom ex `boutique-wa-gateway`, **Public**,
   sans README.
2. **Add file > Upload files** : dépose **uniquement** ces 4 fichiers
   (glisser-déposer depuis ton PC) :
   - `server.js`
   - `package.json`
   - `package-lock.json` (obligatoire : le workflow fait `npm ci`)
   - `.github/workflows/wa-gateway.yml` (recrée les dossiers `.github/workflows`
     via *Add file > Create new file* en tapant le chemin complet, puis colle
     le contenu)
   
   ⛔ N'envoie JAMAIS : `node_modules/`, `auth/`, `.env`, les logs.
3. **Settings > Secrets and variables > Actions** :
   - **Secrets** (`New repository secret`) :
     - `GATEWAY_TOKEN` = un jeton long que tu inventes (le même que côté Laravel)
     - `CLOUDFLARE_TOKEN` = le token copié à l'étape 1
   - **Variables** (`Variables` tab) :
     - `PAIR_NUMBER` = `22382019583` (ton numéro, sans `+`)

## Étape 3 — Premier lancement + jumelage (5 min)

1. Onglet **Actions** > *Passerelle OTP WhatsApp* > **Run workflow** > Run.
2. Ouvre l'exécution > job *passerelle* > étape *Démarrer la passerelle* :
   cherche la ligne `Code de jumelage pour 22382019583 : XXXX-XXXX`
   (ou télécharge l'artifact `logs-N` en bas de la page).
3. Dans WhatsApp sur ton téléphone : **Paramètres > Appareils liés >
   Lier avec un code** > saisis le code.
4. L'étape affiche ensuite `"connected":true` : la passerelle envoie
   désormais les codes depuis ton numéro. ✅

## Étape 4 — Brancher le site (2 min, une fois)

`.env` Laravel (adresse **fixe**, ne changera plus jamais) :

```dotenv
WHATSAPP_OTP_DRIVER=gateway
WHATSAPP_GATEWAY_URL=https://wa.tondomaine.com/send
WHATSAPP_GATEWAY_TOKEN=le-meme-jeton-que-GATEWAY_TOKEN
```

puis `php artisan config:cache`. Teste avec une vraie demande de code.

## Ensuite : tout seul

- GitHub relance la passerelle **toutes les 4 h** (cron) : la session est
  restaurée, le tunnel garde la même adresse. Tu n'as rien à faire.
- Si WhatsApp dissocie l'appareil un jour (rare) : relance manuelle
  (*Run workflow*), nouveau code dans les logs, re-saisis-le. C'est tout.

## Dépannage

- **Onglet Actions vide / rien ne tourne** : vérifie que le repo est bien
  **Public** et que le workflow n'est pas désactivé
  (Actions > *...* > *Disable/Enable workflow*).
- **Codes non reçus** : ouvre la dernière exécution, vérifie `"connected":true`
  dans *Démarrer la passerelle*. Sinon : token Cloudflare invalide ou tunnel
  mal configuré (revois l'étape 1).
- **`Envoi WhatsApp refusé`** côté site pendant 2-5 min : relance de cycle en
  cours — le client touche *Renvoyer le code*, ça repart.
- **On te redemande un jumelage souvent** : les serveurs GitHub changent de
  pays à chaque cycle, WhatsApp peut tiquer. Si ça arrive plus d'1×/mois,
  préviens-moi : on durcira (ou on basculera sur l'option téléphone/PC).

## Limites assumées

- Repo **public** obligatoire (code visible — mais aucun secret dedans).
- Micro-coupures à chaque cycle (~2-5 min, 6×/jour).
- Protocole non officiel : risque de restriction du numéro faible pour des
  OTP sollicités, mais réel — numéro dédié conseillé si possible.