/**
 * Migration script to convert existing JSON playlist files to SQLite database
 * 
 * This script:
 * 1. Reads all existing .json playlist files from the playlists directory
 * 2. Migrates them to the SQLite database
 * 3. Backs up the original JSON files
 * 4. Migrates the active playlist setting
 */

const fs = require('fs');
const path = require('path');
const { initDatabase, createPlaylist, setSetting } = require('./database');

const PLAYLISTS_DIR = process.env.PLAYLISTS_DIR || '/playlists';
const BACKUP_DIR = path.join(PLAYLISTS_DIR, '.json_backup');

function migrate() {
    console.log('[Migration] Starting playlist migration from JSON to SQLite...');
    console.log('[Migration] Playlists directory:', PLAYLISTS_DIR);

    // Initialize database
    initDatabase();

    // Create backup directory
    if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    // Read all JSON files
    let files = [];
    try {
        files = fs.readdirSync(PLAYLISTS_DIR).filter(f => f.endsWith('.json') && !f.startsWith('.'));
    } catch (err) {
        console.log('[Migration] No existing playlists directory or no files to migrate');
        console.log('[Migration] Database initialized and ready for use');
        return;
    }

    if (files.length === 0) {
        console.log('[Migration] No playlist files found to migrate');
        console.log('[Migration] Database initialized and ready for use');
        return;
    }

    console.log(`[Migration] Found ${files.length} playlist file(s) to migrate`);

    let migrated = 0;
    let failed = 0;

    for (const file of files) {
        const filePath = path.join(PLAYLISTS_DIR, file);
        
        try {
            console.log(`[Migration] Migrating ${file}...`);
            
            // Read JSON file
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

            // Transform data to match database structure
            const playlistData = {
                id: data.id,
                name: data.name,
                url: data.url || null,
                type: data.type || 'remote',
                epgUrl: data.epgUrl || null,
                rawContent: data.rawContent || null,
                xtream: data.xtream ? {
                    type: data.xtream.type,
                    server: data.xtream.server,
                    username: data.xtream.username,
                    password: data.xtream.password
                } : null,
                channels: data.channels || []
            };

            // Create playlist in database
            createPlaylist(playlistData);

            // Migrate favorites and hidden items if they exist
            if (data.favoriteCategories && data.favoriteCategories.length > 0) {
                const db = require('./database').getDatabase();
                const insert = db.prepare('INSERT INTO favorites (playlist_id, type, value) VALUES (?, ?, ?)');
                const transaction = db.transaction((items) => {
                    for (const item of items) insert.run(playlistData.id, 'category', item);
                });
                transaction(data.favoriteCategories);
            }

            if (data.favoriteChannels && data.favoriteChannels.length > 0) {
                const db = require('./database').getDatabase();
                const insert = db.prepare('INSERT INTO favorites (playlist_id, type, value) VALUES (?, ?, ?)');
                const transaction = db.transaction((items) => {
                    for (const item of items) insert.run(playlistData.id, 'channel', item);
                });
                transaction(data.favoriteChannels);
            }

            if (data.hiddenCategories && data.hiddenCategories.length > 0) {
                const db = require('./database').getDatabase();
                const insert = db.prepare('INSERT INTO hidden (playlist_id, type, value) VALUES (?, ?, ?)');
                const transaction = db.transaction((items) => {
                    for (const item of items) insert.run(playlistData.id, 'category', item);
                });
                transaction(data.hiddenCategories);
            }

            if (data.hiddenChannels && data.hiddenChannels.length > 0) {
                const db = require('./database').getDatabase();
                const insert = db.prepare('INSERT INTO hidden (playlist_id, type, value) VALUES (?, ?, ?)');
                const transaction = db.transaction((items) => {
                    for (const item of items) insert.run(playlistData.id, 'channel', item);
                });
                transaction(data.hiddenChannels);
            }

            // Backup original file
            const backupPath = path.join(BACKUP_DIR, file);
            fs.copyFileSync(filePath, backupPath);
            
            // Delete original file
            fs.unlinkSync(filePath);

            console.log(`[Migration] ✓ Migrated ${data.name} (${data.channels?.length || 0} channels)`);
            migrated++;

        } catch (err) {
            console.error(`[Migration] ✗ Failed to migrate ${file}:`, err.message);
            failed++;
        }
    }

    // Migrate active playlist setting
    const activePath = path.join(PLAYLISTS_DIR, '.active');
    if (fs.existsSync(activePath)) {
        try {
            const activeId = fs.readFileSync(activePath, 'utf8').trim();
            if (activeId) {
                setSetting('active_playlist', activeId);
                console.log(`[Migration] ✓ Migrated active playlist setting: ${activeId}`);
                
                // Backup and delete .active file
                fs.copyFileSync(activePath, path.join(BACKUP_DIR, '.active'));
                fs.unlinkSync(activePath);
            }
        } catch (err) {
            console.error('[Migration] Failed to migrate active playlist setting:', err.message);
        }
    }

    console.log('\n[Migration] ========== MIGRATION COMPLETE ==========');
    console.log(`[Migration] Successfully migrated: ${migrated} playlists`);
    if (failed > 0) {
        console.log(`[Migration] Failed to migrate: ${failed} playlists`);
    }
    console.log(`[Migration] Backup files saved to: ${BACKUP_DIR}`);
    console.log('[Migration] =========================================\n');
}

// Run migration if this script is executed directly
if (require.main === module) {
    migrate();
}

module.exports = { migrate };
