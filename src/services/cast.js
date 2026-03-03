/**
 * Chromecast & AirPlay casting service
 * 
 * Chromecast uses the Google Cast SDK with the Default Media Receiver.
 * AirPlay is handled natively via WebKit's playback target API.
 */

import { ref } from 'vue';

// Reactive state
export const castAvailable = ref(false);
export const isCasting = ref(false);
export const airplayAvailable = ref(false);

let castSession = null;
let castContext = null;

/**
 * Initialize the Google Cast SDK.
 * Must be called after the Cast SDK script has loaded.
 */
export function initCast() {
    // Wait for the Cast API to be available
    const initWhenReady = () => {
        if (!window.chrome?.cast || !window.cast?.framework) {
            return;
        }

        try {
            castContext = cast.framework.CastContext.getInstance();
            castContext.setOptions({
                receiverApplicationId: chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
                autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED
            });

            // Listen for cast state changes
            castContext.addEventListener(
                cast.framework.CastContextEventType.CAST_STATE_CHANGED,
                (event) => {
                    const state = event.castState;
                    castAvailable.value = state !== cast.framework.CastState.NO_DEVICES_AVAILABLE;
                    isCasting.value = state === cast.framework.CastState.CONNECTED;

                    if (state === cast.framework.CastState.NOT_CONNECTED) {
                        castSession = null;
                    }
                    console.log('[Cast] State changed:', state);
                }
            );

            // Listen for session changes
            castContext.addEventListener(
                cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
                (event) => {
                    console.log('[Cast] Session state:', event.sessionState);
                    if (event.sessionState === cast.framework.SessionState.SESSION_ENDED) {
                        isCasting.value = false;
                        castSession = null;
                    }
                }
            );

            console.log('[Cast] Google Cast SDK initialized');
        } catch (err) {
            console.warn('[Cast] Failed to initialize Cast SDK:', err);
        }
    };

    // The Cast SDK fires __onGCastApiAvailable when ready
    if (window.__onGCastApiAvailable) {
        // Already set by someone else, chain it
        const existing = window.__onGCastApiAvailable;
        window['__onGCastApiAvailable'] = (isAvailable) => {
            existing(isAvailable);
            if (isAvailable) initWhenReady();
        };
    } else {
        window['__onGCastApiAvailable'] = (isAvailable) => {
            if (isAvailable) initWhenReady();
        };
    }

    // If the SDK already loaded before we set the callback
    if (window.chrome?.cast && window.cast?.framework) {
        initWhenReady();
    }
}

/**
 * Start or request a Cast session and load media.
 * @param {string} mediaUrl - The HLS URL to cast
 * @param {string} [title] - Media title (channel name)
 * @param {string} [imageUrl] - Thumbnail/logo URL
 */
export async function startCastSession(mediaUrl, title, imageUrl) {
    if (!castContext) {
        console.warn('[Cast] Cast SDK not initialized');
        return;
    }

    try {
        // If not connected, request a session (shows device picker)
        if (!isCasting.value) {
            await castContext.requestSession();
        }

        castSession = castContext.getCurrentSession();
        if (!castSession) {
            console.warn('[Cast] No cast session available');
            return;
        }

        const mediaInfo = new chrome.cast.media.MediaInfo(mediaUrl, 'application/x-mpegURL');
        mediaInfo.streamType = chrome.cast.media.StreamType.LIVE;
        
        // HLS-specific settings for Chromecast compatibility
        mediaInfo.hlsSegmentFormat = chrome.cast.media.HlsSegmentFormat.TS;
        mediaInfo.hlsVideoSegmentFormat = chrome.cast.media.HlsVideoSegmentFormat.MPEG2_TS;
        
        mediaInfo.metadata = new chrome.cast.media.GenericMediaMetadata();
        mediaInfo.metadata.title = title || 'ViTV Stream';
        if (imageUrl) {
            mediaInfo.metadata.images = [new chrome.cast.Image(imageUrl)];
        }

        const request = new chrome.cast.media.LoadRequest(mediaInfo);
        request.autoplay = true;

        await castSession.loadMedia(request);
        isCasting.value = true;
        console.log('[Cast] Media loaded on Chromecast:', title);
        
        // Monitor media session for errors
        const mediaSession = castSession.getMediaSession();
        if (mediaSession) {
            mediaSession.addUpdateListener((isAlive) => {
                if (!isAlive) {
                    console.warn('[Cast] Media session ended');
                    return;
                }
                const status = mediaSession.playerState;
                console.log('[Cast] Player state:', status);
                if (mediaSession.media) {
                    console.log('[Cast] Media status - streamType:', mediaSession.media.streamType,
                        'contentType:', mediaSession.media.contentType,
                        'duration:', mediaSession.media.duration);
                }
            });
        }
    } catch (err) {
        console.error('[Cast] Error starting cast:', err);
        if (err.code) console.error('[Cast] Error code:', err.code, 'description:', err.description);
        // User cancelled the dialog or error occurred
        if (err.code === 'cancel') {
            console.log('[Cast] User cancelled cast dialog');
        }
    }
}

/**
 * Stop the current Cast session.
 */
export function stopCastSession() {
    if (castContext) {
        const session = castContext.getCurrentSession();
        if (session) {
            session.endSession(true);
        }
    }
    isCasting.value = false;
    castSession = null;
    console.log('[Cast] Session stopped');
}

/**
 * Check if AirPlay is available (Safari/WebKit only).
 * @param {HTMLVideoElement} videoEl - The video element to check
 */
export function checkAirPlaySupport(videoEl) {
    if (!videoEl) return;

    // WebKit AirPlay availability
    if (typeof videoEl.webkitShowPlaybackTargetPicker === 'function') {
        // Listen for AirPlay availability changes
        videoEl.addEventListener('webkitplaybacktargetavailabilitychanged', (event) => {
            airplayAvailable.value = event.availability === 'available';
            console.log('[AirPlay] Availability:', event.availability);
        });
        // Also set initial state — assume available if the API exists (Safari)
        airplayAvailable.value = true;
    }
}

/**
 * Show the AirPlay device picker.
 * @param {HTMLVideoElement} videoEl - The video element
 */
export function requestAirPlay(videoEl) {
    if (videoEl && typeof videoEl.webkitShowPlaybackTargetPicker === 'function') {
        videoEl.webkitShowPlaybackTargetPicker();
    }
}
