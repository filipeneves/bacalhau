import { createRouter, createWebHashHistory } from 'vue-router';
import SetupView from '@/views/SetupView.vue';
import MainView from '@/views/MainView.vue';
import { usePlaylistStore } from '@/stores/playlist';

const routes = [
    {
        path: '/',
        redirect: '/player',
    },
    {
        path: '/setup',
        name: 'Setup',
        component: SetupView,
    },
    {
        path: '/player',
        name: 'Player',
        component: MainView
    },
];

const router = createRouter({
    history: createWebHashHistory(),
    routes,
});

// Middlewares - ensure that if a playlist isn't loaded, the user must go to the setup page
router.beforeEach((to, from, next) => {
    if (to.name !== 'Setup') {
        const playlistStore = usePlaylistStore();
        if (!playlistStore.isPlaylistLoaded) {
            return next({ name: 'Setup' });
        } 
    }
    next();
});

export default router;