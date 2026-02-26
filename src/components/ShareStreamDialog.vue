<template>
    <v-dialog v-model="show" max-width="600px" persistent>
        <v-card>
            <v-card-title class="d-flex align-center">
                <v-icon class="mr-2">mdi-share-variant</v-icon>
                Share Stream
            </v-card-title>

            <v-card-text>
                <div v-if="!isSharing">
                    <p class="text-body-1 mb-4">
                        Share your current stream with others. When you start sharing, a unique URL will be generated that you can send to guests.
                    </p>
                    <v-alert type="info" variant="tonal" class="mb-4">
                        <ul class="pl-4">
                            <li>Guests will see whatever channel you're watching</li>
                            <li>They won't have access to your playlist or settings</li>
                            <li>The stream will stop when you stop watching or stop sharing</li>
                        </ul>
                    </v-alert>
                </div>

                <div v-else>
                    <v-alert type="success" variant="tonal" class="mb-4">
                        <div class="d-flex align-center">
                            <v-icon class="mr-2">mdi-check-circle</v-icon>
                            <span class="font-weight-medium">Stream is now being shared</span>
                        </div>
                    </v-alert>

                    <p class="text-body-2 mb-2 font-weight-medium">Share this URL:</p>
                    <v-text-field
                        :model-value="shareUrl"
                        readonly
                        variant="outlined"
                        density="comfortable"
                        class="mb-3"
                        append-inner-icon="mdi-content-copy"
                        @click:append-inner="copyToClipboard"
                        @click="selectText"
                        ref="shareUrlField"
                    ></v-text-field>

                    <v-alert type="info" variant="tonal" density="compact" class="mb-3">
                        <div class="d-flex align-center">
                            <v-icon class="mr-2">mdi-account-multiple</v-icon>
                            <span class="font-weight-medium">
                                {{ guestCount }} viewer{{ guestCount !== 1 ? 's' : '' }}
                            </span>
                        </div>
                    </v-alert>
                    
                    <div v-if="guestCount > 0">
                        <p class="text-body-2 mb-2 font-weight-medium">Currently watching:</p>
                        <v-chip-group column>
                            <v-chip
                                v-for="(guest, index) in guestNames"
                                :key="index"
                                color="primary"
                                variant="tonal"
                                size="small"
                            >
                                <v-icon start size="small">mdi-account</v-icon>
                                {{ guest }}
                            </v-chip>
                        </v-chip-group>
                    </div>
                </div>
            </v-card-text>

            <v-card-actions>
                <v-spacer></v-spacer>
                <v-btn
                    v-if="!isSharing"
                    color="primary"
                    variant="elevated"
                    @click="startSharing"
                    :loading="loading"
                    :disabled="!canShare"
                >
                    <v-icon class="mr-2">mdi-share</v-icon>
                    Start Sharing
                </v-btn>
                <v-btn
                    v-else
                    color="error"
                    variant="elevated"
                    @click="stopSharing"
                    :loading="loading"
                >
                    <v-icon class="mr-2">mdi-stop</v-icon>
                    Stop Sharing
                </v-btn>
                <v-btn
                    variant="text"
                    @click="closeDialog"
                >
                    Close
                </v-btn>
            </v-card-actions>
        </v-card>

        <v-snackbar v-model="snackbar" :timeout="3000" color="success">
            {{ snackbarText }}
            <template v-slot:actions>
                <v-btn variant="text" @click="snackbar = false">Close</v-btn>
            </template>
        </v-snackbar>
    </v-dialog>
</template>

<script>
import { ref, computed, watch } from 'vue';
import { useAppStore } from '@/stores/app';
import { usePlaylistStore } from '@/stores/playlist';
import { apiFetch } from '@/services/api';
import { wsService } from '@/services/websocket.js';

export default {
    name: 'ShareStreamDialog',
    props: {
        modelValue: Boolean
    },
    emits: ['update:modelValue'],
    
    setup(props, { emit }) {
        const app = useAppStore();
        const playlist = usePlaylistStore();
        
        const show = computed({
            get: () => props.modelValue,
            set: (val) => emit('update:modelValue', val)
        });

        const loading = ref(false);
        const snackbar = ref(false);
        const snackbarText = ref('');
        const shareUrlField = ref(null);
        const guestCount = computed(() => wsService.guestCount.value);
        const guestNames = computed(() => wsService.guestNames.value);

        const isSharing = computed(() => app.isSharing);
        const shareId = computed(() => app.shareId);
        const currentChannel = computed(() => playlist.currentChannel);
        const currentStreamId = computed(() => app.currentStreamId);
        
        const canShare = computed(() => {
            return currentChannel.value && currentChannel.value.url && currentStreamId.value;
        });

        const shareUrl = computed(() => {
            if (!shareId.value) return '';
            
            // Use custom domain/port/protocol if configured
            const customDomain = app.customDomain;
            const customPort = app.customPort;
            const customProtocol = app.customProtocol || 'https';
            
            let baseUrl;
            if (customDomain) {
                // Hide default ports (80 for http, 443 for https)
                const shouldShowPort = customPort && 
                    !((customProtocol === 'http' && customPort === '80') || 
                      (customProtocol === 'https' && customPort === '443'));
                
                const portPart = shouldShowPort ? `:${customPort}` : '';
                baseUrl = `${customProtocol}://${customDomain}${portPart}${window.location.pathname}`;
            } else {
                baseUrl = window.location.origin + window.location.pathname;
            }
            
            return `${baseUrl}#/share/${shareId.value}`;
        });

        async function startSharing() {
            if (!canShare.value) {
                snackbarText.value = 'Please start playing a channel first';
                snackbar.value = true;
                return;
            }

            loading.value = true;
            try {
                console.log('[Share] Starting share with streamId:', currentStreamId.value);
                const response = await apiFetch('/share/start', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        streamId: currentStreamId.value,
                        channelName: currentChannel.value.name,
                        channelLogo: currentChannel.value.tvg?.logo || null
                    })
                });

                console.log('[Share] Response status:', response.status);
                
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                    console.error('[Share] Error response:', errorData);
                    throw new Error(errorData.error || `Server error: ${response.status}`);
                }

                const data = await response.json();
                console.log('[Share] Success! ShareId:', data.shareId);
                app.startSharing(data.shareId);
                
                // Connect to WebSocket room as admin
                wsService.connect(data.shareId, app.adminName || 'Admin', 'admin');
                
                // Sync guest updates to app store
                wsService.onGuestUpdate((count, names) => {
                    app.setGuestInfo(count, names);
                });
                
                snackbarText.value = 'Stream sharing started!';
                snackbar.value = true;
            } catch (err) {
                console.error('[Share] Error starting share:', err);
                snackbarText.value = `Failed to start sharing: ${err.message}`;
                snackbar.value = true;
            } finally {
                loading.value = false;
            }
        }

        async function stopSharing() {
            if (!shareId.value) return;

            loading.value = true;
            try {
                const response = await apiFetch(`/share/${shareId.value}`, {
                    method: 'DELETE'
                });

                if (!response.ok) {
                    throw new Error('Failed to stop sharing');
                }

                app.stopSharing();
                wsService.disconnect();
                app.setGuestInfo(0, []);
                
                snackbarText.value = 'Stream sharing stopped';
                snackbar.value = true;
            } catch (err) {
                console.error('Error stopping share:', err);
                snackbarText.value = 'Failed to stop sharing';
                snackbar.value = true;
            } finally {
                loading.value = false;
            }
        }

        function copyToClipboard() {
            if (!shareUrl.value) return;
            
            navigator.clipboard.writeText(shareUrl.value).then(() => {
                snackbarText.value = 'URL copied to clipboard!';
                snackbar.value = true;
            }).catch(err => {
                console.error('Failed to copy:', err);
            });
        }

        function selectText(event) {
            if (event.target.tagName === 'INPUT') {
                event.target.select();
            }
        }

        function closeDialog() {
            show.value = false;
        }

        // Watch for dialog open/close - no polling needed, WebSocket handles updates

        // Clean up on unmount
        watch(() => isSharing.value, (newVal) => {
            if (!newVal) {
                wsService.disconnect();
            }
        });

        return {
            show,
            loading,
            snackbar,
            snackbarText,
            shareUrlField,
            isSharing,
            shareId,
            shareUrl,
            canShare,
            guestCount,
            guestNames,
            startSharing,
            stopSharing,
            copyToClipboard,
            selectText,
            closeDialog
        };
    }
};
</script>

<style scoped>
.v-text-field :deep(input) {
    cursor: pointer;
}
</style>
