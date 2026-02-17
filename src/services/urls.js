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
  
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
      return `http://${hostname}:8888`;
    }
  }
  
  return 'http://localhost:8888';
}
