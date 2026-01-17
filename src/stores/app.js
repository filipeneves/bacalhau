import { defineStore } from 'pinia';
import { ref } from 'vue';
import { getTranscoderUrl } from '@/services/urls.js';

// Storage key for transcoding settings
const TRANSCODING_SETTINGS_KEY = 'bacalhau_transcoding_settings';

// Get dynamic transcoder URL based on browser location
const defaultTranscoderUrl = getTranscoderUrl();

export const useAppStore = defineStore('app', () => {
    const isLoading = ref(false);
    const isDarkMode = ref(true);
    const isPiP = ref(false);
    const pipSupported = ref(true); // Assume supported until checked
    const isRecording = ref(false);
    const recordingSupported = ref(false); // Recording requires active transcoded stream
    const isPlaying = ref(false);
    const version = ref(import.meta.env.VITE_APP_VERSION || '1.0.0');
    
    // Transcoding settings
    const transcoderUrl = ref(defaultTranscoderUrl);
    const hwAcceleration = ref('cpu'); // cpu, nvenc, qsv, vaapi, amf
    const hwDecoding = ref(true); // Use hardware decoding when available
    const transcodingPreset = ref('fast'); // ultrafast, superfast, veryfast, faster, fast, medium
    const transcodingQuality = ref('balanced'); // performance, balanced, quality

    // Load transcoding settings from localStorage
    function loadTranscodingSettings() {
        try {
            const stored = localStorage.getItem(TRANSCODING_SETTINGS_KEY);
            if (stored) {
                const settings = JSON.parse(stored);
                transcoderUrl.value = settings.transcoderUrl || defaultTranscoderUrl;
                hwAcceleration.value = settings.hwAcceleration || 'cpu';
                hwDecoding.value = settings.hwDecoding !== false;
                transcodingPreset.value = settings.transcodingPreset || 'fast';
                transcodingQuality.value = settings.transcodingQuality || 'balanced';
            }
        } catch (err) {
            console.error('Error loading transcoding settings:', err);
        }
    }

    // Save transcoding settings to localStorage
    function saveTranscodingSettings() {
        try {
            const settings = {
                transcoderUrl: transcoderUrl.value,
                hwAcceleration: hwAcceleration.value,
                hwDecoding: hwDecoding.value,
                transcodingPreset: transcodingPreset.value,
                transcodingQuality: transcodingQuality.value
            };
            localStorage.setItem(TRANSCODING_SETTINGS_KEY, JSON.stringify(settings));
        } catch (err) {
            console.error('Error saving transcoding settings:', err);
        }
    }

    function setTranscoderUrl(value) {
        transcoderUrl.value = value;
        saveTranscodingSettings();
    }

    function setHwAcceleration(value) {
        hwAcceleration.value = value;
        saveTranscodingSettings();
    }

    function setHwDecoding(value) {
        hwDecoding.value = value;
        saveTranscodingSettings();
    }

    function setTranscodingPreset(value) {
        transcodingPreset.value = value;
        saveTranscodingSettings();
    }

    function setTranscodingQuality(value) {
        transcodingQuality.value = value;
        saveTranscodingSettings();
    }

    function setLoading(value) {
        isLoading.value = value;
    }

    function setDarkMode(value) {
        isDarkMode.value = value;
    }

    function setPiP(value) {
        isPiP.value = value;
    }

    function setPipSupported(value) {
        pipSupported.value = value;
    }

    function setRecording(value) {
        isRecording.value = value;
    }

    function setRecordingSupported(value) {
        recordingSupported.value = value;
    }

    function setPlaying(value) {
        isPlaying.value = value;
    }

    // Initialize settings
    loadTranscodingSettings();

    return {
        isLoading,
        setLoading,
        isPiP,
        setPiP,
        pipSupported,
        setPipSupported,
        isRecording,
        setRecording,
        recordingSupported,
        setRecordingSupported,
        isPlaying,
        setPlaying,
        version,
        isDarkMode,
        setDarkMode,
        // Transcoding settings
        transcoderUrl,
        setTranscoderUrl,
        hwAcceleration,
        setHwAcceleration,
        hwDecoding,
        setHwDecoding,
        transcodingPreset,
        setTranscodingPreset,
        transcodingQuality,
        setTranscodingQuality,
    };
});