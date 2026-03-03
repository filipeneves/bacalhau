// Dynamic URL resolution for services
// In production, services run on the same host as the web UI but different ports

export function getTranscoderUrl() {
  // If explicitly set via env var, use that
  const envUrl = import.meta.env.VITE_TRANSCODER_URL;
  if (envUrl && envUrl !== 'http://localhost:3001') {
    return envUrl;
  }
  
  // In production builds, use relative /api path (goes through nginx proxy)
  if (typeof window !== 'undefined' && import.meta.env.PROD) {
    const baseUrl = `${window.location.protocol}//${window.location.host}`;
    const apiUrl = `${baseUrl}/api`;
    console.log('[ViTV] Using API URL:', apiUrl);
    return apiUrl;
  }
  
  // Development mode - direct connection to transcoder
  console.log('[ViTV] Using direct transcoder URL: http://localhost:3001');
  return 'http://localhost:3001';
}

export function getProxyUrl() {
  const envUrl = import.meta.env.VITE_PROXY_URL;
  if (envUrl && envUrl !== 'http://localhost:8888') {
    return envUrl;
  }
  
  // In production, route through nginx proxy endpoint (same domain/port/protocol)
  if (typeof window !== 'undefined' && import.meta.env.PROD) {
    const baseUrl = `${window.location.protocol}//${window.location.host}`;
    return `${baseUrl}/proxy`;
  }
  
  // Development mode - direct connection to CORS proxy
  return 'http://localhost:8888';
}

export function getWebSocketUrl() {
  if (typeof window !== 'undefined' && import.meta.env.PROD) {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsProtocol}//${window.location.host}/ws`;
  }
  // Development mode - direct connection to transcoder WS
  return 'ws://localhost:3001/ws';
}
