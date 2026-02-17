# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
