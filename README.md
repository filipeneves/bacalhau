# 🐟 bacalhau

<p align="center">
  <img src="public/logo.png" alt="bacalhau Logo" width="150" height="150">
</p>

<p align="center">
  <strong>Self-hosted IPTV Player for NAS and Docker</strong>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#gpu-acceleration">GPU Acceleration</a> •
  <a href="#configuration">Configuration</a> •
  <a href="#codec-support">Codec Support</a>
</p>

<p align="center">
  <a href="https://ko-fi.com/M4M81SK5K0"><img src="https://ko-fi.com/img/githubbutton_sm.svg" alt="ko-fi"></a>
</p>

<p align="center">
  <a href="https://discord.gg/vRND4Ufzgb"><img src="https://img.shields.io/badge/Discord-Join%20Server-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Discord"></a>
</p>

---

## Features

- 📺 **M3U/M3U8 Playlist Support** - Import local files or URLs
- 🔗 **Xtream Codes API** - Connect to Xtream-compatible providers
- 📖 **EPG Guide** - Electronic Program Guide with XMLTV support
- 🎬 **Live Recording** - Record streams directly to your server
- ⚡ **GPU Transcoding** - Hardware-accelerated video encoding
- 💾 **Persistent Playlists** - Playlists stored on disk, accessible from any device
- 🎨 **Dark/Light Theme** - Customizable interface
- 🐳 **Docker-first** - Designed for self-hosted environments
- 📱 **Responsive** - Works on desktop and mobile browsers

## Quick Start

### NAS Deployment (Pre-built Images)

For NAS systems like Synology, QNAP, or Unraid, use pre-built images from GitHub Container Registry. No need to clone the repo!

1. Create a `docker-compose.yml` file:

```yaml
name: bacalhau

services:
  web:
    image: ghcr.io/filipeneves/bacalhau:latest
    ports:
      - "8456:80"
    depends_on:
      - proxy
      - transcoder
    restart: unless-stopped

  proxy:
    image: ghcr.io/filipeneves/bacalhau-proxy:latest
    ports:
      - "8888:8080"
    restart: unless-stopped

  transcoder:
    # Choose your image based on GPU and architecture:
    # - ghcr.io/filipeneves/bacalhau-transcoder:latest        (CPU only, amd64 + arm64)
    # - ghcr.io/filipeneves/bacalhau-transcoder:latest-vaapi  (AMD/Intel GPU, amd64 only)
    # - ghcr.io/filipeneves/bacalhau-transcoder:latest-nvidia (NVIDIA GPU, amd64 only)
    # ⚠️ ARM NAS (Synology, etc.): Use the CPU-only image (no -vaapi or -nvidia suffix)
    image: ghcr.io/filipeneves/bacalhau-transcoder:latest
    ports:
      - "3001:3001"
    volumes:
      - ./recordings:/recordings
      - ./playlists:/playlists
    # Uncomment for AMD/Intel GPU on x86 systems:
    # devices:
    #   - /dev/dri:/dev/dri
    restart: unless-stopped

volumes:
  recordings:
  playlists:
```

2. Create data directories and start:
```bash
mkdir -p recordings playlists
docker compose up -d
```

3. Access the player at: **http://your-nas-ip:8456**

### Building from Source

1. Clone the repository:
```bash
git clone https://github.com/filipeneves/bacalhau.git
cd bacalhau
```

2. Create data directories:
```bash
mkdir -p recordings playlists
```

3. Start the services:
```bash
docker compose up -d
```

4. Access the player at: **http://localhost:8456**

### Development Mode

For development with hot-reload:
```bash
docker compose --profile dev up dev
```
Then access at: **http://localhost:5173**

### Services

| Service | Port | Description |
|---------|------|-------------|
| **Web UI (prod)** | 8456 | Main player interface |
| **Web UI (dev)** | 5173 | Development server with hot-reload |
| **CORS Proxy** | 8888 | Proxy for cross-origin streams |
| **Transcoder** | 3001 | FFmpeg transcoding & playlist storage |

### Available Images

| Image | Description |
|-------|-------------|
| `ghcr.io/filipeneves/bacalhau:latest` | Web UI (nginx, multi-arch) |
| `ghcr.io/filipeneves/bacalhau-proxy:latest` | CORS proxy (multi-arch) |
| `ghcr.io/filipeneves/bacalhau-transcoder:latest` | CPU-only transcoder (multi-arch) |
| `ghcr.io/filipeneves/bacalhau-transcoder:latest-vaapi` | AMD/Intel GPU transcoder (amd64) |
| `ghcr.io/filipeneves/bacalhau-transcoder:latest-nvidia` | NVIDIA GPU transcoder (amd64) |

## GPU Acceleration

bacalhau supports hardware-accelerated video transcoding for reduced CPU usage and better performance.

### Supported GPU Types

| GPU | Encoder | Docker Config | Requirements |
|-----|---------|---------------|--------------|
| **NVIDIA** | NVENC | `Dockerfile.nvidia` | nvidia-container-toolkit |
| **AMD** | VAAPI | `Dockerfile.vaapi` | /dev/dri device |
| **Intel** | QSV/VAAPI | `Dockerfile.vaapi` | /dev/dri device |
| **Apple** | VideoToolbox | N/A (macOS only) | - |
| **CPU** | libx264 | `Dockerfile` | None |

### NVIDIA GPU Setup

1. Install nvidia-container-toolkit:
```bash
# Ubuntu/Debian
sudo apt install nvidia-container-toolkit
sudo systemctl restart docker
```

2. Update `docker-compose.yml`:
```yaml
transcoder:
  build:
    context: ./transcoder
    dockerfile: Dockerfile.nvidia
  deploy:
    resources:
      reservations:
        devices:
          - driver: nvidia
            count: all
            capabilities: [gpu, video]
```

3. Rebuild and start:
```bash
docker compose down
docker compose build transcoder
docker compose up -d
```

### AMD/Intel GPU Setup (VAAPI)

1. Update `docker-compose.yml`:
```yaml
transcoder:
  build:
    context: ./transcoder
    dockerfile: Dockerfile.vaapi
  devices:
    - /dev/dri:/dev/dri
```

2. Rebuild and start:
```bash
docker compose down
docker compose build transcoder
docker compose up -d
```

### Verify GPU Access

Check if GPU is detected inside the container:

```bash
# For VAAPI (AMD/Intel)
docker exec bacalhau-transcoder-1 vainfo

# Check available encoders
docker exec bacalhau-transcoder-1 ffmpeg -hide_banner -encoders 2>/dev/null | grep -i "vaapi\|nvenc\|qsv"
```

## Configuration

### Environment Variables

Create a `.env` file or set these in your environment:

| Variable | Default | Description |
|----------|---------|-------------|
| `RECORDINGS_PATH` | `./recordings` | Path to store recordings |
| `PLAYLISTS_PATH` | `./playlists` | Path to store playlists |
| `VITE_PROXY_URL` | `http://localhost:8888` | CORS proxy URL |
| `VITE_TRANSCODER_URL` | `http://localhost:3001` | Transcoder service URL |

### Playlist Storage

Playlists are stored on disk (not in browser storage) so they persist across devices and browsers. This is ideal for NAS deployments where you want to access the same playlists from any device on your network.

```bash
# In .env file
PLAYLISTS_PATH=/path/to/your/playlists

# Or inline with docker compose
PLAYLISTS_PATH=/mnt/nas/playlists docker compose up -d
```

### Recording Storage

To customize where recordings are saved, set the `RECORDINGS_PATH` environment variable:

```bash
# In .env file
RECORDINGS_PATH=/path/to/your/recordings

# Or inline with docker compose
RECORDINGS_PATH=/mnt/nas/recordings docker compose up -d
```

### Settings

Access settings via the ⚙️ icon in the player:

- **General** - Theme preferences
- **Playlists** - Manage M3U playlists and Xtream connections
- **Transcoding** - GPU acceleration and quality settings
- **Recording** - View and manage recordings
- **Credits** - Version info and credits

## Codec Support

### Input Formats (Decoding)

| Format | Container | Status |
|--------|-----------|--------|
| H.264/AVC | TS, MP4, MKV | ✅ Supported |
| H.265/HEVC | TS, MP4, MKV | ✅ Supported |
| MPEG-2 | TS | ✅ Supported |
| VP9 | WebM | ✅ Supported |
| AAC | All | ✅ Supported |
| MP3 | All | ✅ Supported |
| AC3/EAC3 | TS | ✅ Supported |

### Output Formats (Encoding)

| GPU | H.264 | H.265 | Notes |
|-----|-------|-------|-------|
| **NVIDIA** | h264_nvenc | hevc_nvenc | GTX 600+ |
| **AMD** | h264_vaapi | hevc_vaapi | RX 400+ |
| **Intel** | h264_qsv / h264_vaapi | hevc_qsv | 6th gen+ |
| **CPU** | libx264 | libx265 | Universal |

### Stream Protocols

| Protocol | Status | Notes |
|----------|--------|-------|
| HLS (.m3u8) | ✅ Native | Direct playback |
| MPEG-TS | ✅ Via transcoder | Converted to HLS |
| HTTP(S) | ✅ Supported | Via CORS proxy |

## Docker Compose Reference

### Full Configuration

```yaml
services:
  dev:
    build:
      context: .
      dockerfile: Dockerfile
      target: development
    ports:
      - "5173:5173"
    environment:
      - VITE_PROXY_URL=http://localhost:8888
      - VITE_TRANSCODER_URL=http://localhost:3001
    depends_on:
      - proxy
      - transcoder

  proxy:
    image: redocly/cors-anywhere
    ports:
      - "8888:8080"

  transcoder:
    build:
      context: ./transcoder
      dockerfile: Dockerfile.vaapi  # or Dockerfile.nvidia
    ports:
      - "3001:3001"
    volumes:
      - ${RECORDINGS_PATH:-./recordings}:/recordings:z
      - ${PLAYLISTS_PATH:-./playlists}:/playlists:z
    devices:
      - /dev/dri:/dev/dri  # For AMD/Intel GPU
    # For NVIDIA, replace devices with:
    # deploy:
    #   resources:
    #     reservations:
    #       devices:
    #         - driver: nvidia
    #           count: all
    #           capabilities: [gpu, video]
```

### Production Deployment

For production, use the `prod` profile:

```bash
docker compose up -d
```

This serves the built static files via nginx on port 8456.

## Troubleshooting

### Stream not playing

1. Check if the transcoder is running:
```bash
docker logs bacalhau-transcoder-1
```

2. Verify CORS proxy is accessible:
```bash
curl http://localhost:8888/https://example.com
```

### GPU not detected

1. Check device permissions:
```bash
ls -la /dev/dri/
```

2. Verify container has access:
```bash
docker exec bacalhau-transcoder-1 ls -la /dev/dri/
```

### High CPU usage

Enable GPU acceleration in Settings → Transcoding and select your GPU type.

## Development

### Prerequisites

- Node.js 20+
- Docker & Docker Compose

### Local Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev
```

### Build for Production

```bash
npm run build
```

## Credits

**bacalhau** is created by [Filipe Neves](mailto:me@filipeneves.net)

- Built with [Vue 3](https://vuejs.org/) + [Vuetify 3](https://vuetifyjs.com/)
- Video playback: [HLS.js](https://github.com/video-dev/hls.js) + [mpegts.js](https://github.com/xqq/mpegts.js)
- Transcoding: [FFmpeg](https://ffmpeg.org/)

## License

MIT License - see [LICENSE](LICENSE) for details.

---

<p align="center">
  🐟 <em>bacalhau</em> means salted codfish in Portuguese<br>
  🇫🇷 Cooked in France & Luxembourg 🇱🇺 by a Portuguese 🇵🇹
</p>
