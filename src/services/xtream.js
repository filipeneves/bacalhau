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

import { getProxyUrl } from '@/services/urls.js';

const CORS_PROXY = getProxyUrl();

/**
 * Authenticate with Xtream server and get account info
 * @param {string} server - Server URL (e.g., http://example.com:8080)
 * @param {string} username - Xtream username
 * @param {string} password - Xtream password
 * @returns {Promise<object>} Account info and server info
 */
export async function authenticate(server, username, password) {
    const baseUrl = normalizeServerUrl(server);
    const url = `${CORS_PROXY}/${baseUrl}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
    
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Authentication failed: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
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
    const url = `${CORS_PROXY}/${baseUrl}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=get_live_categories`;
    
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch categories: ${response.status}`);
    }
    
    return response.json();
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
    let url = `${CORS_PROXY}/${baseUrl}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=get_live_streams`;
    
    if (categoryId) {
        url += `&category_id=${encodeURIComponent(categoryId)}`;
    }
    
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch streams: ${response.status}`);
    }
    
    return response.json();
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

export default {
    authenticate,
    getLiveCategories,
    getLiveStreams,
    getEpgUrl,
    getStreamUrl,
    streamsToM3U,
    fetchAndConvertToM3U
};
