<template>
    <div class="current-epg-container" :class="{ 'expanded': isExpanded }">
        <!-- EPG Header with collapse/expand toggle -->
        <div class="current-epg-header" @click="toggleExpanded">
            <div class="epg-title">
                <v-icon class="mr-2" size="small">mdi-television-guide</v-icon>
                <span v-if="currentProgram" class="current-program-info">
                    <strong>Now:</strong> {{ currentProgram.title }}
                    <span class="program-time-remaining">({{ timeRemaining }})</span>
                </span>
                <span v-else class="no-program">No program info</span>
            </div>
            <div class="header-actions">
                <v-chip v-if="hasTimeshift" size="x-small" color="primary" variant="tonal" class="mr-2">
                    <v-icon start size="10">mdi-history</v-icon>
                    Catchup
                </v-chip>
                <v-icon size="small">{{ isExpanded ? 'mdi-chevron-down' : 'mdi-chevron-up' }}</v-icon>
            </div>
        </div>

        <!-- EPG Content (collapsible) - timeline of past, current, and upcoming -->
        <div v-show="isExpanded" class="current-epg-content" ref="epgContent">
            <!-- Timeline -->
            <div class="timeline-container" ref="timelineContainer">
                <!-- Past Programs (catchup/timeshift) -->
                <div 
                    v-for="program in pastPrograms" 
                    :key="'past-' + program.start.getTime()"
                    class="program-item past"
                    :class="{ 'catchup-available': hasTimeshift }"
                    @click="handleProgramClick(program, 'past')"
                >
                    <div class="program-time-badge">
                        <span class="time-text">{{ formatTime(program.start) }}</span>
                    </div>
                    <div class="program-body">
                        <div class="program-title-row">
                            <span class="program-title">{{ program.title }}</span>
                            <v-icon v-if="hasTimeshift" size="14" color="primary" class="catchup-icon">mdi-play-circle</v-icon>
                        </div>
                        <div class="program-meta">
                            <span class="program-duration">{{ program.duration }}min</span>
                            <span v-if="program.category" class="program-category">{{ program.category }}</span>
                        </div>
                    </div>
                </div>

                <!-- Current Program -->
                <div v-if="currentProgram" class="program-item current" ref="currentProgramEl" @click="showProgramDetails(currentProgram)">
                    <div class="program-time-badge now">
                        <span class="time-text">{{ formatTime(currentProgram.start) }}</span>
                        <span class="now-label">NOW</span>
                    </div>
                    <div class="program-body">
                        <div class="program-title-row">
                            <span class="program-title">{{ currentProgram.title }}</span>
                        </div>
                        <div class="program-meta">
                            <span class="program-duration">{{ formatTime(currentProgram.start) }} - {{ formatTime(currentProgram.stop) }}</span>
                            <span v-if="currentProgram.category" class="program-category">{{ currentProgram.category }}</span>
                        </div>
                        <div v-if="currentProgram.description" class="program-description">
                            {{ truncateDescription(currentProgram.description) }}
                        </div>
                        <v-progress-linear
                            :model-value="currentProgramProgress"
                            color="primary"
                            height="3"
                            class="mt-2"
                        ></v-progress-linear>
                    </div>
                </div>

                <!-- Upcoming Programs -->
                <div 
                    v-for="program in upcomingPrograms" 
                    :key="'next-' + program.start.getTime()"
                    class="program-item upcoming"
                    @click="showProgramDetails(program)"
                >
                    <div class="program-time-badge">
                        <span class="time-text">{{ formatTime(program.start) }}</span>
                    </div>
                    <div class="program-body">
                        <div class="program-title-row">
                            <span class="program-title">{{ program.title }}</span>
                        </div>
                        <div class="program-meta">
                            <span class="program-duration">{{ program.duration }}min</span>
                            <span v-if="program.category" class="program-category">{{ program.category }}</span>
                        </div>
                    </div>
                </div>

                <!-- No EPG data -->
                <div v-if="!currentProgram && upcomingPrograms.length === 0 && pastPrograms.length === 0" class="no-epg">
                    <p>No program information available for this channel</p>
                </div>
            </div>
        </div>

        <!-- Program details dialog -->
        <v-dialog v-model="showDetails" max-width="500">
            <v-card v-if="selectedProgram">
                <v-card-title>{{ selectedProgram.title }}</v-card-title>
                <v-card-subtitle>
                    {{ formatTime(selectedProgram.start) }} - {{ formatTime(selectedProgram.stop) }} 
                    ({{ selectedProgram.duration }} min)
                </v-card-subtitle>
                <v-card-text>
                    <v-chip v-if="selectedProgram.category" size="small" class="mb-2">
                        {{ selectedProgram.category }}
                    </v-chip>
                    <p>{{ selectedProgram.description || 'No description available' }}</p>
                </v-card-text>
                <v-card-actions>
                    <v-btn v-if="hasTimeshift && selectedProgramIsPast" color="primary" @click="playTimeshift(selectedProgram)">
                        <v-icon start>mdi-play</v-icon>
                        Watch (Catchup)
                    </v-btn>
                    <v-spacer></v-spacer>
                    <v-btn @click="showDetails = false">Close</v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>
    </div>
</template>

<script>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useEpgStore } from '@/stores/epg';
import { usePlaylistStore } from '@/stores/playlist';

export default {
    name: 'CurrentChannelEpg',

    setup() {
        const epgStore = useEpgStore();
        const playlistStore = usePlaylistStore();
        
        const showDetails = ref(false);
        const selectedProgram = ref(null);
        const now = ref(new Date());
        const epgContent = ref(null);
        const currentProgramEl = ref(null);
        const timelineContainer = ref(null);
        let updateInterval = null;

        onMounted(() => {
            updateInterval = setInterval(() => {
                now.value = new Date();
            }, 30000);
        });

        onUnmounted(() => {
            if (updateInterval) clearInterval(updateInterval);
        });

        const isExpanded = computed(() => epgStore.isExpanded);
        
        const currentChannel = computed(() => playlistStore.currentChannel);
        const currentChannelId = computed(() => 
            currentChannel.value?.tvg?.id || currentChannel.value?.name
        );

        // Check if this channel has timeshift
        const hasTimeshift = computed(() => {
            return playlistStore.channelHasTimeshift(currentChannel.value);
        });

        const currentProgram = computed(() => {
            if (!currentChannelId.value) return null;
            return epgStore.getCurrentProgram(currentChannelId.value);
        });

        const upcomingPrograms = computed(() => {
            if (!currentChannelId.value) return [];
            return epgStore.getUpcomingPrograms(currentChannelId.value, 8);
        });

        const pastPrograms = computed(() => {
            if (!currentChannelId.value) return [];
            return epgStore.getPastPrograms(currentChannelId.value, 10);
        });

        const currentProgramProgress = computed(() => {
            if (!currentProgram.value) return 0;
            const start = currentProgram.value.start.getTime();
            const end = currentProgram.value.stop.getTime();
            const current = now.value.getTime();
            return ((current - start) / (end - start)) * 100;
        });

        const timeRemaining = computed(() => {
            if (!currentProgram.value) return '';
            const remaining = Math.max(0, currentProgram.value.stop - now.value);
            const minutes = Math.floor(remaining / 1000 / 60);
            if (minutes > 60) {
                const hours = Math.floor(minutes / 60);
                const mins = minutes % 60;
                return `${hours}h ${mins}m left`;
            }
            return `${minutes}m left`;
        });

        const selectedProgramIsPast = computed(() => {
            if (!selectedProgram.value) return false;
            return selectedProgram.value.stop <= now.value;
        });

        // Auto-scroll to current program when expanded
        watch(isExpanded, (expanded) => {
            if (expanded) {
                nextTick(() => {
                    scrollToCurrentProgram();
                });
            }
        });

        function scrollToCurrentProgram() {
            if (currentProgramEl.value && epgContent.value) {
                currentProgramEl.value.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }

        function toggleExpanded() {
            epgStore.toggleExpanded();
        }

        function formatTime(date) {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }

        function truncateDescription(desc, maxLength = 100) {
            if (desc.length <= maxLength) return desc;
            return desc.substring(0, maxLength) + '...';
        }

        function showProgramDetails(program) {
            selectedProgram.value = program;
            showDetails.value = true;
        }

        function handleProgramClick(program, type) {
            if (type === 'past' && hasTimeshift.value) {
                selectedProgram.value = program;
                showDetails.value = true;
            } else {
                showProgramDetails(program);
            }
        }

        function playTimeshift(program) {
            playlistStore.playTimeshiftProgram(currentChannel.value, program);
            showDetails.value = false;
        }

        return {
            isExpanded,
            currentProgram,
            upcomingPrograms,
            pastPrograms,
            currentProgramProgress,
            timeRemaining,
            showDetails,
            selectedProgram,
            selectedProgramIsPast,
            hasTimeshift,
            epgContent,
            currentProgramEl,
            timelineContainer,
            toggleExpanded,
            formatTime,
            truncateDescription,
            showProgramDetails,
            handleProgramClick,
            playTimeshift
        };
    }
};
</script>

<style scoped>
.current-epg-container {
    position: relative;
    z-index: 10;
    background: rgba(30, 30, 30, 0.95);
}

.current-epg-container.expanded {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    background: rgba(30, 30, 30, 0.6);
    backdrop-filter: blur(20px) saturate(180%);
    -webkit-backdrop-filter: blur(20px) saturate(180%);
    border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.current-epg-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 16px;
    height: 48px;
    cursor: pointer;
    background: rgba(255, 255, 255, 0.05);
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    user-select: none;
}

.current-epg-header:hover {
    background: rgba(255, 255, 255, 0.1);
}

.epg-title {
    display: flex;
    align-items: center;
    font-size: 13px;
    min-width: 0;
    flex: 1;
}

.header-actions {
    display: flex;
    align-items: center;
    flex-shrink: 0;
}

.current-program-info {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.program-time-remaining {
    opacity: 0.7;
    font-size: 12px;
}

.no-program {
    opacity: 0.5;
}

.current-epg-content {
    max-height: 300px;
    overflow-y: auto;
    padding: 8px 12px;
    background: transparent;
}

.timeline-container {
    position: relative;
    padding-left: 4px;
}

/* Timeline line */
.timeline-container::before {
    content: '';
    position: absolute;
    left: 32px;
    top: 0;
    bottom: 0;
    width: 2px;
    background: rgba(255, 255, 255, 0.1);
}

.program-item {
    display: flex;
    padding: 8px;
    margin-bottom: 4px;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s ease;
    position: relative;
}

.program-item:hover {
    background: rgba(255, 255, 255, 0.1);
}

/* Past programs */
.program-item.past {
    opacity: 0.6;
}

.program-item.past.catchup-available {
    opacity: 0.85;
}

.program-item.past.catchup-available:hover {
    background: rgba(33, 150, 243, 0.15);
    opacity: 1;
}

/* Current program */
.program-item.current {
    background: rgba(76, 175, 80, 0.15);
    border: 1px solid rgba(76, 175, 80, 0.3);
    opacity: 1;
}

.program-item.current:hover {
    background: rgba(76, 175, 80, 0.25);
}

/* Upcoming programs */
.program-item.upcoming {
    opacity: 0.7;
}

.program-item.upcoming:hover {
    opacity: 1;
}

.program-time-badge {
    flex-shrink: 0;
    width: 50px;
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-right: 12px;
    position: relative;
    z-index: 1;
}

.program-time-badge .time-text {
    font-size: 11px;
    font-weight: 500;
    opacity: 0.8;
    background: rgba(30, 30, 30, 0.9);
    padding: 2px 4px;
    border-radius: 4px;
}

.program-time-badge.now .time-text {
    color: #4CAF50;
    font-weight: 600;
}

.now-label {
    font-size: 9px;
    font-weight: 700;
    color: #4CAF50;
    letter-spacing: 0.5px;
    margin-top: 2px;
}

.program-body {
    flex: 1;
    min-width: 0;
}

.program-title-row {
    display: flex;
    align-items: center;
    gap: 6px;
}

.program-title {
    font-weight: 500;
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.catchup-icon {
    flex-shrink: 0;
}

.program-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 2px;
}

.program-duration {
    font-size: 11px;
    opacity: 0.6;
}

.program-category {
    font-size: 10px;
    opacity: 0.5;
    background: rgba(255, 255, 255, 0.1);
    padding: 1px 6px;
    border-radius: 4px;
}

.program-description {
    font-size: 12px;
    opacity: 0.6;
    margin-top: 4px;
    line-height: 1.3;
}

.no-epg {
    text-align: center;
    padding: 20px;
    opacity: 0.5;
}
</style>
