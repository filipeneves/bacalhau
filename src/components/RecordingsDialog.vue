<template>
    <v-dialog v-model="model" max-width="900" scrollable>
        <v-card class="recordings-dialog">
            <v-card-title class="d-flex align-center">
                <v-icon class="mr-2">mdi-folder-play</v-icon>
                Recordings
                <v-spacer></v-spacer>
                <v-btn icon variant="text" @click="loadRecordings" :loading="loading">
                    <v-icon>mdi-refresh</v-icon>
                </v-btn>
                <v-btn icon variant="text" @click="close">
                    <v-icon>mdi-close</v-icon>
                </v-btn>
            </v-card-title>
            <v-divider></v-divider>
            <v-card-text class="pa-0">
                <!-- Loading state -->
                <div v-if="loading" class="d-flex justify-center align-center pa-8">
                    <v-progress-circular indeterminate color="primary"></v-progress-circular>
                </div>

                <!-- Error state -->
                <v-alert v-else-if="error" type="error" variant="tonal" class="ma-4">
                    {{ error }}
                </v-alert>

                <!-- Empty state -->
                <div v-else-if="recordings.length === 0" class="d-flex flex-column justify-center align-center pa-8 text-center">
                    <v-icon size="64" color="grey">mdi-folder-play-outline</v-icon>
                    <p class="text-h6 mt-4">No recordings yet</p>
                    <p class="text-caption text-grey">Start recording a channel to see your recordings here.</p>
                </div>

                <!-- Recordings list -->
                <v-list v-else lines="two" class="recordings-list">
                    <v-list-item
                        v-for="recording in recordings"
                        :key="recording.filename"
                        class="recording-item"
                    >
                        <template v-slot:prepend>
                            <v-avatar color="primary" variant="tonal">
                                <v-icon>mdi-video</v-icon>
                            </v-avatar>
                        </template>

                        <v-list-item-title>{{ formatFilename(recording.filename) }}</v-list-item-title>
                        <v-list-item-subtitle>
                            <v-chip size="x-small" class="mr-2">{{ formatSize(recording.size) }}</v-chip>
                            <span class="text-caption">{{ formatDate(recording.created) }}</span>
                        </v-list-item-subtitle>

                        <template v-slot:append>
                            <v-btn 
                                icon 
                                variant="text" 
                                color="primary"
                                @click="downloadRecording(recording.filename)"
                                :loading="downloadingFile === recording.filename"
                                title="Download"
                            >
                                <v-icon>mdi-download</v-icon>
                            </v-btn>
                            <v-btn 
                                icon 
                                variant="text" 
                                color="error"
                                @click="confirmDelete(recording)"
                                title="Delete"
                            >
                                <v-icon>mdi-delete</v-icon>
                            </v-btn>
                        </template>
                    </v-list-item>
                </v-list>
            </v-card-text>

            <!-- Footer with storage info -->
            <v-divider v-if="recordings.length > 0"></v-divider>
            <v-card-actions v-if="recordings.length > 0">
                <span class="text-caption text-grey ml-2">
                    {{ recordings.length }} recording{{ recordings.length !== 1 ? 's' : '' }} 
                    ({{ formatSize(totalSize) }} total)
                </span>
                <v-spacer></v-spacer>
                <v-btn variant="text" @click="close">Close</v-btn>
            </v-card-actions>
        </v-card>

        <!-- Delete confirmation dialog -->
        <v-dialog v-model="showDeleteConfirm" max-width="400">
            <v-card>
                <v-card-title>Delete Recording?</v-card-title>
                <v-card-text>
                    Are you sure you want to delete "{{ recordingToDelete?.filename }}"? 
                    This action cannot be undone.
                </v-card-text>
                <v-card-actions>
                    <v-spacer></v-spacer>
                    <v-btn variant="text" @click="showDeleteConfirm = false">Cancel</v-btn>
                    <v-btn color="error" variant="flat" @click="deleteRecording" :loading="deleting">
                        Delete
                    </v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>
    </v-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue';

const model = defineModel({ type: Boolean, default: false });

const TRANSCODER_URL = 'http://localhost:3001';

const recordings = ref([]);
const loading = ref(false);
const error = ref(null);
const downloadingFile = ref(null);
const showDeleteConfirm = ref(false);
const recordingToDelete = ref(null);
const deleting = ref(false);

const totalSize = computed(() => {
    return recordings.value.reduce((sum, r) => sum + r.size, 0);
});

// Load recordings when dialog opens
watch(model, (isOpen) => {
    if (isOpen) {
        loadRecordings();
    }
});

async function loadRecordings() {
    loading.value = true;
    error.value = null;
    
    try {
        const response = await fetch(`${TRANSCODER_URL}/recordings`);
        if (!response.ok) {
            throw new Error('Failed to fetch recordings');
        }
        recordings.value = await response.json();
    } catch (err) {
        console.error('Error loading recordings:', err);
        error.value = 'Failed to load recordings. Make sure the transcoder service is running.';
        recordings.value = [];
    } finally {
        loading.value = false;
    }
}

function formatFilename(filename) {
    // Remove extension and clean up timestamp
    return filename
        .replace(/\.mp4$/, '')
        .replace(/_/g, ' ')
        .replace(/T(\d{2})-(\d{2})-(\d{2})-\d+Z$/, ' ($1:$2)');
}

function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString();
}

async function downloadRecording(filename) {
    downloadingFile.value = filename;
    
    try {
        const response = await fetch(`${TRANSCODER_URL}/recordings/${encodeURIComponent(filename)}`);
        if (!response.ok) {
            throw new Error('Download failed');
        }
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    } catch (err) {
        console.error('Error downloading recording:', err);
        error.value = 'Failed to download recording';
    } finally {
        downloadingFile.value = null;
    }
}

function confirmDelete(recording) {
    recordingToDelete.value = recording;
    showDeleteConfirm.value = true;
}

async function deleteRecording() {
    if (!recordingToDelete.value) return;
    
    deleting.value = true;
    
    try {
        const response = await fetch(
            `${TRANSCODER_URL}/recordings/${encodeURIComponent(recordingToDelete.value.filename)}`,
            { method: 'DELETE' }
        );
        
        if (!response.ok) {
            throw new Error('Delete failed');
        }
        
        // Remove from list
        recordings.value = recordings.value.filter(
            r => r.filename !== recordingToDelete.value.filename
        );
        
        showDeleteConfirm.value = false;
        recordingToDelete.value = null;
    } catch (err) {
        console.error('Error deleting recording:', err);
        error.value = 'Failed to delete recording';
    } finally {
        deleting.value = false;
    }
}

function close() {
    model.value = false;
}
</script>

<style scoped>
.recordings-dialog {
    display: flex;
    flex-direction: column;
    max-height: 80vh;
}

.recordings-list {
    max-height: 60vh;
    overflow-y: auto;
}

.recording-item {
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.recording-item:last-child {
    border-bottom: none;
}

:deep(.v-theme--light) .recording-item {
    border-bottom-color: rgba(0, 0, 0, 0.05);
}
</style>
