<template>
    <v-dialog v-model="model" max-width="600" persistent>
        <v-card>
            <v-card-title class="d-flex align-center">
                <v-icon class="mr-2">mdi-file-import</v-icon>
                Import Playlist
                <v-spacer></v-spacer>
                <v-btn icon variant="text" @click="close">
                    <v-icon>mdi-close</v-icon>
                </v-btn>
            </v-card-title>
            <v-divider></v-divider>
            <v-card-text>
                <!-- Playlist Name -->
                <v-text-field
                    v-model="playlistName"
                    label="Playlist Name"
                    placeholder="My IPTV Playlist"
                    hint="Give your playlist a memorable name"
                    persistent-hint
                    class="mb-4"
                ></v-text-field>

                <!-- Tabs for import method -->
                <v-tabs v-model="importMethod" class="mb-4">
                    <v-tab value="url">
                        <v-icon start>mdi-link</v-icon>
                        URL
                    </v-tab>
                    <v-tab value="file">
                        <v-icon start>mdi-file-upload</v-icon>
                        File
                    </v-tab>
                    <v-tab value="xtream">
                        <v-icon start>mdi-server</v-icon>
                        Xtream
                    </v-tab>
                </v-tabs>

                <v-window v-model="importMethod">
                    <!-- URL Import -->
                    <v-window-item value="url">
                        <v-text-field
                            v-model="playlistUrl"
                            label="Playlist URL"
                            placeholder="https://example.com/playlist.m3u"
                            hint="Enter the URL to your M3U/M3U8 playlist file"
                            persistent-hint
                            clearable
                            :error-messages="urlError"
                            @keyup.enter="importFromUrl"
                        ></v-text-field>
                        <v-btn 
                            color="primary" 
                            class="mt-4" 
                            block
                            @click="importFromUrl"
                            :loading="loading"
                            :disabled="!playlistUrl || !playlistName"
                        >
                            <v-icon start>mdi-download</v-icon>
                            Import from URL
                        </v-btn>
                    </v-window-item>

                    <!-- File Import -->
                    <v-window-item value="file">
                        <v-file-input
                            v-model="playlistFile"
                            label="Select M3U file"
                            accept=".m3u,.m3u8"
                            prepend-icon="mdi-file-video"
                            hint="Select an M3U or M3U8 playlist file from your device"
                            persistent-hint
                            :error-messages="fileError"
                            show-size
                        ></v-file-input>
                        <v-btn 
                            color="primary" 
                            class="mt-4" 
                            block
                            @click="importFromFile"
                            :loading="loading"
                            :disabled="!playlistFile || !playlistName"
                        >
                            <v-icon start>mdi-upload</v-icon>
                            Import from File
                        </v-btn>
                    </v-window-item>

                    <!-- Xtream Import -->
                    <v-window-item value="xtream">
                        <v-text-field
                            v-model="xtreamServer"
                            label="Server URL"
                            placeholder="http://example.com:8080"
                            hint="Xtream server address with port"
                            persistent-hint
                            clearable
                            class="mb-2"
                        ></v-text-field>
                        <v-text-field
                            v-model="xtreamUsername"
                            label="Username"
                            placeholder="Your username"
                            clearable
                            class="mb-2"
                        ></v-text-field>
                        <v-text-field
                            v-model="xtreamPassword"
                            label="Password"
                            placeholder="Your password"
                            :type="showPassword ? 'text' : 'password'"
                            :append-inner-icon="showPassword ? 'mdi-eye-off' : 'mdi-eye'"
                            @click:append-inner="showPassword = !showPassword"
                            clearable
                        ></v-text-field>
                        <v-alert v-if="xtreamError" type="error" density="compact" class="mt-2 mb-2">
                            {{ xtreamError }}
                        </v-alert>
                        <v-btn 
                            color="primary" 
                            class="mt-4" 
                            block
                            @click="importFromXtream"
                            :loading="loading"
                            :disabled="!xtreamServer || !xtreamUsername || !xtreamPassword || !playlistName"
                        >
                            <v-icon start>mdi-cloud-download</v-icon>
                            Import from Xtream
                        </v-btn>
                        <v-expand-transition>
                            <div v-if="xtreamInfo" class="mt-4">
                                <v-alert type="info" variant="tonal" density="compact">
                                    <div class="text-subtitle-2 mb-1">Account Info</div>
                                    <div class="text-caption">
                                        <div v-if="xtreamInfo.userInfo?.exp_date">
                                            Expires: {{ formatExpiry(xtreamInfo.userInfo.exp_date) }}
                                        </div>
                                        <div>{{ xtreamInfo.channelCount }} channels in {{ xtreamInfo.categoryCount }} categories</div>
                                    </div>
                                </v-alert>
                            </div>
                        </v-expand-transition>
                    </v-window-item>
                </v-window>

                <!-- Success message -->
                <v-alert v-if="successMessage" type="success" class="mt-4" density="compact" closable>
                    {{ successMessage }}
                </v-alert>

                <!-- Info about saved playlists -->
                <v-alert v-if="savedPlaylistCount > 0" type="info" variant="tonal" class="mt-4" density="compact">
                    <div class="d-flex align-center">
                        <span>{{ savedPlaylistCount }} playlist{{ savedPlaylistCount !== 1 ? 's' : '' }} saved</span>
                        <v-spacer></v-spacer>
                        <v-chip v-if="hasEpg" size="small" color="success" variant="flat">
                            <v-icon start size="small">mdi-television-guide</v-icon>
                            EPG loaded
                        </v-chip>
                    </div>
                </v-alert>
            </v-card-text>
            <v-divider></v-divider>
            <v-card-actions>
                <v-spacer></v-spacer>
                <v-btn variant="text" @click="close">Close</v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { usePlaylistStore } from '@/stores/playlist';
import { useEpgStore } from '@/stores/epg';
import { fetchAndConvertToM3U } from '@/services/xtream';

const model = defineModel({ type: Boolean, default: false });

const playlist = usePlaylistStore();
const epg = useEpgStore();

const importMethod = ref('url');
const playlistName = ref('');
const playlistUrl = ref('');
const playlistFile = ref(null);
const loading = ref(false);
const urlError = ref('');
const fileError = ref('');
const successMessage = ref('');

// Xtream fields
const xtreamServer = ref('');
const xtreamUsername = ref('');
const xtreamPassword = ref('');
const xtreamError = ref('');
const xtreamInfo = ref(null);
const showPassword = ref(false);

const savedPlaylistCount = computed(() => playlist.savedPlaylists.length);
const hasEpg = computed(() => epg.isLoaded);

// Auto-generate name from file if not set
watch(playlistFile, (file) => {
    if (file && !playlistName.value) {
        playlistName.value = file.name.replace(/\.(m3u8?|M3U8?)$/, '');
    }
});

async function importFromUrl() {
    if (!playlistUrl.value || !playlistName.value) return;
    
    loading.value = true;
    urlError.value = '';
    successMessage.value = '';
    
    try {
        // Use the CORS proxy for external URLs
        const proxyUrl = `http://localhost:8888/${playlistUrl.value}`;
        const response = await fetch(proxyUrl);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch playlist: ${response.status} ${response.statusText}`);
        }
        
        const content = await response.text();
        
        if (!content.includes('#EXTM3U')) {
            throw new Error('Invalid playlist format. File must be a valid M3U/M3U8 playlist.');
        }
        
        // Save the playlist with name and URL
        playlist.savePlaylist(playlistName.value, content, playlistUrl.value);
        successMessage.value = `Successfully imported "${playlistName.value}" with ${playlist.channels.length} channels`;
        
        // Clear the inputs after successful import
        playlistUrl.value = '';
        playlistName.value = '';
        
    } catch (err) {
        console.error('Error importing playlist from URL:', err);
        urlError.value = err.message || 'Failed to import playlist';
    } finally {
        loading.value = false;
    }
}

async function importFromFile() {
    if (!playlistFile.value || !playlistName.value) return;
    
    loading.value = true;
    fileError.value = '';
    successMessage.value = '';
    
    try {
        const file = playlistFile.value;
        const content = await file.text();
        
        if (!content.includes('#EXTM3U')) {
            throw new Error('Invalid playlist format. File must be a valid M3U/M3U8 playlist.');
        }
        
        // Save the playlist with name (no URL for file imports)
        playlist.savePlaylist(playlistName.value, content, null);
        successMessage.value = `Successfully imported "${playlistName.value}" with ${playlist.channels.length} channels`;
        
        // Clear the inputs after successful import
        playlistFile.value = null;
        playlistName.value = '';
        
    } catch (err) {
        console.error('Error importing playlist from file:', err);
        fileError.value = err.message || 'Failed to read playlist file';
    } finally {
        loading.value = false;
    }
}

async function importFromXtream() {
    if (!xtreamServer.value || !xtreamUsername.value || !xtreamPassword.value || !playlistName.value) return;
    
    loading.value = true;
    xtreamError.value = '';
    xtreamInfo.value = null;
    successMessage.value = '';
    
    try {
        // Fetch and convert Xtream data to M3U
        const result = await fetchAndConvertToM3U(
            xtreamServer.value,
            xtreamUsername.value,
            xtreamPassword.value
        );
        
        xtreamInfo.value = result;
        
        // Save the playlist with Xtream credentials stored
        playlist.savePlaylist(playlistName.value, result.m3uContent, null, {
            type: 'xtream',
            server: xtreamServer.value,
            username: xtreamUsername.value,
            password: xtreamPassword.value,
            epgUrl: result.epgUrl
        });
        
        // Auto-load EPG from Xtream
        if (result.epgUrl) {
            playlist.setEpgUrl(result.epgUrl);
        }
        
        successMessage.value = `Successfully imported "${playlistName.value}" with ${result.channelCount} channels from Xtream`;
        
        // Clear the inputs after successful import
        playlistName.value = '';
        // Keep credentials for convenience
        
    } catch (err) {
        console.error('Error importing from Xtream:', err);
        xtreamError.value = err.message || 'Failed to connect to Xtream server';
    } finally {
        loading.value = false;
    }
}

function formatExpiry(timestamp) {
    if (!timestamp) return 'Unknown';
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString();
}

function close() {
    model.value = false;
    urlError.value = '';
    fileError.value = '';
    xtreamError.value = '';
    successMessage.value = '';
}
</script>

<style scoped>
</style>
