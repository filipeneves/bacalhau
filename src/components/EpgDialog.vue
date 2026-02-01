<template>
    <v-dialog v-model="dialogVisible" fullscreen transition="dialog-bottom-transition">
        <v-card class="epg-dialog">
            <!-- Dialog Header -->
            <div class="epg-toolbar">
                <div class="toolbar-left">
                    <v-icon class="mr-2">mdi-television-guide</v-icon>
                    <span class="toolbar-title">TV Guide</span>
                </div>
                
                <!-- Time display -->
                <div class="toolbar-center">
                    <span class="time-range">{{ formatTimeRange }}</span>
                    <v-btn variant="text" size="small" @click="goToNow" class="ml-3">Now</v-btn>
                </div>
                
                <div class="toolbar-right">
                    <v-btn icon variant="text" @click="close">
                        <v-icon>mdi-close</v-icon>
                    </v-btn>
                </div>
            </div>

            <!-- EPG Grid -->
            <v-card-text class="pa-0 epg-content">
                <!-- Timeline header -->
                <div class="timeline-wrapper">
                    <div class="channel-column-header">Channel</div>
                    <div class="timeline-header">
                        <div 
                            v-for="hour in visibleHours" 
                            :key="hour.getTime()" 
                            class="time-slot"
                            :style="{ width: hourWidth + 'px' }"
                        >
                            {{ formatHour(hour) }}
                        </div>
                    </div>
                </div>

                <!-- Current time indicator -->
                <div class="now-indicator" :style="{ left: nowIndicatorPosition + 'px' }" v-if="isNowVisible"></div>

                <!-- Channel rows -->
                <div class="epg-grid" ref="epgGrid" @scroll="handleScroll">
                    <!-- Spacer for scrolling -->
                    <div :style="{ height: scrollTopSpacer + 'px' }"></div>
                    
                    <div 
                        v-for="channel in renderedChannels" 
                        :key="channel.id" 
                        class="channel-row"
                        :class="{ 'active': channel.id === currentChannelId }"
                    >
                        <!-- Channel info -->
                        <div class="channel-info" @click="selectChannel(channel)">
                            <v-img 
                                v-if="channel.logo" 
                                :src="channel.logo" 
                                width="36" 
                                height="36" 
                                class="channel-logo"
                                cover
                            ></v-img>
                            <div class="channel-details">
                                <span class="channel-name">{{ channel.name }}</span>
                                <span class="channel-number" v-if="channel.number">#{{ channel.number }}</span>
                            </div>
                        </div>

                        <!-- Programs timeline -->
                        <div class="programs-timeline">
                            <div 
                                v-for="program in getChannelPrograms(channel.id)" 
                                :key="`${channel.id}-${program.start.getTime()}`"
                                class="program-block"
                                :class="{ 
                                    'current': isProgramCurrent(program),
                                    'past': isProgramPast(program),
                                    'short-program': program.duration < 30
                                }"
                                :style="getProgramStyle(program)"
                                @click="showProgramDetails(program)"
                                :title="program.title + ' - ' + formatProgramTime(program)"
                            >
                                <div class="program-content">
                                    <span class="program-title">{{ program.title }}</span>
                                    <span class="program-time">{{ formatProgramTime(program) }}</span>
                                </div>
                            </div>
                            
                            <!-- No programs placeholder -->
                            <div v-if="getChannelPrograms(channel.id).length === 0" class="no-programs">
                                No program info
                            </div>
                        </div>
                    </div>
                    
                    <!-- Spacer for scrolling -->
                    <div :style="{ height: scrollBottomSpacer + 'px' }"></div>
                </div>

                <!-- No EPG data message -->
                <div v-if="!hasEpgData" class="no-epg-message">
                    <v-icon size="64" class="mb-4">mdi-television-guide</v-icon>
                    <h3>No EPG data available</h3>
                    <p class="text-body-2 mt-2">Load an XMLTV EPG file in Settings to see the program guide</p>
                </div>
            </v-card-text>
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
        
        const epgGrid = ref(null);
        const viewStartTime = ref(new Date());
        const showDetails = ref(false);
        const selectedProgram = ref(null);
        const selectedChannel = ref(null);
        
        // Virtual scrolling
        const CHANNEL_ROW_HEIGHT = 60;
        const BUFFER_SIZE = 10; // Render 10 extra rows above and below
        const scrollTop = ref(0);
        
        // Constants - Dynamic hours from now until midnight
        const HOUR_WIDTH = 150;
        const CHANNEL_COLUMN_WIDTH = 180;

        const dialogVisible = computed({
            get: () => props.modelValue,
            set: (value) => emit('update:modelValue', value)
        });

        function close() {
            dialogVisible.value = false;
        }
        
        onMounted(() => {
            goToNow();
            const interval = setInterval(() => {
                viewStartTime.value = new Date(viewStartTime.value);
            }, 60000);
            onUnmounted(() => clearInterval(interval));
        });

        const hasEpgData = computed(() => epgStore.isLoaded && Object.keys(epgStore.epgData).length > 0);
        
        const currentChannel = computed(() => playlistStore.currentChannel);
        const currentChannelId = computed(() => currentChannel.value?.tvg?.id || currentChannel.value?.name);

        // Get active playlist for filtering
        const activePlaylist = computed(() => playlistStore.activePlaylist);
        const hiddenCategories = computed(() => activePlaylist.value?.hiddenCategories || []);
        const hiddenChannels = computed(() => activePlaylist.value?.hiddenChannels || []);

        const visibleChannels = computed(() => {
            const channels = playlistStore.channels;
            
            // Filter out hidden categories and channels
            const filteredChannels = channels.filter(ch => {
                const categoryName = ch.group?.title || 'Uncategorized';
                if (hiddenCategories.value.includes(categoryName)) return false;
                if (hiddenChannels.value.includes(ch.url)) return false;
                return true;
            });
            
            return filteredChannels.map((ch, index) => ({
                id: ch.tvg?.id || ch.name,
                name: ch.name,
                logo: ch.tvg?.logo,
                number: index + 1,
                originalChannel: ch
            }));
        });
        
        // Virtual scrolling computed properties
        const visibleStartIndex = computed(() => {
            return Math.max(0, Math.floor(scrollTop.value / CHANNEL_ROW_HEIGHT) - BUFFER_SIZE);
        });
        
        const visibleEndIndex = computed(() => {
            const viewportHeight = epgGrid.value?.clientHeight || 600;
            const visibleRows = Math.ceil(viewportHeight / CHANNEL_ROW_HEIGHT);
            return Math.min(
                visibleChannels.value.length,
                visibleStartIndex.value + visibleRows + BUFFER_SIZE * 2
            );
        });
        
        const renderedChannels = computed(() => {
            return visibleChannels.value.slice(visibleStartIndex.value, visibleEndIndex.value);
        });
        
        const scrollTopSpacer = computed(() => {
            return visibleStartIndex.value * CHANNEL_ROW_HEIGHT;
        });
        
        const scrollBottomSpacer = computed(() => {
            return (visibleChannels.value.length - visibleEndIndex.value) * CHANNEL_ROW_HEIGHT;
        });
        
        function handleScroll(event) {
            scrollTop.value = event.target.scrollTop;
        }

        // Calculate hours from current time until midnight
        const hoursUntilMidnight = computed(() => {
            const now = new Date(viewStartTime.value);
            const currentHour = now.getHours();
            return 24 - currentHour; // Hours remaining until midnight
        });

        const visibleHours = computed(() => {
            const hours = [];
            const start = new Date(viewStartTime.value);
            start.setMinutes(0, 0, 0);
            
            for (let i = 0; i < hoursUntilMidnight.value; i++) {
                const hour = new Date(start);
                hour.setHours(start.getHours() + i);
                hours.push(hour);
            }
            return hours;
        });

        const hourWidth = computed(() => HOUR_WIDTH);
        
        const timelineWidth = computed(() => hoursUntilMidnight.value * HOUR_WIDTH);

        const formatTimeRange = computed(() => {
            const start = visibleHours.value[0];
            if (!start) return '';
            
            const options = { weekday: 'short', month: 'short', day: 'numeric' };
            const dateStr = start.toLocaleDateString([], options);
            return `${dateStr} • ${formatHour(start)} - 00:00`;
        });

        const isNowVisible = computed(() => {
            const now = new Date();
            const start = visibleHours.value[0];
            const lastHour = visibleHours.value[visibleHours.value.length - 1];
            if (!start || !lastHour) return false;
            const end = new Date(lastHour);
            end.setHours(end.getHours() + 1);
            return now >= start && now <= end;
        });

        const nowIndicatorPosition = computed(() => {
            if (!isNowVisible.value) return 0;
            const now = new Date();
            const start = visibleHours.value[0];
            const diffMinutes = (now - start) / 1000 / 60;
            return CHANNEL_COLUMN_WIDTH + (diffMinutes / 60) * HOUR_WIDTH;
        });

        function goToNow() {
            const now = new Date();
            now.setMinutes(0, 0, 0);
            viewStartTime.value = now;
        }

        function formatHour(date) {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }

        function formatProgramTime(program) {
            const start = program.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const end = program.stop.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            return `${start} - ${end}`;
        }
        
        // Cache programs for all rendered channels to avoid repeated fetches
        const channelProgramsCache = computed(() => {
            const start = visibleHours.value[0];
            const lastHour = visibleHours.value[visibleHours.value.length - 1];
            if (!start || !lastHour) return {};
            const end = new Date(lastHour);
            end.setHours(end.getHours() + 1);
            
            const cache = {};
            renderedChannels.value.forEach(channel => {
                cache[channel.id] = epgStore.getProgramsInRange(channel.id, start, end);
            });
            return cache;
        });

        function getChannelPrograms(channelId) {
            return channelProgramsCache.value[channelId] || [];
        }

        function getProgramStyle(program) {
            const timelineStart = visibleHours.value[0];
            const lastHour = visibleHours.value[visibleHours.value.length - 1];
            if (!timelineStart || !lastHour) return { left: '0px', width: '0px' };
            const timelineEnd = new Date(lastHour);
            timelineEnd.setHours(timelineEnd.getHours() + 1);
            
            const progStart = program.start < timelineStart ? timelineStart : program.start;
            const progEnd = program.stop > timelineEnd ? timelineEnd : program.stop;
            
            const startOffset = (progStart - timelineStart) / 1000 / 60;
            const duration = (progEnd - progStart) / 1000 / 60;
            
            const left = (startOffset / 60) * HOUR_WIDTH;
            // Calculate natural width based on duration, with 2px gap for borders
            let width = (duration / 60) * HOUR_WIDTH - 2;
            
            // For very short programs, use a minimum width but don't exceed the natural space
            // to avoid overlapping into adjacent programs
            const minWidth = 25;
            width = Math.max(width, minWidth);
            
            return {
                left: `${left}px`,
                width: `${width}px`
            };
        }

        function isProgramCurrent(program) {
            const now = new Date();
            return program.start <= now && program.stop > now;
        }

        function isProgramPast(program) {
            return program.stop < new Date();
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
                const channel = visibleChannels.value.find(
                    ch => ch.id === selectedProgram.value.channelId
                );
                if (channel) {
                    selectChannel(channel);
                }
            }
            showDetails.value = false;
        }

        return {
            dialogVisible,
            close,
            epgGrid,
            hasEpgData,
            currentChannelId,
            visibleChannels,
            renderedChannels,
            scrollTopSpacer,
            scrollBottomSpacer,
            handleScroll,
            visibleHours,
            hourWidth,
            timelineWidth,
            formatTimeRange,
            isNowVisible,
            nowIndicatorPosition,
            showDetails,
            selectedProgram,
            goToNow,
            formatHour,
            formatProgramTime,
            getChannelPrograms,
            getProgramStyle,
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

.toolbar-left {
    display: flex;
    align-items: center;
    font-weight: 500;
}

.toolbar-title {
    font-size: 16px;
}

.toolbar-center {
    display: flex;
    align-items: center;
}

.toolbar-right {
    display: flex;
    align-items: center;
}

.date-btn {
    font-size: 14px;
    text-transform: none;
    letter-spacing: normal;
}

.time-range {
    font-size: 14px;
    opacity: 0.9;
}

.epg-content {
    flex: 1;
    overflow: auto;
    position: relative;
    background: transparent;
}

.timeline-wrapper {
    display: flex;
    position: sticky;
    top: 0;
    z-index: 3;
    background: rgba(30, 30, 30, 0.9);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.channel-column-header {
    min-width: 180px;
    max-width: 180px;
    padding: 12px;
    font-weight: 500;
    background: rgba(30, 30, 30, 0.9);
    border-right: 1px solid rgba(255, 255, 255, 0.08);
}

.timeline-header {
    display: flex;
}

.time-slot {
    padding: 12px 8px;
    font-size: 13px;
    font-weight: 500;
    border-left: 1px solid rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.7);
}

.now-indicator {
    position: absolute;
    top: 48px;
    bottom: 0;
    width: 2px;
    background: #f44336;
    z-index: 4;
    pointer-events: none;
    box-shadow: 0 0 8px rgba(244, 67, 54, 0.5);
}

.epg-grid {
    position: relative;
}

.channel-row {
    display: flex;
    min-height: 56px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.channel-row.active {
    background: rgba(76, 175, 80, 0.15);
}

.channel-row:hover {
    background: rgba(255, 255, 255, 0.05);
}

.channel-info {
    min-width: 180px;
    max-width: 180px;
    display: flex;
    align-items: center;
    padding: 8px 12px;
    gap: 10px;
    cursor: pointer;
    border-right: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(30, 30, 30, 0.9);
    position: sticky;
    left: 0;
    z-index: 1;
}

.channel-logo {
    border-radius: 4px;
    flex-shrink: 0;
}

.channel-details {
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.channel-name {
    font-size: 13px;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.channel-number {
    font-size: 11px;
    opacity: 0.5;
}

.programs-timeline {
    display: flex;
    position: relative;
    flex: 1;
    overflow: hidden;
}

.program-block {
    position: absolute;
    top: 4px;
    bottom: 4px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    overflow: hidden;
    cursor: pointer;
    transition: all 0.2s ease;
    z-index: 1;
    box-sizing: border-box;
}

.program-block:hover {
    background: rgba(255, 255, 255, 0.15);
    z-index: 10;
    transform: scale(1.02);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}

.program-block.short-program .program-content {
    padding: 2px 4px;
}

.program-block.short-program .program-time {
    display: none;
}

.program-block.short-program .program-title {
    font-size: 10px;
}

.program-block.current {
    background: rgba(76, 175, 80, 0.2);
    border-color: rgba(76, 175, 80, 0.4);
    z-index: 2;
}

.program-block.past {
    opacity: 0.4;
}

.program-content {
    padding: 4px 8px;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
}

.program-title {
    font-size: 12px;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.program-time {
    font-size: 10px;
    opacity: 0.7;
}

.no-programs {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 12px;
    opacity: 0.4;
    white-space: nowrap;
}

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

.program-details-card {
    background: rgba(30, 30, 30, 0.95) !important;
    backdrop-filter: blur(20px) saturate(180%);
    -webkit-backdrop-filter: blur(20px) saturate(180%);
    border: 1px solid rgba(255, 255, 255, 0.1);
}

.program-tooltip {
    text-align: center;
    font-size: 12px;
}
</style>
