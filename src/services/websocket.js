import { ref, readonly } from 'vue';
import { getWebSocketUrl } from './urls.js';

/**
 * WebSocket service for real-time share room communication.
 * Handles guest tracking, channel switching, and danmaku messages.
 */

let ws = null;
let reconnectTimer = null;
let heartbeatTimer = null;
const RECONNECT_DELAY = 3000;
const HEARTBEAT_INTERVAL = 30000;

const connected = ref(false);
const guestCount = ref(0);
const guestNames = ref([]);

// Event callbacks
let onChannelChange = null;
let onDanmaku = null;
let onShareStopped = null;
let onGuestUpdate = null;

function connect(shareId, name, role = 'guest') {
    disconnect(); // Clean up any existing connection

    const baseUrl = getWebSocketUrl();
    const url = `${baseUrl}?shareId=${encodeURIComponent(shareId)}&name=${encodeURIComponent(name)}&role=${role}`;

    console.log(`[WS] Connecting to ${url}`);

    ws = new WebSocket(url);

    ws.onopen = () => {
        console.log('[WS] Connected');
        connected.value = true;
        startHeartbeat();
    };

    ws.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);
            
            switch (msg.type) {
                case 'guest-update':
                    guestCount.value = msg.count;
                    guestNames.value = msg.guests || [];
                    if (onGuestUpdate) onGuestUpdate(msg.count, msg.guests || []);
                    break;
                
                case 'channel-change':
                    console.log('[WS] Channel change:', msg.channelName);
                    if (onChannelChange) onChannelChange(msg);
                    break;
                
                case 'danmaku':
                    if (onDanmaku) onDanmaku(msg);
                    break;
                
                case 'share-stopped':
                    console.log('[WS] Share stopped by owner');
                    if (onShareStopped) onShareStopped();
                    break;
                
                case 'share-state':
                    // Initial state when connecting - treat as channel-change for guests
                    console.log('[WS] Received share state:', msg.channelName);
                    break;
            }
        } catch (err) {
            console.error('[WS] Error parsing message:', err);
        }
    };

    ws.onclose = (event) => {
        console.log(`[WS] Disconnected (code: ${event.code}, reason: ${event.reason})`);
        connected.value = false;
        stopHeartbeat();
        
        // Don't reconnect if share was intentionally stopped or closed
        if (event.code !== 4000 && event.code !== 4001 && event.code !== 4002 && event.code !== 1000) {
            scheduleReconnect(shareId, name, role);
        }
    };

    ws.onerror = (err) => {
        console.error('[WS] Error:', err);
    };
}

function disconnect() {
    clearReconnect();
    stopHeartbeat();
    
    if (ws) {
        ws.onclose = null; // Prevent reconnect loop
        ws.close(1000, 'Intentional disconnect');
        ws = null;
    }
    connected.value = false;
    guestCount.value = 0;
    guestNames.value = [];
}

function send(message) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
    }
}

function sendChannelChange(streamId, channelName, channelLogo) {
    send({
        type: 'channel-change',
        streamId,
        channelName,
        channelLogo
    });
}

function sendDanmaku(text, color = '#FFFFFF') {
    send({
        type: 'danmaku',
        text,
        color
    });
}

function scheduleReconnect(shareId, name, role) {
    clearReconnect();
    reconnectTimer = setTimeout(() => {
        console.log('[WS] Attempting reconnect...');
        connect(shareId, name, role);
    }, RECONNECT_DELAY);
}

function clearReconnect() {
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
}

function startHeartbeat() {
    stopHeartbeat();
    heartbeatTimer = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
        }
    }, HEARTBEAT_INTERVAL);
}

function stopHeartbeat() {
    if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
    }
}

// Register event handlers
function onChannelChangeHandler(handler) {
    onChannelChange = handler;
}

function onDanmakuHandler(handler) {
    onDanmaku = handler;
}

function onShareStoppedHandler(handler) {
    onShareStopped = handler;
}

function onGuestUpdateHandler(handler) {
    onGuestUpdate = handler;
}

export const wsService = {
    connect,
    disconnect,
    send,
    sendChannelChange,
    sendDanmaku,
    connected: readonly(connected),
    guestCount: readonly(guestCount),
    guestNames: readonly(guestNames),
    onChannelChange: onChannelChangeHandler,
    onDanmaku: onDanmakuHandler,
    onShareStopped: onShareStoppedHandler,
    onGuestUpdate: onGuestUpdateHandler
};
