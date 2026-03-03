<template>
    <v-app class="app guest-view">
        <!-- Top bar with channel info only -->
        <v-app-bar app dense density="compact" class="pa-0">
            <v-app-bar-title class="app-bar-title-custom">
                <v-row align="center" no-gutters>
                    <v-col cols="auto">
                        <v-img v-if="channelLogo" :src="channelLogo" alt="Channel Logo"
                            width="50" class="mr-3" cover></v-img>
                    </v-col>
                    <v-col class="channel-name-col">
                        <span class="channel-name-text">{{ channelName || 'Shared Stream' }}</span>
                    </v-col>
                </v-row>
            </v-app-bar-title>

            <v-spacer></v-spacer>
            
            <!-- Guest name badge -->
            <v-chip v-if="guestName" class="mr-4" size="small" color="primary">
                <v-icon start>mdi-account</v-icon>
                {{ guestName }}
            </v-chip>
        </v-app-bar>

        <v-main class="black-background main-content">
            <div class="video-container fill-height">
                <div v-if="error" class="error-container">
                    <v-card class="error-card" max-width="500">
                        <v-card-title class="text-h5 d-flex align-center">
                            <v-icon color="error" class="mr-2">mdi-alert-circle</v-icon>
                            Stream Offline
                        </v-card-title>
                        <v-card-text>
                            <p class="text-body-1">{{ errorMessage }}</p>
                        </v-card-text>
                    </v-card>
                </div>
                <div v-else-if="loading" class="loading-container">
                    <v-progress-circular indeterminate size="64" color="primary"></v-progress-circular>
                    <p class="mt-4">{{ channelName ? `Switching to ${channelName}...` : 'Loading stream...' }}</p>
                </div>
                <div v-else class="video-wrapper">
                    <video ref="videoElement" v-if="hlsUrl" 
                        controls autoplay
                        x-webkit-airplay="allow"
                        class="video-player"
                        @error="handleVideoError"
                        @loadstart="handleLoadStart"
                        @canplay="handleCanPlay"></video>
                    
                    <!-- Danmaku overlay -->
                    <DanmakuOverlay
                        ref="danmakuRef"
                        :isMobile="isMobile"
                        @send="handleDanmakuSend"
                    />
                </div>
            </div>
        </v-main>

        <!-- Name Input Dialog -->
        <v-dialog v-model="showNameDialog" persistent max-width="400px">
            <v-card>
                <v-card-title class="d-flex align-center">
                    <v-icon class="mr-2">mdi-account-circle</v-icon>
                    Welcome!
                </v-card-title>
                <v-card-text>
                    <p class="text-body-1 mb-4">Please enter your name to join the stream:</p>
                    <v-text-field
                        v-model="guestNameInput"
                        label="Your Name"
                        variant="outlined"
                        autofocus
                        @keyup.enter="submitName"
                        :error-messages="nameError"
                    ></v-text-field>
                </v-card-text>
                <v-card-actions>
                    <v-spacer></v-spacer>
                    <v-btn
                        color="primary"
                        variant="elevated"
                        @click="submitName"
                        :disabled="!guestNameInput.trim()"
                    >
                        Join Stream
                    </v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>
    </v-app>
</template>

<script>
import { ref, onMounted, onBeforeUnmount, computed, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import { apiFetch } from '@/services/api';
import { getTranscoderUrl } from '@/services/urls.js';
import { wsService } from '@/services/websocket.js';
import DanmakuOverlay from '@/components/DanmakuOverlay.vue';
import Hls from 'hls.js';

export default {
    name: 'GuestView',
    components: { DanmakuOverlay },
    
    setup() {
        const route = useRoute();
        const shareId = computed(() => route.params.shareId);
        const transcoderUrl = getTranscoderUrl();
        
        const showNameDialog = ref(true);
        const guestNameInput = ref('');
        const guestName = ref('');
        const nameError = ref('');
        
        const loading = ref(true);
        const error = ref(false);
        const errorMessage = ref('');
        
        const channelName = ref('');
        const channelLogo = ref('');
        const hlsUrl = ref('');
        const currentStreamId = ref('');
        
        const videoElement = ref(null);
        const danmakuRef = ref(null);
        let hlsInstance = null;

        const isMobile = ref(false);

        function checkMobile() {
            isMobile.value = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
                || window.innerWidth <= 768;
        }

        async function submitName() {
            if (!guestNameInput.value.trim()) {
                nameError.value = 'Please enter a name';
                return;
            }
            
            guestName.value = guestNameInput.value.trim();
            showNameDialog.value = false;
            
            // Join the stream
            await joinStream();
        }

        async function joinStream() {
            loading.value = true;
            error.value = false;
            
            try {
                // Register as a guest via REST (initial join, get stream info)
                const response = await apiFetch(`/share/${shareId.value}/join`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ guestName: guestName.value })
                });

                if (!response.ok) {
                    if (response.status === 404) {
                        throw new Error('This shared stream is no longer available. The owner may have stopped sharing.');
                    }
                    throw new Error('Failed to join stream');
                }

                const data = await response.json();
                console.log('[Guest] Join response:', data);
                channelName.value = data.channelName || 'Shared Stream';
                channelLogo.value = data.channelLogo || '';
                currentStreamId.value = data.streamId;
                
                // Construct full HLS URL using the transcoder URL
                const relativeHlsUrl = data.hlsUrl;
                hlsUrl.value = relativeHlsUrl.startsWith('http') 
                    ? relativeHlsUrl 
                    : `${transcoderUrl}${relativeHlsUrl}`;
                
                console.log('[Guest] HLS URL:', hlsUrl.value);
                
                // Set loading to false so the video element renders
                loading.value = false;
                
                // Wait for Vue to render the video element
                await nextTick();

                // Initialize video player
                await initializePlayer();
                
                // Connect to WebSocket room as guest
                connectWebSocket();
            } catch (err) {
                console.error('[Error joining stream:', err);
                error.value = true;
                errorMessage.value = err.message || 'Failed to connect to stream. Please check the URL and try again.';
                loading.value = false;
            }
        }

        let isChangingChannel = false; // Track channel transition state

        function connectWebSocket() {
            // Register WebSocket event handlers BEFORE connecting
            wsService.onChannelChange(async (msg) => {
                console.log('[Guest] Channel changed via WebSocket:', msg.channelName);
                isChangingChannel = true;
                
                // Show loading state immediately
                loading.value = true;
                error.value = false;
                
                // Destroy existing player right away
                if (hlsInstance) {
                    hlsInstance.destroy();
                    hlsInstance = null;
                }
                
                // Update channel info
                channelName.value = msg.channelName || 'Shared Stream';
                channelLogo.value = msg.channelLogo || '';
                currentStreamId.value = msg.streamId;
                
                // Construct new HLS URL
                const relativeHlsUrl = msg.hlsUrl;
                const newHlsUrl = relativeHlsUrl.startsWith('http') 
                    ? relativeHlsUrl 
                    : `${transcoderUrl}${relativeHlsUrl}`;
                
                hlsUrl.value = newHlsUrl;
                
                // Wait for the HLS playlist to become available before loading
                try {
                    await waitForStream(newHlsUrl);
                    loading.value = false;
                    await nextTick();
                    await initializePlayer();
                } catch (err) {
                    console.error('[Guest] Failed to load new stream:', err);
                    error.value = true;
                    errorMessage.value = 'Failed to load the new channel. The stream may not be ready yet.';
                    loading.value = false;
                } finally {
                    isChangingChannel = false;
                }
            });

            wsService.onDanmaku((msg) => {
                if (danmakuRef.value) {
                    danmakuRef.value.addMessage(msg);
                }
            });

            wsService.onShareStopped(() => {
                console.log('[Guest] Share stopped by owner');
                error.value = true;
                errorMessage.value = 'The owner has stopped sharing this stream.';
                
                // Clean up player
                if (hlsInstance) {
                    hlsInstance.destroy();
                    hlsInstance = null;
                }
            });

            // Connect to WebSocket
            wsService.connect(shareId.value, guestName.value, 'guest');
        }

        async function initializePlayer() {
            if (!videoElement.value || !hlsUrl.value) {
                console.error('[Guest] Cannot initialize player:', {
                    hasVideoElement: !!videoElement.value,
                    hasHlsUrl: !!hlsUrl.value
                });
                return;
            }

            console.log('[Guest] Initializing HLS player...');
            console.log('[Guest] HLS support:', Hls.isSupported());
            console.log('[Guest] Native HLS:', videoElement.value.canPlayType('application/vnd.apple.mpegurl'));

            if (Hls.isSupported()) {
                console.log('[Guest] Using HLS.js');
                hlsInstance = new Hls({
                    debug: false,
                    enableWorker: true,
                    lowLatencyMode: true,
                    backBufferLength: 90
                });

                hlsInstance.loadSource(hlsUrl.value);
                hlsInstance.attachMedia(videoElement.value);
                
                console.log('[Guest] HLS instance created and attached');

                let networkRetries = 0;
                const MAX_NETWORK_RETRIES = 5;

                hlsInstance.on(Hls.Events.ERROR, (event, data) => {
                    console.error('[Guest] HLS error:', event, data);
                    if (data.fatal) {
                        // If we're in the middle of a channel switch, ignore errors
                        if (isChangingChannel) {
                            console.log('[Guest] Ignoring HLS error during channel transition');
                            return;
                        }
                        console.error('HLS fatal error:', data);
                        switch (data.type) {
                            case Hls.ErrorTypes.NETWORK_ERROR:
                                networkRetries++;
                                if (networkRetries <= MAX_NETWORK_RETRIES) {
                                    console.log(`[Guest] Recovering from network error (attempt ${networkRetries}/${MAX_NETWORK_RETRIES})...`);
                                    setTimeout(() => {
                                        if (hlsInstance) hlsInstance.startLoad();
                                    }, 1000 * networkRetries); // Progressive backoff
                                } else {
                                    console.error('[Guest] Max network retries exceeded');
                                    error.value = true;
                                    errorMessage.value = 'Lost connection to the stream. The owner may have changed channels or stopped sharing.';
                                }
                                break;
                            case Hls.ErrorTypes.MEDIA_ERROR:
                                console.log('Attempting to recover from media error...');
                                hlsInstance.recoverMediaError();
                                break;
                            default:
                                error.value = true;
                                errorMessage.value = 'Stream playback error. The stream may have ended.';
                                break;
                        }
                    }
                });

                // Reset network retries on successful manifest load
                hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
                    networkRetries = 0;
                    console.log('[Guest] Manifest loaded successfully');
                });
            } else if (videoElement.value.canPlayType('application/vnd.apple.mpegurl')) {
                // Native HLS support (Safari)
                videoElement.value.src = hlsUrl.value;
            } else {
                error.value = true;
                errorMessage.value = 'Your browser does not support HLS playback.';
            }
        }

        /**
         * Poll the HLS playlist URL until it returns a 200 response,
         * meaning the transcoder has produced segments and is ready.
         */
        async function waitForStream(url, maxWait = 25000, interval = 1000) {
            const start = Date.now();
            while (Date.now() - start < maxWait) {
                try {
                    const resp = await fetch(url, { method: 'HEAD' });
                    if (resp.ok) {
                        console.log('[Guest] Stream is ready:', url);
                        return;
                    }
                } catch (e) {
                    // fetch failed (CORS, network), keep retrying
                }
                await new Promise(resolve => setTimeout(resolve, interval));
            }
            throw new Error('Timeout waiting for stream to become available');
        }
        
        async function reloadPlayer() {
            console.log('[Guest] Reloading player with new stream');
            loading.value = true;
            error.value = false;
            
            // Destroy existing player
            if (hlsInstance) {
                hlsInstance.destroy();
                hlsInstance = null;
            }
            
            // Wait for DOM update and for the stream to be available
            await nextTick();
            try {
                await waitForStream(hlsUrl.value);
            } catch (e) {
                console.warn('[Guest] Stream not ready after timeout, trying anyway...');
            }
            
            loading.value = false;
            await nextTick();
            
            // Reinitialize player
            await initializePlayer();
        }

        function handleDanmakuSend({ text, color }) {
            wsService.sendDanmaku(text, color);
        }

        function handleVideoError(event) {
            console.error('Video error:', event);
        }

        function handleLoadStart() {
            console.log('Video loading started');
        }

        function handleCanPlay() {
            console.log('Video can play');
            loading.value = false;
        }

        onMounted(() => {
            checkMobile();
            window.addEventListener('resize', checkMobile);
        });

        onBeforeUnmount(() => {
            window.removeEventListener('resize', checkMobile);
            
            // Disconnect WebSocket (automatically removes guest from room)
            wsService.disconnect();
            
            if (hlsInstance) {
                hlsInstance.destroy();
                hlsInstance = null;
            }
        });

        return {
            shareId,
            showNameDialog,
            guestNameInput,
            guestName,
            nameError,
            loading,
            error,
            errorMessage,
            channelName,
            channelLogo,
            hlsUrl,
            videoElement,
            danmakuRef,
            isMobile,
            submitName,
            handleDanmakuSend,
            handleVideoError,
            handleLoadStart,
            handleCanPlay
        };
    }
};
</script>

<style scoped>
.guest-view {
    background: #000;
}

.black-background {
    background-color: #000;
}

.main-content {
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.video-container {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
}

.video-wrapper {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
}

.video-player {
    width: 100%;
    height: 100%;
    max-height: 100vh;
    object-fit: contain;
    background: #000;
}

.error-container {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    padding: 20px;
}

.error-card {
    text-align: center;
}

.loading-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
}

.app-bar-title-custom {
    width: 100%;
}

.channel-name-col {
    overflow: hidden;
}

.channel-name-text {
    font-size: 1.1rem;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

@media (max-width: 768px) {
    .channel-name-text {
        font-size: 0.875rem;
    }
}
</style>
