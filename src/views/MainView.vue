<template>
    <v-app class="app">
        <v-navigation-drawer app permanent width="320" v-model="menuExpanded" class="custom-drawer d-flex flex-column no-scroll">

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
            </v-toolbar>
        </v-navigation-drawer>

        <v-app-bar app dense density="compact" class="pa-0">
            <v-app-bar-title>
                <v-row align="center" no-gutters>
                    <v-col cols="auto" class="mr-3">
                    <v-btn @click="toggleMenu" :icon="menuExpanded ? 'mdi-menu-open' : 'mdi-menu-close'" tile></v-btn>   
                    </v-col>
                    <v-col cols="auto">
                        <v-img v-if="currentChannel?.tvg?.logo" :src="currentChannel?.tvg?.logo" alt="Channel Logo"
                            width="50" class="mr-3" cover></v-img>
                    </v-col>
                    <v-col>
                        <span>{{ currentChannel?.name || 'bacalhau v' + version }}</span>
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

        <v-main class="black-background main-content">
            <div class="video-epg-container">
                <div class="video-wrapper">
                    <VideoPlayer />
                </div>
                <CurrentChannelEpg />
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
import { computed, ref, watch } from 'vue';
import { usePlaylistStore } from '@/stores/playlist';
import { useAppStore } from '@/stores/app';
import { useEpgStore } from '@/stores/epg';
import { storeToRefs } from 'pinia';
import { useTheme } from 'vuetify';


export default {
    name: 'App',
    components: { VideoPlayer, Channels, CurrentChannelEpg, EpgDialog, SettingsDialog, RecordingsDialog, ImportPlaylistDialog },

    setup() {
        const playlist = usePlaylistStore();
        const app = useAppStore();
        const epg = useEpgStore();
        const theme = useTheme();

        // timer for recording
        const recordingStartTime = ref(null);
        const recordingDuration = ref(0);
        const menuExpanded = ref(true);

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