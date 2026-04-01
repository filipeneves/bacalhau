import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { apiFetch } from '@/services/api'

export const useEpgStore = defineStore('epg', () => {
    const epgData = ref({}); // channelId -> programs array
    const isLoaded = ref(false);
    const isLoading = ref(false);
    const isExpanded = ref(false);
    const epgUrl = ref('');

    // Parse XMLTV format EPG data
    function parseXMLTV(xmlString) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlString, 'text/xml');
        
        const programmes = doc.querySelectorAll('programme');
        const channels = doc.querySelectorAll('channel');
        
        // Build channel name map
        const channelNames = {};
        channels.forEach(channel => {
            const id = channel.getAttribute('id');
            const displayName = channel.querySelector('display-name');
            if (id && displayName) {
                channelNames[id] = displayName.textContent;
            }
        });
        
        // Parse programmes
        const programsByChannel = {};
        
        programmes.forEach(prog => {
            const channelId = prog.getAttribute('channel');
            const start = parseXMLTVDate(prog.getAttribute('start'));
            const stop = parseXMLTVDate(prog.getAttribute('stop'));
            const title = prog.querySelector('title')?.textContent || 'Unknown';
            const desc = prog.querySelector('desc')?.textContent || '';
            const category = prog.querySelector('category')?.textContent || '';
            const icon = prog.querySelector('icon')?.getAttribute('src') || '';
            
            if (!programsByChannel[channelId]) {
                programsByChannel[channelId] = [];
            }
            
            programsByChannel[channelId].push({
                channelId,
                channelName: channelNames[channelId] || channelId,
                start,
                stop,
                title,
                description: desc,
                category,
                icon,
                duration: (stop - start) / 1000 / 60 // duration in minutes
            });
        });
        
        // Sort programs by start time
        Object.keys(programsByChannel).forEach(channelId => {
            programsByChannel[channelId].sort((a, b) => a.start - b.start);
        });
        
        return programsByChannel;
    }
    
    // Parse XMLTV date format: 20240116120000 +0000
    function parseXMLTVDate(dateStr) {
        if (!dateStr) return null;
        
        // Remove timezone part and parse
        const match = dateStr.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
        if (!match) return null;
        
        const [, year, month, day, hour, minute, second] = match;
        
        // Handle timezone offset if present
        const tzMatch = dateStr.match(/([+-])(\d{2})(\d{2})$/);
        let tzOffset = 0;
        if (tzMatch) {
            const sign = tzMatch[1] === '+' ? 1 : -1;
            tzOffset = sign * (parseInt(tzMatch[2]) * 60 + parseInt(tzMatch[3]));
        }
        
        const date = new Date(Date.UTC(
            parseInt(year),
            parseInt(month) - 1,
            parseInt(day),
            parseInt(hour),
            parseInt(minute),
            parseInt(second)
        ));
        
        // Adjust for timezone
        date.setMinutes(date.getMinutes() - tzOffset);
        
        return date;
    }

    async function loadEpg(url) {
        if (!url) return;
        
        isLoading.value = true;
        epgUrl.value = url;
        
        try {
            const response = await apiFetch('/fetch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            });
            const data = await response.json();
            let text = data.content;
            
            // Handle gzipped content
            if (url.endsWith('.gz')) {
                const pako = await import('pako');
                const encoder = new TextEncoder();
                const compressed = encoder.encode(text);
                text = pako.ungzip(compressed, { to: 'string' });
            }
            
            epgData.value = parseXMLTV(text);
            isLoaded.value = true;
            console.log('EPG loaded with', Object.keys(epgData.value).length, 'channels');
        } catch (error) {
            console.error('Failed to load EPG:', error);
        } finally {
            isLoading.value = false;
        }
    }

    function loadEpgFromString(xmlString) {
        try {
            epgData.value = parseXMLTV(xmlString);
            isLoaded.value = true;
            console.log('EPG loaded from string with', Object.keys(epgData.value).length, 'channels');
        } catch (error) {
            console.error('Failed to parse EPG:', error);
        }
    }

    function toggleExpanded() {
        isExpanded.value = !isExpanded.value;
    }

    function setExpanded(value) {
        isExpanded.value = value;
    }

    // Get programs for a specific channel
    function getProgramsForChannel(channelId) {
        // Try exact match first
        if (epgData.value[channelId]) {
            return epgData.value[channelId];
        }
        
        // Try case-insensitive match
        const lowerChannelId = channelId?.toLowerCase();
        for (const id of Object.keys(epgData.value)) {
            if (id.toLowerCase() === lowerChannelId) {
                return epgData.value[id];
            }
        }
        
        return [];
    }

    // Get current program for a channel
    function getCurrentProgram(channelId) {
        const programs = getProgramsForChannel(channelId);
        const now = new Date();
        
        return programs.find(p => p.start <= now && p.stop > now);
    }

    // Get upcoming programs for a channel
    function getUpcomingPrograms(channelId, limit = 5) {
        const programs = getProgramsForChannel(channelId);
        const now = new Date();
        
        return programs.filter(p => p.start > now).slice(0, limit);
    }

    // Get past programs for a channel (for timeshift/catchup)
    function getPastPrograms(channelId, limit = 20) {
        const programs = getProgramsForChannel(channelId);
        const now = new Date();
        
        return programs.filter(p => p.stop <= now).slice(-limit);
    }

    // Get programs within a time range
    function getProgramsInRange(channelId, startTime, endTime) {
        const programs = getProgramsForChannel(channelId);
        if (!programs.length) return [];

        // Programs are already sorted by start in XMLTV data. Filter overlapping window.
        const result = [];
        const seenKeys = new Set();

        for (const p of programs) {
            // Skip programs entirely outside the window
            if (p.stop <= startTime) continue;
            if (p.start >= endTime) break; // sorted, so nothing further will match

            // Deduplicate by start+title
            const key = `${p.start.getTime()}-${p.title}`;
            if (seenKeys.has(key)) continue;
            seenKeys.add(key);

            // Skip programs fully contained inside the previous one
            if (result.length > 0) {
                const prev = result[result.length - 1];
                if (p.start < prev.stop && p.stop <= prev.stop) continue;
            }

            result.push(p);
        }

        return result;
    }

    const getEpgData = computed(() => epgData.value);
    const getIsLoaded = computed(() => isLoaded.value);
    const getIsExpanded = computed(() => isExpanded.value);
    const channelIds = computed(() => Object.keys(epgData.value));

    return {
        epgData,
        isLoaded,
        isLoading,
        isExpanded,
        epgUrl,
        loadEpg,
        loadEpgFromString,
        toggleExpanded,
        setExpanded,
        getProgramsForChannel,
        getCurrentProgram,
        getUpcomingPrograms,
        getPastPrograms,
        getProgramsInRange,
        getEpgData,
        getIsLoaded,
        getIsExpanded,
        channelIds
    };
});
