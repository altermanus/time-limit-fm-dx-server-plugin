(() => {
    'use strict';

    // -----------------------------------------------------------------------
    // Admin ellenőrzés – ha be van jelentkezve, nincs limit
    // -----------------------------------------------------------------------
    function isAdminUser() {
        // Bejelentkezett admin: van logout link az oldalon
        if (document.querySelector('.logout-link')) return true;
        if (window.loggedIn === true) return true;
        if (window.isAdmin === true) return true;
        return false;
    }

    // -----------------------------------------------------------------------
    // CSS
    // -----------------------------------------------------------------------
    const STYLES = `
        #tl-widget {
            position: fixed;
            top: 70px;
            right: 12px;
            z-index: 9000;
            background: #1a1a2e;
            border: 1px solid #333;
            border-radius: 6px;
            padding: 8px 14px;
            text-align: center;
            box-shadow: 0 2px 8px rgba(0,0,0,0.5);
            font-family: 'Consolas', 'Courier New', monospace;
            user-select: none;
            min-width: 110px;
            transition: border-color 0.3s;
        }
        #tl-widget.warn     { border-color: #e67e22 !important; }
        #tl-widget.critical { border-color: #e74c3c !important; animation: tl-pulse 1s infinite; }
        @keyframes tl-pulse {
            0%, 100% { box-shadow: 0 2px 8px rgba(231,76,60,0.3); }
            50%       { box-shadow: 0 2px 16px rgba(231,76,60,0.8); }
        }
        #tl-title           { font-size: 9px; letter-spacing: 2px; text-transform: uppercase; color: #666; margin-bottom: 3px; }
        #tl-value           { font-size: 20px; font-weight: bold; color: #e0e0e0; line-height: 1.1; }
        #tl-widget.warn     #tl-value { color: #e67e22; }
        #tl-widget.critical #tl-value { color: #e74c3c; }
        #tl-sub             { font-size: 9px; color: #555; margin-top: 3px; }

        #tl-overlay {
            display: none;
            position: fixed;
            inset: 0;
            z-index: 999999;
            background: rgba(0,0,0,0.96);
            flex-direction: column;
            align-items: center;
            justify-content: center;
            font-family: 'Consolas', 'Courier New', monospace;
            color: #e0e0e0;
            text-align: center;
        }
        #tl-overlay.visible { display: flex; }
        #tl-overlay-icon    { font-size: 56px; margin-bottom: 18px; }
        #tl-overlay-title   { font-size: 26px; font-weight: bold; color: #e74c3c; margin-bottom: 10px; }
        #tl-overlay-msg     { font-size: 13px; color: #888; line-height: 1.7; margin-bottom: 24px; }
        #tl-overlay-counter { font-size: 12px; color: #555; }
    `;

    function injectStyles() {
        const s = document.createElement('style');
        s.textContent = STYLES;
        document.head.appendChild(s);
    }

    function createWidget() {
        const w = document.createElement('div');
        w.id = 'tl-widget';
        w.innerHTML = `
            <div id="tl-title">Session</div>
            <div id="tl-value">--:--</div>
            <div id="tl-sub">remaining</div>
        `;
        document.body.appendChild(w);

        const o = document.createElement('div');
        o.id = 'tl-overlay';
        o.innerHTML = `
            <div id="tl-overlay-icon">⏱</div>
            <div id="tl-overlay-title">Session Expired</div>
            <div id="tl-overlay-msg">
                Your session time has expired.<br>
                You have been disconnected from the server.
            </div>
            <div id="tl-overlay-counter">Redirecting in <span id="tl-countdown">5</span> seconds...</div>
        `;
        document.body.appendChild(o);

        return {
            widget:    w,
            value:     document.getElementById('tl-value'),
            overlay:   o,
            countdown: document.getElementById('tl-countdown'),
        };
    }

    function formatTime(secs) {
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        return String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
    }

    function kickUser(els, blockRemaining) {
        els.widget.style.display = 'none';
        els.overlay.classList.add('visible');

        // Audio stream leállítása
        try { if (typeof window.destroyStream === 'function') window.destroyStream(); } catch(e) {}
        try { if (window._3LAS) window._3LAS = null; } catch(e) {}
        try { if (typeof window.audioStreamRestartInterval !== 'undefined') {
            clearInterval(window.audioStreamRestartInterval);
            window.audioStreamRestartInterval = null;
        }} catch(e) {}
        // WebSocket kapcsolat lezárása
        try { if (window.socket?.readyState === 1) window.socket.close(1000, 'Session expired'); } catch(e) {}

        // Visszaszámláló – mikor lehet visszajönni
        let remaining = blockRemaining || 0;

        function updateCounter() {
            if (remaining <= 0) {
                els.countdown.textContent = 'You can now reconnect. Please refresh the page.';
                return;
            }
            const m = Math.floor(remaining / 60);
            const s = remaining % 60;
            els.countdown.textContent = 'You can reconnect in ' +
                String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
            remaining--;
            setTimeout(updateCounter, 1000);
        }
        updateCounter();
    }

    function updateWidget(els, remaining) {
        els.value.textContent = formatTime(remaining);
        if (remaining <= 10)  els.widget.className = 'critical';
        else if (remaining <= 60) els.widget.className = 'warn';
        else els.widget.className = '';
    }

    // -----------------------------------------------------------------------
    // WebSocket a szerver oldali plugin-nel
    // -----------------------------------------------------------------------
    function startSession(els) {
        const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const pathname   = location.pathname.endsWith('/') ? location.pathname : location.pathname + '/';
        const wsUrl      = `${wsProtocol}//${location.host}${pathname}data_plugins`;

        let ws;
        let localRemaining = null;
        let localTimer = null;

        function connect() {
            ws = new WebSocket(wsUrl);

            ws.onopen = () => {
                // Admin státusz küldése
                ws.send(JSON.stringify({
                    type: 'TimeLimit_Auth',
                    value: { isAdmin: isAdminUser() }
                }));

                // Állapot lekérése
                ws.send(JSON.stringify({ type: 'TimeLimit_Check' }));
            };

            ws.onmessage = (e) => {
                try {
                    const msg = JSON.parse(e.data);

                    if (msg.type === 'TimeLimit_Status') {
                        if (msg.exempt) {
                            // Admin – widget elrejtése
                            els.widget.style.display = 'none';
                            return;
                        }

                        localRemaining = msg.remaining;
                        updateWidget(els, localRemaining);

                        // Helyi visszaszámláló a következő szerver-pollozásig
                        if (localTimer) clearInterval(localTimer);
                        localTimer = setInterval(() => {
                            if (localRemaining <= 0) {
                                clearInterval(localTimer);
                                return;
                            }
                            localRemaining--;
                            updateWidget(els, localRemaining);
                        }, 1000);
                    }

                    if (msg.type === 'TimeLimit_Kicked') {
                        if (localTimer) clearInterval(localTimer);
                        kickUser(els, msg.blockRemaining);
                    }
                } catch(e) {}
            };

            ws.onclose = () => setTimeout(connect, 3000);
        }

        connect();

        // 30 másodpercenként szinkronizál a szerver oldallal
        setInterval(() => {
            if (ws?.readyState === 1) {
                ws.send(JSON.stringify({ type: 'TimeLimit_Check' }));
            }
        }, 30000);
    }

    // -----------------------------------------------------------------------
    // Inicializálás
    // -----------------------------------------------------------------------
    function init() {
        injectStyles();
        const els = createWidget();

        // Kis késleltetés hogy a webszerver JS betölthessen
        setTimeout(() => {
            if (isAdminUser()) {
                els.widget.style.display = 'none';
                return;
            }
            startSession(els);
        }, 1500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
