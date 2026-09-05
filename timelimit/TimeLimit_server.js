const { logInfo, logWarn, logError } = require('../../server/console');

let pluginsApi, serverConfig, pluginsWss;

try {
    pluginsApi   = require('../../server/plugins_api');
    serverConfig = pluginsApi.getServerConfig?.();
    pluginsWss   = pluginsApi.getPluginsWss?.();
} catch (e) {
    logWarn('[TimeLimit] ERROR: Unable to link server components.');
}

if (!serverConfig) serverConfig = require('../../config.json');

// Beállítások
const LIMIT_MINUTES = 10;    // időlimit percben
const BLOCK_MINUTES = 60;   // blokkolás lejárat után

// ip → { connectedAt, blockedUntil }
const sessions = new Map();

function getIp(req) {
    return req.headers['x-forwarded-for']?.split(',')[0].trim()
        || req.socket?.remoteAddress
        || 'unknown';
}

if (pluginsWss) {
    pluginsWss.on('connection', (ws, req) => {
        const ip  = getIp(req);
        const now = Date.now();
        let isAdmin = false;

        // Session kezelés csatlakozáskor
        const existing = sessions.get(ip);

        if (existing?.blockedUntil && now < existing.blockedUntil) {
            // Blokkolt IP – nem csinálunk semmit, a Check üzenetre válaszolunk
            logWarn(`[TimeLimit] Blocked IP connected - IP: ${ip}`);
        } else if (!existing || existing.blockedUntil) {
            // Új vagy lejárt blokk – friss session
            sessions.set(ip, { connectedAt: now, blockedUntil: null });
            logInfo(`[TimeLimit] New session - IP: ${ip} (limit: ${LIMIT_MINUTES} min)`);
        }
        // Ha van aktív session, NEM indítjuk újra – az oldal frissítésekor megmarad

        ws.on('message', (data) => {
            try {
                const msg = JSON.parse(data.toString());

                if (msg.type === 'TimeLimit_Auth') {
                    if (msg.value?.isAdmin) {
                        isAdmin = true;
                        logInfo(`[TimeLimit] Admin identified - IP: ${ip}`);
                    }
                    return;
                }

                if (msg.type === 'TimeLimit_Check') {
                    if (isAdmin) {
                        ws.send(JSON.stringify({ type: 'TimeLimit_Status', exempt: true }));
                        return;
                    }

                    const s   = sessions.get(ip);
                    const now2 = Date.now();

                    // Blokkolt?
                    if (s?.blockedUntil && now2 < s.blockedUntil) {
                        const blockRemaining = Math.ceil((s.blockedUntil - now2) / 1000);
                        ws.send(JSON.stringify({ type: 'TimeLimit_Kicked', blockRemaining }));
                        return;
                    }

                    // Hátralévő idő
                    const elapsed   = Math.floor((now2 - s.connectedAt) / 1000);
                    const limitSecs = LIMIT_MINUTES * 60;
                    const remaining = limitSecs - elapsed;

                    if (remaining <= 0) {
                        s.blockedUntil = now2 + BLOCK_MINUTES * 60 * 1000;
                        sessions.set(ip, s);
                        logInfo(`[TimeLimit] Session expired - IP: ${ip} (blocked ${BLOCK_MINUTES} min)`);
                        ws.send(JSON.stringify({ type: 'TimeLimit_Kicked', blockRemaining: BLOCK_MINUTES * 60 }));
                    } else {
                        ws.send(JSON.stringify({ type: 'TimeLimit_Status', remaining, exempt: false }));
                    }
                }
            } catch (e) {}
        });
    });

    logInfo(`[TimeLimit] Server plugin loaded. Limit: ${LIMIT_MINUTES} min, Block: ${BLOCK_MINUTES} min.`);
}

module.exports = {};
