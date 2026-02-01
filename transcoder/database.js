const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Database file location (in playlists directory for easy backup)
const DB_PATH = process.env.DB_PATH || path.join(process.env.PLAYLISTS_DIR || '/playlists', 'bacalhau.db');

let db = null;

/**
 * Initialize database connection and create tables if they don't exist
 */
function initDatabase() {
    // Ensure directory exists
    const dbDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }

    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL'); // Write-Ahead Logging for better performance
    db.pragma('foreign_keys = ON'); // Enable foreign key constraints

    // Create tables
    createTables();
    
    console.log('[Database] Initialized SQLite database at:', DB_PATH);
    return db;
}

/**
 * Create database schema
 */
function createTables() {
    // Playlists table
    db.exec(`
        CREATE TABLE IF NOT EXISTS playlists (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            url TEXT,
            type TEXT DEFAULT 'remote',
            epg_url TEXT,
            raw_content TEXT,
            xtream_type TEXT,
            xtream_server TEXT,
            xtream_username TEXT,
            xtream_password TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // Channels table (parsed from playlists)
    db.exec(`
        CREATE TABLE IF NOT EXISTS channels (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            playlist_id TEXT NOT NULL,
            name TEXT NOT NULL,
            url TEXT NOT NULL,
            logo TEXT,
            group_title TEXT,
            tvg_id TEXT,
            tvg_name TEXT,
            channel_number INTEGER,
            FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_channels_playlist ON channels(playlist_id);
    `);

    // Favorites table
    db.exec(`
        CREATE TABLE IF NOT EXISTS favorites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            playlist_id TEXT NOT NULL,
            type TEXT NOT NULL, -- 'category' or 'channel'
            value TEXT NOT NULL, -- category name or channel URL
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
            UNIQUE(playlist_id, type, value)
        );
        CREATE INDEX IF NOT EXISTS idx_favorites_playlist ON favorites(playlist_id);
    `);

    // Hidden items table
    db.exec(`
        CREATE TABLE IF NOT EXISTS hidden (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            playlist_id TEXT NOT NULL,
            type TEXT NOT NULL, -- 'category' or 'channel'
            value TEXT NOT NULL, -- category name or channel URL
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
            UNIQUE(playlist_id, type, value)
        );
        CREATE INDEX IF NOT EXISTS idx_hidden_playlist ON hidden(playlist_id);
    `);

    // Settings table (global settings like active playlist)
    db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // Sessions table (for express-session SQLite store)
    db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
            sid TEXT PRIMARY KEY,
            sess TEXT NOT NULL,
            expire INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_sessions_expire ON sessions(expire);
    `);
}

/**
 * Get database instance
 */
function getDatabase() {
    if (!db) {
        initDatabase();
    }
    return db;
}

// ==================== PLAYLIST OPERATIONS ====================

/**
 * Get all playlists (metadata only, no channels)
 */
function getAllPlaylists() {
    const stmt = db.prepare(`
        SELECT id, name, url, type, epg_url, created_at, updated_at,
               xtream_type, xtream_server, xtream_username, xtream_password,
               (SELECT COUNT(*) FROM channels WHERE playlist_id = playlists.id) as channel_count
        FROM playlists
        ORDER BY created_at DESC
    `);
    return stmt.all();
}

/**
 * Get single playlist by ID with all data including channels
 */
function getPlaylistById(id) {
    const playlist = db.prepare(`
        SELECT * FROM playlists WHERE id = ?
    `).get(id);

    if (!playlist) return null;

    // Get channels
    const channels = db.prepare(`
        SELECT * FROM channels WHERE playlist_id = ? ORDER BY channel_number, name
    `).all(id);

    // Get favorites
    const favoriteCategories = db.prepare(`
        SELECT value FROM favorites WHERE playlist_id = ? AND type = 'category'
    `).all(id).map(row => row.value);

    const favoriteChannels = db.prepare(`
        SELECT value FROM favorites WHERE playlist_id = ? AND type = 'channel'
    `).all(id).map(row => row.value);

    // Get hidden
    const hiddenCategories = db.prepare(`
        SELECT value FROM hidden WHERE playlist_id = ? AND type = 'category'
    `).all(id).map(row => row.value);

    const hiddenChannels = db.prepare(`
        SELECT value FROM hidden WHERE playlist_id = ? AND type = 'channel'
    `).all(id).map(row => row.value);

    return {
        id: playlist.id,
        name: playlist.name,
        url: playlist.url,
        type: playlist.type,
        epgUrl: playlist.epg_url,
        rawContent: playlist.raw_content,
        xtream: playlist.xtream_type ? {
            type: playlist.xtream_type,
            server: playlist.xtream_server,
            username: playlist.xtream_username,
            password: playlist.xtream_password
        } : null,
        channels,
        favoriteCategories,
        favoriteChannels,
        hiddenCategories,
        hiddenChannels,
        createdAt: playlist.created_at,
        updatedAt: playlist.updated_at
    };
}

/**
 * Create new playlist
 */
function createPlaylist(data) {
    const { id, name, url, type, epgUrl, rawContent, xtream, channels } = data;

    const insert = db.prepare(`
        INSERT INTO playlists (id, name, url, type, epg_url, raw_content,
                              xtream_type, xtream_server, xtream_username, xtream_password)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insert.run(
        id,
        name,
        url || null,
        type || 'remote',
        epgUrl || null,
        rawContent || null,
        xtream?.type || null,
        xtream?.server || null,
        xtream?.username || null,
        xtream?.password || null
    );

    // Insert channels if provided
    if (channels && channels.length > 0) {
        const insertChannel = db.prepare(`
            INSERT INTO channels (playlist_id, name, url, logo, group_title, tvg_id, tvg_name, channel_number)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const insertMany = db.transaction((channelList) => {
            for (const channel of channelList) {
                insertChannel.run(
                    id,
                    channel.name,
                    channel.url,
                    channel.tvg?.logo || null,
                    channel.group?.title || null,
                    channel.tvg?.id || null,
                    channel.tvg?.name || null,
                    channel.tvg?.chno || null
                );
            }
        });

        insertMany(channels);
    }

    return getPlaylistById(id);
}

/**
 * Update playlist
 */
function updatePlaylist(id, data) {
    const { name, url, epgUrl, xtream, channels, rawContent, favoriteCategories, favoriteChannels, hiddenCategories, hiddenChannels } = data;

    const update = db.prepare(`
        UPDATE playlists
        SET name = ?,
            url = ?,
            epg_url = ?,
            raw_content = ?,
            xtream_type = ?,
            xtream_server = ?,
            xtream_username = ?,
            xtream_password = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `);

    update.run(
        name,
        url || null,
        epgUrl || null,
        rawContent || null,
        xtream?.type || null,
        xtream?.server || null,
        xtream?.username || null,
        xtream?.password || null,
        id
    );

    // Update channels if provided
    if (channels) {
        // Delete existing channels
        db.prepare('DELETE FROM channels WHERE playlist_id = ?').run(id);

        // Insert new channels
        if (channels.length > 0) {
            const insertChannel = db.prepare(`
                INSERT INTO channels (playlist_id, name, url, logo, group_title, tvg_id, tvg_name, channel_number)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `);

            const insertMany = db.transaction((channelList) => {
                for (const channel of channelList) {
                    insertChannel.run(
                        id,
                        channel.name,
                        channel.url,
                        channel.tvg?.logo || null,
                        channel.group?.title || null,
                        channel.tvg?.id || null,
                        channel.tvg?.name || null,
                        channel.tvg?.chno || null
                    );
                }
            });

            insertMany(channels);
        }
    }

    // Update favorites if provided
    if (favoriteCategories !== undefined) {
        db.prepare('DELETE FROM favorites WHERE playlist_id = ? AND type = ?').run(id, 'category');
        const insertFav = db.prepare('INSERT INTO favorites (playlist_id, type, value) VALUES (?, ?, ?)');
        const transaction = db.transaction((items) => {
            for (const item of items) insertFav.run(id, 'category', item);
        });
        transaction(favoriteCategories);
    }

    if (favoriteChannels !== undefined) {
        db.prepare('DELETE FROM favorites WHERE playlist_id = ? AND type = ?').run(id, 'channel');
        const insertFav = db.prepare('INSERT INTO favorites (playlist_id, type, value) VALUES (?, ?, ?)');
        const transaction = db.transaction((items) => {
            for (const item of items) insertFav.run(id, 'channel', item);
        });
        transaction(favoriteChannels);
    }

    // Update hidden if provided
    if (hiddenCategories !== undefined) {
        db.prepare('DELETE FROM hidden WHERE playlist_id = ? AND type = ?').run(id, 'category');
        const insertHidden = db.prepare('INSERT INTO hidden (playlist_id, type, value) VALUES (?, ?, ?)');
        const transaction = db.transaction((items) => {
            for (const item of items) insertHidden.run(id, 'category', item);
        });
        transaction(hiddenCategories);
    }

    if (hiddenChannels !== undefined) {
        db.prepare('DELETE FROM hidden WHERE playlist_id = ? AND type = ?').run(id, 'channel');
        const insertHidden = db.prepare('INSERT INTO hidden (playlist_id, type, value) VALUES (?, ?, ?)');
        const transaction = db.transaction((items) => {
            for (const item of items) insertHidden.run(id, 'channel', item);
        });
        transaction(hiddenChannels);
    }

    return getPlaylistById(id);
}

/**
 * Delete playlist
 */
function deletePlaylist(id) {
    const playlist = getPlaylistById(id);
    if (!playlist) return null;

    db.prepare('DELETE FROM playlists WHERE id = ?').run(id);
    // Channels, favorites, and hidden will be deleted automatically due to CASCADE

    return playlist;
}

// ==================== SETTINGS OPERATIONS ====================

/**
 * Get a setting value
 */
function getSetting(key) {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : null;
}

/**
 * Set a setting value
 */
function setSetting(key, value) {
    db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            updated_at = CURRENT_TIMESTAMP
    `).run(key, value);
}

/**
 * Delete a setting
 */
function deleteSetting(key) {
    db.prepare('DELETE FROM settings WHERE key = ?').run(key);
}

// ==================== SESSION STORE FOR EXPRESS-SESSION ====================

const { EventEmitter } = require('events');

class SQLiteStore extends EventEmitter {
    constructor() {
        super();
        this.db = getDatabase();
    }

    get(sid, callback) {
        try {
            const row = this.db.prepare('SELECT sess FROM sessions WHERE sid = ? AND expire >= ?')
                .get(sid, Date.now());
            
            if (row) {
                callback(null, JSON.parse(row.sess));
            } else {
                callback();
            }
        } catch (err) {
            callback(err);
        }
    }

    set(sid, session, callback) {
        try {
            const expire = session.cookie && session.cookie.expires
                ? new Date(session.cookie.expires).getTime()
                : Date.now() + (24 * 60 * 60 * 1000); // 24 hours default

            this.db.prepare(`
                INSERT INTO sessions (sid, sess, expire)
                VALUES (?, ?, ?)
                ON CONFLICT(sid) DO UPDATE SET
                    sess = excluded.sess,
                    expire = excluded.expire
            `).run(sid, JSON.stringify(session), expire);

            callback();
        } catch (err) {
            callback(err);
        }
    }

    destroy(sid, callback) {
        try {
            this.db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
            callback();
        } catch (err) {
            callback(err);
        }
    }

    // Clean up expired sessions
    touch(sid, session, callback) {
        try {
            const expire = session.cookie && session.cookie.expires
                ? new Date(session.cookie.expires).getTime()
                : Date.now() + (24 * 60 * 60 * 1000);

            this.db.prepare('UPDATE sessions SET expire = ? WHERE sid = ?')
                .run(expire, sid);

            callback();
        } catch (err) {
            callback(err);
        }
    }

    // Clean up expired sessions periodically
    clearExpired() {
        try {
            const result = this.db.prepare('DELETE FROM sessions WHERE expire < ?')
                .run(Date.now());
            console.log(`[Database] Cleaned up ${result.changes} expired sessions`);
        } catch (err) {
            console.error('[Database] Error cleaning expired sessions:', err);
        }
    }
}

// Clean up expired sessions every hour
setInterval(() => {
    if (db) {
        const store = new SQLiteStore();
        store.clearExpired();
    }
}, 60 * 60 * 1000);

module.exports = {
    initDatabase,
    getDatabase,
    getAllPlaylists,
    getPlaylistById,
    createPlaylist,
    updatePlaylist,
    deletePlaylist,
    getSetting,
    setSetting,
    deleteSetting,
    SQLiteStore
};
