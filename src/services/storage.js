/**
 * IndexedDB Storage Service for large playlist data
 * 
 * Uses IndexedDB instead of localStorage for playlist content
 * to avoid the 5MB localStorage limit and improve performance.
 */

const DB_NAME = 'Bacalhau';
const DB_VERSION = 1;
const STORE_NAME = 'playlists';

let db = null;

/**
 * Open/initialize the IndexedDB database
 * @returns {Promise<IDBDatabase>}
 */
export async function openDatabase() {
    if (db) return db;

    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            console.error('[Storage] Error opening IndexedDB:', request.error);
            reject(request.error);
        };

        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            
            // Create playlists store if it doesn't exist
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                database.createObjectStore(STORE_NAME, { keyPath: 'id' });
                console.log('[Storage] Created playlists object store');
            }
        };
    });
}

/**
 * Save playlist content to IndexedDB
 * @param {string} id - Playlist ID
 * @param {string} content - M3U content
 * @returns {Promise<void>}
 */
export async function savePlaylistContent(id, content) {
    const database = await openDatabase();
    
    return new Promise((resolve, reject) => {
        const transaction = database.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        
        const request = store.put({ id, content });
        
        request.onerror = () => {
            console.error('[Storage] Error saving playlist content:', request.error);
            reject(request.error);
        };
        
        request.onsuccess = () => {
            resolve();
        };
    });
}

/**
 * Get playlist content from IndexedDB
 * @param {string} id - Playlist ID
 * @returns {Promise<string|null>}
 */
export async function getPlaylistContent(id) {
    const database = await openDatabase();
    
    return new Promise((resolve, reject) => {
        const transaction = database.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        
        const request = store.get(id);
        
        request.onerror = () => {
            console.error('[Storage] Error getting playlist content:', request.error);
            reject(request.error);
        };
        
        request.onsuccess = () => {
            resolve(request.result?.content || null);
        };
    });
}

/**
 * Delete playlist content from IndexedDB
 * @param {string} id - Playlist ID
 * @returns {Promise<void>}
 */
export async function deletePlaylistContent(id) {
    const database = await openDatabase();
    
    return new Promise((resolve, reject) => {
        const transaction = database.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        
        const request = store.delete(id);
        
        request.onerror = () => {
            console.error('[Storage] Error deleting playlist content:', request.error);
            reject(request.error);
        };
        
        request.onsuccess = () => {
            resolve();
        };
    });
}

/**
 * Clear all playlist content from IndexedDB
 * @returns {Promise<void>}
 */
export async function clearAllPlaylistContent() {
    const database = await openDatabase();
    
    return new Promise((resolve, reject) => {
        const transaction = database.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        
        const request = store.clear();
        
        request.onerror = () => {
            console.error('[Storage] Error clearing playlists:', request.error);
            reject(request.error);
        };
        
        request.onsuccess = () => {
            resolve();
        };
    });
}

/**
 * Migrate playlists from localStorage to IndexedDB
 * @param {Array} playlists - Array of playlist objects with content
 * @returns {Promise<void>}
 */
export async function migrateFromLocalStorage(playlists) {
    for (const playlist of playlists) {
        if (playlist.content) {
            await savePlaylistContent(playlist.id, playlist.content);
        }
    }
    console.log(`[Storage] Migrated ${playlists.length} playlists to IndexedDB`);
}

export default {
    openDatabase,
    savePlaylistContent,
    getPlaylistContent,
    deletePlaylistContent,
    clearAllPlaylistContent,
    migrateFromLocalStorage
};
