<template>
    <v-app>
        <v-navigation-drawer ></v-navigation-drawer>

        <v-app-bar>
            <v-app-bar-title>bacalhau</v-app-bar-title>
        </v-app-bar>

        <v-main>
            <SelectPlaylist />
        </v-main>
    </v-app>
</template>

<script>
import SelectPlaylist from '@/components/SelectPlaylist.vue';

export default {
    name: 'SetupView',
    components: { SelectPlaylist },
    data: () => ({ drawer: null }),
}
</script>