<template>
    <!-- Loading state -->
    <div v-if="vodLoading" class="d-flex justify-center align-center pa-8">
        <v-progress-circular indeterminate color="primary" size="32"></v-progress-circular>
    </div>

    <!-- Series detail view -->
    <div v-else-if="seriesInfo" class="vod-series-detail">
        <!-- Back button + Series header -->
        <v-toolbar flat dense density="compact" class="series-header">
            <v-btn icon size="small" @click="playlist.vodGoBack()">
                <v-icon>mdi-arrow-left</v-icon>
            </v-btn>
            <v-toolbar-title class="text-body-2 font-weight-medium text-truncate">
                {{ seriesInfo.info?.name || selectedSeries?.name || 'Series' }}
            </v-toolbar-title>
        </v-toolbar>

        <!-- Series info banner -->
        <div v-if="seriesInfo.info" class="series-banner pa-3">
            <div class="d-flex">
                <v-img
                    v-if="seriesInfo.info.cover"
                    :src="proxyUrl(seriesInfo.info.cover)"
                    width="80"
                    max-width="80"
                    height="120"
                    class="rounded mr-3 flex-shrink-0"
                    cover
                >
                    <template v-slot:error>
                        <v-icon size="40" color="grey">mdi-movie-open</v-icon>
                    </template>
                </v-img>
                <div class="flex-grow-1" style="min-width: 0;">
                    <div v-if="seriesInfo.info.rating" class="text-caption text-grey mb-1">
                        <v-icon size="12" color="warning">mdi-star</v-icon>
                        {{ seriesInfo.info.rating }}
                        <span v-if="seriesInfo.info.releaseDate" class="ml-2">{{ seriesInfo.info.releaseDate }}</span>
                    </div>
                    <div v-if="seriesInfo.info.genre" class="text-caption text-grey mb-1">{{ seriesInfo.info.genre }}</div>
                    <div v-if="seriesInfo.info.plot" class="text-caption text-grey series-plot">{{ seriesInfo.info.plot }}</div>
                </div>
            </div>
        </div>

        <!-- Season tabs -->
        <v-tabs v-model="selectedSeason" density="compact" show-arrows class="season-tabs">
            <v-tab v-for="(episodes, seasonNum) in seriesInfo.episodes" :key="seasonNum" :value="seasonNum">
                S{{ seasonNum }}
            </v-tab>
        </v-tabs>

        <!-- Episode list -->
        <v-virtual-scroll
            v-if="currentSeasonEpisodes.length > 0"
            :items="currentSeasonEpisodes"
            :item-height="60"
            class="episodes-scroll"
        >
            <template v-slot:default="{ item }">
                <v-list-item
                    :key="item.id"
                    class="episode-item"
                    @click="playlist.playSeriesEpisode(item)"
                    :title="item.title || `Episode ${item.episode_num}`"
                    :subtitle="item.info?.plot ? truncate(item.info.plot, 60) : ''"
                >
                    <template #prepend>
                        <v-avatar size="40" rounded class="mr-2">
                            <v-img v-if="item.info?.movie_image" :src="proxyUrl(item.info.movie_image)" cover>
                                <template v-slot:error>
                                    <v-icon size="24" color="grey">mdi-play-circle</v-icon>
                                </template>
                            </v-img>
                            <v-icon v-else size="24" color="grey">mdi-play-circle</v-icon>
                        </v-avatar>
                    </template>
                    <template #append>
                        <span v-if="item.info?.duration" class="text-caption text-grey">{{ item.info.duration }}</span>
                    </template>
                </v-list-item>
            </template>
        </v-virtual-scroll>
        <div v-else class="text-center pa-8">
            <v-icon size="48" color="grey">mdi-filmstrip-off</v-icon>
            <p class="text-caption text-grey mt-2">No episodes available</p>
        </div>
    </div>

    <!-- VOD items list -->
    <div v-else-if="vodItems.length > 0" class="vod-items">
        <!-- Back to categories -->
        <v-toolbar flat dense density="compact" class="items-header">
            <v-btn icon size="small" @click="playlist.vodGoBack()">
                <v-icon>mdi-arrow-left</v-icon>
            </v-btn>
            <v-toolbar-title class="text-body-2 font-weight-medium text-truncate">
                {{ currentCategoryName }}
            </v-toolbar-title>
            <v-chip size="x-small" variant="tonal" color="grey" class="ml-2">
                {{ filteredVodItems.length }}
            </v-chip>
        </v-toolbar>

        <v-virtual-scroll
            v-if="filteredVodItems.length > 0"
            :items="filteredVodItems"
            :item-height="64"
            class="vod-items-scroll"
        >
            <template v-slot:default="{ item }">
                <v-list-item
                    :key="item.stream_id || item.series_id"
                    class="vod-item"
                    @click="handleItemClick(item)"
                >
                    <template #prepend>
                        <v-avatar size="44" rounded class="mr-2">
                            <v-img
                                :src="proxyUrl(item.stream_icon || item.cover || '')"
                                cover
                                loading="lazy"
                            >
                                <template v-slot:placeholder>
                                    <v-icon size="28" color="grey">{{ vodType === 'movie' ? 'mdi-movie' : 'mdi-television-classic' }}</v-icon>
                                </template>
                                <template v-slot:error>
                                    <v-icon size="28" color="grey">{{ vodType === 'movie' ? 'mdi-movie' : 'mdi-television-classic' }}</v-icon>
                                </template>
                            </v-img>
                        </v-avatar>
                    </template>
                    <v-list-item-title class="text-body-2 text-truncate">{{ item.name }}</v-list-item-title>
                    <v-list-item-subtitle class="text-caption text-truncate">
                        <span v-if="item.rating">
                            <v-icon size="10" color="warning">mdi-star</v-icon>
                            {{ item.rating }}
                        </span>
                        <span v-if="item.year" class="ml-1">{{ item.year }}</span>
                        <span v-if="item.genre" class="ml-1">{{ item.genre }}</span>
                    </v-list-item-subtitle>
                    <template #append>
                        <v-icon v-if="vodType === 'series'" size="16" color="grey">mdi-chevron-right</v-icon>
                        <v-icon v-else size="16" color="grey">mdi-play</v-icon>
                    </template>
                </v-list-item>
            </template>
        </v-virtual-scroll>

        <!-- No search results in items -->
        <div v-else class="text-center pa-8">
            <v-icon size="48" color="grey">mdi-magnify</v-icon>
            <p class="text-caption text-grey mt-2">No results match "{{ search }}"</p>
        </div>
    </div>

    <!-- Categories list -->
    <div v-else class="vod-categories">
        <!-- Movie / Series toggle -->
        <div class="vod-type-toggle-bar">
            <v-btn-toggle v-model="vodType" mandatory density="compact" rounded="0" color="primary" class="vod-type-toggle">
                <v-btn value="movie" size="small" class="vod-type-toggle-btn">
                    <v-icon start size="16">mdi-movie</v-icon>
                    Movies
                </v-btn>
                <v-btn value="series" size="small" class="vod-type-toggle-btn">
                    <v-icon start size="16">mdi-television-classic</v-icon>
                    Series
                </v-btn>
            </v-btn-toggle>
        </div>

        <!-- "All" button + category list -->
        <v-list density="compact" class="categories-list">
            <v-list-item
                class="category-item"
                @click="playlist.loadVodItems(null)"
            >
                <template #prepend>
                    <v-icon size="20" color="primary" class="mr-2">mdi-view-grid</v-icon>
                </template>
                <v-list-item-title class="text-body-2">All {{ vodType === 'movie' ? 'Movies' : 'Series' }}</v-list-item-title>
            </v-list-item>

            <v-virtual-scroll
                v-if="filteredCategories.length > 0"
                :items="filteredCategories"
                :item-height="40"
                class="categories-scroll"
            >
                <template v-slot:default="{ item }">
                    <v-list-item
                        :key="item.category_id"
                        class="category-item"
                        @click="playlist.loadVodItems(item.category_id)"
                    >
                        <template #prepend>
                            <v-icon size="20" color="grey" class="mr-2">mdi-folder</v-icon>
                        </template>
                        <v-list-item-title class="text-body-2 text-truncate">{{ item.category_name }}</v-list-item-title>
                    </v-list-item>
                </template>
            </v-virtual-scroll>
        </v-list>

        <!-- Empty categories -->
        <div v-if="filteredCategories.length === 0 && !vodLoading" class="text-center pa-8">
            <v-icon size="48" color="grey">mdi-movie-off</v-icon>
            <p class="text-caption text-grey mt-2">No {{ vodType === 'movie' ? 'movie' : 'series' }} categories found</p>
        </div>
    </div>
</template>

<script>
import { computed, ref, watch } from 'vue';
import { usePlaylistStore } from '@/stores/playlist';
import { proxyUrl } from '@/services/mixedContent.js';

export default {
    name: 'VodBrowser',
    props: {
        search: {
            type: String,
            default: ''
        }
    },

    setup(props) {
        const playlist = usePlaylistStore();

        const vodLoading = computed(() => playlist.vodLoading);
        const vodItems = computed(() => playlist.vodItems);
        const vodCategories = computed(() => playlist.currentVodCategories);
        const selectedVodCategory = computed(() => playlist.selectedVodCategory);
        const seriesInfo = computed(() => playlist.seriesInfo);
        const selectedSeries = computed(() => playlist.selectedSeries);
        const selectedSeason = ref(null);

        // Two-way binding for vodType
        const vodType = computed({
            get: () => playlist.vodType,
            set: (val) => playlist.setVodType(val)
        });

        // Current category name
        const currentCategoryName = computed(() => {
            if (!selectedVodCategory.value) return vodType.value === 'movie' ? 'All Movies' : 'All Series';
            const cat = vodCategories.value.find(c => c.category_id === selectedVodCategory.value);
            return cat?.category_name || 'Category';
        });

        // Filter categories by search
        const filteredCategories = computed(() => {
            if (!props.search) return vodCategories.value;
            const searchLower = props.search.toLowerCase();
            return vodCategories.value.filter(c =>
                c.category_name?.toLowerCase().includes(searchLower)
            );
        });

        // Filter VOD items by search
        const filteredVodItems = computed(() => {
            if (!props.search) return vodItems.value;
            const searchLower = props.search.toLowerCase();
            return vodItems.value.filter(item =>
                item.name?.toLowerCase().includes(searchLower)
            );
        });

        // Get episodes for the selected season
        const currentSeasonEpisodes = computed(() => {
            if (!seriesInfo.value?.episodes) return [];
            const seasonKey = selectedSeason.value;
            if (!seasonKey) {
                // Pick the first season
                const seasons = Object.keys(seriesInfo.value.episodes);
                if (seasons.length > 0) return seriesInfo.value.episodes[seasons[0]] || [];
                return [];
            }
            return seriesInfo.value.episodes[seasonKey] || [];
        });

        // Auto-select first season when series info loads
        watch(seriesInfo, (info) => {
            if (info?.episodes) {
                const seasons = Object.keys(info.episodes);
                if (seasons.length > 0) {
                    selectedSeason.value = seasons[0];
                }
            }
        });

        // Handle clicking on a VOD item
        function handleItemClick(item) {
            if (vodType.value === 'series') {
                playlist.loadSeriesDetails(item);
            } else {
                playlist.playVodItem(item);
            }
        }

        // Truncate text helper
        function truncate(text, maxLength) {
            if (!text || text.length <= maxLength) return text;
            return text.substring(0, maxLength) + '...';
        }

        return {
            playlist,
            vodLoading,
            vodItems,
            vodCategories,
            vodType,
            selectedVodCategory,
            seriesInfo,
            selectedSeries,
            selectedSeason,
            currentCategoryName,
            filteredCategories,
            filteredVodItems,
            currentSeasonEpisodes,
            handleItemClick,
            truncate,
            proxyUrl,
            search: computed(() => props.search),
        };
    }
};
</script>

<style scoped>
.vod-categories,
.vod-items,
.vod-series-detail {
    height: 100%;
    display: flex;
    flex-direction: column;
}

.categories-list {
    flex: 1;
    overflow-y: auto;
}

.categories-scroll {
    flex: 1;
}

.vod-items-scroll {
    flex: 1;
}

.episodes-scroll {
    flex: 1;
}

.category-item {
    cursor: pointer;
}

.category-item:hover {
    background: rgba(255, 255, 255, 0.05);
}

.vod-item {
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.vod-item:hover {
    background: rgba(255, 255, 255, 0.05);
}

.episode-item {
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.episode-item:hover {
    background: rgba(255, 255, 255, 0.05);
}

.series-banner {
    background: rgba(0, 0, 0, 0.2);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.series-plot {
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
    line-height: 1.3;
}

.season-tabs {
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.items-header,
.series-header {
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.vod-type-toggle-bar {
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(0, 0, 0, 0.2);
}

.vod-type-toggle {
    width: 100%;
}

.vod-type-toggle-btn {
    flex: 1 !important;
}
</style>
