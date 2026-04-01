<template>
    <v-app class="app" ref="appElement" @mousemove="handleMouseMove" @mouseleave="hideDrawerDelayed" @touchstart="handleTouchStart">
        <v-navigation-drawer 
            app 
            permanent 
            :width="isMobile ? 280 : 320" 
            v-model="drawerVisible" 
            class="custom-drawer d-flex flex-column no-scroll"
            :class="{ 'fullscreen-drawer': isFullscreen, 'mobile-drawer': isMobile }"
        >

            <!-- Search Toolbar -->
            <v-toolbar flat dense density="compact" class="sticky-search">
                <v-text-field v-model="searchQuery" prepend-inner-icon="mdi-magnify" dense hide-details clearable
                    :placeholder="vodMode ? 'Search VOD...' : 'Search channels...'"></v-text-field>
            </v-toolbar>

            <!-- scrollable channel / VOD list -->
            <div class="channels-list flex-grow-1">
                <VodBrowser v-if="vodMode" :search="searchQuery" />
                <Channels v-else :search="searchQuery" />
            </div>

            <!-- VOD / Channels toggle (only for Xtream playlists) -->
            <div v-if="isXtreamPlaylist" class="vod-toggle-bar">
                <v-btn-toggle v-model="vodMode" mandatory density="compact" color="primary" class="vod-toggle" rounded="0">
                    <v-btn :value="false" size="small" class="vod-toggle-btn">
                        <v-icon start size="16">mdi-television</v-icon>
                        Channels
                    </v-btn>
                    <v-btn :value="true" size="small" class="vod-toggle-btn">
                        <v-icon start size="16">mdi-movie-open</v-icon>
                        VOD
                    </v-btn>
                </v-btn-toggle>
            </div>

            <!-- Bottom Toolbar for Buttons -->
            <v-toolbar flat dense density="compact" class="bottom-toolbar">
                <v-btn icon tile title="Import Playlist" @click="showImportPlaylist = true">
                    <v-icon>mdi-file-import</v-icon>
                </v-btn>

                <v-btn icon tile title="Recordings" @click="showRecordings = true">
                    <v-icon>mdi-folder-play</v-icon>
                </v-btn>

                <v-btn icon tile title="Settings" @click="showSettings = true">
                    <v-icon>mdi-cog</v-icon>
                </v-btn>

                <v-spacer></v-spacer>

                <v-btn v-if="authEnabled" icon tile title="Logout" @click="handleLogout" color="error">
                    <v-icon>mdi-logout</v-icon>
                </v-btn>
            </v-toolbar>
        </v-navigation-drawer>

        <v-app-bar 
            app 
            dense 
            density="compact" 
            class="pa-0"
            v-model="appBarVisible"
            :class="{ 'fullscreen-appbar': isFullscreen }"
        >
            <v-app-bar-title class="app-bar-title-custom">
                <v-row align="center" no-gutters>
                    <v-col cols="auto" class="mr-3">
                    <v-btn @click="toggleMenu" :icon="menuExpanded ? 'mdi-menu-open' : 'mdi-menu-close'" tile></v-btn>   
                    </v-col>
                    <v-col cols="auto">
                        <v-img v-if="currentChannel?.tvg?.logo" :src="proxyUrl(currentChannel?.tvg?.logo)" alt="Channel Logo"
                            width="50" class="mr-3" cover></v-img>
                    </v-col>
                    <v-col class="channel-name-col">
                        <span class="channel-name-text">{{ currentChannel?.name || 'bacalhau v' + version }}</span>
                    </v-col>
                </v-row>
            </v-app-bar-title>

            <v-spacer></v-spacer>
            <!-- dark/light mode -->
            <v-btn icon tile @click="toggleDarkMode">
                <v-icon>{{ isDarkMode ? 'mdi-weather-night' : 'mdi-weather-sunny' }}</v-icon>
            </v-btn>
            <v-divider vertical class="mx-2"></v-divider>
            <v-tooltip location="bottom" :disabled="recordingSupported">
                <template v-slot:activator="{ props }">
                    <span v-bind="props">
                        <v-btn 
                            @click="toggleRecording" 
                            :class="isRecording ? 'record-btn' : ''"
                            :disabled="!recordingSupported && !isRecording"
                        >
                            <span v-if="isRecording" class="record-text">Recording ({{ formattedRecordingTime }})</span>
                            <v-icon :class="isRecording ? 'record-icon' : ''">mdi-record</v-icon>
                        </v-btn>
                    </span>
                </template>
                <span>Recording requires an active stream.<br>Start playing a channel first.</span>
            </v-tooltip>
            <v-tooltip location="bottom" :disabled="recordingSupported">
                <template v-slot:activator="{ props }">
                    <span v-bind="props">
                        <v-btn 
                            @click="showShareStream = true" 
                            :class="isSharing ? 'share-btn' : ''"
                            :disabled="!recordingSupported && !isSharing"
                        >
                            <v-icon :class="isSharing ? 'share-icon' : ''">mdi-share-variant</v-icon>
                            <span v-if="isSharing" class="ml-2 guest-count-badge">
                                {{ guestCount }}
                            </span>
                        </v-btn>
                    </span>
                </template>
                <span v-if="!isSharing">Share stream requires an active stream.<br>Start playing a channel first.</span>
                <span v-else-if="guestCount > 0">
                    {{ guestCount }} viewer{{ guestCount !== 1 ? 's' : '' }} watching:<br>
                    {{ guestNames.join(', ') }}
                </span>
                <span v-else>No viewers yet</span>
            </v-tooltip>
            <v-tooltip location="bottom" :disabled="pipSupported">
                <template v-slot:activator="{ props }">
                    <span v-bind="props">
                        <v-btn 
                            @click="togglePictureInPicture" 
                            :disabled="!pipSupported"
                            :class="{ 'pip-disabled': !pipSupported }"
                        >
                            <v-icon>mdi-picture-in-picture-bottom-right</v-icon>
                        </v-btn>
                    </span>
                </template>
                <span>Picture-in-Picture is not supported in this browser.<br>If using Firefox, right-click the video and select "Watch in Picture-in-Picture"</span>
            </v-tooltip>
            <v-btn v-if="airplayAvailable" @click="requestAirPlay" title="AirPlay">
                <v-icon>mdi-apple-airplay</v-icon>
            </v-btn>
            <v-btn v-if="castAvailable" @click="startCast" :title="isCasting ? 'Stop Casting' : 'Cast to Chromecast'">
                <v-icon>{{ isCasting ? 'mdi-cast-connected' : 'mdi-cast' }}</v-icon>
            </v-btn>
            <v-btn @click="showEpgDialog = true">
                <v-icon>mdi-television-guide</v-icon>
            </v-btn>
        </v-app-bar>

        <v-main class="black-background main-content" :class="{ 'fullscreen-main': isFullscreen }">
            <div class="video-epg-container" :class="{ 'fullscreen-video-container': isFullscreen }">
                <div class="video-wrapper" :class="{ 'fullscreen-video-wrapper': isFullscreen }">
                    <VideoPlayer ref="videoPlayerRef" @toggle-fullscreen="toggleFullscreen" />
                </div>
                <CurrentChannelEpg 
                    v-if="(!isFullscreen && !isMobile) || epgVisible" 
                    :class="{ 'fullscreen-epg': isFullscreen, 'mobile-epg': isMobile }"
                />
            </div>
        </v-main>

        <!-- Full EPG Dialog -->
        <EpgDialog v-model="showEpgDialog" />

        <!-- Settings Dialog -->
        <SettingsDialog v-model="showSettings" />

        <!-- Recordings Dialog -->
        <RecordingsDialog v-model="showRecordings" />

        <!-- Import Playlist Dialog -->
        <ImportPlaylistDialog v-model="showImportPlaylist" />

        <!-- Share Stream Dialog -->
        <ShareStreamDialog v-model="showShareStream" />
    </v-app>
</template>

<script>
import VideoPlayer from '@/components/VideoPlayer.vue';
import Channels from '@/components/Channels.vue';
import VodBrowser from '@/components/VodBrowser.vue';
import CurrentChannelEpg from '@/components/CurrentChannelEpg.vue';
import EpgDialog from '@/components/EpgDialog.vue';
import SettingsDialog from '@/components/SettingsDialog.vue';
import RecordingsDialog from '@/components/RecordingsDialog.vue';
import ImportPlaylistDialog from '@/components/ImportPlaylistDialog.vue';
import ShareStreamDialog from '@/components/ShareStreamDialog.vue';

import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { usePlaylistStore } from '@/stores/playlist';
import { useAppStore } from '@/stores/app';
import { proxyUrl } from '@/services/mixedContent.js';
import { useEpgStore } from '@/stores/epg';
import { storeToRefs } from 'pinia';
import { useTheme } from 'vuetify';
import { useRouter } from 'vue-router';
import { checkAuthStatus, logout } from '@/services/api';
import { castAvailable, isCasting, airplayAvailable, startCastSession, stopCastSession } from '@/services/cast.js';


export default {
    name: 'App',
    components: { VideoPlayer, Channels, VodBrowser, CurrentChannelEpg, EpgDialog, SettingsDialog, RecordingsDialog, ImportPlaylistDialog, ShareStreamDialog },

    setup() {
        const playlist = usePlaylistStore();
        const app = useAppStore();
        const epg = useEpgStore();
        const theme = useTheme();
        const router = useRouter();

        // timer for recording
        const recordingStartTime = ref(null);
        const recordingDuration = ref(0);
        const menuExpanded = ref(true);
        const authEnabled = ref(false);
        const appElement = ref(null);
        const videoPlayerRef = ref(null);
        const isFullscreen = ref(false);
        
        // Detect mobile device
        const isMobile = ref(false);
        const checkMobile = () => {
            isMobile.value = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
                            window.innerWidth <= 768;
        };
        
        const drawerVisible = ref(true);
        const epgVisible = ref(true);
        const appBarVisible = ref(true);
        let mouseIdleTimeout = null;

        // EPG dialog
        const showEpgDialog = ref(false);

        // Settings dialog
        const showSettings = ref(false);

        // Recordings dialog
        const showRecordings = ref(false);

        // Import Playlist dialog
        const showImportPlaylist = ref(false);

        // Share Stream dialog
        const showShareStream = ref(false);

        let recordingInterval = null;

        const searchQuery = ref('');

        // VOD mode
        const isXtreamPlaylist = computed(() => playlist.isXtreamPlaylist);
        const vodMode = computed({
            get: () => playlist.vodMode,
            set: (val) => playlist.setVodMode(val)
        });

        // Load timeshift channels when Xtream playlist is loaded
        watch(isXtreamPlaylist, (isXtream) => {
            if (isXtream) {
                playlist.loadTimeshiftChannels();
            }
        }, { immediate: true });

        // Check auth status on mount
        onMounted(async () => {
            checkMobile();
            
            // On mobile, hide UI by default and enter fullscreen-like mode
            if (isMobile.value) {
                drawerVisible.value = false;
                epgVisible.value = false;
                appBarVisible.value = false;
                menuExpanded.value = false;
            }
            
            addFullscreenListeners();
            
            const status = await checkAuthStatus();
            authEnabled.value = status.authEnabled;
        });
        function toggleMenu() {
            menuExpanded.value = !menuExpanded.value;
        }

        // Playlists are loaded from IndexedDB in the playlist store's initPlaylists()
        // No default playlist is loaded - user must import one

        const currentChannel = computed(() => playlist.getCurrentChannel);
        const isRecording = computed(() => app.isRecording);
        const isSharing = computed(() => app.isSharing);
        const guestCount = computed(() => app.guestCount);
        const guestNames = computed(() => app.guestNames);
        const version = computed(() => app.version);
        const isDarkMode = computed(() => app.isDarkMode);
        const pipSupported = computed(() => app.pipSupported);
        const recordingSupported = computed(() => app.recordingSupported);

        watch(isRecording, (newVal) => {
            if (newVal) {
                startRecordTimer();
            } else {
                stopRecordTimer();
            }
        });

        function toggleDarkMode() {
            app.setDarkMode(!isDarkMode.value);
            theme.global.name.value = isDarkMode.value ? 'dark' : 'light';
        }

        function startRecordTimer() {
            recordingStartTime.value = Date.now();
            recordingDuration.value = 0;

            recordingInterval = setInterval(() => {
                recordingDuration.value = Math.floor((Date.now() - recordingStartTime.value) / 1000);
            }, 1000);
        }

        function stopRecordTimer() {
            clearInterval(recordingInterval);
            recordingInterval = null;
            recordingStartTime.value = null;
            recordingDuration.value = 0;
        }

        const formattedRecordingTime = computed(() => {
            const minutes = Math.floor(recordingDuration.value / 60);
            const seconds = recordingDuration.value % 60;
            return `${minutes}:${seconds.toString().padStart(2, '0')}`;
        });


        const togglePictureInPicture = () => {
            app.setPiP(!app.isPiP);
        };

        // Cast functions - delegate to VideoPlayer component
        function startCast() {
            if (videoPlayerRef.value) {
                videoPlayerRef.value.startCast();
            }
        }

        function requestAirPlay() {
            if (videoPlayerRef.value) {
                videoPlayerRef.value.requestAirPlay();
            }
        }

        const toggleRecording = () => {
            app.setRecording(!app.isRecording);
        };

        const handleLogout = async () => {
            const result = await logout();
            if (result.success) {
                console.log('[MainView] Logout successful, redirecting to login');
                router.push('/login');
            } else {
                console.error('[MainView] Logout failed');
            }
        };

        // Fullscreen handling
        function toggleFullscreen() {
            const app = appElement.value?.$el || appElement.value;
            if (!document.fullscreenElement) {
                app?.requestFullscreen().catch(err => console.error("Error entering fullscreen:", err));
            } else {
                document.exitFullscreen();
            }
        }

        function checkFullscreen() {
            isFullscreen.value = !!document.fullscreenElement;
            // Show drawer, EPG, and app bar when entering fullscreen
            if (isFullscreen.value) {
                drawerVisible.value = true;
                epgVisible.value = true;
                appBarVisible.value = true;
                hideDrawerAndEpgDelayed();
            } else {
                drawerVisible.value = true;
                epgVisible.value = true;
                appBarVisible.value = true;
                if (mouseIdleTimeout) {
                    clearTimeout(mouseIdleTimeout);
                }
            }
        }

        function handleMouseMove() {
            if (!isFullscreen.value && !isMobile.value) return;
            
            // Show drawer, EPG, and app bar when mouse moves
            drawerVisible.value = true;
            epgVisible.value = true;
            appBarVisible.value = true;
            
            // Reset the hide timer
            hideDrawerAndEpgDelayed();
        }
        
        function handleTouchStart(event) {
            if (!isMobile.value) return;
            
            // Don't toggle UI if touching interactive elements (drawer, app bar, buttons, dialogs, EPG)
            const target = event.target;
            const isInteractiveElement = target.closest('.v-navigation-drawer, .v-app-bar, .v-btn, .channel-row, .v-list-item, .v-dialog, .epg-dialog, .v-overlay, .current-channel-epg');
            
            if (isInteractiveElement) return;
            
            // Toggle UI visibility on touch
            const shouldShow = !drawerVisible.value;
            drawerVisible.value = shouldShow;
            epgVisible.value = shouldShow;
            appBarVisible.value = shouldShow;
            
            // If showing, hide after 3 seconds
            if (shouldShow) {
                hideDrawerAndEpgDelayed();
            }
        }

        function hideDrawerAndEpgDelayed() {
            if (!isFullscreen.value && !isMobile.value) return;
            
            if (mouseIdleTimeout) {
                clearTimeout(mouseIdleTimeout);
            }
            
            mouseIdleTimeout = setTimeout(() => {
                if (isFullscreen.value || isMobile.value) {
                    drawerVisible.value = false;
                    epgVisible.value = false;
                    appBarVisible.value = false;
                }
            }, 3000); // Hide after 3 seconds of no mouse movement
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

        onMounted(() => {
            addFullscreenListeners();
        });

        onBeforeUnmount(() => {
            removeFullscreenListeners();
            if (mouseIdleTimeout) {
                clearTimeout(mouseIdleTimeout);
            }
            if (recordingInterval) {
                clearInterval(recordingInterval);
            }
        });

        return {
            currentChannel,
            playlist,
            searchQuery,
            togglePictureInPicture,
            toggleRecording,
            isRecording,
            isSharing,
            guestCount,
            guestNames,
            formattedRecordingTime,
            toggleMenu,
            menuExpanded,
            version,
            toggleDarkMode,
            isDarkMode,
            pipSupported,
            recordingSupported,
            showEpgDialog,
            showSettings,
            showRecordings,
            showImportPlaylist,
            showShareStream,
            authEnabled,
            handleLogout,
            appElement,
            videoPlayerRef,
            isFullscreen,
            proxyUrl,
            drawerVisible,
            epgVisible,
            appBarVisible,
            isMobile,
            toggleFullscreen,
            handleMouseMove,
            handleTouchStart,
            castAvailable,
            isCasting,
            airplayAvailable,
            startCast,
            requestAirPlay,
            isXtreamPlaylist,
            vodMode,
        };

    },
};
</script>

<style>
.black-background {
    background-color: #000;
}

.main-content {
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.video-epg-container {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    position: relative;
}

.video-wrapper {
    flex: 1;
    min-height: 0;
    position: relative;
}

.sticky-search {
    flex-shrink: 0;
}

.no-scroll {
    overflow: hidden !important;
}

.custom-drawer .v-navigation-drawer__content {
    display: flex !important;
    flex-direction: column !important;
    overflow: hidden !important;
}

.channels-list {
    flex: 1 1 0 !important;
    min-height: 0 !important;
    overflow-y: auto !important;
}

.bottom-toolbar {
    flex-shrink: 0 !important;
}

.vod-toggle-bar {
    flex-shrink: 0 !important;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(0, 0, 0, 0.2);
}

.vod-toggle {
    width: 100%;
}

.vod-toggle-btn {
    flex: 1 !important;
}

.custom-drawer {
    height: 100vh;
}

.app-bar-title-custom {
    overflow: visible !important;
    max-width: none !important;
}

.channel-name-col {
    min-width: 0;
    flex: 1;
}

.channel-name-text {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.record-icon {
    padding-left: 10px;
}

.record-text {
    animation: blink 1s linear infinite;
}

.record-btn {
    color: red !important;
}

.share-btn {
    color: #4CAF50 !important;
}

.share-icon {
    animation: pulse 2s ease-in-out infinite;
}

.guest-count-badge {
    background: rgba(76, 175, 80, 0.3);
    border-radius: 12px;
    padding: 2px 8px;
    font-size: 0.75rem;
    font-weight: bold;
    color: #4CAF50;
}

@keyframes pulse {
    0%, 100% {
        opacity: 1;
    }
    50% {
        opacity: 0.6;
    }
}

.pip-disabled {
    opacity: 0.5;
}

/* Fullscreen mode styles */
.fullscreen-drawer {
    z-index: 2100 !important;
    transition: transform 0.3s ease-in-out;
}

.fullscreen-appbar {
    z-index: 2100 !important;
    transition: transform 0.3s ease-in-out;
}

.fullscreen-main {
    width: 100vw !important;
    height: 100vh !important;
}

.fullscreen-video-container {
    height: 100vh !important;
}

.fullscreen-video-wrapper {
    height: 100vh !important;
}

.fullscreen-epg {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 2050;
    max-height: 30vh;
    transition: transform 0.3s ease-in-out;
    background: rgba(0, 0, 0, 0.9);
}

/* Mobile mode styles */
.mobile-drawer {
    z-index: 2100 !important;
    transition: transform 0.3s ease-in-out;
}

@media (max-width: 768px) {
    .v-app-bar {
        font-size: 0.875rem;
    }
    
    .channel-name {
        font-size: 0.875rem;
    }
    
    .v-btn {
        min-width: 36px !important;
    }
}

@keyframes blink {
    0% {
        opacity: 1;
    }

    50% {
        opacity: 0;
    }

    100% {
        opacity: 1;
    }
}
</style>