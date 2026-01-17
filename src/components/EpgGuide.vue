<template>
    <div class="epg-container" :class="{ 'expanded': isExpanded }">
        <!-- EPG Header with collapse/expand toggle -->
        <div class="epg-header" @click="toggleExpanded">
            <div class="epg-title">
                <v-icon class="mr-2">mdi-television-guide</v-icon>
                <span>TV Guide</span>
                <span v-if="currentProgram" class="current-program-preview">
                    - {{ currentProgram.title }}
                </span>
            </div>
            <v-icon>{{ isExpanded ? 'mdi-chevron-down' : 'mdi-chevron-up' }}</v-icon>
        </div>

        <!-- EPG Content (collapsible) -->
        <div v-show="isExpanded" class="epg-content">
            <!-- Time navigation -->
            <div class="time-navigation">
                <v-btn icon size="small" variant="text" @click="navigateTime(-2)">
                    <v-icon>mdi-chevron-left</v-icon>
                </v-btn>
                <span class="current-time">{{ formatTimeRange }}</span>
                <v-btn icon size="small" variant="text" @click="navigateTime(2)">
                    <v-icon>mdi-chevron-right</v-icon>
                </v-btn>
                <v-btn size="small" variant="text" @click="goToNow" class="ml-2">
                    Now
                </v-btn>
            </div>

            <!-- Timeline header -->
            <div class="timeline-container">
                <div class="channel-column-header"></div>
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
            <div class="epg-grid" ref="epgGrid">
                <div 
                    v-for="channel in visibleChannels" 
                    :key="channel.id" 
                    class="channel-row"
                    :class="{ 'active': channel.id === currentChannelId }"
                >
                    <!-- Channel info -->
                    <div class="channel-info" @click="selectChannel(channel)">
                        <v-img 
                            v-if="channel.logo" 
                            :src="channel.logo" 
                            width="32" 
                            height="32" 
                            class="channel-logo"
                            cover
                        ></v-img>
                        <span class="channel-name">{{ channel.name }}</span>
                    </div>

                    <!-- Programs timeline -->
                    <div class="programs-timeline">
                        <div 
                            v-for="program in getChannelPrograms(channel.id)" 
                            :key="program.start.getTime()"
                            class="program-block"
                            :class="{ 
                                'current': isProgramCurrent(program),
                                'past': isProgramPast(program)
                            }"
                            :style="getProgramStyle(program)"
                            :title="program.title + (program.description ? '\n' + program.description : '')"
                            @click="showProgramDetails(program)"
                        >
                            <div class="program-content">
                                <span class="program-title">{{ program.title }}</span>
                                <span class="program-time">{{ formatProgramTime(program) }}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- No EPG data message -->
            <div v-if="!hasEpgData" class="no-epg-message">
                <v-icon size="48" class="mb-2">mdi-television-guide</v-icon>
                <p>No EPG data available</p>
                <p class="text-caption">Load an XMLTV EPG file to see the program guide</p>
            </div>
        </div>

        <!-- Program details dialog -->
        <v-dialog v-model="showDetails" max-width="500">
            <v-card v-if="selectedProgram">
                <v-card-title>{{ selectedProgram.title }}</v-card-title>
                <v-card-subtitle>
                    {{ formatProgramTime(selectedProgram) }} ({{ selectedProgram.duration }} min)
                </v-card-subtitle>
                <v-card-text>
                    <v-chip v-if="selectedProgram.category" size="small" class="mb-2">
                        {{ selectedProgram.category }}
                    </v-chip>
                    <p>{{ selectedProgram.description || 'No description available' }}</p>
                </v-card-text>
                <v-card-actions>
                    <v-spacer></v-spacer>
                    <v-btn @click="showDetails = false">Close</v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>
    </div>
</template>

<script>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useEpgStore } from '@/stores/epg';
import { usePlaylistStore } from '@/stores/playlist';

export default {
    name: 'EpgGuide',

    setup() {
        const epgStore = useEpgStore();
        const playlistStore = usePlaylistStore();
        
        const epgGrid = ref(null);
        const viewStartTime = ref(new Date());
        const showDetails = ref(false);
        const selectedProgram = ref(null);
        
        // Constants
        const HOURS_VISIBLE = 4;
        const HOUR_WIDTH = 200; // pixels per hour
        const CHANNEL_COLUMN_WIDTH = 150;
        
        // Initialize to current hour
        onMounted(() => {
            goToNow();
            // Update now indicator every minute
            const interval = setInterval(() => {
                // Force reactivity update
                viewStartTime.value = new Date(viewStartTime.value);
            }, 60000);
            
            onUnmounted(() => clearInterval(interval));
        });

        const isExpanded = computed(() => epgStore.isExpanded);
        const hasEpgData = computed(() => epgStore.isLoaded && Object.keys(epgStore.epgData).length > 0);
        
        const currentChannel = computed(() => playlistStore.currentChannel);
        const currentChannelId = computed(() => currentChannel.value?.tvg?.id || currentChannel.value?.name);
        
        const currentProgram = computed(() => {
            if (!currentChannelId.value) return null;
            return epgStore.getCurrentProgram(currentChannelId.value);
        });

        // Get visible channels from playlist that have EPG data
        const visibleChannels = computed(() => {
            const channels = playlistStore.channels;
            return channels.map(ch => ({
                id: ch.tvg?.id || ch.name,
                name: ch.name,
                logo: ch.tvg?.logo,
                originalChannel: ch
            })).slice(0, 20); // Limit for performance
        });

        const visibleHours = computed(() => {
            const hours = [];
            const start = new Date(viewStartTime.value);
            start.setMinutes(0, 0, 0);
            
            for (let i = 0; i < HOURS_VISIBLE; i++) {
                const hour = new Date(start);
                hour.setHours(hour.getHours() + i);
                hours.push(hour);
            }
            return hours;
        });

        const hourWidth = computed(() => HOUR_WIDTH);

        const formatTimeRange = computed(() => {
            const start = visibleHours.value[0];
            const end = visibleHours.value[HOURS_VISIBLE - 1];
            if (!start || !end) return '';
            
            const endHour = new Date(end);
            endHour.setHours(endHour.getHours() + 1);
            
            return `${formatHour(start)} - ${formatHour(endHour)}`;
        });

        const isNowVisible = computed(() => {
            const now = new Date();
            const start = visibleHours.value[0];
            const end = new Date(visibleHours.value[HOURS_VISIBLE - 1]);
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

        function toggleExpanded() {
            epgStore.toggleExpanded();
        }

        function navigateTime(hours) {
            const newTime = new Date(viewStartTime.value);
            newTime.setHours(newTime.getHours() + hours);
            viewStartTime.value = newTime;
        }

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

        function getChannelPrograms(channelId) {
            const start = visibleHours.value[0];
            const end = new Date(visibleHours.value[HOURS_VISIBLE - 1]);
            end.setHours(end.getHours() + 1);
            
            return epgStore.getProgramsInRange(channelId, start, end);
        }

        function getProgramStyle(program) {
            const timelineStart = visibleHours.value[0];
            const timelineEnd = new Date(visibleHours.value[HOURS_VISIBLE - 1]);
            timelineEnd.setHours(timelineEnd.getHours() + 1);
            
            // Clamp program times to visible range
            const progStart = program.start < timelineStart ? timelineStart : program.start;
            const progEnd = program.stop > timelineEnd ? timelineEnd : program.stop;
            
            const startOffset = (progStart - timelineStart) / 1000 / 60; // minutes from start
            const duration = (progEnd - progStart) / 1000 / 60; // duration in minutes
            
            const left = (startOffset / 60) * HOUR_WIDTH;
            const width = (duration / 60) * HOUR_WIDTH;
            
            return {
                left: `${left}px`,
                width: `${Math.max(width - 2, 20)}px` // min width, subtract border
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
            }
        }

        return {
            epgGrid,
            isExpanded,
            hasEpgData,
            currentProgram,
            currentChannelId,
            visibleChannels,
            visibleHours,
            hourWidth,
            formatTimeRange,
            isNowVisible,
            nowIndicatorPosition,
            showDetails,
            selectedProgram,
            toggleExpanded,
            navigateTime,
            goToNow,
            formatHour,
            formatProgramTime,
            getChannelPrograms,
            getProgramStyle,
            isProgramCurrent,
            isProgramPast,
            showProgramDetails,
            selectChannel
        };
    }
};
</script>

<style scoped>
.epg-container {
    background: rgb(var(--v-theme-surface));
    border-top: 1px solid rgba(var(--v-border-color), 0.12);
    transition: height 0.3s ease;
    overflow: hidden;
}

.epg-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 16px;
    cursor: pointer;
    background: rgba(var(--v-theme-primary), 0.1);
    user-select: none;
}

.epg-header:hover {
    background: rgba(var(--v-theme-primary), 0.2);
}

.epg-title {
    display: flex;
    align-items: center;
    font-weight: 500;
}

.current-program-preview {
    margin-left: 8px;
    opacity: 0.7;
    font-weight: normal;
    max-width: 300px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.epg-content {
    max-height: 300px;
    overflow: auto;
    position: relative;
}

.time-navigation {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 8px;
    background: rgba(var(--v-theme-surface-variant), 0.5);
    position: sticky;
    top: 0;
    z-index: 3;
}

.current-time {
    min-width: 150px;
    text-align: center;
    font-weight: 500;
}

.timeline-container {
    display: flex;
    position: sticky;
    top: 40px;
    z-index: 2;
    background: rgb(var(--v-theme-surface));
}

.channel-column-header {
    min-width: 150px;
    background: rgb(var(--v-theme-surface));
}

.timeline-header {
    display: flex;
    border-bottom: 1px solid rgba(var(--v-border-color), 0.12);
}

.time-slot {
    padding: 8px;
    text-align: left;
    font-size: 12px;
    font-weight: 500;
    border-left: 1px solid rgba(var(--v-border-color), 0.12);
    color: rgba(var(--v-theme-on-surface), 0.7);
}

.now-indicator {
    position: absolute;
    top: 40px;
    bottom: 0;
    width: 2px;
    background: rgb(var(--v-theme-error));
    z-index: 4;
    pointer-events: none;
}

.epg-grid {
    position: relative;
}

.channel-row {
    display: flex;
    min-height: 48px;
    border-bottom: 1px solid rgba(var(--v-border-color), 0.08);
}

.channel-row.active {
    background: rgba(var(--v-theme-primary), 0.1);
}

.channel-row:hover {
    background: rgba(var(--v-theme-primary), 0.05);
}

.channel-info {
    min-width: 150px;
    max-width: 150px;
    display: flex;
    align-items: center;
    padding: 4px 8px;
    gap: 8px;
    cursor: pointer;
    border-right: 1px solid rgba(var(--v-border-color), 0.12);
    background: rgb(var(--v-theme-surface));
    position: sticky;
    left: 0;
    z-index: 1;
}

.channel-logo {
    border-radius: 4px;
    flex-shrink: 0;
}

.channel-name {
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.programs-timeline {
    display: flex;
    position: relative;
    flex: 1;
    min-width: 800px; /* 4 hours * 200px */
}

.program-block {
    position: absolute;
    top: 2px;
    bottom: 2px;
    background: rgba(var(--v-theme-primary), 0.15);
    border: 1px solid rgba(var(--v-theme-primary), 0.3);
    border-radius: 4px;
    overflow: hidden;
    cursor: pointer;
    transition: background 0.2s, transform 0.1s;
}

.program-block:hover {
    background: rgba(var(--v-theme-primary), 0.25);
    z-index: 1;
}

.program-block.current {
    background: rgba(var(--v-theme-success), 0.2);
    border-color: rgba(var(--v-theme-success), 0.5);
}

.program-block.past {
    opacity: 0.5;
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

.no-epg-message {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px;
    opacity: 0.5;
    text-align: center;
}
</style>
