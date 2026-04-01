<template>
    <v-dialog v-model="dialogVisible" fullscreen transition="dialog-bottom-transition">
        <v-card class="epg-dialog">
            <!-- Dialog Header -->
            <div class="epg-toolbar">
                <div class="toolbar-left">
                    <v-icon class="mr-2">mdi-television-guide</v-icon>
                    <span class="toolbar-title">TV Guide</span>
                </div>
                
                <!-- Time navigation -->
                <div class="toolbar-center">
                    <v-btn icon variant="text" size="small" @click="shiftTime(-2)">
                        <v-icon>mdi-chevron-left</v-icon>
                    </v-btn>
                    <span class="time-range">{{ formatTimeRange }}</span>
                    <v-btn icon variant="text" size="small" @click="shiftTime(2)">
                        <v-icon>mdi-chevron-right</v-icon>
                    </v-btn>
                    <v-btn variant="text" size="small" @click="goToNow" class="ml-2">Now</v-btn>
                </div>
                
                <div class="toolbar-right">
                    <v-btn icon variant="text" @click="close">
                        <v-icon>mdi-close</v-icon>
                    </v-btn>
                </div>
            </div>

            <!-- Timeline header row -->
            <div class="timeline-header-row">
                <div class="channel-col-header">Channel</div>
                <div class="time-slots-header" ref="timeSlotsHeader">
                    <div 
                        v-for="slot in timeSlots" 
                        :key="slot.getTime()" 
                        class="time-slot"
                    >
                        {{ formatHour(slot) }}
                    </div>
                    <!-- Now marker in header -->
                    <div v-if="nowMarkerPct >= 0 && nowMarkerPct <= 100" class="now-marker-header" :style="{ left: nowMarkerPct + '%' }"></div>
                </div>
            </div>

            <!-- EPG Grid with virtual scroll -->
            <v-card-text class="pa-0 epg-content" v-if="hasEpgData">
                <v-virtual-scroll
                    :items="visibleChannels"
                    :item-height="56"
                    class="epg-virtual-scroll"
                >
                    <template v-slot:default="{ item }">
                        <div 
                            class="channel-row"
                            :class="{ 'active': item.id === currentChannelId }"
                        >
                            <!-- Channel info (sticky left) -->
                            <div class="channel-info" @click="selectChannel(item)">
                                <v-avatar size="32" rounded class="mr-2 flex-shrink-0">
                                    <v-img v-if="item.logo" :src="item.logo" cover>
                                        <template v-slot:error>
                                            <v-icon size="20" color="grey">mdi-television</v-icon>
                                        </template>
                                    </v-img>
                                    <v-icon v-else size="20" color="grey">mdi-television</v-icon>
                                </v-avatar>
                                <span class="channel-name">{{ item.name }}</span>
                            </div>

                            <!-- Programs row -->
                            <div class="programs-row" ref="programsRow">
                                <div 
                                    v-for="program in getChannelPrograms(item.id)" 
                                    :key="program.start.getTime() + '-' + program.title"
                                    class="program-block"
                                    :class="{ 
                                        'is-current': isProgramCurrent(program),
                                        'is-past': isProgramPast(program)
                                    }"
                                    :style="{ flexBasis: getProgramWidth(program), flexGrow: 0, flexShrink: 0 }"
                                    @click="showProgramDetails(program)"
                                    :title="program.title + ' (' + formatProgramTime(program) + ')'"
                                >
                                    <span class="prog-title">{{ program.title }}</span>
                                    <span class="prog-time">{{ formatProgramTime(program) }}</span>
                                </div>
                                <div v-if="getChannelPrograms(item.id).length === 0" class="no-program-info">
                                    No program info
                                </div>
                                <!-- Now marker line -->
                                <div v-if="nowMarkerPct >= 0 && nowMarkerPct <= 100" class="now-marker" :style="{ left: nowMarkerPct + '%' }"></div>
                            </div>
                        </div>
                    </template>
                </v-virtual-scroll>
            </v-card-text>

            <!-- No EPG data message -->
            <div v-else class="no-epg-message">
                <v-icon size="64" class="mb-4">mdi-television-guide</v-icon>
                <h3>No EPG data available</h3>
                <p class="text-body-2 mt-2">Load an XMLTV EPG file in Settings to see the program guide</p>
            </div>
        </v-card>

        <!-- Program details dialog -->
        <v-dialog v-model="showDetails" max-width="500">
            <v-card v-if="selectedProgram" class="program-details-card">
                <v-card-title>{{ selectedProgram.title }}</v-card-title>
                <v-card-subtitle>
                    {{ formatProgramTime(selectedProgram) }} ({{ selectedProgram.duration }} min)
                </v-card-subtitle>
                <v-card-text>
                    <v-chip v-if="selectedProgram.category" size="small" class="mb-2" variant="tonal">
                        {{ selectedProgram.category }}
                    </v-chip>
                    <p>{{ selectedProgram.description || 'No description available' }}</p>
                </v-card-text>
                <v-card-actions>
                    <v-spacer></v-spacer>
                    <v-btn color="success" variant="tonal" @click="watchChannel">Watch Channel</v-btn>
                    <v-btn variant="text" @click="showDetails = false">Close</v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>
    </v-dialog>
</template>

<script>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useEpgStore } from '@/stores/epg';
import { usePlaylistStore } from '@/stores/playlist';
import { proxyUrl } from '@/services/mixedContent.js';

export default {
    name: 'EpgDialog',

    props: {
        modelValue: {
            type: Boolean,
            default: false
        }
    },

    emits: ['update:modelValue'],

    setup(props, { emit }) {
        const epgStore = useEpgStore();
        const playlistStore = usePlaylistStore();
        
        const showDetails = ref(false);
        const selectedProgram = ref(null);
        
        // Time window: 4 hours
        const HOURS_VISIBLE = 4;
        const viewStartTime = ref(null);

        const dialogVisible = computed({
            get: () => props.modelValue,
            set: (value) => emit('update:modelValue', value)
        });

        // Reset to "now" each time dialog opens
        watch(dialogVisible, (open) => {
            if (open) goToNow();
        });

        function close() {
            dialogVisible.value = false;
        }

        function goToNow() {
            const now = new Date();
            now.setMinutes(0, 0, 0);
            viewStartTime.value = now;
        }

        function shiftTime(hours) {
            const t = new Date(viewStartTime.value);
            t.setHours(t.getHours() + hours);
            viewStartTime.value = t;
        }

        // Refresh now marker every minute
        const tick = ref(0);
        let tickInterval = null;
        onMounted(() => {
            goToNow();
            tickInterval = setInterval(() => { tick.value++; }, 60000);
        });
        onUnmounted(() => { if (tickInterval) clearInterval(tickInterval); });

        const hasEpgData = computed(() => epgStore.isLoaded && Object.keys(epgStore.epgData).length > 0);
        const currentChannel = computed(() => playlistStore.currentChannel);
        const currentChannelId = computed(() => currentChannel.value?.tvg?.id || currentChannel.value?.name);

        // Filtered channels
        const activePlaylist = computed(() => playlistStore.activePlaylist);
        const hiddenCategories = computed(() => activePlaylist.value?.hiddenCategories || []);
        const hiddenChannels = computed(() => activePlaylist.value?.hiddenChannels || []);

        const visibleChannels = computed(() => {
            return playlistStore.channels
                .filter(ch => {
                    const cat = ch.group?.title || 'Uncategorized';
                    if (hiddenCategories.value.includes(cat)) return false;
                    if (hiddenChannels.value.includes(ch.url)) return false;
                    return true;
                })
                .map((ch, i) => ({
                    id: ch.tvg?.id || ch.name,
                    name: ch.name,
                    logo: proxyUrl(ch.tvg?.logo),
                    number: i + 1,
                    originalChannel: ch
                }));
        });

        // Time window
        const windowStart = computed(() => viewStartTime.value || new Date());
        const windowEnd = computed(() => {
            const e = new Date(windowStart.value);
            e.setHours(e.getHours() + HOURS_VISIBLE);
            return e;
        });
        const windowDuration = computed(() => windowEnd.value - windowStart.value); // ms

        // Half-hour time slots for the header
        const timeSlots = computed(() => {
            const slots = [];
            const s = new Date(windowStart.value);
            for (let i = 0; i < HOURS_VISIBLE * 2; i++) {
                const t = new Date(s);
                t.setMinutes(s.getMinutes() + i * 30);
                slots.push(t);
            }
            return slots;
        });

        const formatTimeRange = computed(() => {
            if (!viewStartTime.value) return '';
            const opts = { weekday: 'short', month: 'short', day: 'numeric' };
            const dateStr = windowStart.value.toLocaleDateString([], opts);
            return `${dateStr}  ${formatHour(windowStart.value)} – ${formatHour(windowEnd.value)}`;
        });

        // Now marker as percentage of the window
        const nowMarkerPct = computed(() => {
            const _ = tick.value; // depend on tick
            const now = new Date();
            const pct = ((now - windowStart.value) / windowDuration.value) * 100;
            return pct;
        });

        // ---- Programs (cached per window) ----
        const programsCache = computed(() => {
            const cache = {};
            const s = windowStart.value;
            const e = windowEnd.value;
            // Pre-compute for ALL channel IDs that exist in EPG so the per-row lookup is O(1)
            for (const channelId of Object.keys(epgStore.epgData)) {
                cache[channelId] = epgStore.getProgramsInRange(channelId, s, e);
            }
            return cache;
        });

        // Case-insensitive lookup helper (built once per window so the per-row function is fast)
        const lowerCaseMap = computed(() => {
            const m = {};
            for (const id of Object.keys(programsCache.value)) {
                m[id.toLowerCase()] = id;
            }
            return m;
        });

        function getChannelPrograms(channelId) {
            if (programsCache.value[channelId]) return programsCache.value[channelId];
            const mapped = lowerCaseMap.value[channelId?.toLowerCase()];
            if (mapped) return programsCache.value[mapped];
            return [];
        }

        function getProgramWidth(program) {
            const s = windowStart.value;
            const e = windowEnd.value;
            const pStart = program.start < s ? s : program.start;
            const pEnd = program.stop > e ? e : program.stop;
            const pct = ((pEnd - pStart) / windowDuration.value) * 100;
            return Math.max(pct, 0.5) + '%'; // min 0.5% to stay visible
        }

        function isProgramCurrent(program) {
            const _ = tick.value;
            const now = new Date();
            return program.start <= now && program.stop > now;
        }

        function isProgramPast(program) {
            const _ = tick.value;
            return program.stop < new Date();
        }

        function formatHour(date) {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }

        function formatProgramTime(program) {
            return `${formatHour(program.start)} - ${formatHour(program.stop)}`;
        }

        function showProgramDetails(program) {
            selectedProgram.value = program;
            showDetails.value = true;
        }

        function selectChannel(channel) {
            if (channel.originalChannel) {
                playlistStore.setCurrentChannel(channel.originalChannel);
                close();
            }
        }

        function watchChannel() {
            if (selectedProgram.value) {
                const ch = visibleChannels.value.find(c => c.id === selectedProgram.value.channelId);
                if (ch) selectChannel(ch);
            }
            showDetails.value = false;
        }

        return {
            dialogVisible,
            close,
            hasEpgData,
            currentChannelId,
            visibleChannels,
            timeSlots,
            formatTimeRange,
            nowMarkerPct,
            showDetails,
            selectedProgram,
            goToNow,
            shiftTime,
            formatHour,
            formatProgramTime,
            getChannelPrograms,
            getProgramWidth,
            isProgramCurrent,
            isProgramPast,
            showProgramDetails,
            selectChannel,
            watchChannel
        };
    }
};
</script>

<style scoped>
.epg-dialog {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: rgba(20, 20, 20, 0.85);
    backdrop-filter: blur(30px) saturate(180%);
    -webkit-backdrop-filter: blur(30px) saturate(180%);
}

/* ---- Toolbar ---- */
.epg-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 16px;
    height: 48px;
    background: rgba(255, 255, 255, 0.05);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    flex-shrink: 0;
}
.toolbar-left { display: flex; align-items: center; font-weight: 500; }
.toolbar-title { font-size: 16px; }
.toolbar-center { display: flex; align-items: center; }
.toolbar-right { display: flex; align-items: center; }
.time-range { font-size: 14px; opacity: 0.9; min-width: 250px; text-align: center; }

/* ---- Timeline header ---- */
.timeline-header-row {
    display: flex;
    flex-shrink: 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(30, 30, 30, 0.9);
}
.channel-col-header {
    min-width: 170px;
    max-width: 170px;
    padding: 8px 12px;
    font-weight: 500;
    font-size: 13px;
    border-right: 1px solid rgba(255, 255, 255, 0.08);
    flex-shrink: 0;
}
.time-slots-header {
    display: flex;
    flex: 1;
    position: relative;
}
.time-slot {
    flex: 1;
    padding: 8px 6px;
    font-size: 12px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.6);
    border-left: 1px solid rgba(255, 255, 255, 0.06);
    text-align: center;
}

/* ---- Now marker ---- */
.now-marker-header {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background: #f44336;
    z-index: 5;
    pointer-events: none;
}
.now-marker {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background: #f44336;
    z-index: 5;
    pointer-events: none;
    box-shadow: 0 0 6px rgba(244, 67, 54, 0.4);
}

/* ---- EPG content ---- */
.epg-content {
    flex: 1;
    overflow: hidden;
    background: transparent;
}
.epg-virtual-scroll {
    height: 100%;
}

/* ---- Channel row ---- */
.channel-row {
    display: flex;
    height: 56px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}
.channel-row.active {
    background: rgba(76, 175, 80, 0.12);
}
.channel-row:hover {
    background: rgba(255, 255, 255, 0.04);
}

.channel-info {
    min-width: 170px;
    max-width: 170px;
    display: flex;
    align-items: center;
    padding: 0 10px;
    cursor: pointer;
    border-right: 1px solid rgba(255, 255, 255, 0.06);
    flex-shrink: 0;
    overflow: hidden;
}
.channel-name {
    font-size: 12px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

/* ---- Programs row (flex, NOT absolute) ---- */
.programs-row {
    display: flex;
    flex: 1;
    min-width: 0;
    position: relative;
    overflow: hidden;
}

.program-block {
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 2px 6px;
    overflow: hidden;
    cursor: pointer;
    border-right: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(255, 255, 255, 0.06);
    transition: background 0.15s;
    min-width: 0;
    box-sizing: border-box;
}
.program-block:hover {
    background: rgba(255, 255, 255, 0.14);
    z-index: 2;
}
.program-block.is-current {
    background: rgba(76, 175, 80, 0.18);
    border-right-color: rgba(76, 175, 80, 0.35);
}
.program-block.is-past {
    opacity: 0.45;
}

.prog-title {
    font-size: 11px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.prog-time {
    font-size: 10px;
    opacity: 0.6;
    white-space: nowrap;
}

.no-program-info {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    font-size: 11px;
    opacity: 0.3;
}

/* ---- No EPG ---- */
.no-epg-message {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 80px 40px;
    text-align: center;
    opacity: 0.6;
    color: rgba(255, 255, 255, 0.8);
}

/* ---- Program details card ---- */
.program-details-card {
    background: rgba(30, 30, 30, 0.95) !important;
    backdrop-filter: blur(20px) saturate(180%);
    -webkit-backdrop-filter: blur(20px) saturate(180%);
    border: 1px solid rgba(255, 255, 255, 0.1);
}
</style>
