<template>
    <v-app id="app">
        <div v-show="loading" class="loading">
            <v-progress-circular indeterminate color="primary"></v-progress-circular>
        </div>
        <RouterView />
    </v-app>
</template>

<script>
import { storeToRefs } from 'pinia';
import { useAppStore } from './stores/app';

export default {
    name: 'App',

    setup() {
        const app = useAppStore();
        const { isLoading: loading } = storeToRefs(app);

        return { loading };
    }
}
</script>

<style>
.loading {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 9999;
}
</style>