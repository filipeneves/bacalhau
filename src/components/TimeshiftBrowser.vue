<template>
    <!-- Loading state -->
    <div v-if="timeshiftLoading" class="d-flex justify-center align-center pa-8">
        <v-progress-circular indeterminate color="primary" size="32"></v-progress-circular>
    </div>

    <!-- Empty state -->
    <div v-else-if="filteredChannels.length === 0 && !search" class="text-center pa-8">
        <v-icon size="48" color="grey">mdi-history</v-icon>
        <p class="text-caption text-grey mt-2">No channels with catchup/timeshift available</p>
    </div>

    <!-- No search results -->
    <div v-else-if="filteredChannels.length === 0 && search" class="text-center pa-8">
        <v-icon size="48" color="grey">mdi-magnify</v-icon>
        <p class="text-caption text-grey mt-2">No timeshift channels match "{{ search }}"</p>
    </div>

    <!-- Timeshift channel list -->
    <div v-else class="timeshift-channels">
        <div class="timeshift-header pa-3">
            <v-icon size="18" color="primary" class="mr-2">mdi-history</v-icon>
            <span class="text-body-2 font-weight-medium">Catchup / Timeshift</span>
            <v-chip size="x-small" variant="tonal" color="grey" class="ml-2">
                {{ filteredChannels.length }}
            </v-chip>
        </div>

        <v-virtual-scroll
            :items="filteredChannels"
            :item-height="64"
            class="timeshift-scroll"
        >
            <template v-slot:default="{ item }">
                <v-list-item
                    :key="item.stream_id"
                    class="timeshift-item"
                    @click="playlist.selectTimeshiftChannel(item)"
                >
                    <template #prepend>
                        <v-avatar size="44" rounded class="mr-2">
                            <v-img
                                :src="proxyUrl(item.stream_icon || '')"
                                cover
                                loading="lazy"
                            >
                                <template v-slot:placeholder>
                                    <v-icon size="28" color="grey">mdi-television</v-icon>
                                </template>
                                <template v-slot:error>
                                    <v-icon size="28" color="grey">mdi-television</v-icon>
                                </template>
                            </v-img>
                        </v-avatar>
                    </template>
                    <v-list-item-title class="text-body-2 text-truncate">{{ item.name }}</v-list-item-title>
                    <v-list-item-subtitle class="text-caption text-truncate">
                        <v-icon size="10" color="primary" class="mr-1">mdi-history</v-icon>
                        {{ item.tv_archive_duration }} days catchup
                        <span v-if="item.category_name" class="ml-2">· {{ item.category_name }}</span>
                    </v-list-item-subtitle>
                    <template #append>
                        <v-icon size="16" color="grey">mdi-chevron-right</v-icon>
                    </template>
                </v-list-item>
            </template>
        </v-virtual-scroll>
    </div>
</template>

<script>
import { computed } from 'vue';
import { usePlaylistStore } from '@/stores/playlist';
import { proxyUrl } from '@/services/mixedContent.js';

export default {
    name: 'TimeshiftBrowser',
    props: {
        search: {
            type: String,
            default: ''
        }
    },

    setup(props) {
        const playlist = usePlaylistStore();

        const timeshiftLoading = computed(() => playlist.timeshiftLoading);
        const timeshiftChannels = computed(() => playlist.timeshiftChannels);

        const filteredChannels = computed(() => {
            if (!props.search) return timeshiftChannels.value;
            const searchLower = props.search.toLowerCase();
            return timeshiftChannels.value.filter(ch =>
                ch.name?.toLowerCase().includes(searchLower)
            );
        });

        return {
            playlist,
            timeshiftLoading,
            timeshiftChannels,
            filteredChannels,
            proxyUrl,
            search: computed(() => props.search),
        };
    }
};
</script>

<style scoped>
.timeshift-channels {
    height: 100%;
    display: flex;
    flex-direction: column;
}

.timeshift-header {
    display: flex;
    align-items: center;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(0, 0, 0, 0.2);
    flex-shrink: 0;
}

.timeshift-scroll {
    flex: 1;
}

.timeshift-item {
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.timeshift-item:hover {
    background: rgba(255, 255, 255, 0.05);
}
</style>
