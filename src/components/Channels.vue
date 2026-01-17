<template>
    <!-- Loading state -->
    <div v-if="isLoading" class="d-flex justify-center align-center pa-8">
        <v-progress-circular indeterminate color="primary" size="32"></v-progress-circular>
    </div>

    <!-- Empty state -->
    <div v-else-if="totalChannels === 0 && !search" class="text-center pa-8">
        <v-icon size="48" color="grey">mdi-playlist-plus</v-icon>
        <p class="text-caption text-grey mt-2">No channels loaded</p>
    </div>

    <!-- No search results -->
    <div v-else-if="flatList.length === 0 && search" class="text-center pa-8">
        <v-icon size="48" color="grey">mdi-magnify</v-icon>
        <p class="text-caption text-grey mt-2">No channels match "{{ search }}"</p>
    </div>

    <!-- Channel list with virtual scrolling -->
    <v-virtual-scroll
        v-else
        :items="flatList"
        :item-height="48"
        class="channels-virtual-scroll"
    >
        <template v-slot:default="{ item }">
            <!-- Category header -->
            <v-list-item 
                v-if="item.isCategory"
                :key="'cat-' + item.name"
                class="category-header"
                @click="toggleCategory(item.name)"
            >
                <template #prepend>
                    <v-icon size="20" :color="item.expanded ? 'primary' : 'grey'">
                        {{ item.expanded ? 'mdi-chevron-down' : 'mdi-chevron-right' }}
                    </v-icon>
                    <v-icon v-if="item.isFavorite" size="16" color="warning" class="ml-1">mdi-star</v-icon>
                    <v-icon size="20" color="primary" class="ml-1">mdi-folder</v-icon>
                </template>
                <v-list-item-title class="font-weight-medium text-truncate">
                    {{ item.name }}
                </v-list-item-title>
                <template #append>
                    <v-chip size="x-small" variant="tonal" color="grey">
                        {{ item.count }}
                    </v-chip>
                </template>
            </v-list-item>

            <!-- Channel item -->
            <v-list-item 
                v-else
                :key="item.url"
                link 
                :title="item.name" 
                @click="playlist.setCurrentChannel(item)" 
                :active="currentChannel?.name === item.name"
                class="channel-item"
            >
                <template #prepend>
                    <v-icon v-if="item.isFavorite" size="14" color="warning" class="ml-4 mr-1">mdi-star</v-icon>
                    <v-avatar size="30" class="rounded-0" :class="item.isFavorite ? 'ml-1' : 'ml-6'">
                        <v-img 
                            :src="item.tvg?.logo" 
                            alt="Channel Logo"
                            loading="lazy"
                        >
                            <template v-slot:placeholder>
                                <v-icon size="24" color="grey">mdi-television</v-icon>
                            </template>
                            <template v-slot:error>
                                <v-icon size="24" color="grey">mdi-television</v-icon>
                            </template>
                        </v-img>
                    </v-avatar>
                </template>
            </v-list-item>
        </template>
    </v-virtual-scroll>
</template>

<script>
import { usePlaylistStore } from '@/stores/playlist';
import { computed, toRefs, ref, watch, shallowRef } from 'vue';

export default {
    name: 'Channels',
    props: {
        search: {
            type: String,
            default: ''
        }
    },

    setup(props) {
        const playlist = usePlaylistStore();
        const channels = computed(() => playlist.getChannels);
        const currentChannel = computed(() => playlist.getCurrentChannel);
        const isLoading = computed(() => playlist.isLoadingPlaylist);
        const activePlaylist = computed(() => playlist.activePlaylist);
        const { search } = toRefs(props);
        
        // Track expanded categories using a plain object for better reactivity
        const expandedCategories = ref({});
        
        // Trigger for forcing flatList recalculation
        const expandTrigger = ref(0);
        
        // Debounced search for better performance
        const debouncedSearch = ref('');
        let searchTimeout = null;
        
        watch(search, (newVal) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                debouncedSearch.value = newVal;
            }, 150);
        }, { immediate: true });

        // Get favorites and hidden from active playlist
        const favoriteCategories = computed(() => activePlaylist.value?.favoriteCategories || []);
        const favoriteChannels = computed(() => activePlaylist.value?.favoriteChannels || []);
        const hiddenCategories = computed(() => activePlaylist.value?.hiddenCategories || []);
        const hiddenChannels = computed(() => activePlaylist.value?.hiddenChannels || []);

        // Filter channels: remove hidden, then apply search
        const filteredChannels = computed(() => {
            let result = channels.value;
            
            // Filter out hidden channels and channels in hidden categories
            result = result.filter(channel => {
                const categoryName = channel.group?.title || 'Uncategorized';
                if (hiddenCategories.value.includes(categoryName)) return false;
                if (hiddenChannels.value.includes(channel.url)) return false;
                return true;
            });
            
            // Apply search filter
            if (debouncedSearch.value) {
                const searchLower = debouncedSearch.value.toLowerCase();
                result = result.filter(channel =>
                    channel.name.toLowerCase().includes(searchLower)
                );
            }
            
            return result;
        });

        // Group channels by category with favorites first
        const groupedChannels = computed(() => {
            const favoriteGroup = new Map();
            const regularGroups = new Map();
            
            // First pass: collect all channels by category
            for (const channel of filteredChannels.value) {
                const groupName = channel.group?.title || 'Uncategorized';
                const isFavCat = favoriteCategories.value.includes(groupName);
                const isFavChannel = favoriteChannels.value.includes(channel.url);
                
                // Mark channel as favorite
                const channelWithFav = { ...channel, isFavorite: isFavChannel || isFavCat };
                
                const targetMap = isFavCat ? favoriteGroup : regularGroups;
                
                if (!targetMap.has(groupName)) {
                    targetMap.set(groupName, []);
                }
                targetMap.get(groupName).push(channelWithFav);
            }
            
            // Sort channels within each group: favorites first
            for (const [, channels] of favoriteGroup) {
                channels.sort((a, b) => (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0));
            }
            for (const [, channels] of regularGroups) {
                channels.sort((a, b) => (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0));
            }
            
            // Combine: favorite categories first, then regular
            const combined = new Map();
            for (const [name, channels] of favoriteGroup) {
                combined.set(name, { channels, isFavorite: true });
            }
            for (const [name, channels] of regularGroups) {
                combined.set(name, { channels, isFavorite: false });
            }
            
            return combined;
        });

        // Create flat list with category headers + channels (only expanded ones)
        const flatList = computed(() => {
            // Depend on trigger for manual updates
            const _ = expandTrigger.value;
            const expanded = expandedCategories.value;
            const isSearching = !!debouncedSearch.value;
            
            const items = [];
            
            for (const [categoryName, { channels: categoryChannels, isFavorite }] of groupedChannels.value) {
                // Add category header
                items.push({
                    isCategory: true,
                    name: categoryName,
                    count: categoryChannels.length,
                    expanded: !!expanded[categoryName],
                    isFavorite
                });
                
                // Add channels only if category is expanded OR if searching
                if (expanded[categoryName] || isSearching) {
                    for (const channel of categoryChannels) {
                        items.push(channel);
                    }
                }
            }
            
            return items;
        });

        // Toggle category expansion
        function toggleCategory(categoryName) {
            expandedCategories.value[categoryName] = !expandedCategories.value[categoryName];
            expandTrigger.value++;
        }

        // Check if category is expanded
        function isExpanded(categoryName) {
            return !!expandedCategories.value[categoryName];
        }

        // Expand all categories (useful for search)
        function expandAll() {
            const newExpanded = {};
            for (const name of groupedChannels.value.keys()) {
                newExpanded[name] = true;
            }
            expandedCategories.value = newExpanded;
            expandTrigger.value++;
        }

        // Collapse all categories
        function collapseAll() {
            expandedCategories.value = {};
            expandTrigger.value++;
        }

        // Total channel count
        const totalChannels = computed(() => channels.value.length);

        return {
            channels,
            playlist,
            currentChannel,
            flatList,
            totalChannels,
            isLoading,
            search,
            expandedCategories,
            toggleCategory,
            isExpanded,
            expandAll,
            collapseAll
        };
    }
};
</script>

<style scoped>
.channels-virtual-scroll {
    height: 100%;
}

.category-header {
    background: rgba(0, 0, 0, 0.35);
    cursor: pointer;
}

.category-header:hover {
    background: rgba(0, 0, 0, 0.45);
}

.channel-item {
    padding-left: 8px;
}
</style>