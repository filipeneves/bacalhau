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
                    <p class="mt-4">Loading stream...</p>
                </div>
                <div v-else class="video-wrapper">
                    <video ref="videoElement" v-if="hlsUrl" 
                        controls autoplay
                        class="video-player"
                        @error="handleVideoError"
                        @loadstart="handleLoadStart"
                        @canplay="handleCanPlay"></video>
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
import Hls from 'hls.js';

export default {
    name: 'GuestView',
    
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
        const lastUpdatedAt = ref('');
        
        const videoElement = ref(null);
        let hlsInstance = null;
        let healthCheckInterval = null;

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
                // Register as a guest
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
                lastUpdatedAt.value = data.updatedAt;
                
                // Construct full HLS URL using the transcoder URL
                const relativeHlsUrl = data.hlsUrl;
                hlsUrl.value = relativeHlsUrl.startsWith('http') 
                    ? relativeHlsUrl 
                    : `${transcoderUrl}${relativeHlsUrl}`;
                
                console.log('[Guest] HLS URL:', hlsUrl.value);
                console.log('[Guest] Stream ID:', currentStreamId.value);
                
                // Set loading to false so the video element renders
                loading.value = false;
                
                // Wait for Vue to render the video element
                await nextTick();
                
                console.log('[Guest] Video element after nextTick:', videoElement.value);

                // Initialize video player
                await initializePlayer();
                
                // Start health check
                startHealthCheck();
            } catch (err) {
                console.error('[Error joining stream:', err);
                error.value = true;
                errorMessage.value = err.message || 'Failed to connect to stream. Please check the URL and try again.';
                loading.value = false;
            }
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

                hlsInstance.on(Hls.Events.ERROR, (event, data) => {
                    console.error('[Guest] HLS error:', event, data);
                    if (data.fatal) {
                        console.error('HLS fatal error:', data);
                        switch (data.type) {
                            case Hls.ErrorTypes.NETWORK_ERROR:
                                // Try to recover
                                console.log('Attempting to recover from network error...');
                                hlsInstance.startLoad();
                                break;
                            case Hls.ErrorTypes.MEDIA_ERROR:
                                console.log('Attempting to recover from media error...');
                                hlsInstance.recoverMediaError();
                                break;
                            default:
                                error.value = true;
                                errorMessage.value = 'Stream playback error. The stream may have ended.';
                                stopHealthCheck();
                                break;
                        }
                    }
                });
            } else if (videoElement.value.canPlayType('application/vnd.apple.mpegurl')) {
                // Native HLS support (Safari)
                videoElement.value.src = hlsUrl.value;
            } else {
                error.value = true;
                errorMessage.value = 'Your browser does not support HLS playback.';
            }
        }

        async function checkStreamHealth() {
            try {
                const response = await apiFetch(`/share/${shareId.value}/status`);
                
                if (!response.ok) {
                    throw new Error('Stream is offline');
                }
                
                const data = await response.json();
                if (!data.active) {
                    throw new Error('The owner has stopped sharing this stream.');
                }
                
                // Check if the channel/stream has changed
                if (data.streamId !== currentStreamId.value) {
                    console.log('[Guest] Channel changed! Reloading stream...');
                    console.log('[Guest] Old stream:', currentStreamId.value);
                    console.log('[Guest] New stream:', data.streamId);
                    
                    // Update channel info
                    channelName.value = data.channelName || 'Shared Stream';
                    channelLogo.value = data.channelLogo || '';
                    currentStreamId.value = data.streamId;
                    lastUpdatedAt.value = data.updatedAt;
                    
                    // Construct new HLS URL
                    const relativeHlsUrl = data.hlsUrl;
                    const newHlsUrl = relativeHlsUrl.startsWith('http') 
                        ? relativeHlsUrl 
                        : `${transcoderUrl}${relativeHlsUrl}`;
                    
                    // Reload the player with new stream
                    hlsUrl.value = newHlsUrl;
                    await reloadPlayer();
                }
            } catch (err) {
                console.error('[Guest] Stream health check failed:', err);
                error.value = true;
                errorMessage.value = err.message || 'The stream is no longer available.';
                stopHealthCheck();
                
                // Clean up video player
                if (hlsInstance) {
                    hlsInstance.destroy();
                    hlsInstance = null;
                }
            }
        }

        function startHealthCheck() {
            stopHealthCheck();
            // Check every 10 seconds
            healthCheckInterval = setInterval(checkStreamHealth, 10000);
        }

        function stopHealthCheck() {
            if (healthCheckInterval) {
                clearInterval(healthCheckInterval);
                healthCheckInterval = null;
            }
        }
        
        async function reloadPlayer() {
            console.log('[Guest] Reloading player with new stream');
            
            // Destroy existing player
            if (hlsInstance) {
                hlsInstance.destroy();
                hlsInstance = null;
            }
            
            // Wait a moment for cleanup
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Reinitialize player
            await initializePlayer();
        }

        function handleVideoError(event) {
            console.error('Video error:', event);
            // Health check will handle showing the error
        }

        function handleLoadStart() {
            console.log('Video loading started');
        }

        function handleCanPlay() {
            console.log('Video can play');
            loading.value = false;
        }

        // Notify server when guest leaves
        function notifyLeave() {
            if (shareId.value && guestName.value) {
                // Use sendBeacon for more reliable delivery when page is unloading
                const url = `${getTranscoderUrl()}/share/${shareId.value}/leave`;
                const data = JSON.stringify({ guestName: guestName.value });
                
                if (navigator.sendBeacon) {
                    const blob = new Blob([data], { type: 'application/json' });
                    navigator.sendBeacon(url, blob);
                } else {
                    // Fallback to regular fetch
                    apiFetch(`/share/${shareId.value}/leave`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: data
                    }).catch(err => console.error('Error notifying leave:', err));
                }
            }
        }

        // Add beforeunload listener for more reliable cleanup
        onMounted(() => {
            window.addEventListener('beforeunload', notifyLeave);
        });

        onBeforeUnmount(() => {
            window.removeEventListener('beforeunload', notifyLeave);
            stopHealthCheck();
            if (hlsInstance) {
                hlsInstance.destroy();
                hlsInstance = null;
            }
            
            // Notify server that guest is leaving
            notifyLeave();
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
            submitName,
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
