// Dynamic URL resolution for services
// In production, services run on the same host as the web UI but different ports

export function getTranscoderUrl() {
  // If explicitly set via env var, use that
  const envUrl = import.meta.env.VITE_TRANSCODER_URL;
  if (envUrl && envUrl !== 'http://localhost:3001') {
    return envUrl;
  }
  
  // In production (not localhost dev server), use the same host
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    // If accessing from a real IP/hostname (not localhost dev), use that host
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
      return `http://${hostname}:3001`;
    }
  }
  
  // Default for local development
  return 'http://localhost:3001';
}

export function getProxyUrl() {
  const envUrl = import.meta.env.VITE_PROXY_URL;
  if (envUrl && envUrl !== 'http://localhost:8888') {
    return envUrl;
  }
  
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
      return `http://${hostname}:8888`;
    }
  }
  
  return 'http://localhost:8888';
}
