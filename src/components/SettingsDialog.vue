<template>
    <v-dialog v-model="model" max-width="1000" persistent>
        <v-card class="settings-dialog">
            <div class="settings-container">
                <!-- Left sidebar with categories -->
                <div class="settings-sidebar">
                    <v-list nav dense>
                        <v-list-item
                            v-for="category in categories"
                            :key="category.id"
                            :value="category.id"
                            :active="activeCategory === category.id"
                            @click="activeCategory = category.id"
                            rounded
                        >
                            <template v-slot:prepend>
                                <v-icon>{{ category.icon }}</v-icon>
                            </template>
                            <v-list-item-title>{{ category.title }}</v-list-item-title>
                        </v-list-item>
                    </v-list>
                </div>

                <!-- Right content panel -->
                <div class="settings-content">
                    <v-card-title class="d-flex align-center">
                        <v-icon class="mr-2">{{ currentCategory.icon }}</v-icon>
                        {{ currentCategory.title }}
                        <v-spacer></v-spacer>
                        <v-btn icon variant="text" @click="close">
                            <v-icon>mdi-close</v-icon>
                        </v-btn>
                    </v-card-title>
                    <v-divider></v-divider>
                    <v-card-text class="settings-panel">
                        <!-- General Settings -->
                        <div v-if="activeCategory === 'general'" class="settings-section">
                            <v-switch
                                v-model="darkMode"
                                label="Dark Mode"
                                hint="Toggle between dark and light theme"
                                persistent-hint
                                color="primary"
                            ></v-switch>
                            <v-divider class="my-4"></v-divider>
                            <p class="text-caption text-grey">App Version: {{ version }}</p>
                        </div>

                        <!-- Transcoding Settings -->
                        <div v-if="activeCategory === 'transcoding'" class="settings-section">
                            <v-alert type="info" variant="tonal" class="mb-4" density="compact">
                                GPU acceleration requires appropriate drivers and FFmpeg compiled with hardware support.
                            </v-alert>

                            <v-text-field
                                v-model="transcoderUrlSetting"
                                label="Transcoder Server URL"
                                placeholder="http://localhost:3001"
                                hint="URL of the transcoder service"
                                persistent-hint
                                density="compact"
                                clearable
                                @blur="saveTranscoderUrl"
                            ></v-text-field>

                            <v-divider class="my-4"></v-divider>

                            <p class="text-subtitle-2 mb-3">
                                <v-icon size="18" class="mr-1">mdi-memory</v-icon>
                                Hardware Acceleration
                            </p>

                            <v-radio-group v-model="hwAcceleration" @update:model-value="saveHwAcceleration">
                                <v-radio value="cpu">
                                    <template #label>
                                        <div>
                                            <span class="font-weight-medium">CPU (Software)</span>
                                            <p class="text-caption text-grey mb-0">
                                                Uses libx264/libx265. Works everywhere, higher CPU usage.
                                            </p>
                                        </div>
                                    </template>
                                </v-radio>
                                <v-radio value="nvenc">
                                    <template #label>
                                        <div>
                                            <span class="font-weight-medium">NVIDIA NVENC</span>
                                            <v-chip size="x-small" color="success" class="ml-2">GPU</v-chip>
                                            <p class="text-caption text-grey mb-0">
                                                For NVIDIA GPUs (GTX 600+). Fast encoding with low CPU usage.
                                            </p>
                                        </div>
                                    </template>
                                </v-radio>
                                <v-radio value="qsv">
                                    <template #label>
                                        <div>
                                            <span class="font-weight-medium">Intel Quick Sync</span>
                                            <v-chip size="x-small" color="info" class="ml-2">GPU</v-chip>
                                            <p class="text-caption text-grey mb-0">
                                                For Intel CPUs with integrated graphics (6th gen+).
                                            </p>
                                        </div>
                                    </template>
                                </v-radio>
                                <v-radio value="vaapi">
                                    <template #label>
                                        <div>
                                            <span class="font-weight-medium">VAAPI (Linux)</span>
                                            <v-chip size="x-small" color="warning" class="ml-2">GPU</v-chip>
                                            <p class="text-caption text-grey mb-0">
                                                Linux VA-API for Intel/AMD. Requires vainfo installed.
                                            </p>
                                        </div>
                                    </template>
                                </v-radio>
                                <v-radio value="amf">
                                    <template #label>
                                        <div>
                                            <span class="font-weight-medium">AMD AMF</span>
                                            <v-chip size="x-small" color="error" class="ml-2">GPU</v-chip>
                                            <p class="text-caption text-grey mb-0">
                                                For AMD GPUs (RX 400+). Windows/Linux with ROCm.
                                            </p>
                                        </div>
                                    </template>
                                </v-radio>
                                <v-radio value="videotoolbox">
                                    <template #label>
                                        <div>
                                            <span class="font-weight-medium">VideoToolbox (macOS)</span>
                                            <v-chip size="x-small" color="purple" class="ml-2">GPU</v-chip>
                                            <p class="text-caption text-grey mb-0">
                                                Native macOS hardware encoding. Apple Silicon & Intel Macs.
                                            </p>
                                        </div>
                                    </template>
                                </v-radio>
                            </v-radio-group>

                            <v-divider class="my-4"></v-divider>

                            <v-switch
                                v-model="hwDecoding"
                                label="Hardware Decoding"
                                hint="Use GPU for decoding input streams (reduces CPU usage)"
                                persistent-hint
                                color="primary"
                                @update:model-value="saveHwDecoding"
                            ></v-switch>

                            <v-divider class="my-4"></v-divider>

                            <p class="text-subtitle-2 mb-3">
                                <v-icon size="18" class="mr-1">mdi-speedometer</v-icon>
                                Encoding Preset
                            </p>

                            <v-select
                                v-model="transcodingPreset"
                                :items="presetOptions"
                                item-title="title"
                                item-value="value"
                                label="Encoding Speed"
                                hint="Faster = lower quality, Slower = better quality"
                                persistent-hint
                                density="compact"
                                @update:model-value="saveTranscodingPreset"
                            ></v-select>

                            <v-divider class="my-4"></v-divider>

                            <p class="text-subtitle-2 mb-3">
                                <v-icon size="18" class="mr-1">mdi-tune</v-icon>
                                Quality Profile
                            </p>

                            <v-btn-toggle
                                v-model="transcodingQuality"
                                mandatory
                                divided
                                density="compact"
                                color="primary"
                                @update:model-value="saveTranscodingQuality"
                            >
                                <v-btn value="performance">
                                    <v-icon start>mdi-lightning-bolt</v-icon>
                                    Performance
                                </v-btn>
                                <v-btn value="balanced">
                                    <v-icon start>mdi-scale-balance</v-icon>
                                    Balanced
                                </v-btn>
                                <v-btn value="quality">
                                    <v-icon start>mdi-diamond</v-icon>
                                    Quality
                                </v-btn>
                            </v-btn-toggle>
                            <p class="text-caption text-grey mt-2">
                                {{ qualityDescription }}
                            </p>
                        </div>

                        <!-- Recording Settings -->
                        <div v-if="activeCategory === 'recording'" class="settings-section">
                            <v-alert type="info" variant="tonal" class="mb-4">
                                Recordings are stored on the transcoder server. Configure the transcoder URL in the Transcoding tab.
                            </v-alert>
                            <div class="d-flex align-center">
                                <div>
                                    <p class="text-subtitle-2">Recording Status</p>
                                    <p class="text-caption text-grey">
                                        {{ recordingSupported ? 'Ready - Stream is active' : 'Unavailable - No active stream' }}
                                    </p>
                                </div>
                                <v-spacer></v-spacer>
                                <v-chip 
                                    :color="recordingSupported ? 'success' : 'grey'" 
                                    size="small"
                                >
                                    {{ recordingSupported ? 'Ready' : 'Inactive' }}
                                </v-chip>
                            </div>
                            <v-divider class="my-4"></v-divider>
                            <p class="text-caption text-grey">
                                <v-icon size="14" class="mr-1">mdi-server</v-icon>
                                Transcoder: {{ transcoderUrlSetting }}
                            </p>
                        </div>

                        <!-- Credits -->
                        <div v-if="activeCategory === 'credits'" class="settings-section">
                            <div class="text-center mb-6">
                                <img src="/logo.png" alt="bacalhau Logo" width="120" height="120" class="mb-4">
                                <h2 class="text-h5 font-weight-bold">bacalhau</h2>
                                <p class="text-subtitle-1 text-grey">Self-hosted IPTV Player for NAS and Docker</p>
                                <v-chip color="primary" variant="tonal" class="mt-2">
                                    v{{ version }}
                                </v-chip>
                            </div>

                            <v-divider class="my-4"></v-divider>

                            <v-list lines="two" class="bg-transparent">
                                <v-list-item>
                                    <template v-slot:prepend>
                                        <v-avatar color="primary" variant="tonal">
                                            <v-icon>mdi-account</v-icon>
                                        </v-avatar>
                                    </template>
                                    <v-list-item-title>Created by</v-list-item-title>
                                    <v-list-item-subtitle>Filipe Neves</v-list-item-subtitle>
                                </v-list-item>

                                <v-list-item href="https://github.com/pfrfrfr/bacalhau" target="_blank">
                                    <template v-slot:prepend>
                                        <v-avatar color="grey-darken-3" variant="tonal">
                                            <v-icon>mdi-github</v-icon>
                                        </v-avatar>
                                    </template>
                                    <v-list-item-title>GitHub Repository</v-list-item-title>
                                    <v-list-item-subtitle>github.com/pfrfrfr/bacalhau</v-list-item-subtitle>
                                    <template v-slot:append>
                                        <v-icon size="small">mdi-open-in-new</v-icon>
                                    </template>
                                </v-list-item>

                                <v-list-item href="mailto:me@filipeneves.net">
                                    <template v-slot:prepend>
                                        <v-avatar color="info" variant="tonal">
                                            <v-icon>mdi-email</v-icon>
                                        </v-avatar>
                                    </template>
                                    <v-list-item-title>Contact</v-list-item-title>
                                    <v-list-item-subtitle>me@filipeneves.net</v-list-item-subtitle>
                                </v-list-item>
                            </v-list>

                            <v-divider class="my-4"></v-divider>

                            <p class="text-subtitle-2 mb-3">
                                <v-icon size="18" class="mr-1">mdi-package-variant</v-icon>
                                Built with
                            </p>
                            <div class="d-flex flex-wrap ga-2">
                                <v-chip size="small" variant="outlined">Vue 3</v-chip>
                                <v-chip size="small" variant="outlined">Vuetify 3</v-chip>
                                <v-chip size="small" variant="outlined">HLS.js</v-chip>
                                <v-chip size="small" variant="outlined">mpegts.js</v-chip>
                                <v-chip size="small" variant="outlined">FFmpeg</v-chip>
                                <v-chip size="small" variant="outlined">Docker</v-chip>
                            </div>

                            <v-divider class="my-4"></v-divider>

                            <p class="text-caption text-grey text-center">
                                🐟 <em>bacalhau</em> means codfish in Portuguese
                            </p>
                            <p class="text-caption text-grey text-center mt-1">
                                🇫🇷 Cooked in France & Luxembourg 🇱🇺 by a Portuguese 🇵🇹
                            </p>
                        </div>

                        <!-- Playlist Settings -->
                        <div v-if="activeCategory === 'playlist'" class="settings-section">
                            <div v-if="savedPlaylists.length === 0" class="text-center py-8">
                                <v-icon size="64" color="grey">mdi-playlist-music-outline</v-icon>
                                <p class="text-h6 mt-4">No playlists yet</p>
                                <p class="text-caption text-grey">Import a playlist to get started.</p>
                            </div>

                            <!-- Playlist list with expansion panels -->
                            <v-expansion-panels v-else v-model="expandedPlaylist" variant="accordion">
                                <v-expansion-panel
                                    v-for="pl in savedPlaylists"
                                    :key="pl.id"
                                    :value="pl.id"
                                >
                                    <v-expansion-panel-title>
                                        <div class="d-flex align-center flex-grow-1">
                                            <v-avatar 
                                                :color="pl.id === activePlaylistId ? 'primary' : (pl.xtream ? 'purple' : 'grey')" 
                                                variant="tonal"
                                                size="36"
                                                class="mr-3"
                                            >
                                                <v-icon size="20">{{ pl.xtream ? 'mdi-server' : 'mdi-playlist-play' }}</v-icon>
                                            </v-avatar>
                                            <div class="flex-grow-1">
                                                <div class="d-flex align-center">
                                                    <span class="font-weight-medium">{{ pl.name }}</span>
                                                    <v-chip 
                                                        v-if="pl.id === activePlaylistId" 
                                                        size="x-small" 
                                                        color="primary" 
                                                        class="ml-2"
                                                    >
                                                        Active
                                                    </v-chip>
                                                    <v-chip 
                                                        v-if="pl.xtream" 
                                                        size="x-small" 
                                                        color="purple" 
                                                        variant="outlined"
                                                        class="ml-1"
                                                    >
                                                        Xtream
                                                    </v-chip>
                                                </div>
                                                <div class="text-caption text-grey">
                                                    {{ pl.channelCount }} channels • Added {{ formatDate(pl.addedAt) }}
                                                </div>
                                            </div>
                                        </div>
                                    </v-expansion-panel-title>

                                    <v-expansion-panel-text>
                                        <!-- Playlist actions -->
                                        <div class="d-flex gap-2 mb-4">
                                            <v-btn 
                                                v-if="pl.id !== activePlaylistId"
                                                color="primary" 
                                                size="small"
                                                @click="switchPlaylist(pl.id)"
                                            >
                                                <v-icon left>mdi-check</v-icon>
                                                Set Active
                                            </v-btn>
                                            <v-btn 
                                                v-if="pl.xtream"
                                                color="secondary" 
                                                size="small"
                                                variant="outlined"
                                                @click="refreshXtreamPlaylist(pl)"
                                                :loading="refreshingPlaylistId === pl.id"
                                            >
                                                <v-icon left>mdi-refresh</v-icon>
                                                Refresh
                                            </v-btn>
                                            <v-spacer></v-spacer>
                                            <v-btn 
                                                color="error" 
                                                size="small"
                                                variant="outlined"
                                                @click="confirmDeletePlaylist(pl)"
                                            >
                                                <v-icon left>mdi-delete</v-icon>
                                                Delete
                                            </v-btn>
                                        </div>

                                        <!-- EPG Settings for this playlist -->
                                        <v-divider class="mb-4"></v-divider>
                                        <p class="text-subtitle-2 mb-2">
                                            <v-icon size="18" class="mr-1">mdi-television-guide</v-icon>
                                            EPG Source
                                        </p>
                                        <v-text-field
                                            v-model="playlistEpgInputs[pl.id]"
                                            label="EPG URL (XMLTV format)"
                                            placeholder="https://example.com/epg.xml"
                                            hint="Enter the URL to your XMLTV EPG file and click Load"
                                            persistent-hint
                                            density="compact"
                                            clearable
                                            @keyup.enter="saveAndLoadEpg(pl.id)"
                                        >
                                            <template #append-inner>
                                                <v-btn 
                                                    color="primary"
                                                    variant="tonal" 
                                                    size="x-small"
                                                    :loading="loadingEpgFor === pl.id"
                                                    @click="saveAndLoadEpg(pl.id)"
                                                >
                                                    Load EPG
                                                </v-btn>
                                            </template>
                                        </v-text-field>

                                        <!-- Category/Channel Management -->
                                        <v-divider class="my-4"></v-divider>
                                        <div class="d-flex align-center mb-2">
                                            <p class="text-subtitle-2">
                                                <v-icon size="18" class="mr-1">mdi-folder-star</v-icon>
                                                Categories & Channels
                                            </p>
                                            <v-spacer></v-spacer>
                                            <v-btn 
                                                size="x-small" 
                                                variant="text"
                                                @click="loadPlaylistCategories(pl)"
                                                :loading="loadingCategoriesFor === pl.id"
                                            >
                                                <v-icon left>mdi-refresh</v-icon>
                                                Load
                                            </v-btn>
                                        </div>
                                        
                                        <div v-if="playlistCategories[pl.id]" class="category-manager">
                                            <v-text-field
                                                v-model="categorySearch[pl.id]"
                                                placeholder="Search categories/channels..."
                                                prepend-inner-icon="mdi-magnify"
                                                density="compact"
                                                hide-details
                                                clearable
                                                class="mb-2"
                                            ></v-text-field>
                                            
                                            <div class="category-list">
                                                <v-list density="compact" class="pa-0">
                                                    <template v-for="(channels, catName) in getFilteredCategories(pl.id)" :key="catName">
                                                        <!-- Category header -->
                                                        <v-list-item 
                                                            class="category-item"
                                                            :class="{ 'hidden-item': isHiddenCategory(pl, catName) }"
                                                        >
                                                            <template #prepend>
                                                                <v-btn 
                                                                    icon 
                                                                    variant="text" 
                                                                    size="x-small"
                                                                    @click="toggleCategoryExpand(pl.id, catName)"
                                                                >
                                                                    <v-icon size="16">
                                                                        {{ expandedCategories[pl.id]?.[catName] ? 'mdi-chevron-down' : 'mdi-chevron-right' }}
                                                                    </v-icon>
                                                                </v-btn>
                                                                <v-icon size="18" class="mr-1" color="primary">mdi-folder</v-icon>
                                                            </template>
                                                            <v-list-item-title class="text-body-2">
                                                                {{ catName }}
                                                                <v-chip size="x-small" class="ml-1">{{ channels.length }}</v-chip>
                                                            </v-list-item-title>
                                                            <template #append>
                                                                <v-btn
                                                                    icon
                                                                    variant="text"
                                                                    size="x-small"
                                                                    :color="isFavoriteCategory(pl, catName) ? 'warning' : 'grey'"
                                                                    @click="toggleFavCategory(pl.id, catName)"
                                                                    title="Favorite"
                                                                >
                                                                    <v-icon size="16">{{ isFavoriteCategory(pl, catName) ? 'mdi-star' : 'mdi-star-outline' }}</v-icon>
                                                                </v-btn>
                                                                <v-btn
                                                                    icon
                                                                    variant="text"
                                                                    size="x-small"
                                                                    :color="isHiddenCategory(pl, catName) ? 'error' : 'grey'"
                                                                    @click="toggleHideCategory(pl.id, catName)"
                                                                    title="Hide"
                                                                >
                                                                    <v-icon size="16">{{ isHiddenCategory(pl, catName) ? 'mdi-eye-off' : 'mdi-eye' }}</v-icon>
                                                                </v-btn>
                                                            </template>
                                                        </v-list-item>

                                                        <!-- Channels in category (when expanded) -->
                                                        <template v-if="expandedCategories[pl.id]?.[catName]">
                                                            <v-list-item
                                                                v-for="channel in channels"
                                                                :key="channel.url"
                                                                class="channel-item"
                                                                :class="{ 'hidden-item': isHiddenChannel(pl, channel.url) }"
                                                            >
                                                                <template #prepend>
                                                                    <v-avatar size="24" class="ml-6 mr-2">
                                                                        <v-img :src="channel.tvg?.logo" v-if="channel.tvg?.logo">
                                                                            <template #error>
                                                                                <v-icon size="16">mdi-television</v-icon>
                                                                            </template>
                                                                        </v-img>
                                                                        <v-icon v-else size="16">mdi-television</v-icon>
                                                                    </v-avatar>
                                                                </template>
                                                                <v-list-item-title class="text-body-2">
                                                                    {{ channel.name }}
                                                                </v-list-item-title>
                                                                <template #append>
                                                                    <v-btn
                                                                        icon
                                                                        variant="text"
                                                                        size="x-small"
                                                                        :color="isFavoriteChannel(pl, channel.url) ? 'warning' : 'grey'"
                                                                        @click="toggleFavChannel(pl.id, channel.url)"
                                                                        title="Favorite"
                                                                    >
                                                                        <v-icon size="16">{{ isFavoriteChannel(pl, channel.url) ? 'mdi-star' : 'mdi-star-outline' }}</v-icon>
                                                                    </v-btn>
                                                                    <v-btn
                                                                        icon
                                                                        variant="text"
                                                                        size="x-small"
                                                                        :color="isHiddenChannel(pl, channel.url) ? 'error' : 'grey'"
                                                                        @click="toggleHideChannel(pl.id, channel.url)"
                                                                        title="Hide"
                                                                    >
                                                                        <v-icon size="16">{{ isHiddenChannel(pl, channel.url) ? 'mdi-eye-off' : 'mdi-eye' }}</v-icon>
                                                                    </v-btn>
                                                                </template>
                                                            </v-list-item>
                                                        </template>
                                                    </template>
                                                </v-list>
                                            </div>
                                        </div>
                                        <div v-else class="text-center py-4 text-grey">
                                            <p class="text-caption">Click "Load" to manage categories and channels</p>
                                        </div>
                                    </v-expansion-panel-text>
                                </v-expansion-panel>
                            </v-expansion-panels>
                        </div>
                    </v-card-text>
                </div>
            </div>
        </v-card>

        <!-- Delete Playlist Confirmation -->
        <v-dialog v-model="showDeleteConfirm" max-width="400">
            <v-card>
                <v-card-title>Delete Playlist?</v-card-title>
                <v-card-text>
                    Are you sure you want to delete "{{ playlistToDelete?.name }}"? 
                    This action cannot be undone.
                </v-card-text>
                <v-card-actions>
                    <v-spacer></v-spacer>
                    <v-btn variant="text" @click="showDeleteConfirm = false">Cancel</v-btn>
                    <v-btn color="error" variant="flat" @click="deletePlaylistConfirmed">
                        Delete
                    </v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>
    </v-dialog>
</template>

<script setup>
import { ref, computed, watch, reactive } from 'vue';
import { useAppStore } from '@/stores/app';
import { useEpgStore } from '@/stores/epg';
import { usePlaylistStore } from '@/stores/playlist';
import { useTheme } from 'vuetify';
import { storeToRefs } from 'pinia';
import { fetchAndConvertToM3U } from '@/services/xtream';
import { parse } from 'iptv-playlist-parser';

// API base URL for playlist storage
const TRANSCODER_URL = import.meta.env.VITE_TRANSCODER_URL || 'http://localhost:3001';

const model = defineModel({ type: Boolean, default: false });

const app = useAppStore();
const epg = useEpgStore();
const playlistStore = usePlaylistStore();
const theme = useTheme();

const categories = [
    { id: 'general', title: 'General', icon: 'mdi-cog' },
    { id: 'playlist', title: 'Playlists', icon: 'mdi-playlist-play' },
    { id: 'transcoding', title: 'Transcoding', icon: 'mdi-video-switch' },
    { id: 'recording', title: 'Recording', icon: 'mdi-record-circle' },
    { id: 'credits', title: 'Credits', icon: 'mdi-information' },
];

const activeCategory = ref('general');

const currentCategory = computed(() => {
    return categories.find(c => c.id === activeCategory.value) || categories[0];
});

// General settings
const darkMode = ref(app.isDarkMode);
const version = computed(() => app.version);

watch(darkMode, (newVal) => {
    app.setDarkMode(newVal);
    theme.global.name.value = newVal ? 'dark' : 'light';
});

// Transcoding settings
const transcoderUrlSetting = ref(app.transcoderUrl);
const hwAcceleration = ref(app.hwAcceleration);
const hwDecoding = ref(app.hwDecoding);
const transcodingPreset = ref(app.transcodingPreset);
const transcodingQuality = ref(app.transcodingQuality);

const presetOptions = [
    { title: 'Ultrafast (lowest quality, fastest)', value: 'ultrafast' },
    { title: 'Superfast', value: 'superfast' },
    { title: 'Veryfast', value: 'veryfast' },
    { title: 'Faster', value: 'faster' },
    { title: 'Fast (recommended for live)', value: 'fast' },
    { title: 'Medium (balanced)', value: 'medium' },
    { title: 'Slow (higher quality)', value: 'slow' },
];

const qualityDescription = computed(() => {
    switch (transcodingQuality.value) {
        case 'performance':
            return 'Optimized for low latency. Lower bitrate, faster encoding.';
        case 'balanced':
            return 'Good balance between quality and performance. Recommended for most users.';
        case 'quality':
            return 'Higher bitrate and better quality. May increase latency.';
        default:
            return '';
    }
});

function saveTranscoderUrl() {
    app.setTranscoderUrl(transcoderUrlSetting.value);
}

function saveHwAcceleration(value) {
    app.setHwAcceleration(value);
}

function saveHwDecoding(value) {
    app.setHwDecoding(value);
}

function saveTranscodingPreset(value) {
    app.setTranscodingPreset(value);
}

function saveTranscodingQuality(value) {
    app.setTranscodingQuality(value);
}

// EPG settings
const epgUrlInput = ref(playlistStore.epgUrl || '');
const autoLoadEpg = ref(false);
const epgLoading = computed(() => epg.isLoading);
const epgLoaded = computed(() => epg.isLoaded);
const epgChannelCount = computed(() => epg.channelIds.length);

function loadEpgFromUrl() {
    if (epgUrlInput.value) {
        playlistStore.setEpgUrl(epgUrlInput.value);
    }
}

// Recording settings
const { recordingSupported } = storeToRefs(app);

// Playlist settings
const { savedPlaylists, activePlaylistId } = storeToRefs(playlistStore);
const showDeleteConfirm = ref(false);
const playlistToDelete = ref(null);
const refreshingPlaylistId = ref(null);
const expandedPlaylist = ref(null);

// Category/Channel management state
const playlistCategories = reactive({});
const expandedCategories = reactive({});
const categorySearch = reactive({});
const loadingCategoriesFor = ref(null);
const showEpgUrl = reactive({});
const playlistEpgInputs = reactive({});
const loadingEpgFor = ref(null);

// Initialize EPG inputs when playlists are loaded
watch(() => savedPlaylists.value, (playlists) => {
    for (const pl of playlists) {
        if (!(pl.id in playlistEpgInputs)) {
            playlistEpgInputs[pl.id] = pl.epgUrl || '';
        }
    }
}, { immediate: true, deep: true });

async function saveAndLoadEpg(playlistId) {
    const url = playlistEpgInputs[playlistId];
    if (!url) return;
    
    loadingEpgFor.value = playlistId;
    try {
        // Save the EPG URL to the playlist
        await playlistStore.updatePlaylistEpgUrl(playlistId, url);
        
        // If this is the active playlist, also trigger EPG load
        if (playlistId === playlistStore.activePlaylistId) {
            playlistStore.setEpgUrl(url);
        }
    } finally {
        loadingEpgFor.value = null;
    }
}

async function switchPlaylist(playlistId) {
    await playlistStore.switchPlaylist(playlistId);
}

function confirmDeletePlaylist(pl) {
    playlistToDelete.value = pl;
    showDeleteConfirm.value = true;
}

function deletePlaylistConfirmed() {
    if (playlistToDelete.value) {
        playlistStore.deletePlaylist(playlistToDelete.value.id);
        playlistToDelete.value = null;
        showDeleteConfirm.value = false;
    }
}

async function refreshXtreamPlaylist(pl) {
    if (!pl.xtream) return;
    
    refreshingPlaylistId.value = pl.id;
    
    try {
        const result = await fetchAndConvertToM3U(
            pl.xtream.server,
            pl.xtream.username,
            pl.xtream.password
        );
        
        // Update the playlist content
        playlistStore.updatePlaylistContent(pl.id, result.m3uContent, result.epgUrl);
        
        console.log(`[Xtream] Refreshed playlist "${pl.name}" with ${result.channelCount} channels`);
    } catch (err) {
        console.error('Error refreshing Xtream playlist:', err);
    } finally {
        refreshingPlaylistId.value = null;
    }
}

// EPG per playlist
function updatePlaylistEpg(playlistId, epgUrl) {
    playlistStore.updatePlaylistEpgUrl(playlistId, epgUrl);
}

// Load categories for a playlist
async function loadPlaylistCategories(pl) {
    loadingCategoriesFor.value = pl.id;
    try {
        // Fetch playlist content from server
        const response = await fetch(`${TRANSCODER_URL}/playlists/${pl.id}`);
        if (response.ok) {
            const data = await response.json();
            const content = data.rawContent;
            if (content) {
                const parsed = parse(content);
                const groups = {};
                
                for (const channel of parsed.items) {
                    const groupName = channel.group?.title || 'Uncategorized';
                    if (!groups[groupName]) {
                        groups[groupName] = [];
                    }
                    groups[groupName].push(channel);
                }
                
                playlistCategories[pl.id] = groups;
                if (!expandedCategories[pl.id]) {
                    expandedCategories[pl.id] = {};
                }
            }
        }
    } catch (err) {
        console.error('Error loading playlist categories:', err);
    } finally {
        loadingCategoriesFor.value = null;
    }
}

// Get filtered categories based on search
function getFilteredCategories(playlistId) {
    const cats = playlistCategories[playlistId];
    if (!cats) return {};
    
    const search = (categorySearch[playlistId] || '').toLowerCase();
    if (!search) return cats;
    
    const filtered = {};
    for (const [catName, channels] of Object.entries(cats)) {
        const matchingChannels = channels.filter(ch => 
            ch.name.toLowerCase().includes(search) || 
            catName.toLowerCase().includes(search)
        );
        if (matchingChannels.length > 0 || catName.toLowerCase().includes(search)) {
            filtered[catName] = catName.toLowerCase().includes(search) ? channels : matchingChannels;
        }
    }
    return filtered;
}

// Toggle category expand in settings
function toggleCategoryExpand(playlistId, catName) {
    if (!expandedCategories[playlistId]) {
        expandedCategories[playlistId] = {};
    }
    expandedCategories[playlistId][catName] = !expandedCategories[playlistId][catName];
}

// Favorites helpers
function isFavoriteCategory(pl, catName) {
    return pl.favoriteCategories?.includes(catName) || false;
}

function isFavoriteChannel(pl, channelUrl) {
    return pl.favoriteChannels?.includes(channelUrl) || false;
}

function toggleFavCategory(playlistId, catName) {
    playlistStore.toggleFavoriteCategory(playlistId, catName);
}

function toggleFavChannel(playlistId, channelUrl) {
    playlistStore.toggleFavoriteChannel(playlistId, channelUrl);
}

// Hidden helpers
function isHiddenCategory(pl, catName) {
    return pl.hiddenCategories?.includes(catName) || false;
}

function isHiddenChannel(pl, channelUrl) {
    return pl.hiddenChannels?.includes(channelUrl) || false;
}

function toggleHideCategory(playlistId, catName) {
    playlistStore.toggleHiddenCategory(playlistId, catName);
}

function toggleHideChannel(playlistId, channelUrl) {
    playlistStore.toggleHiddenChannel(playlistId, channelUrl);
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString();
}

function close() {
    model.value = false;
}
</script>

<style scoped>
.settings-dialog {
    overflow: hidden;
}

.settings-container {
    display: flex;
    min-height: 550px;
    max-height: 80vh;
}

.settings-sidebar {
    width: 200px;
    border-right: 1px solid rgba(255, 255, 255, 0.12);
    padding: 8px;
    flex-shrink: 0;
}

.settings-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
}

.settings-panel {
    flex: 1;
    overflow-y: auto;
}

.settings-section {
    padding: 8px 0;
}

.playlist-list {
    max-height: 300px;
    overflow-y: auto;
}

.active-playlist {
    background: rgba(var(--v-theme-primary), 0.08);
}

.category-manager {
    max-height: 350px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}

.category-list {
    flex: 1;
    overflow-y: auto;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 4px;
}

.category-item {
    background: rgba(0, 0, 0, 0.15);
}

.channel-item {
    padding-left: 16px;
}

.hidden-item {
    opacity: 0.5;
}

/* Dark mode adjustments */
:deep(.v-theme--light) .settings-sidebar {
    border-right-color: rgba(0, 0, 0, 0.12);
}

:deep(.v-theme--light) .category-list {
    border-color: rgba(0, 0, 0, 0.12);
}

:deep(.v-theme--light) .category-item {
    background: rgba(0, 0, 0, 0.05);
}
</style>
