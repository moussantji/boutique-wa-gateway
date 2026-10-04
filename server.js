// Passerelle WhatsApp 100% gratuite pour la Boutique.
// Le site génère le code OTP, cette passerelle l'envoie depuis TON numéro.
//
// 1. npm install
// 2. GATEWAY_TOKEN=change-moi node server.js   (ou : voir .env.example)
// 3. Scanne le QR affiché (ou ouvre http://localhost:3001/qr) avec WhatsApp :
//    Paramètres > Appareils liés > Lier un appareil.
// 4. Côté Laravel (.env) : WHATSAPP_OTP_DRIVER=gateway
//    + WHATSAPP_GATEWAY_URL=http://127.0.0.1:3001/send (dev)
//    (+ WHATSAPP_GATEWAY_TOKEN=change-moi)
//
// La session est conservée dans ./auth : un seul scan suffit (sauf déconnexion).
import express from 'express';
import makeWASocket, {
    DisconnectReason,
    fetchLatestBaileysVersion,
    useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import fs from 'node:fs';

const PORT = Number(process.env.PORT || 3001);
const TOKEN = process.env.GATEWAY_TOKEN || '';
const PAIR_NUMBER = (process.env.PAIR_NUMBER || '').replace(/\D+/g, '');

// Anti-crash : une erreur interne Baileys/WhatsApp ne doit jamais tuer la
// passerelle (le job GitHub resterait « vert » avec un service mort).
process.on('unhandledRejection', (e) => {
    console.log('Rejet non géré (passerelle maintenue) :', e?.message || e);
});
process.on('uncaughtException', (e) => {
    console.log('Exception non capturée (passerelle maintenue) :', e?.message || e);
});

const app = express();
app.use(express.json({ limit: '256kb' }));

let sock = null;
let connected = false;
let lastQr = null;
let lastQrAt = 0;
let lastPairing = null;
let pairingTimer = null;

function checkToken(req, res, next) {
    if (!TOKEN) return next(); // dev local sans token
    const given =
        req.body?.token ?? req.query?.token ?? req.headers['x-gateway-token'] ?? '';
    if (given !== TOKEN) {
        return res.status(401).json({ sent: false, error: 'bad token' });
    }
    next();
}

async function start() {
    // Au tout premier lancement le dossier n'existe pas encore (ex : CI
    // avec cache vide) : Baileys planterait en écrivant auth/creds.json.
    fs.mkdirSync('./auth', { recursive: true });
    let state;
    let saveCreds;
    try {
        ({ state, saveCreds } = await useMultiFileAuthState('./auth'));
    } catch (e) {
        console.log('Session illisible, on repart de zéro :', e?.message || e);
        try {
            fs.rmSync('./auth', { recursive: true, force: true });
        } catch {}
        fs.mkdirSync('./auth', { recursive: true });
        ({ state, saveCreds } = await useMultiFileAuthState('./auth'));
    }
    let version;
    try {
        ({ version } = await fetchLatestBaileysVersion());
    } catch {
        version = undefined;
    }

    try {
        sock = makeWASocket({
        auth: state,
        version,
        printQRInTerminal: false,
        browser: ['Boutique OTP', 'Chrome', '1.0'],
    });
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (u) => {
        const { connection, lastDisconnect, qr } = u;
        if (qr) {
            lastQr = qr;
            lastQrAt = Date.now();
            console.log('--- Scanne ce QR avec WhatsApp (Appareils liés > Lier un appareil) ---');
            console.log(qr);
            console.log(`--- ou ouvre http://localhost:${PORT}/qr ---`);
        }
        if (connection === 'open') {
            connected = true;
            lastQr = null;
            if (pairingTimer) {
                clearInterval(pairingTimer);
                pairingTimer = null;
            }
            console.log('WhatsApp connecté, prêt à envoyer les codes OTP.');
        }
        if (connection === 'close') {
            connected = false;
            const code = lastDisconnect?.error?.output?.statusCode;
            const loggedOut = code === DisconnectReason.loggedOut;
            console.log(
                loggedOut
                    ? 'Session supprimée côté WhatsApp : supprime ./auth et rescanner le QR.'
                    : 'Connexion perdue, reconnexion...',
            );
            if (loggedOut) {
                try {
                    fs.rmSync('./auth', { recursive: true, force: true });
                } catch {}
            }
            setTimeout(start, loggedOut ? 3000 : 5000);
        }
    });

    // Jumelage par code (pratique sans écran, et code affiché sur /pairing) :
    // le code expire vite (~1 min) donc on le renouvelle toutes les 90 s
    // jusqu'à ce que le numéro soit lié. À saisir dans
    // WhatsApp > Appareils liés > Lier avec un code.
    async function requestPairing() {
        if (!PAIR_NUMBER || !sock || sock.authState.creds.registered) return;
        try {
            const pairingCode = await sock.requestPairingCode(PAIR_NUMBER);
            lastPairing = { code: pairingCode, at: Date.now() };
            console.log(
                `Code de jumelage pour ${PAIR_NUMBER} : ${pairingCode} (renouvelé auto toutes les 90 s)`,
            );
        } catch (e) {
            console.log('Jumelage par code impossible :', e?.message || e);
        }
    }
    if (PAIR_NUMBER && !state.creds.registered) {
        setTimeout(requestPairing, 8000);
        pairingTimer = setInterval(async () => {
            if (connected || sock?.authState?.creds?.registered) {
                if (pairingTimer) clearInterval(pairingTimer);
                return;
            }
            await requestPairing();
        }, 90000);
    }
    } catch (e) {
        console.log('Démarrage socket impossible, nouvel essai dans 10 s :', e?.message || e);
        setTimeout(start, 10000);
    }
}

// Accepte « 22379000000 », « +223... », « 223...@s.whatsapp.net ».
function toJid(to) {
    let d = String(to || '').replace(/\D+/g, '');
    if (d.startsWith('00223')) d = d.slice(2);
    return d + '@s.whatsapp.net';
}

app.get('/status', (req, res) => {
    res.json({ connected, qrAvailable: !!lastQr });
});

// Dernier code de jumelage (protégé par token si configuré) : pratique pour
// le saisir vite depuis le navigateur, sans fouiller les logs.
app.get('/pairing', (req, res) => {
    if (TOKEN) {
        const given = req.query?.token ?? req.headers['x-gateway-token'] ?? '';
        if (given !== TOKEN) {
            return res.status(401).json({ error: 'token requis (?token=...)' });
        }
    }
    if (!lastPairing) {
        return res
            .status(connected ? 410 : 404)
            .json({ error: connected ? 'déjà lié' : 'aucun code pour le moment' });
    }
    res.json({ code: lastPairing.code, at: lastPairing.at, number: PAIR_NUMBER });
});

app.get('/qr', async (req, res) => {
    // Le QR permet de lier TON numéro : protégé par token si configuré
    // (utile quand la passerelle est exposée via tunnel, ex Colab).
    if (TOKEN) {
        const given = req.query?.token ?? req.headers['x-gateway-token'] ?? '';
        if (given !== TOKEN) {
            return res.status(401).json({ error: 'token requis (?token=...)' });
        }
    }
    if (!lastQr) {
        return res
            .status(connected ? 410 : 404)
            .json({ error: connected ? 'déjà connecté' : 'QR pas encore généré, réessaie dans 10 s' });
    }
    try {
        const img = await QRCode.toDataURL(lastQr, { width: 280, margin: 1 });
        res.send(
            `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
                `<body style="font-family:sans-serif;text-align:center;padding:24px">` +
                `<h2>Lier ton numéro WhatsApp</h2>` +
                `<p>WhatsApp > Paramètres > Appareils liés > Lier un appareil</p>` +
                `<img src="${img}" alt="QR WhatsApp"><script>setTimeout(()=>location.reload(),20000)</script>`,
        );
    } catch {
        res.status(500).json({ error: 'QR illisible' });
    }
});

app.post('/send', checkToken, async (req, res) => {
    const { to, body } = req.body || {};
    if (!to || !body) {
        return res.status(422).json({ sent: false, error: 'to/body requis' });
    }
    if (!sock || !connected) {
        return res.status(503).json({ sent: false, error: 'WhatsApp non connecté (scanne le QR)' });
    }
    try {
        const r = await sock.sendMessage(toJid(to), { text: String(body) });
        res.json({ sent: true, id: r?.key?.id || null });
    } catch (e) {
        res.status(502).json({ sent: false, error: String(e?.message || e) });
    }
});

app.listen(PORT, () => {
    console.log(`Passerelle OTP : http://localhost:${PORT}  (/status, /qr, POST /send)`);
    start();
});
