import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { parse } from 'iptv-playlist-parser';
import { useAppStore } from './app.js';
import { useEpgStore } from './epg.js';
import { getTranscoderUrl } from '@/services/urls.js';
import { getVodCategories, getVodStreams, getVodInfo, getVodStreamUrl, getSeriesCategories, getSeries, getSeriesInfo, getSeriesStreamUrl } from '@/services/xtream.js';

// API base URL for playlist storage (dynamic based on browser location)
const TRANSCODER_URL = getTranscoderUrl();

export const usePlaylistStore = defineStore('playlist', () => {

    const appStore = useAppStore();
    const isPlaylistLoaded = ref(true);
    const isLoadingPlaylist = ref(false);
    const playlist = ref('');
    const channels = ref([]);
    const currentChannel = ref({});
    const epgUrl = ref('');

    // Multiple playlists support
    const savedPlaylists = ref([]);
    const activePlaylistId = ref(null);

    // VOD state
    const vodMode = ref(false);          // true = showing VOD, false = showing channels
    const vodCategories = ref([]);       // VOD category list
    const vodItems = ref([]);            // Current VOD items (movies/series in selected category)
    const vodLoading = ref(false);       // Loading state for VOD
    const selectedVodCategory = ref(null); // Currently selected VOD category
    const vodType = ref('movie');        // 'movie' or 'series'
    const seriesInfo = ref(null);        // Selected series details (seasons/episodes)
    const selectedSeries = ref(null);    // Currently selected series item

    // Load saved playlists from server on init
    async function initPlaylists() {
        try {
            // Fetch playlist metadata from server
            const response = await fetch(`${TRANSCODER_URL}/playlists`);
            if (response.ok) {
                const data = await response.json();
                
                // Load full metadata for each playlist
                const playlistsWithMeta = [];
                for (const pl of data.playlists) {
                    const fullResponse = await fetch(`${TRANSCODER_URL}/playlists/${pl.id}`);
                    if (fullResponse.ok) {
                        const fullData = await fullResponse.json();
                        playlistsWithMeta.push({
                            id: fullData.id,
                            name: fullData.name,
                            url: fullData.url,
                            channelCount: fullData.channels ? fullData.channels.length : 0,
                            epgUrl: fullData.epgUrl,
                            addedAt: fullData.createdAt,
                            xtream: fullData.xtream,
                            favoriteCategories: fullData.favoriteCategories || [],
                            favoriteChannels: fullData.favoriteChannels || [],
                            hiddenCategories: fullData.hiddenCategories || [],
                            hiddenChannels: fullData.hiddenChannels || [],
                            channels: fullData.channels || [] // Store channels for "use all playlists" feature
                        });
                    }
                }
                savedPlaylists.value = playlistsWithMeta;
            }
            
            // Get active playlist from server
            const activeResponse = await fetch(`${TRANSCODER_URL}/playlists/active/current`);
            if (activeResponse.ok) {
                const activeData = await activeResponse.json();
                if (activeData.activePlaylistId) {
                    activePlaylistId.value = activeData.activePlaylistId;
                    // Load the active playlist
                    await loadActivePlaylist(activeData.activePlaylistId);
                } else if (savedPlaylists.value.length > 0) {
                    // No active playlist set, but we have playlists - set first one as active
                    const firstPlaylistId = savedPlaylists.value[0].id;
                    activePlaylistId.value = firstPlaylistId;
                    
                    // Save this as active on server
                    await fetch(`${TRANSCODER_URL}/playlists/active/current`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ playlistId: firstPlaylistId })
                    });
                    
                    // Load the playlist
                    await loadActivePlaylist(firstPlaylistId);
                }
            }
        } catch (err) {
            console.error('Error loading saved playlists:', err);
        }
    }

    // Load active playlist content from server
    async function loadActivePlaylist(playlistId) {
        console.log('[Playlist] Loading active playlist:', playlistId);
        isLoadingPlaylist.value = true;
        try {
            const response = await fetch(`${TRANSCODER_URL}/playlists/${playlistId}`);
            console.log('[Playlist] Fetch response ok:', response.ok);
            if (response.ok) {
                const data = await response.json();
                console.log('[Playlist] Got data, rawContent length:', data.rawContent?.length);
                if (data.rawContent) {
                    loadPlaylist(data.rawContent, false);
                    console.log('[Playlist] Loaded, channels count:', channels.value.length);
                } else if (data.channels && data.channels.length > 0) {
                    // Fallback: use channels array directly if rawContent is missing
                    console.log('[Playlist] Using channels array directly:', data.channels.length);
                    channels.value = data.channels;
                    isPlaylistLoaded.value = true;
                }
                
                // Check if playlist has a stored EPG URL (manually set by user)
                // This handles cases where the EPG isn't embedded in the M3U
                const pl = savedPlaylists.value.find(p => p.id === playlistId);
                if (pl?.epgUrl && !epgUrl.value) {
                    console.log('[Playlist] Loading stored EPG URL:', pl.epgUrl);
                    setEpgUrl(pl.epgUrl);
                }
            }
        } catch (err) {
            console.error('Error loading playlist content:', err);
        } finally {
            isLoadingPlaylist.value = false;
        }
    }

    // Persist playlist to server
    async function persistPlaylist(playlistId) {
        try {
            const pl = savedPlaylists.value.find(p => p.id === playlistId);
            if (!pl) return;
            
            // Get current playlist data from server (for rawContent)
            const response = await fetch(`${TRANSCODER_URL}/playlists/${playlistId}`);
            if (!response.ok) return;
            
            const current = await response.json();
            
            // Update with local metadata
            await fetch(`${TRANSCODER_URL}/playlists/${playlistId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: pl.name,
                    url: pl.url,
                    epgUrl: pl.epgUrl,
                    xtream: pl.xtream,
                    favoriteCategories: pl.favoriteCategories,
                    favoriteChannels: pl.favoriteChannels,
                    hiddenCategories: pl.hiddenCategories,
                    hiddenChannels: pl.hiddenChannels,
                    channels: current.channels,
                    rawContent: current.rawContent
                })
            });
        } catch (err) {
            console.error('Error persisting playlist:', err);
        }
    }

    // Add a new playlist to saved list
    async function savePlaylist(name, content, url = null, xtreamConfig = null) {
        const parsed = parse(content);
        const channelCount = parsed.items.length;
        
        // Extract EPG URL if present (from content or xtream config)
        let playlistEpgUrl = xtreamConfig?.epgUrl || null;
        if (!playlistEpgUrl) {
            const match = content.match(/url-tvg="([^"]+)"/i);
            if (match && match[1]) {
                playlistEpgUrl = match[1];
            }
        }

        // Save to server
        const response = await fetch(`${TRANSCODER_URL}/playlists`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name,
                channels: parsed.items,
                rawContent: content,
                url,
                epgUrl: playlistEpgUrl,
                xtream: xtreamConfig ? {
                    type: xtreamConfig.type,
                    server: xtreamConfig.server,
                    username: xtreamConfig.username,
                    password: xtreamConfig.password,
                } : null,
                favoriteCategories: [],
                favoriteChannels: [],
                hiddenCategories: [],
                hiddenChannels: []
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to save playlist to server');
        }
        
        const savedData = await response.json();
        const id = savedData.id;

        const newPlaylist = {
            id,
            name,
            url,
            channelCount,
            epgUrl: playlistEpgUrl,
            addedAt: savedData.createdAt,
            xtream: xtreamConfig ? {
                type: xtreamConfig.type,
                server: xtreamConfig.server,
                username: xtreamConfig.username,
                password: xtreamConfig.password,
            } : null,
            favoriteCategories: [],
            favoriteChannels: [],
            hiddenCategories: [],
            hiddenChannels: []
        };

        savedPlaylists.value.push(newPlaylist);

        // Load the playlist content (already parsed above, just set channels)
        channels.value = parsed.items;
        activePlaylistId.value = id;
        isPlaylistLoaded.value = true;
        
        // Set active playlist on server
        await fetch(`${TRANSCODER_URL}/playlists/active/current`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playlistId: id })
        });
        
        // Handle EPG
        extractEpgUrl(content);

        return id;
    }

    // Switch to a different playlist
    async function switchPlaylist(playlistId) {
        const pl = savedPlaylists.value.find(p => p.id === playlistId);
        if (pl) {
            activePlaylistId.value = playlistId;
            
            // Save active playlist to server
            await fetch(`${TRANSCODER_URL}/playlists/active/current`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ playlistId })
            });
            
            // Load content from server
            await loadActivePlaylist(playlistId);
        }
    }

    // Delete a playlist
    async function deletePlaylist(playlistId) {
        const index = savedPlaylists.value.findIndex(p => p.id === playlistId);
        if (index > -1) {
            // Delete from server
            await fetch(`${TRANSCODER_URL}/playlists/${playlistId}`, {
                method: 'DELETE'
            });
            
            savedPlaylists.value.splice(index, 1);

            // If we deleted the active playlist, switch to another or clear
            if (activePlaylistId.value === playlistId) {
                if (savedPlaylists.value.length > 0) {
                    await switchPlaylist(savedPlaylists.value[0].id);
                } else {
                    activePlaylistId.value = null;
                    channels.value = [];
                    currentChannel.value = {};
                    // Clear active playlist on server
                    await fetch(`${TRANSCODER_URL}/playlists/active/current`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ playlistId: null })
                    });
                }
            }
        }
    }

    // Update playlist content (for Xtream refresh)
    async function updatePlaylistContent(playlistId, content, newEpgUrl = null) {
        const pl = savedPlaylists.value.find(p => p.id === playlistId);
        if (pl) {
            const parsed = parse(content);
            pl.channelCount = parsed.items.length;
            if (newEpgUrl) {
                pl.epgUrl = newEpgUrl;
            }
            
            // Update on server
            await fetch(`${TRANSCODER_URL}/playlists/${playlistId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    channels: parsed.items,
                    rawContent: content,
                    epgUrl: newEpgUrl || pl.epgUrl
                })
            });

            // If this is the active playlist, reload it
            if (activePlaylistId.value === playlistId) {
                loadPlaylist(content, false);
                if (newEpgUrl) {
                    setEpgUrl(newEpgUrl);
                }
            }
        }
    }

    // Update playlist name
    async function renamePlaylist(playlistId, newName) {
        const pl = savedPlaylists.value.find(p => p.id === playlistId);
        if (pl) {
            pl.name = newName;
            await persistPlaylist(playlistId);
        }
    }

    function loadPlaylist(file, save = false) {
        playlist.value = file;
        isPlaylistLoaded.value = true;
        parseM3U();
        
        // Try to extract EPG URL from playlist header
        extractEpgUrl(file);
    }

    function extractEpgUrl(m3uContent) {
        // Look for url-tvg in the #EXTM3U header line
        const match = m3uContent.match(/url-tvg="([^"]+)"/i);
        if (match && match[1]) {
            epgUrl.value = match[1];
            console.log('Found EPG URL in playlist:', match[1]);
            
            // Auto-load EPG
            const epgStore = useEpgStore();
            epgStore.loadEpg(match[1]);
        }
    }

    function setEpgUrl(url) {
        epgUrl.value = url;
        if (url) {
            const epgStore = useEpgStore();
            epgStore.loadEpg(url);
        }
    }

    function setCurrentChannel(channel) {
        currentChannel.value = channel;
    }

    function parseM3U() {
        channels.value = parse(playlist.value).items;
    }

    const getChannels = computed(() => {
        // If useAllPlaylists is enabled, merge channels from all playlists
        if (appStore.useAllPlaylists && savedPlaylists.value.length > 0) {
            const allChannels = [];
            for (const pl of savedPlaylists.value) {
                // Fetch channels for each playlist
                // Note: This assumes channels are stored in the playlist metadata
                // We'll need to enhance this to load channels on demand
                if (pl.channels) {
                    allChannels.push(...pl.channels);
                }
            }
            return allChannels;
        }
        return channels.value;
    });
    const getCurrentChannel = computed(() => currentChannel.value);

    // Get the active playlist object
    const activePlaylist = computed(() => {
        return savedPlaylists.value.find(p => p.id === activePlaylistId.value) || null;
    });

    // Update playlist EPG URL
    async function updatePlaylistEpgUrl(playlistId, newEpgUrl) {
        const pl = savedPlaylists.value.find(p => p.id === playlistId);
        if (pl) {
            pl.epgUrl = newEpgUrl;
            await persistPlaylist(playlistId);
            // If this is the active playlist, load the EPG
            if (playlistId === activePlaylistId.value && newEpgUrl) {
                setEpgUrl(newEpgUrl);
            }
        }
    }

    // Toggle favorite category
    async function toggleFavoriteCategory(playlistId, categoryName) {
        const pl = savedPlaylists.value.find(p => p.id === playlistId);
        if (pl) {
            if (!pl.favoriteCategories) pl.favoriteCategories = [];
            const index = pl.favoriteCategories.indexOf(categoryName);
            if (index > -1) {
                pl.favoriteCategories.splice(index, 1);
            } else {
                pl.favoriteCategories.push(categoryName);
            }
            await persistPlaylist(playlistId);
        }
    }

    // Toggle favorite channel
    async function toggleFavoriteChannel(playlistId, channelUrl) {
        const pl = savedPlaylists.value.find(p => p.id === playlistId);
        if (pl) {
            if (!pl.favoriteChannels) pl.favoriteChannels = [];
            const index = pl.favoriteChannels.indexOf(channelUrl);
            if (index > -1) {
                pl.favoriteChannels.splice(index, 1);
            } else {
                pl.favoriteChannels.push(channelUrl);
            }
            await persistPlaylist(playlistId);
        }
    }

    // Toggle hidden category
    async function toggleHiddenCategory(playlistId, categoryName) {
        const pl = savedPlaylists.value.find(p => p.id === playlistId);
        if (pl) {
            if (!pl.hiddenCategories) pl.hiddenCategories = [];
            const index = pl.hiddenCategories.indexOf(categoryName);
            if (index > -1) {
                pl.hiddenCategories.splice(index, 1);
            } else {
                pl.hiddenCategories.push(categoryName);
            }
            await persistPlaylist(playlistId);
        }
    }

    // Toggle hidden channel
    async function toggleHiddenChannel(playlistId, channelUrl) {
        const pl = savedPlaylists.value.find(p => p.id === playlistId);
        if (pl) {
            if (!pl.hiddenChannels) pl.hiddenChannels = [];
            const index = pl.hiddenChannels.indexOf(channelUrl);
            if (index > -1) {
                pl.hiddenChannels.splice(index, 1);
            } else {
                pl.hiddenChannels.push(channelUrl);
            }
            await persistPlaylist(playlistId);
        }
    }

    // Initialize playlists from storage
    initPlaylists();

    // ==================== VOD Functions ====================
    
    // Check if the active playlist is an Xtream playlist
    const isXtreamPlaylist = computed(() => {
        const pl = activePlaylist.value;
        return !!(pl?.xtream?.server && pl?.xtream?.username && pl?.xtream?.password);
    });

    // Get Xtream credentials from active playlist
    function getXtreamCredentials() {
        const pl = activePlaylist.value;
        if (!pl?.xtream) return null;
        return {
            server: pl.xtream.server,
            username: pl.xtream.username,
            password: pl.xtream.password
        };
    }

    // Load VOD categories
    async function loadVodCategories() {
        const creds = getXtreamCredentials();
        if (!creds) return;
        
        vodLoading.value = true;
        try {
            const [movieCats, seriesCats] = await Promise.all([
                getVodCategories(creds.server, creds.username, creds.password).catch(() => []),
                getSeriesCategories(creds.server, creds.username, creds.password).catch(() => [])
            ]);
            
            // Store both types — we'll filter by vodType
            vodCategories.value = {
                movie: Array.isArray(movieCats) ? movieCats : [],
                series: Array.isArray(seriesCats) ? seriesCats : []
            };
            console.log(`[VOD] Loaded ${vodCategories.value.movie.length} movie categories, ${vodCategories.value.series.length} series categories`);
        } catch (err) {
            console.error('[VOD] Error loading categories:', err);
            vodCategories.value = { movie: [], series: [] };
        } finally {
            vodLoading.value = false;
        }
    }

    // Get current VOD categories based on vodType
    const currentVodCategories = computed(() => {
        if (!vodCategories.value || !vodCategories.value[vodType.value]) return [];
        return vodCategories.value[vodType.value];
    });

    // Load VOD items for a category
    async function loadVodItems(categoryId = null) {
        const creds = getXtreamCredentials();
        if (!creds) return;
        
        selectedVodCategory.value = categoryId;
        seriesInfo.value = null;
        selectedSeries.value = null;
        vodLoading.value = true;
        
        try {
            let items;
            if (vodType.value === 'movie') {
                items = await getVodStreams(creds.server, creds.username, creds.password, categoryId);
            } else {
                items = await getSeries(creds.server, creds.username, creds.password, categoryId);
            }
            vodItems.value = Array.isArray(items) ? items : [];
            console.log(`[VOD] Loaded ${vodItems.value.length} ${vodType.value} items`);
        } catch (err) {
            console.error('[VOD] Error loading items:', err);
            vodItems.value = [];
        } finally {
            vodLoading.value = false;
        }
    }

    // Load series details (seasons/episodes)
    async function loadSeriesDetails(series) {
        const creds = getXtreamCredentials();
        if (!creds) return;
        
        selectedSeries.value = series;
        vodLoading.value = true;
        
        try {
            const info = await getSeriesInfo(creds.server, creds.username, creds.password, series.series_id);
            seriesInfo.value = info;
            console.log('[VOD] Loaded series info:', info?.info?.name, 'seasons:', Object.keys(info?.episodes || {}).length);
        } catch (err) {
            console.error('[VOD] Error loading series info:', err);
            seriesInfo.value = null;
        } finally {
            vodLoading.value = false;
        }
    }

    // Play a VOD item
    function playVodItem(item) {
        const creds = getXtreamCredentials();
        if (!creds) return;
        
        const extension = item.container_extension || 'mp4';
        const streamUrl = getVodStreamUrl(creds.server, creds.username, creds.password, item.stream_id, extension);
        
        currentChannel.value = {
            name: item.name || item.title || 'VOD',
            url: streamUrl,
            tvg: {
                logo: item.stream_icon || item.cover || ''
            },
            isVod: true
        };
    }

    // Play a series episode
    function playSeriesEpisode(episode) {
        const creds = getXtreamCredentials();
        if (!creds) return;
        
        const extension = episode.container_extension || 'mp4';
        const streamUrl = getSeriesStreamUrl(creds.server, creds.username, creds.password, episode.id, extension);
        
        const seriesName = selectedSeries.value?.name || seriesInfo.value?.info?.name || 'Series';
        const episodeNum = episode.episode_num || '';
        const seasonNum = episode.season || '';
        const episodeTitle = episode.title || '';
        
        // Format: "Series Name - S01E03" or "Series Name - S01E03 - Episode Title" 
        let displayName = `${seriesName} - S${String(seasonNum).padStart(2, '0')}E${String(episodeNum).padStart(2, '0')}`;
        if (episodeTitle && episodeTitle !== episodeNum) {
            displayName += ` - ${episodeTitle}`;
        }
        
        currentChannel.value = {
            name: displayName,
            url: streamUrl,
            tvg: {
                logo: episode.info?.movie_image || selectedSeries.value?.cover || ''
            },
            isVod: true
        };
    }

    // Toggle VOD mode on/off
    function setVodMode(enabled) {
        vodMode.value = enabled;
        if (enabled && vodCategories.value.length === 0 && (!vodCategories.value.movie || vodCategories.value.movie.length === 0)) {
            loadVodCategories();
        }
    }

    // Switch between movies and series
    function setVodType(type) {
        vodType.value = type;
        vodItems.value = [];
        selectedVodCategory.value = null;
        seriesInfo.value = null;
        selectedSeries.value = null;
    }

    // Go back in VOD navigation
    function vodGoBack() {
        if (seriesInfo.value) {
            // Go back from series detail to series list
            seriesInfo.value = null;
            selectedSeries.value = null;
        } else if (vodItems.value.length > 0) {
            // Go back from items to categories
            vodItems.value = [];
            selectedVodCategory.value = null;
        }
    }

    // ==================== END VOD Functions ====================

    return {
        isPlaylistLoaded,
        isLoadingPlaylist,
        playlist,
        currentChannel,
        epgUrl,
        loadPlaylist,
        setCurrentChannel,
        setEpgUrl,
        getChannels,
        channels,
        getCurrentChannel,
        // Multiple playlists
        savedPlaylists,
        activePlaylistId,
        activePlaylist,
        savePlaylist,
        switchPlaylist,
        deletePlaylist,
        renamePlaylist,
        updatePlaylistContent,
        updatePlaylistEpgUrl,
        // Favorites and hidden
        toggleFavoriteCategory,
        toggleFavoriteChannel,
        toggleHiddenCategory,
        toggleHiddenChannel,
        // VOD
        vodMode,
        vodCategories,
        vodItems,
        vodLoading,
        vodType,
        selectedVodCategory,
        seriesInfo,
        selectedSeries,
        isXtreamPlaylist,
        currentVodCategories,
        loadVodCategories,
        loadVodItems,
        loadSeriesDetails,
        playVodItem,
        playSeriesEpisode,
        setVodMode,
        setVodType,
        vodGoBack,
    };

});