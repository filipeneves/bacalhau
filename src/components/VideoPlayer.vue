<template>
    <v-container ref="containerElement" fluid class="pa-0 fill-height video-container" @mousemove="showControls" @mouseleave="hideControlsDelayed">
        <v-row>
            <v-col cols="12">
                <video ref="videoElement" v-if="videoKey" :key="videoKey" 
                    :controls="!isLiveStream"
                    x-webkit-airplay="allow"
                    class="video-player" :class="{ 'live-stream': isLiveStream }"
                    @click="togglePlay"></video>
                
                <!-- Codec support warning -->
                <div v-if="codecWarning" class="codec-warning">
                    <v-icon color="warning" class="mr-2">mdi-alert</v-icon>
                    <div class="codec-warning-text">
                        <strong>H.264 codec not supported</strong>
                        <p>Your browser does not support H.264 video via MediaSource Extensions. Video playback will not work.</p>
                        <p v-if="isChromium">Install the codec package: <code>sudo apt install chromium-codecs-ffmpeg-extra</code> and restart your browser.</p>
                        <p v-else>Try using Chrome or Firefox instead.</p>
                    </div>
                    <v-btn icon variant="text" size="x-small" @click="codecWarning = false" class="ml-2">
                        <v-icon>mdi-close</v-icon>
                    </v-btn>
                </div>
                
                <!-- Danmaku overlay (only when sharing) -->
                <DanmakuOverlay
                    v-if="isSharing"
                    ref="danmakuRef"
                    :isMobile="false"
                    @send="handleDanmakuSend"
                />
                
                <!-- Custom controls for live streams (no seek bar) -->
                <div v-if="isLiveStream" class="custom-controls" :class="{ 'visible': controlsVisible }">
                    <div class="controls-left">
                        <v-btn icon variant="text" size="small" @click="togglePlay">
                            <v-icon>{{ isPlaying ? 'mdi-pause' : 'mdi-play' }}</v-icon>
                        </v-btn>
                        <v-btn icon variant="text" size="small" @click="toggleMute">
                            <v-icon>{{ isMuted ? 'mdi-volume-off' : 'mdi-volume-high' }}</v-icon>
                        </v-btn>
                        <input type="range" min="0" max="1" step="0.1" :value="volume" 
                            @input="setVolume($event.target.value)" class="volume-slider" />
                        <span class="live-badge">LIVE</span>
                    </div>
                    <div class="controls-right">
                        <v-btn v-if="airplayAvailable" icon variant="text" size="small" @click="requestAirPlay" title="AirPlay">
                            <v-icon>mdi-apple-airplay</v-icon>
                        </v-btn>
                        <v-btn v-if="castAvailable" icon variant="text" size="small" @click="startCast" title="Cast to Chromecast">
                            <v-icon>{{ isCasting ? 'mdi-cast-connected' : 'mdi-cast' }}</v-icon>
                        </v-btn>
                        <v-btn icon variant="text" size="small" @click="toggleFullscreen">
                            <v-icon>{{ isFullscreen ? 'mdi-fullscreen-exit' : 'mdi-fullscreen' }}</v-icon>
                        </v-btn>
                    </div>
                </div>
            </v-col>
        </v-row>
    </v-container>
</template>

<script>
import { ref, onMounted, watch, computed, onBeforeUnmount, nextTick } from 'vue';
import { usePlaylistStore } from '@/stores/playlist';
import { useAppStore } from '@/stores/app';
import { getTranscoderUrl, getProxyUrl as getProxyUrlBase } from '@/services/urls.js';
import { wsService } from '@/services/websocket.js';
import { initCast, castAvailable, isCasting, airplayAvailable, startCastSession, stopCastSession, checkAirPlaySupport, requestAirPlay as requestAirPlayPicker } from '@/services/cast.js';
import DanmakuOverlay from './DanmakuOverlay.vue';
import mpegts from 'mpegts.js';
import Hls from 'hls.js';

export default {
    name: 'VideoPlayer',
    components: { DanmakuOverlay },
    emits: ['toggle-fullscreen'],

    setup(props, { emit }) {
        const videoElement = ref(null);
        const containerElement = ref(null);
        const danmakuRef = ref(null);
        const videoKey = ref(Date.now());
        const playlist = usePlaylistStore();
        const app = useAppStore();

        const currentChannel = computed(() => playlist.currentChannel);
        const isPiP = computed(() => app.isPiP);
        const isRecording = computed(() => app.isRecording);
        const isSharing = computed(() => app.isSharing);
        const isFullscreen = ref(false);
        const isLiveStream = ref(true); // Assume live by default, will be updated when playing
        const isPlaying = ref(false);
        const codecWarning = ref(false);
        
        // Detect if browser is Chromium (but not Chrome) for specific install instructions
        const isChromium = ref(false);
        {
            const ua = navigator.userAgent;
            const hasChromium = /Chromium/.test(ua) || (/Chrome/.test(ua) && !/Edg|OPR/.test(ua));
            // Chrome includes "Chrome/" but NOT "Chromium/", while Chromium includes "Chromium/"
            isChromium.value = /Chromium/.test(ua);
        }
        
        // Check if H.264 is supported via MSE (MediaSource Extensions)
        function checkH264MseSupport() {
            if (typeof MediaSource === 'undefined') return false;
            const codecs = [
                'video/mp4; codecs="avc1.42E01E"',  // Baseline
                'video/mp4; codecs="avc1.4D401E"',  // Main
                'video/mp4; codecs="avc1.4D4020"',  // Main 3.2
                'video/mp4; codecs="avc1.640028"',  // High 4.0
            ];
            return codecs.some(c => MediaSource.isTypeSupported(c));
        }
        
        // Load volume settings from localStorage
        const VOLUME_STORAGE_KEY = 'bacalhau_video_volume';
        const MUTED_STORAGE_KEY = 'bacalhau_video_muted';
        const savedVolume = localStorage.getItem(VOLUME_STORAGE_KEY);
        const savedMuted = localStorage.getItem(MUTED_STORAGE_KEY);
        
        const isMuted = ref(savedMuted === 'true');
        const volume = ref(savedVolume ? parseFloat(savedVolume) : 1);
        const controlsVisible = ref(true);
        let controlsTimeout = null;

        let hlsInstance = null;
        let mpegtsPlayer = null;
        let hasFatalError = false; // Track if we've hit a fatal error to prevent error floods
        let currentStreamId = null; // Track transcoded stream for cleanup
        let currentRecordingId = null; // Track active recording for cleanup
        let currentHlsUrl = null; // Track current HLS URL for casting
        
        // CORS proxy URL for external streams (dynamic based on browser location)
        const proxyUrl = getProxyUrlBase();
        // Transcoder URL for MPEG-TS to HLS conversion and recording
        const transcoderUrl = getTranscoderUrl();
        
        function getProxiedUrl(url) {
            // Only proxy external URLs, not local ones
            if (url.startsWith('http://') || url.startsWith('https://')) {
                return `${proxyUrl}/${url}`;
            }
            return url;
        }
        
        // Request transcoding of MPEG-TS stream to HLS
        async function getTranscodedHlsUrl(originalUrl) {
            console.log('Requesting transcoding for:', originalUrl);
            console.log('Transcoding settings:', {
                hwAccel: app.hwAcceleration,
                hwDecode: app.hwDecoding,
                preset: app.transcodingPreset,
                quality: app.transcodingQuality
            });
            
            try {
                // Build URL with GPU acceleration settings
                const params = new URLSearchParams({
                    url: originalUrl,
                    hwaccel: app.hwAcceleration,
                    hwdecode: app.hwDecoding ? 'true' : 'false',
                    preset: app.transcodingPreset,
                    quality: app.transcodingQuality
                });
                
                const response = await fetch(`${transcoderUrl}/transcode?${params}`);
                if (!response.ok) {
                    throw new Error(`Transcoder error: ${response.status}`);
                }
                const data = await response.json();
                console.log('Transcoder response:', data);
                currentStreamId = data.streamId;
                app.setCurrentStreamId(data.streamId); // Store in app state for sharing
                app.setRecordingSupported(true); // Recording is available with transcoded stream
                
                // If sharing is active, notify guests via WebSocket about channel change
                if (app.isSharing && app.shareId) {
                    wsService.sendChannelChange(
                        data.streamId,
                        currentChannel.value?.name,
                        currentChannel.value?.tvg?.logo || null
                    );
                    console.log('[Share] Notified guests of channel change via WebSocket');
                }
                
                return `${transcoderUrl}${data.hlsUrl}`;
            } catch (err) {
                console.error('Failed to get transcoded stream:', err);
                throw err;
            }
        }
        
        // Stop transcoded stream
        async function stopTranscodedStream() {
            if (currentStreamId) {
                try {
                    await fetch(`${transcoderUrl}/stream/${currentStreamId}`, { method: 'DELETE' });
                    console.log('Stopped transcoded stream:', currentStreamId);
                } catch (err) {
                    console.warn('Error stopping transcoded stream:', err);
                }
                currentStreamId = null;
                app.setCurrentStreamId(null);
                app.setRecordingSupported(false); // Recording no longer available
            }
        }

        function checkFullscreen() {
            isFullscreen.value = !!document.fullscreenElement;
        }

        function toggleFullscreen() {
            // Emit event to parent (MainView) to handle fullscreen
            emit('toggle-fullscreen');
        }

        // Handle browser close/refresh - stop recording if active
        function handleBeforeUnload(event) {
            if (currentRecordingId) {
                console.log('Browser closing with active recording, stopping recording...');
                // Use synchronous fetch with keepalive to ensure request completes
                navigator.sendBeacon(
                    `${transcoderUrl}/record/stop`,
                    JSON.stringify({ recordingId: currentRecordingId })
                );
                // Note: We can't use async fetch here as the page is unloading
                // sendBeacon is the browser's way to send data during page unload
            }
        }

        onMounted(async () => {
            addFullscreenListeners();
            addPiPListeners();
            
            // Initialize casting support
            initCast();
            
            // Add beforeunload handler to stop recording when browser closes
            window.addEventListener('beforeunload', handleBeforeUnload);
            
            // Register WebSocket danmaku handler
            wsService.onDanmaku((msg) => {
                if (danmakuRef.value) {
                    danmakuRef.value.addMessage(msg);
                }
            });
            
            // Check PiP support and update store
            const checkPipSupport = () => {
                const video = videoElement.value;
                if (video) {
                    const supported = typeof video.requestPictureInPicture === 'function';
                    app.setPipSupported(supported);
                    console.log('PiP support detected:', supported);
                    
                    // Check AirPlay support
                    checkAirPlaySupport(video);
                }
            };
            
            // Check after a short delay to ensure video element is ready
            await nextTick();
            checkPipSupport();

            if (currentChannel.value?.url) {
                await playSource(currentChannel.value.url, currentChannel.value.type);
            }
        });

        onBeforeUnmount(() => {
            removeFullscreenListeners();
            removePiPListeners();
            window.removeEventListener('beforeunload', handleBeforeUnload);
            cleanupPlayer();
        });
        
        // PiP event handlers to sync store state with browser PiP state
        function onEnterPiP() {
            if (!app.isPiP) {
                app.setPiP(true);
            }
        }
        
        function onLeavePiP() {
            if (app.isPiP) {
                app.setPiP(false);
            }
        }
        
        function addPiPListeners() {
            const video = videoElement.value;
            if (video) {
                video.addEventListener('enterpictureinpicture', onEnterPiP);
                video.addEventListener('leavepictureinpicture', onLeavePiP);
                video.addEventListener('play', () => { isPlaying.value = true; });
                video.addEventListener('pause', () => { isPlaying.value = false; });
                video.addEventListener('volumechange', () => { 
                    isMuted.value = video.muted;
                    volume.value = video.volume;
                    // Persist volume settings
                    localStorage.setItem(VOLUME_STORAGE_KEY, video.volume.toString());
                    localStorage.setItem(MUTED_STORAGE_KEY, video.muted.toString());
                });
                
                // Restore saved volume/muted state
                video.volume = volume.value;
                video.muted = isMuted.value;
            }
        }
        
        function removePiPListeners() {
            const video = videoElement.value;
            if (video) {
                video.removeEventListener('enterpictureinpicture', onEnterPiP);
                video.removeEventListener('leavepictureinpicture', onLeavePiP);
            }
        }

        function cleanupPlayer() {
            const video = videoElement.value;
            hasFatalError = true; // Prevent any more error handling during cleanup

            // Stop any transcoded stream
            stopTranscodedStream();

            // Stop any active recording when changing channels
            if (currentRecordingId) {
                // Update store to reflect recording stopped
                if (app.isRecording) {
                    app.setRecording(false);
                }
                // Send stop request to server
                fetch(`${transcoderUrl}/record/stop`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ recordingId: currentRecordingId })
                }).catch(err => console.warn('Error stopping recording during cleanup:', err));
                currentRecordingId = null;
            }

            // Cleanup HLS.js instance
            if (hlsInstance) {
                console.log("Cleaning up HLS.js instance");
                try {
                    hlsInstance.stopLoad();
                    hlsInstance.detachMedia();
                    hlsInstance.destroy();
                } catch (e) {
                    console.warn('Error during HLS cleanup:', e);
                }
                hlsInstance = null;
            }

            // Cleanup MPEG-TS player
            if (mpegtsPlayer) {
                console.log("Cleaning up MPEG-TS player");
                // Store reference and nullify first to prevent race conditions
                const player = mpegtsPlayer;
                mpegtsPlayer = null;
                
                try {
                    // Remove all event listeners first
                    player.off(mpegts.Events.ERROR);
                    player.off(mpegts.Events.MEDIA_INFO);
                    player.off(mpegts.Events.LOADING_COMPLETE);
                    
                    player.pause();
                    player.unload();
                    player.detachMediaElement();
                    player.destroy();
                } catch (e) {
                    console.warn('Error during mpegts cleanup:', e);
                }
            }

            // Reset video element
            if (video) {
                try {
                    video.pause();
                    video.removeAttribute('src');
                    video.load();
                } catch (e) {
                    console.warn('Error resetting video element:', e);
                }
            }
        }

        function addFullscreenListeners() {
            document.addEventListener("fullscreenchange", checkFullscreen);
            document.addEventListener("webkitfullscreenchange", checkFullscreen);
            document.addEventListener("mozfullscreenchange", checkFullscreen);
            document.addEventListener("msfullscreenchange", checkFullscreen);
        }

        function removeFullscreenListeners() {
            document.removeEventListener("fullscreenchange", checkFullscreen);
            document.removeEventListener("webkitfullscreenchange", checkFullscreen);
            document.removeEventListener("mozfullscreenchange", checkFullscreen);
            document.removeEventListener("msfullscreenchange", checkFullscreen);
        }

        watch(() => currentChannel.value, (newVal) => {
            if (!newVal || !newVal.url) {
                console.warn("No channel selected or URL is empty.");
                return;
            }
            console.log("Switching to channel:", newVal.name, "URL:", newVal.url, "Type:", newVal.type);
            playSource(newVal.url, newVal.type);
        });

        watch(() => isPiP.value, async (newVal) => {
            console.log('PiP toggle requested:', newVal);
            const video = videoElement.value;
            if (!video) {
                console.warn('Cannot toggle PiP: video element not available');
                return;
            }
            
            console.log('Video element found, readyState:', video.readyState);
            
            // Check if PiP API is available (Chrome/Edge have it, Firefox doesn't fully support it)
            const pipSupported = typeof video.requestPictureInPicture === 'function';
            console.log('PiP API supported:', pipSupported);
            
            if (newVal) {
                // Enter Picture-in-Picture
                try {
                    if (pipSupported && !video.disablePictureInPicture) {
                        await video.requestPictureInPicture();
                        console.log('Entered Picture-in-Picture mode');
                    } else {
                        console.warn('Picture-in-Picture is not available in this browser. Try using Chrome or Edge.');
                        app.setPiP(false);
                    }
                } catch (err) {
                    console.error('Failed to enter Picture-in-Picture:', err);
                    app.setPiP(false);
                }
            } else {
                // Exit Picture-in-Picture
                try {
                    if (document.pictureInPictureElement) {
                        await document.exitPictureInPicture();
                        console.log('Exited Picture-in-Picture mode');
                    }
                } catch (err) {
                    console.error('Failed to exit Picture-in-Picture:', err);
                }
            }
        });

        watch(() => isRecording.value, (newVal) => {
            if (newVal) {
                startRecording();
            } else {
                stopRecording();
            }
        });

        // Server-side recording via FFmpeg (records from active transcoded stream)
        async function startRecording() {
            if (!currentStreamId) {
                console.error('No active stream to record. Recording requires an active transcoded stream.');
                app.setRecording(false);
                return;
            }

            try {
                const response = await fetch(`${transcoderUrl}/record/start`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        streamId: currentStreamId,
                        channelName: currentChannel.value?.name || 'recording'
                    })
                });

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error || `Recording failed: ${response.status}`);
                }

                const data = await response.json();
                currentRecordingId = data.recordingId;
                console.log('Recording started:', data);
            } catch (err) {
                console.error('Failed to start recording:', err);
                app.setRecording(false);
            }
        }

        async function stopRecording() {
            if (!currentRecordingId) {
                console.log('No active recording to stop');
                return;
            }

            try {
                const response = await fetch(`${transcoderUrl}/record/stop`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ recordingId: currentRecordingId })
                });

                if (response.ok) {
                    const data = await response.json();
                    console.log('Recording stopped:', data);
                }
            } catch (err) {
                console.error('Failed to stop recording:', err);
            } finally {
                currentRecordingId = null;
            }
        }

        async function playSource(url, type) {
            // Clean up any previous player instances
            cleanupPlayer();

            // Use proxy for external URLs to bypass CORS
            const streamUrl = getProxiedUrl(url);
            console.log('Stream URL (proxied):', streamUrl);

            type = type || getMimeTypeFromUrl(url);
            console.log('Using type:', type);
            
            // Determine if this is a live stream based on type and VOD flag
            // HLS and MPEG-TS are typically live, MP4/WebM/MKV are typically VOD
            // If channel has isVod flag, always treat as non-live
            const isVod = currentChannel.value?.isVod === true;
            const isLive = !isVod && (type === 'application/x-mpegURL' || 
                           type === 'video/mp2t' || 
                           type === 'application/octet-stream');
            isLiveStream.value = isLive;
            console.log('Is live stream:', isLive, 'Is VOD:', isVod);

            videoKey.value = Date.now();
            await nextTick(); // Ensure DOM is up-to-date
            
            // Re-add PiP listeners after video element is recreated
            addPiPListeners();

            const video = videoElement.value;
            if (!video) {
                console.error('Video element not available');
                return;
            }

            // For HLS streams
            if (type === 'application/x-mpegURL') {
                currentHlsUrl = streamUrl;
                if (Hls.isSupported()) {
                    console.log('Using HLS.js for playback');
                    
                    // Check if this is a proxied URL and extract the original base URL
                    const isProxied = streamUrl.startsWith(proxyUrl);
                    const originalStreamUrl = isProxied ? streamUrl.replace(proxyUrl + '/', '') : streamUrl;
                    const baseUrl = originalStreamUrl.substring(0, originalStreamUrl.lastIndexOf('/') + 1);
                    
                    hlsInstance = new Hls({
                        enableWorker: true,
                        lowLatencyMode: false,             // Disable for smoother playback
                        backBufferLength: 60,
                        liveSyncDurationCount: 3,
                        liveMaxLatencyDurationCount: 6,
                        maxBufferLength: 30,
                        maxMaxBufferLength: 60,
                        maxBufferHole: 1,
                        nudgeOffset: 0.2,
                        nudgeMaxRetry: 10,
                        preferManagedMediaSource: false,    // Force standard MediaSource for Chromium compat
                        // Custom loader to proxy all requests through CORS proxy
                        xhrSetup: function(xhr, url) {
                            // Skip if already local/proxied
                            if (url.startsWith(transcoderUrl) || url.startsWith('/') || url.startsWith('blob:')) {
                                return;
                            }
                            
                            let finalUrl = url;
                            
                            // Handle relative URLs
                            if (!url.startsWith('http://') && !url.startsWith('https://')) {
                                finalUrl = baseUrl + url;
                            }
                            
                            // If URL is external (not already proxied), proxy it
                            if (!finalUrl.startsWith(proxyUrl)) {
                                finalUrl = `${proxyUrl}/${finalUrl}`;
                            }
                            
                            // Re-open with the proxied URL
                            xhr.open('GET', finalUrl, true);
                            // Set Origin header required by cors-anywhere
                            xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
                        }
                    });
                    hlsInstance.attachMedia(video);
                    hlsInstance.on(Hls.Events.MEDIA_ATTACHED, () => {
                        hlsInstance.loadSource(streamUrl);
                    });
                    hlsInstance.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
                        // HLS.js can tell us if the stream is live or VOD
                        const live = !hlsInstance.levels[0]?.details?.live === false;
                        isLiveStream.value = live || data.levels.some(l => l.details?.live);
                        console.log('HLS manifest parsed, isLive:', isLiveStream.value);
                    });
                    // Play once a full fragment is buffered (all source buffers ready)
                    let hlsPlayStarted = false;
                    const doPlay = () => {
                        if (hlsPlayStarted) return;
                        hlsPlayStarted = true;
                        // Seek past any initial PTS gap to avoid bufferStalledError
                        if (video.buffered.length > 0 && video.currentTime < video.buffered.start(0)) {
                            video.currentTime = video.buffered.start(0);
                        }
                        console.log('[HLS] Starting playback, readyState:', video.readyState);
                        video.play().catch(err => {
                            console.error('Error playing video:', err);
                            // If still not ready, wait for canplay
                            if (err.name === 'NotSupportedError') {
                                hlsPlayStarted = false;
                            }
                        });
                    };
                    hlsInstance.on(Hls.Events.FRAG_BUFFERED, doPlay);
                    video.addEventListener('canplay', doPlay, { once: true });
                    hlsInstance.on(Hls.Events.ERROR, (event, data) => {
                        console.error(`HLS.js error: ${data.type} - ${data.details}`, data);
                        if (data.fatal) {
                            switch (data.type) {
                                case Hls.ErrorTypes.NETWORK_ERROR:
                                    console.log('Fatal network error, trying to recover...');
                                    hlsInstance.startLoad();
                                    break;
                                case Hls.ErrorTypes.MEDIA_ERROR:
                                    console.log('Fatal media error, trying to recover...');
                                    hlsInstance.recoverMediaError();
                                    break;
                                default:
                                    console.error('Fatal error, cannot recover');
                                    cleanupPlayer();
                                    break;
                            }
                        }
                    });
                } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                    // Native HLS support (Safari)
                    console.log('Using native HLS support');
                    video.src = streamUrl;
                    video.play().catch(err => console.error("Error playing video:", err));
                }
            } 
            // For MPEG-TS streams - use transcoder to convert to HLS
            else if (type === 'video/mp2t' || url.match(/\d+$/)) {
                console.log('MPEG-TS stream detected, using transcoder for HLS conversion');
                hasFatalError = false;
                
                try {
                    // Request transcoding to HLS format
                    const hlsUrl = await getTranscodedHlsUrl(url);
                    console.log('Got transcoded HLS URL:', hlsUrl);
                    currentHlsUrl = hlsUrl;
                    
                    // Check H.264 MSE support before attempting playback
                    if (!checkH264MseSupport()) {
                        console.error('[VideoPlayer] H.264 not supported via MSE in this browser');
                        codecWarning.value = true;
                    }
                    
                    if (Hls.isSupported()) {
                        console.log('Playing transcoded HLS stream');
                        hlsInstance = new Hls({
                            enableWorker: true,
                            lowLatencyMode: false,
                            backBufferLength: 60,
                            liveSyncDurationCount: 3,
                            liveMaxLatencyDurationCount: 6,
                            maxBufferLength: 30,
                            maxMaxBufferLength: 60,
                            maxBufferHole: 1,
                            nudgeOffset: 0.2,
                            nudgeMaxRetry: 10,
                            preferManagedMediaSource: false  // Force standard MediaSource for Chromium compatibility
                        });
                        // IMPORTANT: attachMedia FIRST, then loadSource after MEDIA_ATTACHED
                        // Calling loadSource before attachMedia triggers BUFFER_RESET before
                        // the MediaSource exists, corrupting buffer-controller state and causing
                        // the MediaSource to close before data can be appended in Chromium.
                        hlsInstance.attachMedia(video);
                        hlsInstance.on(Hls.Events.MEDIA_ATTACHED, () => {
                            console.log('[HLS] Media attached, loading source');
                            hlsInstance.loadSource(hlsUrl);
                        });
                        hlsInstance.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
                            isLiveStream.value = true;
                            console.log('Transcoded HLS manifest parsed, isLive: true');
                        });
                        // Play once a full fragment is buffered (dual approach for cross-browser compat)
                        let hlsPlayStarted = false;
                        const doPlay = () => {
                            if (hlsPlayStarted) return;
                            hlsPlayStarted = true;
                            // Seek past any initial PTS gap to avoid bufferStalledError
                            if (video.buffered.length > 0 && video.currentTime < video.buffered.start(0)) {
                                video.currentTime = video.buffered.start(0);
                            }
                            console.log('[HLS] Starting playback, readyState:', video.readyState);
                            video.play().catch(err => {
                                console.warn('[HLS] play() error:', err.message);
                                if (err.name === 'NotSupportedError') {
                                    hlsPlayStarted = false;
                                }
                            });
                        };
                        hlsInstance.on(Hls.Events.FRAG_BUFFERED, doPlay);
                        video.addEventListener('canplay', doPlay, { once: true });
                        // Monitor video element errors for debugging
                        video.addEventListener('error', (e) => {
                            console.error('[Video] error event:', video.error?.code, video.error?.message);
                        });
                        hlsInstance.on(Hls.Events.ERROR, (event, data) => {
                            console.error(`HLS.js error: ${data.type} - ${data.details}`, data);
                            if (data.fatal) {
                                switch (data.type) {
                                    case Hls.ErrorTypes.NETWORK_ERROR:
                                        console.log('Fatal network error, trying to recover...');
                                        hlsInstance.startLoad();
                                        break;
                                    case Hls.ErrorTypes.MEDIA_ERROR:
                                        console.log('Fatal media error, trying to recover...');
                                        hlsInstance.recoverMediaError();
                                        break;
                                    default:
                                        console.error('Fatal error, cannot recover');
                                        cleanupPlayer();
                                        break;
                                }
                            }
                        });
                    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                        // Native HLS support (Safari)
                        console.log('Using native HLS support for transcoded stream');
                        video.src = hlsUrl;
                        video.play().catch(err => console.error("Error playing video:", err));
                    }
                } catch (err) {
                    console.error('Transcoding failed:', err);
                    // Fallback to direct mpegts.js (may not work in all browsers)
                    console.log('Falling back to direct mpegts.js playback');
                    if (mpegts.isSupported()) {
                        mpegtsPlayer = mpegts.createPlayer({
                            type: 'mpegts',
                            url: streamUrl,
                            isLive: true
                        }, {
                            enableWorker: true,
                            enableStashBuffer: false,
                            stashInitialSize: 128
                        });
                        mpegtsPlayer.attachMediaElement(video);
                        mpegtsPlayer.load();
                        mpegtsPlayer.play();
                        
                        mpegtsPlayer.on(mpegts.Events.ERROR, (errorType, errorDetail, errorInfo) => {
                            if (hasFatalError) return;
                            console.error('mpegts.js error:', errorType, errorDetail, errorInfo);
                            if (errorType === 'MediaError') {
                                hasFatalError = true;
                                cleanupPlayer();
                            }
                        });
                    }
                }
            } 
            // For other formats (MP4, WebM, etc.) - these are typically VOD
            else {
                console.log('Using native video playback for type:', type);
                isLiveStream.value = false; // MP4/WebM are typically on-demand
                video.src = streamUrl;
                
                // Restore volume settings
                video.volume = volume.value;
                video.muted = isMuted.value;
                
                video.play().catch(err => console.error("Error playing video:", err));
                
                // If native playback fails (e.g. MKV/unsupported codec), try transcoder
                video.addEventListener('error', async () => {
                    const errorCode = video.error?.code;
                    console.warn('[VideoPlayer] Native playback error, code:', errorCode, video.error?.message);
                    if (errorCode === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED || errorCode === MediaError.MEDIA_ERR_DECODE) {
                        console.log('[VideoPlayer] Attempting transcoder fallback for VOD');
                        try {
                            const hlsUrl = await getTranscodedHlsUrl(url);
                            currentHlsUrl = hlsUrl;
                            if (Hls.isSupported()) {
                                cleanupPlayer();
                                videoKey.value = Date.now();
                                await nextTick();
                                const retryVideo = videoElement.value;
                                if (!retryVideo) return;
                                
                                hlsInstance = new Hls({
                                    enableWorker: true,
                                    lowLatencyMode: false,
                                    preferManagedMediaSource: false
                                });
                                hlsInstance.attachMedia(retryVideo);
                                hlsInstance.on(Hls.Events.MEDIA_ATTACHED, () => {
                                    hlsInstance.loadSource(hlsUrl);
                                });
                                let started = false;
                                const doPlay = () => {
                                    if (started) return;
                                    started = true;
                                    retryVideo.play().catch(e => console.error('[VOD] play error:', e));
                                };
                                hlsInstance.on(Hls.Events.FRAG_BUFFERED, doPlay);
                                retryVideo.addEventListener('canplay', doPlay, { once: true });
                            }
                        } catch (e) {
                            console.error('[VideoPlayer] Transcoder fallback also failed:', e);
                        }
                    }
                }, { once: true });
            }
        }

        // Function to determine MIME type based on URL
        function getMimeTypeFromUrl(url) {
            if (url.includes('.m3u8')) return 'application/x-mpegURL';
            if (url.includes('.mp4')) return 'video/mp4';
            if (url.includes('.mkv')) return 'video/x-matroska';
            if (url.includes('.avi')) return 'video/x-msvideo';
            if (url.includes('.webm')) return 'video/webm';
            if (url.includes('.ts')) return 'video/mp2t'; // MPEG-TS streams (.ts extension)
            if (url.match(/\d+$/)) return 'video/mp2t'; // Raw MPEG-TS streams (no extension)
            return 'application/octet-stream';
        }

        // Handle sending danmaku messages from the overlay
        function handleDanmakuSend({ text, color }) {
            wsService.sendDanmaku(text, color);
        }

        // Cast to Chromecast
        function startCast() {
            if (isCasting.value) {
                stopCastSession();
                return;
            }
            
            // Build an absolute URL for the Chromecast/AirPlay device to reach
            // The TV can't access localhost, so use the custom domain from settings if available
            let castUrl = currentHlsUrl;
            if (castUrl) {
                // Determine the base origin the cast device should use
                let castBase;
                if (app.customDomain) {
                    // Build from separate domain/port/protocol fields (same as ShareStreamDialog)
                    const protocol = app.customProtocol || 'http';
                    const domain = app.customDomain;
                    const port = app.customPort;
                    const shouldShowPort = port && 
                        !((protocol === 'http' && port === '80') || 
                          (protocol === 'https' && port === '443'));
                    const portPart = shouldShowPort ? `:${port}` : '';
                    castBase = `${protocol}://${domain}${portPart}`;
                } else {
                    castBase = window.location.origin;
                }
                
                if (castUrl.startsWith('http://') || castUrl.startsWith('https://')) {
                    // Already absolute — replace the origin with the cast-reachable base
                    try {
                        const parsed = new URL(castUrl);
                        castUrl = `${castBase}${parsed.pathname}${parsed.search}`;
                    } catch {
                        // If URL parsing fails, use as-is
                    }
                } else {
                    // Relative URL — make absolute using cast base
                    castUrl = `${castBase}${castUrl.startsWith('/') ? '' : '/'}${castUrl}`;
                }
            }
            
            if (!castUrl) {
                console.warn('[Cast] No stream URL available to cast');
                return;
            }
            
            console.log('[Cast] Casting URL:', castUrl);
            startCastSession(
                castUrl,
                currentChannel.value?.name || 'ViTV Stream',
                currentChannel.value?.tvg?.logo || null
            );
        }

        // AirPlay
        function handleAirPlay() {
            const video = videoElement.value;
            if (video) {
                requestAirPlayPicker(video);
            }
        }

        return {
            videoElement,
            containerElement,
            danmakuRef,
            isFullscreen,
            isLiveStream,
            isSharing,
            isPlaying,
            isMuted,
            volume,
            controlsVisible,
            toggleFullscreen,
            videoKey,
            codecWarning,
            isChromium,
            handleDanmakuSend,
            castAvailable,
            isCasting,
            airplayAvailable,
            startCast,
            requestAirPlay: handleAirPlay,
            play: () => videoElement.value?.play(),
            pause: () => videoElement.value?.pause(),
            togglePlay: () => {
                const video = videoElement.value;
                if (!video) return;
                if (video.paused) {
                    video.play().catch(err => {
                        console.warn('togglePlay: play failed, readyState:', video.readyState, err.message);
                    });
                    isPlaying.value = true;
                } else {
                    video.pause();
                    isPlaying.value = false;
                }
            },
            toggleMute: () => {
                const video = videoElement.value;
                if (!video) return;
                video.muted = !video.muted;
                isMuted.value = video.muted;
            },
            setVolume: (val) => {
                if (videoElement.value) {
                    videoElement.value.volume = val;
                    volume.value = val;
                }
            },
            showControls: () => {
                controlsVisible.value = true;
                if (controlsTimeout) clearTimeout(controlsTimeout);
            },
            hideControlsDelayed: () => {
                if (controlsTimeout) clearTimeout(controlsTimeout);
                controlsTimeout = setTimeout(() => {
                    controlsVisible.value = false;
                }, 2000);
            },
            setCurrentTime: (val) => {
                if (videoElement.value) videoElement.value.currentTime = val;
            },
            getCurrentTime: () => videoElement.value?.currentTime ?? 0,
            getDuration: () => videoElement.value?.duration ?? 0
        };
    }
};

</script>

<style scoped>
.video-container {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background-color: black;
}

.video-js,
.video-js .vjs-tech {
    width: 100% !important;
    height: 100% !important;
    object-fit: contain !important;
    top: 0 !important;
    left: 0 !important;
    position: absolute !important;
}

video {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
}

/* Custom controls for live streams */
.custom-controls {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    background: linear-gradient(transparent, rgba(0, 0, 0, 0.7));
    padding: 10px 15px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    opacity: 0;
    transition: opacity 0.3s ease;
    z-index: 5;
}

.custom-controls.visible {
    opacity: 1;
}

.video-container:hover .custom-controls {
    opacity: 1;
}

.controls-left,
.controls-right {
    display: flex;
    align-items: center;
    gap: 8px;
}

.controls-left .v-btn,
.controls-right .v-btn {
    color: white;
}

.volume-slider {
    width: 80px;
    height: 4px;
    cursor: pointer;
    accent-color: white;
}

.live-badge {
    background-color: #e53935;
    color: white;
    font-size: 11px;
    font-weight: bold;
    padding: 2px 8px;
    border-radius: 3px;
    margin-left: 10px;
}

/* Hide seek bar styles (fallback) */
video.live-stream::-webkit-media-controls-timeline {
    display: none !important;
}

video.live-stream::-webkit-media-controls-current-time-display,
video.live-stream::-webkit-media-controls-time-remaining-display {
    display: none !important;
}

/* Firefox */
video.live-stream::-moz-range-track {
    display: none !important;
}

.fullscreen-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.5);
    /* Semi-transparent black */
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    color: white;
    font-size: 24px;
    font-weight: bold;
    z-index: 10;
    /* Ensure it appears on top */
    text-align: center;
    pointer-events: none;
    /* Allows clicks to go through */
}

/* Codec warning banner */
.codec-warning {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(30, 30, 30, 0.95);
    border: 1px solid #FFA726;
    border-radius: 8px;
    padding: 16px 20px;
    display: flex;
    align-items: flex-start;
    max-width: 500px;
    z-index: 10;
    color: white;
}

.codec-warning-text {
    flex: 1;
}

.codec-warning-text strong {
    font-size: 14px;
    color: #FFA726;
}

.codec-warning-text p {
    margin: 6px 0 0;
    font-size: 12px;
    color: #ccc;
    line-height: 1.4;
}

.codec-warning-text code {
    background: rgba(255, 255, 255, 0.1);
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 11px;
    color: #81C784;
}
</style>