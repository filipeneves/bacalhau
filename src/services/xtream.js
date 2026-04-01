/**
 * Xtream Codes API Service
 * 
 * Xtream Codes is a popular IPTV panel that provides APIs for:
 * - Authentication
 * - Live TV channels
 * - VOD (Video on Demand)
 * - Series
 * - EPG (Electronic Program Guide)
 */

import { apiFetch } from '@/services/api';

/**
 * Helper: fetch a URL through the backend proxy (handles malformed HTTP responses)
 * @param {string} url - The URL to fetch
 * @returns {Promise<string>} Response body as text
 */
async function proxyFetch(url) {
    const response = await apiFetch('/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `Fetch failed: ${response.status}`);
    }
    const { content } = await response.json();
    return content;
}

/**
 * Helper: fetch a URL through the backend proxy and parse as JSON
 * @param {string} url - The URL to fetch
 * @returns {Promise<object>} Parsed JSON
 */
async function proxyFetchJSON(url) {
    const text = await proxyFetch(url);
    return JSON.parse(text);
}

/**
 * Authenticate with Xtream server and get account info
 * @param {string} server - Server URL (e.g., http://example.com:8080)
 * @param {string} username - Xtream username
 * @param {string} password - Xtream password
 * @returns {Promise<object>} Account info and server info
 */
export async function authenticate(server, username, password) {
    const baseUrl = normalizeServerUrl(server);
    const url = `${baseUrl}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
    
    const data = await proxyFetchJSON(url);
    
    if (data.user_info?.auth === 0) {
        throw new Error('Invalid username or password');
    }
    
    return {
        userInfo: data.user_info,
        serverInfo: data.server_info,
        baseUrl
    };
}

/**
 * Get live TV categories
 * @param {string} server - Server URL
 * @param {string} username - Xtream username
 * @param {string} password - Xtream password
 * @returns {Promise<array>} List of categories
 */
export async function getLiveCategories(server, username, password) {
    const baseUrl = normalizeServerUrl(server);
    const url = `${baseUrl}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=get_live_categories`;
    
    return proxyFetchJSON(url);
}

/**
 * Get live TV streams (channels)
 * @param {string} server - Server URL
 * @param {string} username - Xtream username
 * @param {string} password - Xtream password
 * @param {string} categoryId - Optional category ID to filter
 * @returns {Promise<array>} List of channels
 */
export async function getLiveStreams(server, username, password, categoryId = null) {
    const baseUrl = normalizeServerUrl(server);
    let url = `${baseUrl}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=get_live_streams`;
    
    if (categoryId) {
        url += `&category_id=${encodeURIComponent(categoryId)}`;
    }
    
    return proxyFetchJSON(url);
}

/**
 * Get EPG URL for the Xtream server
 * @param {string} server - Server URL
 * @param {string} username - Xtream username
 * @param {string} password - Xtream password
 * @returns {string} EPG XMLTV URL
 */
export function getEpgUrl(server, username, password) {
    const baseUrl = normalizeServerUrl(server);
    return `${baseUrl}/xmltv.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
}

/**
 * Get stream URL for a channel
 * @param {string} server - Server URL
 * @param {string} username - Xtream username
 * @param {string} password - Xtream password
 * @param {number} streamId - Stream ID
 * @param {string} extension - Stream extension (ts, m3u8)
 * @returns {string} Stream URL
 */
export function getStreamUrl(server, username, password, streamId, extension = 'ts') {
    const baseUrl = normalizeServerUrl(server);
    return `${baseUrl}/live/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${streamId}.${extension}`;
}

/**
 * Convert Xtream streams to M3U format
 * @param {string} server - Server URL
 * @param {string} username - Xtream username
 * @param {string} password - Xtream password
 * @param {array} streams - Array of Xtream stream objects
 * @param {array} categories - Array of category objects
 * @param {string} epgUrl - EPG URL
 * @returns {string} M3U playlist content
 */
export function streamsToM3U(server, username, password, streams, categories, epgUrl) {
    const baseUrl = normalizeServerUrl(server);
    
    // Create category lookup
    const categoryMap = {};
    if (categories && Array.isArray(categories)) {
        categories.forEach(cat => {
            categoryMap[cat.category_id] = cat.category_name;
        });
    }
    
    // Build M3U content
    let m3u = `#EXTM3U url-tvg="${epgUrl}"\n`;
    
    for (const stream of streams) {
        const name = stream.name || 'Unknown Channel';
        const logo = stream.stream_icon || '';
        const group = categoryMap[stream.category_id] || 'Uncategorized';
        const tvgId = stream.epg_channel_id || stream.stream_id || '';
        const tvgName = stream.name || '';
        const streamUrl = getStreamUrl(server, username, password, stream.stream_id, 'ts');
        
        m3u += `#EXTINF:-1 tvg-id="${tvgId}" tvg-name="${tvgName}" tvg-logo="${logo}" group-title="${group}",${name}\n`;
        m3u += `${streamUrl}\n`;
    }
    
    return m3u;
}

/**
 * Fetch all data and convert to M3U
 * @param {string} server - Server URL
 * @param {string} username - Xtream username
 * @param {string} password - Xtream password
 * @returns {Promise<object>} Object with m3u content and epgUrl
 */
export async function fetchAndConvertToM3U(server, username, password) {
    // Authenticate first
    const authData = await authenticate(server, username, password);
    console.log('[Xtream] Authenticated successfully:', authData.userInfo?.username);
    
    // Fetch categories and streams in parallel
    const [categories, streams] = await Promise.all([
        getLiveCategories(server, username, password),
        getLiveStreams(server, username, password)
    ]);
    
    console.log(`[Xtream] Fetched ${categories?.length || 0} categories and ${streams?.length || 0} streams`);
    
    // Get EPG URL
    const epgUrl = getEpgUrl(server, username, password);
    
    // Convert to M3U
    const m3uContent = streamsToM3U(server, username, password, streams, categories, epgUrl);
    
    return {
        m3uContent,
        epgUrl,
        channelCount: streams?.length || 0,
        categoryCount: categories?.length || 0,
        userInfo: authData.userInfo,
        serverInfo: authData.serverInfo
    };
}

/**
 * Normalize server URL (remove trailing slash, ensure protocol)
 * @param {string} server - Raw server URL
 * @returns {string} Normalized URL
 */
function normalizeServerUrl(server) {
    let url = server.trim();
    
    // Add http:// if no protocol
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'http://' + url;
    }
    
    // Remove trailing slash
    if (url.endsWith('/')) {
        url = url.slice(0, -1);
    }
    
    return url;
}

// ==================== VOD API ====================

/**
 * Get VOD categories
 * @param {string} server - Server URL
 * @param {string} username - Xtream username
 * @param {string} password - Xtream password
 * @returns {Promise<array>} List of VOD categories
 */
export async function getVodCategories(server, username, password) {
    const baseUrl = normalizeServerUrl(server);
    const url = `${baseUrl}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=get_vod_categories`;
    return proxyFetchJSON(url);
}

/**
 * Get VOD streams (movies)
 * @param {string} server - Server URL
 * @param {string} username - Xtream username
 * @param {string} password - Xtream password
 * @param {string} categoryId - Optional category ID to filter
 * @returns {Promise<array>} List of VOD items
 */
export async function getVodStreams(server, username, password, categoryId = null) {
    const baseUrl = normalizeServerUrl(server);
    let url = `${baseUrl}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=get_vod_streams`;
    if (categoryId) {
        url += `&category_id=${encodeURIComponent(categoryId)}`;
    }
    return proxyFetchJSON(url);
}

/**
 * Get VOD info (movie details)
 * @param {string} server - Server URL
 * @param {string} username - Xtream username
 * @param {string} password - Xtream password
 * @param {number} vodId - VOD stream ID
 * @returns {Promise<object>} VOD details (plot, cast, duration, etc.)
 */
export async function getVodInfo(server, username, password, vodId) {
    const baseUrl = normalizeServerUrl(server);
    const url = `${baseUrl}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=get_vod_info&vod_id=${encodeURIComponent(vodId)}`;
    return proxyFetchJSON(url);
}

/**
 * Get VOD stream URL
 * @param {string} server - Server URL
 * @param {string} username - Xtream username
 * @param {string} password - Xtream password
 * @param {number} streamId - Stream ID
 * @param {string} extension - Container extension (mp4, mkv, avi)
 * @returns {string} VOD stream URL
 */
export function getVodStreamUrl(server, username, password, streamId, extension = 'mp4') {
    const baseUrl = normalizeServerUrl(server);
    return `${baseUrl}/movie/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${streamId}.${extension}`;
}

/**
 * Get series categories
 * @param {string} server - Server URL
 * @param {string} username - Xtream username
 * @param {string} password - Xtream password
 * @returns {Promise<array>} List of series categories
 */
export async function getSeriesCategories(server, username, password) {
    const baseUrl = normalizeServerUrl(server);
    const url = `${baseUrl}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=get_series_categories`;
    return proxyFetchJSON(url);
}

/**
 * Get series list
 * @param {string} server - Server URL
 * @param {string} username - Xtream username
 * @param {string} password - Xtream password
 * @param {string} categoryId - Optional category ID to filter
 * @returns {Promise<array>} List of series
 */
export async function getSeries(server, username, password, categoryId = null) {
    const baseUrl = normalizeServerUrl(server);
    let url = `${baseUrl}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=get_series`;
    if (categoryId) {
        url += `&category_id=${encodeURIComponent(categoryId)}`;
    }
    return proxyFetchJSON(url);
}

/**
 * Get series info (seasons, episodes)
 * @param {string} server - Server URL
 * @param {string} username - Xtream username
 * @param {string} password - Xtream password
 * @param {number} seriesId - Series ID
 * @returns {Promise<object>} Series details with episodes
 */
export async function getSeriesInfo(server, username, password, seriesId) {
    const baseUrl = normalizeServerUrl(server);
    const url = `${baseUrl}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=get_series_info&series_id=${encodeURIComponent(seriesId)}`;
    return proxyFetchJSON(url);
}

/**
 * Get series episode stream URL
 * @param {string} server - Server URL
 * @param {string} username - Xtream username
 * @param {string} password - Xtream password
 * @param {number} streamId - Episode stream ID
 * @param {string} extension - Container extension
 * @returns {string} Episode stream URL
 */
export function getSeriesStreamUrl(server, username, password, streamId, extension = 'mp4') {
    const baseUrl = normalizeServerUrl(server);
    return `${baseUrl}/series/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${streamId}.${extension}`;
}

// ==================== END VOD API ====================

// ==================== Timeshift / Catchup API ====================

/**
 * Get timeshift stream URL for a past program
 * Xtream Codes servers support catchup/timeshift via a specific URL pattern.
 * @param {string} server - Server URL
 * @param {string} username - Xtream username
 * @param {string} password - Xtream password
 * @param {number} streamId - Stream ID of the channel
 * @param {Date} start - Program start time
 * @param {number} durationMinutes - Duration in minutes
 * @returns {string} Timeshift stream URL
 */
export function getTimeshiftUrl(server, username, password, streamId, start, durationMinutes) {
    const baseUrl = normalizeServerUrl(server);
    // Format start time as YYYY-MM-DD:HH-MM
    const y = start.getFullYear();
    const m = String(start.getMonth() + 1).padStart(2, '0');
    const d = String(start.getDate()).padStart(2, '0');
    const hh = String(start.getHours()).padStart(2, '0');
    const mm = String(start.getMinutes()).padStart(2, '0');
    const startStr = `${y}-${m}-${d}:${hh}-${mm}`;
    const dur = Math.ceil(durationMinutes);
    return `${baseUrl}/timeshift/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${dur}/${startStr}/${streamId}.ts`;
}

/**
 * Get short EPG for a specific stream (useful for getting recent program data)
 * @param {string} server - Server URL
 * @param {string} username - Xtream username
 * @param {string} password - Xtream password
 * @param {number} streamId - Stream ID
 * @param {number} limit - Number of items to return
 * @returns {Promise<object>} Short EPG data
 */
export async function getShortEpg(server, username, password, streamId, limit = 10) {
    const baseUrl = normalizeServerUrl(server);
    const url = `${baseUrl}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=get_short_epg&stream_id=${encodeURIComponent(streamId)}&limit=${limit}`;
    return proxyFetchJSON(url);
}

/**
 * Get simple data table (all EPG) for a specific stream
 * @param {string} server - Server URL
 * @param {string} username - Xtream username
 * @param {string} password - Xtream password
 * @param {number} streamId - Stream ID
 * @returns {Promise<object>} Full EPG listing
 */
export async function getSimpleDataTable(server, username, password, streamId) {
    const baseUrl = normalizeServerUrl(server);
    const url = `${baseUrl}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=get_simple_data_table&stream_id=${encodeURIComponent(streamId)}`;
    return proxyFetchJSON(url);
}

// ==================== END Timeshift / Catchup API ====================

export default {
    authenticate,
    getLiveCategories,
    getLiveStreams,
    getEpgUrl,
    getStreamUrl,
    streamsToM3U,
    fetchAndConvertToM3U,
    getVodCategories,
    getVodStreams,
    getVodInfo,
    getVodStreamUrl,
    getSeriesCategories,
    getSeries,
    getSeriesInfo,
    getSeriesStreamUrl,
    getTimeshiftUrl,
    getShortEpg,
    getSimpleDataTable
};
