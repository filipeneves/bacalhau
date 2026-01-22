import { createRouter, createWebHashHistory } from 'vue-router';
import SetupView from '@/views/SetupView.vue';
import MainView from '@/views/MainView.vue';
import LoginView from '@/views/LoginView.vue';
import { usePlaylistStore } from '@/stores/playlist';
import { getTranscoderUrl } from '@/services/urls.js';

const transcoderUrl = getTranscoderUrl();

const routes = [
    {
        path: '/',
        redirect: '/player',
    },
    {
        path: '/login',
        name: 'Login',
        component: LoginView,
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

// Check authentication status
async function checkAuth() {
    try {
        const response = await fetch(`${transcoderUrl}/auth/status`, {
            credentials: 'include'
        });
        const data = await response.json();
        return data;
    } catch (err) {
        console.error('[Router] Error checking auth:', err);
        return { authEnabled: false, authenticated: true };
    }
}

// Middlewares
router.beforeEach(async (to, from, next) => {
    // Check authentication first (if enabled)
    const authStatus = await checkAuth();
    
    if (authStatus.authEnabled && !authStatus.authenticated) {
        // Auth is enabled and user is not authenticated
        if (to.name !== 'Login') {
            console.log('[Router] Redirecting to login - authentication required');
            return next({ name: 'Login' });
        }
        return next();
    }
    
    // If already on login page and authenticated, redirect to player
    if (to.name === 'Login' && authStatus.authenticated) {
        return next({ name: 'Player' });
    }
    
    // Check if playlist is loaded (unless going to Setup or Login)
    if (to.name !== 'Setup' && to.name !== 'Login') {
        const playlistStore = usePlaylistStore();
        if (!playlistStore.isPlaylistLoaded) {
            return next({ name: 'Setup' });
        } 
    }
    
    next();
});

export default router;