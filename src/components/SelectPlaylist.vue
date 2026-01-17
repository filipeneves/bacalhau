<template>
    <v-container>
        <v-card class="pa-5" elevation="4">
            <v-card-title class="text-h5">Load Playlist</v-card-title>

            <v-card-text>
                <v-text-field v-model="playlistUrl" label="Playlist URL" placeholder="https://example.com/playlist.m3u"
                    prepend-icon="mdi-link" clearable></v-text-field>

                <v-divider class="mb-4">OR</v-divider>

                <v-file-input label="Upload Playlist (.m3u)" accept=".m3u" prepend-icon="mdi-file-upload"
                    @change="handlePlaylistUpload"></v-file-input>

                <v-btn color="primary" block class="mb-4">Import Playlist</v-btn>
            </v-card-text>
        </v-card>
        <v-card v-show="channels.length > 0" class="pa-5" elevation="4"></v-card>
    </v-container>
</template>

<script>
import { parse } from "iptv-playlist-parser";
import { useAppStore } from "@/stores/app";
import { usePlaylistStore } from "@/stores/playlist";

export default {
    name: 'SelectPlaylist',
    data() {
        return {
            playlistUrl: '',
            fileContent: '',
            channels: [],
        };
    },
    methods: {
        handlePlaylistUpload(event) {
            // send loading event
            const app = useAppStore();
            const playlist = usePlaylistStore();
            app.setLoading(true);

            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();

            reader.onload = (e) => {
                this.fileContent = e.target.result;
                this.channels = this.parseM3U(this.fileContent);
                playlist.loadPlaylist(this.channels);
                app.setLoading(false);
            };

            reader.onerror = (e) => {
                console.error('Error reading file:', e);
                app.setLoading(false);
            };

            reader.readAsText(file, 'UTF-8');
        },

        parseM3U(text) {
            const result = parse(text);
            return result.items.map((item) => ({
                name: item.name,
                url: item.url,
                logo: item.tvg.logo,
                type: 'mpegts',
            }));
        }
    },
}
</script>

<style></style>