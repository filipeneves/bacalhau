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
            <v-icon size="small">{{ isExpanded ? 'mdi-chevron-down' : 'mdi-chevron-up' }}</v-icon>
        </div>

        <!-- EPG Content (collapsible) - shows current and upcoming programs -->
        <div v-show="isExpanded" class="current-epg-content">
            <!-- Current Program -->
            <div v-if="currentProgram" class="program-item current" @click="showProgramDetails(currentProgram)">
                <div class="program-time">
                    {{ formatTime(currentProgram.start) }} - {{ formatTime(currentProgram.stop) }}
                </div>
                <div class="program-info">
                    <div class="program-title">{{ currentProgram.title }}</div>
                    <div class="program-description" v-if="currentProgram.description">
                        {{ truncateDescription(currentProgram.description) }}
                    </div>
                </div>
                <div class="program-progress">
                    <v-progress-linear
                        :model-value="currentProgramProgress"
                        color="primary"
                        height="3"
                    ></v-progress-linear>
                </div>
            </div>

            <!-- Upcoming Programs -->
            <div 
                v-for="program in upcomingPrograms" 
                :key="program.start.getTime()"
                class="program-item upcoming"
                @click="showProgramDetails(program)"
            >
                <div class="program-time">
                    {{ formatTime(program.start) }} - {{ formatTime(program.stop) }}
                </div>
                <div class="program-info">
                    <div class="program-title">{{ program.title }}</div>
                </div>
            </div>

            <!-- No EPG data -->
            <div v-if="!currentProgram && upcomingPrograms.length === 0" class="no-epg">
                <p>No program information available for this channel</p>
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
                    <v-spacer></v-spacer>
                    <v-btn @click="showDetails = false">Close</v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>
    </div>
</template>

<script>
import { ref, computed, onMounted, onUnmounted } from 'vue';
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
        let updateInterval = null;

        onMounted(() => {
            // Update current time every 30 seconds
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

        const currentProgram = computed(() => {
            if (!currentChannelId.value) return null;
            return epgStore.getCurrentProgram(currentChannelId.value);
        });

        const upcomingPrograms = computed(() => {
            if (!currentChannelId.value) return [];
            return epgStore.getUpcomingPrograms(currentChannelId.value, 5);
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

        return {
            isExpanded,
            currentProgram,
            upcomingPrograms,
            currentProgramProgress,
            timeRemaining,
            showDetails,
            selectedProgram,
            toggleExpanded,
            formatTime,
            truncateDescription,
            showProgramDetails
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

/* When expanded, overlay on top of video */
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
}

.current-program-info {
    display: flex;
    align-items: center;
    gap: 8px;
}

.program-time-remaining {
    opacity: 0.7;
    font-size: 12px;
}

.no-program {
    opacity: 0.5;
}

.current-epg-content {
    max-height: 250px;
    overflow-y: auto;
    padding: 12px;
    background: transparent;
}

.program-item {
    display: flex;
    flex-direction: column;
    padding: 10px 12px;
    margin-bottom: 6px;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s ease;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.05);
}

.program-item:hover {
    background: rgba(255, 255, 255, 0.15);
    border-color: rgba(255, 255, 255, 0.1);
}

.program-item.current {
    background: rgba(76, 175, 80, 0.2);
    border-left: 3px solid #4CAF50;
    border-color: rgba(76, 175, 80, 0.3);
}

.program-item.upcoming {
    background: rgba(255, 255, 255, 0.05);
}

.program-time {
    font-size: 11px;
    opacity: 0.7;
    margin-bottom: 2px;
}

.program-info {
    flex: 1;
}

.program-title {
    font-weight: 500;
    font-size: 14px;
}

.program-description {
    font-size: 12px;
    opacity: 0.7;
    margin-top: 4px;
}

.program-progress {
    margin-top: 8px;
}

.no-epg {
    text-align: center;
    padding: 20px;
    opacity: 0.5;
}
</style>
