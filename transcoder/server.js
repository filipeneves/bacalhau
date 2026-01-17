const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = 3001;

// CORS middleware - allow requests from dev server
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Store active streams
const activeStreams = new Map();

// Store active recordings
const activeRecordings = new Map();

// HLS output directory
const HLS_DIR = '/tmp/hls';

// Recordings directory (configurable via environment variable)
const RECORDINGS_DIR = process.env.RECORDINGS_DIR || '/recordings';

// Playlists directory (configurable via environment variable)
const PLAYLISTS_DIR = process.env.PLAYLISTS_DIR || '/playlists';

// Ensure directories exist
if (!fs.existsSync(HLS_DIR)) {
    fs.mkdirSync(HLS_DIR, { recursive: true });
}
if (!fs.existsSync(RECORDINGS_DIR)) {
    fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
}
if (!fs.existsSync(PLAYLISTS_DIR)) {
    fs.mkdirSync(PLAYLISTS_DIR, { recursive: true });
}

// Build FFmpeg arguments based on hardware acceleration settings
function buildFFmpegArgs({ streamUrl, hwAccel, hwDecode, preset, quality, streamDir, playlistPath }) {
    const args = [];
    
    // Quality settings
    const qualitySettings = {
        performance: { crf: 28, bitrate: '2M', maxrate: '3M' },
        balanced: { crf: 23, bitrate: '4M', maxrate: '6M' },
        quality: { crf: 18, bitrate: '8M', maxrate: '12M' }
    };
    const qSettings = qualitySettings[quality] || qualitySettings.balanced;
    
    // Map user-friendly presets to NVENC numeric presets
    const nvencPresetMap = {
        'ultrafast': 'p1',
        'superfast': 'p2',
        'veryfast': 'p3',
        'faster': 'p4',
        'fast': 'p5',
        'medium': 'p5',
        'slow': 'p6',
        'slower': 'p7',
        'veryslow': 'p7'
    };
    
    // Input options based on acceleration type
    switch (hwAccel) {
        case 'nvenc':
            // NVIDIA CUDA/NVDEC hardware decoding + NVENC encoding
            if (hwDecode) {
                args.push('-hwaccel', 'cuda');
                args.push('-hwaccel_output_format', 'cuda');
            }
            break;
            
        case 'qsv':
            // Intel Quick Sync Video
            if (hwDecode) {
                args.push('-hwaccel', 'qsv');
                args.push('-qsv_device', '/dev/dri/renderD128');
                args.push('-hwaccel_output_format', 'qsv');
            }
            break;
            
        case 'vaapi':
            // Linux VA-API (AMD/Intel on Linux)
            if (hwDecode) {
                args.push('-hwaccel', 'vaapi');
                args.push('-vaapi_device', '/dev/dri/renderD128');
                args.push('-hwaccel_output_format', 'vaapi');
            }
            break;
            
        case 'amf':
            // AMD AMF (Windows primarily)
            if (hwDecode) {
                args.push('-hwaccel', 'd3d11va');
            }
            break;
            
        case 'videotoolbox':
            // macOS VideoToolbox
            if (hwDecode) {
                args.push('-hwaccel', 'videotoolbox');
            }
            break;
            
        case 'cpu':
        default:
            // Software decoding - no special options needed
            break;
    }
    
    // Common input options
    args.push(
        '-i', streamUrl,
        '-reconnect', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '5',
        // Only map video and audio streams - ignore subtitles/data streams that can cause errors
        '-map', '0:v:0?',   // First video stream (optional)
        '-map', '0:a:0?'    // First audio stream (optional)
    );
    
    // Video encoding options based on acceleration type
    switch (hwAccel) {
        case 'nvenc':
            args.push(
                '-c:v', 'h264_nvenc',
                '-preset', nvencPresetMap[preset] || 'p5',
                '-tune', 'ull',  // Ultra low latency
                '-rc', 'vbr',    // Variable bitrate
                '-cq', String(qSettings.crf + 5), // CQ value (NVENC uses different scale)
                '-b:v', qSettings.bitrate,
                '-maxrate', qSettings.maxrate,
                '-bufsize', qSettings.maxrate
            );
            break;
            
        case 'qsv':
            args.push(
                '-c:v', 'h264_qsv',
                '-preset', preset === 'ultrafast' ? 'veryfast' : preset,
                '-global_quality', String(qSettings.crf + 5),
                '-b:v', qSettings.bitrate,
                '-maxrate', qSettings.maxrate,
                '-bufsize', qSettings.maxrate
            );
            break;
            
        case 'vaapi':
            // VAAPI needs format conversion if hwaccel output format is vaapi
            if (hwDecode) {
                args.push('-vf', 'format=nv12|vaapi,hwupload');
            } else {
                args.push('-vf', 'format=nv12,hwupload');
            }
            args.push(
                '-c:v', 'h264_vaapi',
                '-qp', String(qSettings.crf + 5),
                '-b:v', qSettings.bitrate,
                '-maxrate', qSettings.maxrate,
                '-bufsize', qSettings.maxrate
            );
            break;
            
        case 'amf':
            args.push(
                '-c:v', 'h264_amf',
                '-quality', quality === 'quality' ? 'quality' : (quality === 'performance' ? 'speed' : 'balanced'),
                '-rc', 'vbr_latency',
                '-qp_i', String(qSettings.crf),
                '-qp_p', String(qSettings.crf + 2),
                '-b:v', qSettings.bitrate,
                '-maxrate', qSettings.maxrate,
                '-bufsize', qSettings.maxrate
            );
            break;
            
        case 'videotoolbox':
            args.push(
                '-c:v', 'h264_videotoolbox',
                '-q:v', String(Math.max(1, Math.min(100, 100 - qSettings.crf * 3))),
                '-b:v', qSettings.bitrate,
                '-maxrate', qSettings.maxrate,
                '-bufsize', qSettings.maxrate,
                '-realtime', '1'
            );
            break;
            
        case 'cpu':
        default:
            args.push(
                '-c:v', 'libx264',
                '-preset', preset,
                '-tune', 'zerolatency',
                '-crf', String(qSettings.crf),
                '-maxrate', qSettings.maxrate,
                '-bufsize', qSettings.maxrate
            );
            break;
    }
    
    // Common output options for HLS
    args.push(
        '-c:a', 'aac',
        '-b:a', '128k',
        '-ar', '44100',
        '-ac', '2',
        '-f', 'hls',
        '-hls_time', '4',
        '-hls_list_size', '6',
        '-hls_flags', 'delete_segments+append_list',
        '-hls_segment_filename', path.join(streamDir, 'segment%03d.ts'),
        '-y',
        playlistPath
    );
    
    return args;
}

// CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Serve HLS files
app.use('/hls', express.static(HLS_DIR, {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.m3u8')) {
            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        } else if (filePath.endsWith('.ts')) {
            res.setHeader('Content-Type', 'video/mp2t');
        }
    }
}));

// Start transcoding a stream
app.get('/transcode', async (req, res) => {
    const streamUrl = req.query.url;
    const hwAccel = req.query.hwaccel || 'cpu';           // cpu, nvenc, qsv, vaapi, amf, videotoolbox
    const hwDecode = req.query.hwdecode !== 'false';       // Enable/disable hardware decoding
    const preset = req.query.preset || 'fast';             // Encoding preset
    const quality = req.query.quality || 'balanced';       // performance, balanced, quality
    
    if (!streamUrl) {
        return res.status(400).json({ error: 'Missing url parameter' });
    }

    console.log(`[Transcoder] Request to transcode: ${streamUrl}`);
    console.log(`[Transcoder] Options: hwaccel=${hwAccel}, hwdecode=${hwDecode}, preset=${preset}, quality=${quality}`);

    // Check if we already have this stream with same settings
    const streamKey = `${streamUrl}-${hwAccel}-${preset}-${quality}`;
    const existingStream = Array.from(activeStreams.entries()).find(
        ([, data]) => data.streamKey === streamKey
    );

    if (existingStream) {
        const [streamId, data] = existingStream;
        console.log(`[Transcoder] Reusing existing stream: ${streamId}`);
        return res.json({
            streamId,
            hlsUrl: `/hls/${streamId}/playlist.m3u8`,
            status: 'active'
        });
    }

    // Create new stream
    const streamId = uuidv4();
    const streamDir = path.join(HLS_DIR, streamId);
    
    fs.mkdirSync(streamDir, { recursive: true });

    const playlistPath = path.join(streamDir, 'playlist.m3u8');

    // Build FFmpeg arguments based on acceleration type
    const ffmpegArgs = buildFFmpegArgs({
        streamUrl,
        hwAccel,
        hwDecode,
        preset,
        quality,
        streamDir,
        playlistPath
    });

    console.log(`[Transcoder] Starting FFmpeg for stream ${streamId}`);
    console.log(`[Transcoder] FFmpeg args: ffmpeg ${ffmpegArgs.join(' ')}`);

    const ffmpeg = spawn('ffmpeg', ffmpegArgs, {
        stdio: ['ignore', 'pipe', 'pipe']
    });

    let ffmpegOutput = '';

    ffmpeg.stdout.on('data', (data) => {
        console.log(`[FFmpeg ${streamId}] stdout: ${data}`);
    });

    ffmpeg.stderr.on('data', (data) => {
        ffmpegOutput += data.toString();
        // Log only important messages
        const msg = data.toString();
        if (msg.includes('Error') || msg.includes('error') || msg.includes('Opening') || msg.includes('Stream')) {
            console.log(`[FFmpeg ${streamId}] ${msg.trim()}`);
        }
    });

    ffmpeg.on('error', (err) => {
        console.error(`[FFmpeg ${streamId}] Process error:`, err);
        cleanupStream(streamId);
    });

    ffmpeg.on('close', (code) => {
        console.log(`[FFmpeg ${streamId}] Process exited with code ${code}`);
        cleanupStream(streamId);
    });

    // Store stream info
    activeStreams.set(streamId, {
        sourceUrl: streamUrl,
        streamKey,
        ffmpeg,
        streamDir,
        startTime: Date.now()
    });

    // Wait for playlist to be created and have at least 3 segments (with timeout)
    const maxWait = 20000; // 20 seconds
    const checkInterval = 500;
    let waited = 0;

    const waitForPlaylist = () => {
        return new Promise((resolve, reject) => {
            const check = () => {
                if (fs.existsSync(playlistPath)) {
                    // Check if we have at least 3 segments for smooth playback
                    const segments = fs.readdirSync(streamDir)
                        .filter(f => f.startsWith('segment') && f.endsWith('.ts'));
                    if (segments.length >= 3) {
                        resolve(true);
                    } else if (waited >= maxWait) {
                        // If timeout but playlist exists, go ahead anyway
                        resolve(true);
                    } else {
                        waited += checkInterval;
                        setTimeout(check, checkInterval);
                    }
                } else if (waited >= maxWait) {
                    reject(new Error('Timeout waiting for HLS playlist'));
                } else if (!activeStreams.has(streamId)) {
                    reject(new Error('Stream was terminated'));
                } else {
                    waited += checkInterval;
                    setTimeout(check, checkInterval);
                }
            };
            check();
        });
    };

    try {
        await waitForPlaylist();
        console.log(`[Transcoder] HLS playlist ready for stream ${streamId}`);
        res.json({
            streamId,
            hlsUrl: `/hls/${streamId}/playlist.m3u8`,
            status: 'ready'
        });
    } catch (err) {
        console.error(`[Transcoder] Error starting stream ${streamId}:`, err.message);
        console.error(`[Transcoder] FFmpeg output: ${ffmpegOutput.slice(-1000)}`);
        cleanupStream(streamId);
        res.status(500).json({ error: err.message });
    }
});

// Stop a stream
app.delete('/stream/:streamId', (req, res) => {
    const { streamId } = req.params;
    
    if (activeStreams.has(streamId)) {
        cleanupStream(streamId);
        res.json({ status: 'stopped' });
    } else {
        res.status(404).json({ error: 'Stream not found' });
    }
});

// List active streams
app.get('/streams', (req, res) => {
    const streams = Array.from(activeStreams.entries()).map(([id, data]) => ({
        streamId: id,
        sourceUrl: data.sourceUrl,
        uptime: Date.now() - data.startTime
    }));
    res.json(streams);
});

// ==================== RECORDING ENDPOINTS ====================

// Start recording a stream
app.post('/record/start', express.json(), (req, res) => {
    const { streamId, channelName } = req.body;
    
    if (!streamId) {
        return res.status(400).json({ error: 'Missing streamId in request body. Recording requires an active transcoded stream.' });
    }

    // Check if the stream exists
    const stream = activeStreams.get(streamId);
    if (!stream) {
        return res.status(404).json({ error: 'Stream not found. Make sure the channel is playing before recording.' });
    }

    // Check if already recording this stream
    const existingRecording = Array.from(activeRecordings.values()).find(r => r.streamId === streamId);
    if (existingRecording) {
        return res.status(409).json({ error: 'Already recording this stream' });
    }

    // Generate recording ID and filename
    const recordingId = uuidv4();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeName = (channelName || 'recording').replace(/[^a-zA-Z0-9-_]/g, '_');
    const filename = `${safeName}_${timestamp}.mp4`;
    const outputPath = path.join(RECORDINGS_DIR, filename);

    console.log(`[Recorder] Starting recording ${recordingId}`);
    console.log(`[Recorder] Stream directory: ${stream.streamDir}`);
    console.log(`[Recorder] Output: ${outputPath}`);

    // Recording approach: Write TS segments directly to a temp file as they appear,
    // then use FFmpeg to remux to MP4 when stopping
    const tempTsPath = path.join(RECORDINGS_DIR, `${recordingId}.ts`);
    
    // Track which segments we've already written
    let lastSegmentNum = -1;
    let segmentWatcher = null;
    let writeStream = null;
    
    try {
        writeStream = fs.createWriteStream(tempTsPath, { flags: 'a' });
    } catch (err) {
        console.error(`[Recorder ${recordingId}] Failed to create write stream:`, err);
        return res.status(500).json({ error: 'Failed to start recording' });
    }
    
    // Function to find and append new segments to the temp file
    const feedSegments = () => {
        try {
            const files = fs.readdirSync(stream.streamDir)
                .filter(f => f.startsWith('segment') && f.endsWith('.ts'))
                .map(f => {
                    const match = f.match(/segment(\d+)\.ts/);
                    return match ? { file: f, num: parseInt(match[1], 10) } : null;
                })
                .filter(Boolean)
                .sort((a, b) => a.num - b.num);
            
            for (const { file, num } of files) {
                if (num > lastSegmentNum) {
                    const segPath = path.join(stream.streamDir, file);
                    // Check if file still exists before reading
                    if (fs.existsSync(segPath)) {
                        try {
                            const segData = fs.readFileSync(segPath);
                            writeStream.write(segData);
                            console.log(`[Recorder ${recordingId}] Wrote segment: ${file} (${segData.length} bytes)`);
                            lastSegmentNum = num;
                        } catch (readErr) {
                            // Segment was deleted between check and read, skip it
                            console.log(`[Recorder ${recordingId}] Segment ${file} was deleted, skipping`);
                        }
                    }
                }
            }
        } catch (err) {
            console.warn(`[Recorder ${recordingId}] Error reading segments:`, err.message);
        }
    };
    
    // Feed initial segments
    feedSegments();
    
    // Watch for new segments every 500ms
    segmentWatcher = setInterval(feedSegments, 500);

    // Store recording info
    activeRecordings.set(recordingId, {
        streamId,
        sourceUrl: stream.sourceUrl,
        channelName: channelName || 'Unknown',
        filename,
        outputPath,
        tempTsPath,
        writeStream,
        segmentWatcher,
        startTime: Date.now(),
        status: 'recording'
    });

    res.json({
        recordingId,
        filename,
        status: 'recording',
        message: 'Recording started'
    });
});

// Stop a recording
app.post('/record/stop', express.json(), async (req, res) => {
    const { recordingId } = req.body;
    
    if (!recordingId) {
        return res.status(400).json({ error: 'Missing recordingId in request body' });
    }

    const recording = activeRecordings.get(recordingId);
    if (!recording) {
        return res.status(404).json({ error: 'Recording not found' });
    }

    console.log(`[Recorder] Stopping recording ${recordingId}`);

    // Clear segment watcher first
    if (recording.segmentWatcher) {
        clearInterval(recording.segmentWatcher);
        recording.segmentWatcher = null;
    }

    // Close the write stream
    if (recording.writeStream) {
        recording.writeStream.end();
    }

    // Remux the TS file to MP4 using FFmpeg
    console.log(`[Recorder ${recordingId}] Remuxing to MP4...`);
    const ffmpegArgs = [
        '-i', recording.tempTsPath,
        '-c:v', 'copy',
        '-c:a', 'copy',
        '-f', 'mp4',
        '-movflags', '+faststart',
        recording.outputPath
    ];

    const ffmpeg = spawn('ffmpeg', ffmpegArgs, {
        stdio: ['ignore', 'pipe', 'pipe']
    });

    ffmpeg.stderr.on('data', (data) => {
        const msg = data.toString();
        if (msg.includes('Error') || msg.includes('error')) {
            console.error(`[Recorder ${recordingId}] Remux error: ${msg.trim()}`);
        }
    });

    ffmpeg.on('close', (code) => {
        console.log(`[Recorder ${recordingId}] Remux completed with code ${code}`);
        
        // Delete temp TS file
        try {
            fs.unlinkSync(recording.tempTsPath);
            console.log(`[Recorder ${recordingId}] Cleaned up temp file`);
        } catch (err) {
            console.warn(`[Recorder ${recordingId}] Failed to delete temp file:`, err.message);
        }
        
        recording.status = code === 0 ? 'completed' : 'failed';
        recording.endTime = Date.now();
        activeRecordings.delete(recordingId);
    });

    res.json({
        recordingId,
        filename: recording.filename,
        status: 'stopping',
        message: 'Recording stopping and converting to MP4...'
    });
});

// List active recordings
app.get('/recordings/active', (req, res) => {
    const recordings = Array.from(activeRecordings.entries()).map(([id, data]) => ({
        recordingId: id,
        channelName: data.channelName,
        filename: data.filename,
        duration: Date.now() - data.startTime,
        status: data.status
    }));
    res.json(recordings);
});

// List saved recordings
app.get('/recordings', (req, res) => {
    try {
        const files = fs.readdirSync(RECORDINGS_DIR)
            .filter(f => f.endsWith('.mp4'))
            .map(filename => {
                const filePath = path.join(RECORDINGS_DIR, filename);
                const stats = fs.statSync(filePath);
                return {
                    filename,
                    size: stats.size,
                    created: stats.birthtime,
                    modified: stats.mtime
                };
            })
            .sort((a, b) => new Date(b.created) - new Date(a.created));
        
        res.json(files);
    } catch (err) {
        console.error('[Recorder] Error listing recordings:', err);
        res.status(500).json({ error: 'Failed to list recordings' });
    }
});

// Download a recording
app.get('/recordings/:filename', (req, res) => {
    const { filename } = req.params;
    const filePath = path.join(RECORDINGS_DIR, filename);
    
    // Security: prevent directory traversal
    if (!filePath.startsWith(RECORDINGS_DIR)) {
        return res.status(403).json({ error: 'Access denied' });
    }
    
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Recording not found' });
    }

    res.download(filePath);
});

// Delete a recording
app.delete('/recordings/:filename', (req, res) => {
    const { filename } = req.params;
    const filePath = path.join(RECORDINGS_DIR, filename);
    
    // Security: prevent directory traversal
    if (!filePath.startsWith(RECORDINGS_DIR)) {
        return res.status(403).json({ error: 'Access denied' });
    }
    
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Recording not found' });
    }

    try {
        fs.unlinkSync(filePath);
        res.json({ status: 'deleted', filename });
    } catch (err) {
        console.error('[Recorder] Error deleting recording:', err);
        res.status(500).json({ error: 'Failed to delete recording' });
    }
});

function cleanupRecording(recordingId) {
    const recording = activeRecordings.get(recordingId);
    if (recording) {
        console.log(`[Recorder] Cleaning up recording ${recordingId}`);
        
        // Clear segment watcher
        if (recording.segmentWatcher) {
            clearInterval(recording.segmentWatcher);
        }
        
        // Close write stream
        if (recording.writeStream) {
            recording.writeStream.end();
        }
        
        // Delete temp TS file if it exists
        if (recording.tempTsPath && fs.existsSync(recording.tempTsPath)) {
            try {
                fs.unlinkSync(recording.tempTsPath);
            } catch (err) {
                console.warn(`[Recorder] Failed to delete temp file:`, err.message);
            }
        }
        
        activeRecordings.delete(recordingId);
    }
}

// ==================== END RECORDING ENDPOINTS ====================

// ==================== PLAYLIST ENDPOINTS ====================

// Get all playlists (metadata only)
app.get('/playlists', (req, res) => {
    try {
        const files = fs.readdirSync(PLAYLISTS_DIR);
        const playlists = [];
        
        for (const file of files) {
            if (file.endsWith('.json')) {
                try {
                    const filePath = path.join(PLAYLISTS_DIR, file);
                    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                    playlists.push({
                        id: data.id,
                        name: data.name,
                        channelCount: data.channels ? data.channels.length : 0,
                        createdAt: data.createdAt,
                        updatedAt: data.updatedAt
                    });
                } catch (err) {
                    console.warn(`[Playlists] Error reading ${file}:`, err.message);
                }
            }
        }
        
        res.json({ playlists });
    } catch (err) {
        console.error('[Playlists] Error listing playlists:', err.message);
        res.status(500).json({ error: 'Failed to list playlists' });
    }
});

// Get active playlist ID (stored in a special file)
// NOTE: This must come BEFORE /playlists/:id to avoid "active" being matched as an id
app.get('/playlists/active/current', (req, res) => {
    const activePath = path.join(PLAYLISTS_DIR, '.active');
    
    try {
        if (fs.existsSync(activePath)) {
            const activeId = fs.readFileSync(activePath, 'utf8').trim();
            res.json({ activePlaylistId: activeId || null });
        } else {
            res.json({ activePlaylistId: null });
        }
    } catch (err) {
        console.error('[Playlists] Error reading active playlist:', err.message);
        res.json({ activePlaylistId: null });
    }
});

// Set active playlist
// NOTE: This must come BEFORE /playlists/:id to avoid "active" being matched as an id
app.put('/playlists/active/current', express.json(), (req, res) => {
    const { playlistId } = req.body;
    const activePath = path.join(PLAYLISTS_DIR, '.active');
    
    try {
        if (playlistId) {
            // Verify playlist exists
            const playlistPath = path.join(PLAYLISTS_DIR, `${playlistId}.json`);
            if (!fs.existsSync(playlistPath)) {
                return res.status(404).json({ error: 'Playlist not found' });
            }
            fs.writeFileSync(activePath, playlistId);
        } else {
            // Clear active playlist
            if (fs.existsSync(activePath)) {
                fs.unlinkSync(activePath);
            }
        }
        
        console.log(`[Playlists] Active playlist set to: ${playlistId || 'none'}`);
        res.json({ activePlaylistId: playlistId || null });
    } catch (err) {
        console.error('[Playlists] Error setting active playlist:', err.message);
        res.status(500).json({ error: 'Failed to set active playlist' });
    }
});

// Get single playlist with full content
app.get('/playlists/:id', (req, res) => {
    const { id } = req.params;
    const filePath = path.join(PLAYLISTS_DIR, `${id}.json`);
    
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Playlist not found' });
    }
    
    try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        res.json(data);
    } catch (err) {
        console.error(`[Playlists] Error reading playlist ${id}:`, err.message);
        res.status(500).json({ error: 'Failed to read playlist' });
    }
});

// Create new playlist
app.post('/playlists', express.json({ limit: '50mb' }), (req, res) => {
    try {
        const { 
            name, channels, rawContent, url, epgUrl, xtream,
            favoriteCategories, favoriteChannels, hiddenCategories, hiddenChannels 
        } = req.body;
        
        if (!name) {
            return res.status(400).json({ error: 'Playlist name is required' });
        }
        
        const id = uuidv4();
        const now = new Date().toISOString();
        const playlist = {
            id,
            name,
            channels: channels || [],
            rawContent: rawContent || '',
            url: url || null,
            epgUrl: epgUrl || null,
            xtream: xtream || null,
            favoriteCategories: favoriteCategories || [],
            favoriteChannels: favoriteChannels || [],
            hiddenCategories: hiddenCategories || [],
            hiddenChannels: hiddenChannels || [],
            createdAt: now,
            updatedAt: now
        };
        
        const filePath = path.join(PLAYLISTS_DIR, `${id}.json`);
        fs.writeFileSync(filePath, JSON.stringify(playlist, null, 2));
        
        console.log(`[Playlists] Created playlist: ${name} (${id})`);
        res.status(201).json(playlist);
    } catch (err) {
        console.error('[Playlists] Error creating playlist:', err.message);
        res.status(500).json({ error: 'Failed to create playlist' });
    }
});

// Update existing playlist
app.put('/playlists/:id', express.json({ limit: '50mb' }), (req, res) => {
    const { id } = req.params;
    const filePath = path.join(PLAYLISTS_DIR, `${id}.json`);
    
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Playlist not found' });
    }
    
    try {
        const existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const { 
            name, channels, rawContent, url, epgUrl, xtream,
            favoriteCategories, favoriteChannels, hiddenCategories, hiddenChannels 
        } = req.body;
        
        const updated = {
            ...existing,
            name: name !== undefined ? name : existing.name,
            channels: channels !== undefined ? channels : existing.channels,
            rawContent: rawContent !== undefined ? rawContent : existing.rawContent,
            url: url !== undefined ? url : existing.url,
            epgUrl: epgUrl !== undefined ? epgUrl : existing.epgUrl,
            xtream: xtream !== undefined ? xtream : existing.xtream,
            favoriteCategories: favoriteCategories !== undefined ? favoriteCategories : existing.favoriteCategories,
            favoriteChannels: favoriteChannels !== undefined ? favoriteChannels : existing.favoriteChannels,
            hiddenCategories: hiddenCategories !== undefined ? hiddenCategories : existing.hiddenCategories,
            hiddenChannels: hiddenChannels !== undefined ? hiddenChannels : existing.hiddenChannels,
            updatedAt: new Date().toISOString()
        };
        
        fs.writeFileSync(filePath, JSON.stringify(updated, null, 2));
        
        console.log(`[Playlists] Updated playlist: ${updated.name} (${id})`);
        res.json(updated);
    } catch (err) {
        console.error(`[Playlists] Error updating playlist ${id}:`, err.message);
        res.status(500).json({ error: 'Failed to update playlist' });
    }
});

// Delete playlist
app.delete('/playlists/:id', (req, res) => {
    const { id } = req.params;
    const filePath = path.join(PLAYLISTS_DIR, `${id}.json`);
    
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Playlist not found' });
    }
    
    try {
        // Get playlist name for logging
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        fs.unlinkSync(filePath);
        
        console.log(`[Playlists] Deleted playlist: ${data.name} (${id})`);
        res.json({ message: 'Playlist deleted', id, name: data.name });
    } catch (err) {
        console.error(`[Playlists] Error deleting playlist ${id}:`, err.message);
        res.status(500).json({ error: 'Failed to delete playlist' });
    }
});

// ==================== END PLAYLIST ENDPOINTS ====================

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        activeStreams: activeStreams.size,
        activeRecordings: activeRecordings.size,
        recordingsDir: RECORDINGS_DIR,
        playlistsDir: PLAYLISTS_DIR
    });
});

function cleanupStream(streamId) {
    const stream = activeStreams.get(streamId);
    if (stream) {
        console.log(`[Transcoder] Cleaning up stream ${streamId}`);
        
        // Kill FFmpeg process
        if (stream.ffmpeg && !stream.ffmpeg.killed) {
            stream.ffmpeg.kill('SIGTERM');
            setTimeout(() => {
                if (!stream.ffmpeg.killed) {
                    stream.ffmpeg.kill('SIGKILL');
                }
            }, 2000);
        }

        // Remove stream directory
        try {
            fs.rmSync(stream.streamDir, { recursive: true, force: true });
        } catch (err) {
            console.warn(`[Transcoder] Error removing stream dir:`, err.message);
        }

        activeStreams.delete(streamId);
    }
}

// Cleanup on shutdown
process.on('SIGTERM', () => {
    console.log('[Transcoder] Shutting down...');
    for (const streamId of activeStreams.keys()) {
        cleanupStream(streamId);
    }
    for (const recordingId of activeRecordings.keys()) {
        cleanupRecording(recordingId);
    }
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('[Transcoder] Shutting down...');
    for (const streamId of activeStreams.keys()) {
        cleanupStream(streamId);
    }
    for (const recordingId of activeRecordings.keys()) {
        cleanupRecording(recordingId);
    }
    process.exit(0);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Transcoder] Server running on port ${PORT}`);
    console.log(`[Transcoder] Recordings directory: ${RECORDINGS_DIR}`);
});
