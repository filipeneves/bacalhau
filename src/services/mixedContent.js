/**
 * Mixed-content proxy helper.
 * 
 * When the app is served over HTTPS, browsers block HTTP sub-resources
 * (images, scripts, stylesheets, API calls, etc.). This helper rewrites
 * HTTP URLs to go through the backend mixed-content proxy endpoint, which
 * fetches them server-side and serves them over the same HTTPS origin.
 */

import { getTranscoderUrl } from './urls.js';

/**
 * Proxy a URL if needed to avoid mixed-content blocking.
 * - On HTTPS pages: rewrites http:// URLs through /api/mixed-content-proxy
 * - On HTTP pages: returns the URL unchanged (no mixed-content issue)
 * - HTTPS URLs, data: URIs, blob: URIs, relative paths: returned unchanged
 * 
 * @param {string} url - The URL to potentially proxy
 * @returns {string} The proxied or original URL
 */
export function proxyUrl(url) {
    if (!url) return url;

    // Only proxy http:// URLs when the page is served over https://
    if (typeof window === 'undefined') return url;
    if (window.location.protocol !== 'https:') return url;
    if (!url.startsWith('http://')) return url;

    // Route through the backend mixed-content proxy
    const transcoderUrl = getTranscoderUrl();
    return `${transcoderUrl}/mixed-content-proxy?url=${encodeURIComponent(url)}`;
}

// Backwards-compatible alias
export const proxyImageUrl = proxyUrl;
