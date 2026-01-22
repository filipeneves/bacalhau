/**
 * API Service for authenticated requests
 * Automatically includes credentials for session management
 */

import { getTranscoderUrl } from './urls.js';

const transcoderUrl = getTranscoderUrl();

/**
 * Make an authenticated fetch request
 * @param {string} url - The URL to fetch (can be relative or absolute)
 * @param {RequestInit} options - Fetch options
 * @returns {Promise<Response>}
 */
export async function apiFetch(url, options = {}) {
    // Ensure credentials are included for session management
    const fetchOptions = {
        ...options,
        credentials: 'include',
    };
    
    // Handle relative URLs
    const fullUrl = url.startsWith('http') ? url : `${transcoderUrl}${url}`;
    
    return fetch(fullUrl, fetchOptions);
}

/**
 * Check if authentication is enabled and user is authenticated
 * @returns {Promise<{authEnabled: boolean, authenticated: boolean, username: string|null}>}
 */
export async function checkAuthStatus() {
    try {
        const response = await apiFetch('/auth/status');
        return await response.json();
    } catch (err) {
        console.error('[API] Error checking auth status:', err);
        return { authEnabled: false, authenticated: true, username: null };
    }
}

/**
 * Login with username and password
 * @param {string} username
 * @param {string} password
 * @returns {Promise<{success: boolean, username?: string, error?: string}>}
 */
export async function login(username, password) {
    try {
        const response = await apiFetch('/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        return await response.json();
    } catch (err) {
        console.error('[API] Login error:', err);
        return { success: false, error: 'Failed to connect to server' };
    }
}

/**
 * Logout current user
 * @returns {Promise<{success: boolean}>}
 */
export async function logout() {
    try {
        const response = await apiFetch('/auth/logout', {
            method: 'POST'
        });
        
        return await response.json();
    } catch (err) {
        console.error('[API] Logout error:', err);
        return { success: false };
    }
}

export default { apiFetch, checkAuthStatus, login, logout };
