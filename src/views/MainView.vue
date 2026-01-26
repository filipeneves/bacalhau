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
                    placeholder="Search channels..."></v-text-field>
            </v-toolbar>

            <!-- scrollable channel list -->
            <div class="channels-list flex-grow-1">
                <Channels :search="searchQuery" />
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
                        <v-img v-if="currentChannel?.tvg?.logo" :src="currentChannel?.tvg?.logo" alt="Channel Logo"
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
            <v-btn @click="showEpgDialog = true">
                <v-icon>mdi-television-guide</v-icon>
            </v-btn>
        </v-app-bar>

        <v-main class="black-background main-content" :class="{ 'fullscreen-main': isFullscreen }">
            <div class="video-epg-container" :class="{ 'fullscreen-video-container': isFullscreen }">
                <div class="video-wrapper" :class="{ 'fullscreen-video-wrapper': isFullscreen }">
                    <VideoPlayer @toggle-fullscreen="toggleFullscreen" />
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
    </v-app>
</template>

<script>
import VideoPlayer from '@/components/VideoPlayer.vue';
import Channels from '@/components/Channels.vue';
import CurrentChannelEpg from '@/components/CurrentChannelEpg.vue';
import EpgDialog from '@/components/EpgDialog.vue';
import SettingsDialog from '@/components/SettingsDialog.vue';
import RecordingsDialog from '@/components/RecordingsDialog.vue';
import ImportPlaylistDialog from '@/components/ImportPlaylistDialog.vue';
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { usePlaylistStore } from '@/stores/playlist';
import { useAppStore } from '@/stores/app';
import { useEpgStore } from '@/stores/epg';
import { storeToRefs } from 'pinia';
import { useTheme } from 'vuetify';
import { useRouter } from 'vue-router';
import { checkAuthStatus, logout } from '@/services/api';


export default {
    name: 'App',
    components: { VideoPlayer, Channels, CurrentChannelEpg, EpgDialog, SettingsDialog, RecordingsDialog, ImportPlaylistDialog },

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

        let recordingInterval = null;

        const searchQuery = ref('');

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
            authEnabled,
            handleLogout,
            appElement,
            isFullscreen,
            drawerVisible,
            epgVisible,
            appBarVisible,
            isMobile,
            toggleFullscreen,
            handleMouseMove,
            handleTouchStart,
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
    position: sticky;
    top: 0;
    z-index: 1;
}

.no-scroll {
    overflow: hidden;
}

.channels-list {
    height: calc(100vh - 96px);
    overflow-y: auto;
}

.bottom-toolbar {
    position: sticky;
    bottom: 0;
    z-index: 1;
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