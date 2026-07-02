# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0] - 2026-07-02

### Improved
- **Faster Stream Startup**: Cut the wait before a live stream begins playing from ~8s to ~3s
  - Low-latency FFmpeg input options for live streams (`-fflags nobuffer`, `-flags low_delay`, reduced `-analyzeduration`/`-probesize`) cut source probing from ~5s to under 1s
  - Live HLS segment duration reduced from 4s to 2s so playable segments are produced sooner (VOD keeps 4s segments for efficient seeking)
  - Forced keyframes at each segment boundary let FFmpeg cut segments exactly on time instead of waiting for the source's next keyframe
  - Server now responds as soon as the playlist lists 2 finalized segments (previously waited for 3), and counts actual playlist entries instead of on-disk `.ts` files — the latter could include a half-written segment and hand the client an unplayable playlist
  - Readiness polling interval tightened from 500ms to 50ms so playback starts the instant segments land
  - Player no longer uses `lowLatencyMode` for live playback (it hugged the live edge and started with no buffer, causing `bufferStalledError` and a slow, nudgy start); it now begins a couple of segments back on already-buffered data for an immediate, stall-free start

### Developer
- **Transcoder Hot Reload**: Added `docker-compose.override.yml` that bind-mounts the transcoder source and runs it under `node --watch`, so `transcoder/server.js` changes restart the process in-place with no image rebuild (a named volume preserves the image's compiled `better-sqlite3`)
- **Startup Timing Logs**: The transcoder logs `[Timing]` markers (spawn → input probed → encoding started → segments ready → responded) to make time-to-first-frame regressions easy to diagnose

## [1.2.0] - 2026-04-01

### Added
- **Timeshift / Catchup Playback**: Watch previously aired programs on channels that support catchup
  - Timeshift icon indicator next to channel names in the channel list (only shown for channels with `tv_archive` support)
  - Redesigned EPG panel below the video player showing past, current, and upcoming programs in a vertical timeline
  - Past programs are clickable for catchup playback with a play icon and "Catchup" chip
  - Program detail dialog with "Watch (Catchup)" button that builds the Xtream Codes timeshift URL
  - Auto-scrolls to the currently airing program when opening the EPG panel
  - Progress bar on the current program showing elapsed time
  - New Xtream Codes API integration: `getTimeshiftUrl`, `getShortEpg`, `getSimpleDataTable`

### Improved
- **EPG Grid Dialog Performance**: Completely rewritten for near-instant loading
  - Replaced manual virtual scrolling with Vuetify's `v-virtual-scroll` for immediate rendering
  - Replaced absolute CSS positioning with flex layout, eliminating program overlap and alignment issues
  - Programs cache computed once per time window for all channels (O(1) per-row lookup)
  - Time navigation with back/forward buttons and "Now" reset
  - Now marker rendered as a percentage line across the grid
- **Channel Switching Speed**: Optimized video player for faster playback start
  - Video element is reused in-place instead of being destroyed and recreated on every channel switch
  - Old transcoded stream cleanup runs non-blocking (fire-and-forget)
  - For MPEG-TS streams, the transcoder request fires in parallel with player setup
  - HLS.js tuned for faster first-frame: low-latency mode, smaller initial buffer, fragment prefetch
- **EPG Data Processing**: Simplified `getProgramsInRange` to a single-pass algorithm that leverages pre-sorted data, replacing the previous filter → dedup → sort → overlap-removal pipeline

## [1.1.0] - 2026-03-11

### Added
- **VOD Support (Movies & Series)**: Browse and play Video on Demand content from Xtream Codes playlists
  - Channels/VOD toggle in the sidebar (only shown for Xtream playlists)
  - Movies and Series tabs with category browsing
  - Series drill-down: season selector with episode list, metadata, and poster art
  - Search filtering across categories, movies, series, and episodes
  - VOD playback with native video player and seek bar
  - Automatic transcoder fallback for unsupported formats (MKV, AVI, etc.)
  - Full Xtream Codes API integration: categories, streams, series info, and stream URLs

### Fixed
- **VOD Transcoding**: Transcoder now properly distinguishes between live and VOD modes
  - VOD streams use `hls_list_size=0` and `hls_playlist_type=event` to keep all segments, enabling full seek support
  - Live streams retain existing behavior with rolling segment deletion
  - Reconnect options (`-reconnect`) are only applied to live streams, preventing issues with VOD file sources
- **VOD Playback**: Player correctly configures HLS.js for VOD vs live content
  - `liveSyncDurationCount` and `liveMaxLatencyDurationCount` are only set for live streams
  - Transcoded VOD streams now report `isLiveStream = false`, enabling the seek bar
- **Race Condition on Channel Switch**: Added `playGeneration` counter to cancel stale async callbacks when rapidly switching channels or content, preventing ghost playback from previous selections
- **VOD Fallback Cleanup**: Native-to-transcoder fallback for unsupported formats (MKV, AVI) no longer calls `cleanupPlayer()` which would kill the transcoded stream it just created
- **Episode Display Names**: Series episodes now show properly formatted names like "Series Name - S01E03 - Episode Title" with zero-padded season/episode numbers

## [1.0.7] - 2026-03-03

### Added
- **Chromecast Support**: Cast any live stream to a Chromecast device
  - Cast button appears in player controls and app bar when a Chromecast is detected
  - Uses Google's Default Media Receiver (no registration required for users)
  - Streams HLS content directly to the Chromecast
  - Click the cast-connected icon to stop casting
- **AirPlay Support**: Cast to Apple TV and AirPlay-compatible devices
  - AirPlay button appears in player controls and app bar on Safari/iOS
  - Native WebKit integration with `webkitShowPlaybackTargetPicker`
  - Works with both admin and guest views

### Fixed
- **Playlist URL Import Broken**: Importing a playlist from a URL was routing through a client-side CORS proxy (`http://<domain>:8888/...`), which failed with mixed-content errors on HTTPS and when port 8888 wasn't reachable through the custom domain
  - Playlist URL fetching now happens server-side via a new `/playlists/fetch-url` backend endpoint
  - Eliminates CORS and mixed-content issues entirely
- **CORS Proxy URL in Production**: `getProxyUrl()` now routes through nginx (`/proxy`) in production instead of hardcoding `http://<hostname>:8888`
- **Nginx Proxy for CORS**: Added `/proxy/` location block in nginx config to forward requests to the CORS proxy container

## [1.0.6] - 2026-02-26

### Added
- **WebSocket-Powered Stream Sharing**: Replaced HTTP polling with WebSockets for real-time communication
  - Instant channel switching for all connected guests when the admin changes channels
  - Real-time guest count and viewer list updates without polling delays
  - Automatic reconnection on connection drops
  - Guests are immediately notified when the owner stops sharing
- **Danmaku (Live Comments)**: Bilibili-style floating messages over the video player
  - Both admin and guests can send messages that scroll across the video
  - Custom color picker for message colors
  - Toggle button in the player controls (mobile-friendly placement)
  - Messages limited to 200 characters with text shadow for readability
  - Auto-distributed across vertical tracks to avoid overlapping
- **Admin Display Name**: Configurable display name for danmaku messages in Settings → Danmaku Settings

### Fixed
- Channel switching not propagating to guests in shared streams (was relying on 10-second polling)
- Guest viewer count glitchy and inaccurate (was using REST polling, now uses WebSocket presence)
- Guests not reliably removed from viewer list when disconnecting
- Guest stream going offline when admin switches channels (now uses `waitForStream` polling with loading state)
- WebSocket disconnecting guests on channel switch (cleanupSharedStreams now checks if admin is still connected)

### Changed
- Guest tracking now uses WebSocket connections instead of REST API polling
- Channel changes in shared streams are now instant via WebSocket instead of 10-second polling detection
- Nginx configuration updated with dedicated WebSocket proxy endpoint

## [1.0.5] - 2026-02-25

### Fixed
- **Session Store Crash**: Fixed `TypeError: store.createSession is not a function` error that prevented sessions from working. SQLiteStore now correctly extends `express-session`'s `Store` base class instead of `EventEmitter`, providing the required `createSession` method.

## [1.0.4] - 2026-02-17

### Added
- **Share URL Configuration**: Custom domain, port, and protocol (HTTP/HTTPS) settings for share URLs
- **Guest Viewer Tracking**: Real-time display of viewer count and names in share dialog and toolbar
- **Guest List Display**: Visual chips showing who is currently watching the shared stream
- **Improved Guest Leave Detection**: More reliable guest tracking using `navigator.sendBeacon` API
- **Smart Port Handling**: Automatically hides default ports (80/443) in share URLs

### Changed
- Share settings now require explicit save button instead of auto-saving on blur
- Share button badge now shows viewer count even when zero
- Enhanced share dialog UI with better guest information display

### Fixed
- Guest count not updating when viewers close their browser window
- Version display showing "vundefined" in production builds
- M3U file upload 413 Payload Too Large error (increased limit to 200MB)

## [1.0.3] - 2026-02-08

### Added
- **Multi-Playlist View**: New "Show channels from all playlists" option in Settings
  - Toggle to display channels from all playlists simultaneously
  - Easily switch between single and multi-playlist mode
  - All channels accessible without switching active playlist
- **Recording Management Improvements**: Enhanced Recordings Dialog
  - Search/filter recordings by name or date
  - Pagination support (10 recordings per page)
  - Shows filtered count and total size
  - Better organization for large recording libraries
  - "No matches found" state when search returns empty

### Changed
- Version display now reads dynamically from package.json
- Recordings dialog now handles large recording collections efficiently with pagination
- Reduced UI clutter by showing only 10 recordings at a time

### Improved
- Better visual feedback for empty search results
- Improved user experience when managing multiple playlists

## [1.0.2] - 2026-02-02

### Added
- **SQLite Database**: Replaced JSON file storage with SQLite for better performance and reliability
  - Automatic migration from JSON files on startup (backs up originals to .json_backup/)
  - Session storage now persists in database
  - Faster playlist operations
- **Mobile-Optimized Interface**: Automatic detection and fullscreen mode for phones/tablets
  - UI hidden by default on mobile devices
  - Tap video to toggle controls visibility
  - Auto-hide after 3 seconds of inactivity
  - Optimized drawer width and button sizes for mobile
- **TV Guide Virtual Scrolling**: Only renders ~30 visible channels instead of all channels
  - Dramatically faster loading with large playlists (hundreds or thousands of channels)
  - Smooth scrolling experience
  - Program data caching to reduce redundant queries
  - Optimized EPG rendering with memoized channel programs

### Fixed
- Playlist import failing with large playlists (increased body-parser limit to 50mb)
- Recording button disabled when stream is active - now properly detects transcoded streams
- Channel name text overflow in top bar - now shows ellipsis for long names
- UI "shrinking" on mobile when interacting with channels or EPG

### Improved
- Current channel EPG visibility now syncs with UI state on mobile/fullscreen
- Touch interactions improved - ignores taps on interactive elements (drawer, buttons, dialogs)
- Better mobile detection (checks user agent and screen width ≤ 768px)
- Removed heavy Vuetify tooltips from TV Guide for better performance

## [1.0.1] - 2026-01-25

### Added
- **Optional Authentication System**: Protect your instance with username/password
  - Configured via environment variables (BACALHAU_USER, BACALHAU_PASSWORD)
  - Styled login page with dark theme matching the player interface
  - Session-based access control

### Fixed
- Audio volume/muted state not persisting when changing channels
- Recordings continuing after browser close - now properly stops recording on page unload

### Changed
- Docker Compose now uses CPU transcoder by default (easier setup for new users)
- Updated proxy configuration to use local image instead of remote URL

### Improved
- Added Discord and GitHub community links to documentation

### Note
The current authentication system is temporary. A full-fledged authentication and user management system is planned for a future release.

## [1.0.0] - 2026-01-15

### Added
- Initial public release
- M3U/M3U8 playlist support
- Xtream Codes API integration
- EPG Guide with XMLTV support
- Live recording functionality
- GPU transcoding support (NVIDIA, AMD/Intel VAAPI)
- Stream sharing feature
- Dark/Light theme
- Responsive interface
- Docker-first deployment
- Persistent playlist storage
