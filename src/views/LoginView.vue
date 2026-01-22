<template>
    <v-app>
        <v-main class="d-flex align-center justify-center login-background">
            <v-container>
                <v-row justify="center">
                    <v-col cols="12" sm="8" md="6" lg="4">
                        <v-card class="elevation-12 login-card">
                            <v-card-title class="text-center pa-6">
                                <div class="logo-container">
                                    <v-img src="/logo.png" alt="bacalhau" width="80" class="mx-auto mb-4"></v-img>
                                    <h2 class="text-h4 logo-text">bacalhau</h2>
                                    <p class="text-caption subtitle-text mt-2">Authentication Required</p>
                                </div>
                            </v-card-title>

                            <v-card-text class="px-8 pb-2">
                                <v-form @submit.prevent="handleLogin" ref="loginForm">
                                    <v-text-field
                                        v-model="username"
                                        label="Username"
                                        prepend-inner-icon="mdi-account"
                                        variant="outlined"
                                        :error-messages="errors.username"
                                        :disabled="loading"
                                        autofocus
                                        required
                                        class="login-input"
                                        color="green"
                                        base-color="grey-lighten-1"
                                    ></v-text-field>

                                    <v-text-field
                                        v-model="password"
                                        label="Password"
                                        prepend-inner-icon="mdi-lock"
                                        :append-inner-icon="showPassword ? 'mdi-eye-off' : 'mdi-eye'"
                                        :type="showPassword ? 'text' : 'password'"
                                        variant="outlined"
                                        :error-messages="errors.password"
                                        :disabled="loading"
                                        required
                                        class="login-input"
                                        color="green"
                                        base-color="grey-lighten-1"
                                        @click:append-inner="showPassword = !showPassword"
                                        @keyup.enter="handleLogin"
                                    ></v-text-field>

                                    <v-alert
                                        v-if="errorMessage"
                                        type="error"
                                        variant="tonal"
                                        density="compact"
                                        class="mb-4"
                                    >
                                        {{ errorMessage }}
                                    </v-alert>

                                    <v-btn
                                        type="submit"
                                        color="green-darken-2"
                                        size="large"
                                        block
                                        :loading="loading"
                                        :disabled="!username || !password"
                                        class="mt-2 login-button"
                                    >
                                        <v-icon start>mdi-login</v-icon>
                                        Login
                                    </v-btn>
                                </v-form>
                            </v-card-text>

                            <v-card-text class="text-center text-caption version-text pb-4">
                                <p class="mb-0">v{{ version }}</p>
                            </v-card-text>
                        </v-card>
                    </v-col>
                </v-row>
            </v-container>
        </v-main>
    </v-app>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAppStore } from '@/stores/app';
import { getTranscoderUrl } from '@/services/urls.js';

const router = useRouter();
const app = useAppStore();
const transcoderUrl = getTranscoderUrl();

const username = ref('');
const password = ref('');
const showPassword = ref(false);
const loading = ref(false);
const errorMessage = ref('');
const errors = ref({});
const loginForm = ref(null);
const version = ref(app.version);

async function handleLogin() {
    errorMessage.value = '';
    errors.value = {};
    
    if (!username.value || !password.value) {
        errorMessage.value = 'Please enter username and password';
        return;
    }
    
    loading.value = true;
    
    try {
        const response = await fetch(`${transcoderUrl}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                username: username.value,
                password: password.value
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            console.log('[Auth] Login successful');
            // Redirect to main view
            router.push('/player');
        } else {
            errorMessage.value = data.error || 'Login failed';
            console.error('[Auth] Login failed:', data.error);
        }
    } catch (err) {
        console.error('[Auth] Login error:', err);
        errorMessage.value = 'Failed to connect to server';
    } finally {
        loading.value = false;
    }
}
</script>

<style scoped>
.login-background {
    background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 50%, #1a1a1a 100%);
    min-height: 100vh;
}

.login-card {
    background: rgba(30, 30, 30, 0.95) !important;
    border: 1px solid rgba(76, 175, 80, 0.3);
}

.logo-container {
    width: 100%;
}

.logo-text {
    color: #4caf50 !important;
    font-weight: 600;
    text-shadow: 0 0 20px rgba(76, 175, 80, 0.3);
}

.subtitle-text {
    color: #9ccc65 !important;
}

.version-text {
    color: #66bb6a !important;
}

.login-input :deep(.v-field) {
    background-color: rgba(50, 50, 50, 0.6);
    border-color: rgba(76, 175, 80, 0.3);
}

.login-input :deep(.v-field__input) {
    color: #ffffff !important;
}

.login-input :deep(.v-label) {
    color: #9ccc65 !important;
}

.login-input :deep(.v-field--focused) {
    background-color: rgba(60, 60, 60, 0.8);
}

.login-button {
    background: linear-gradient(135deg, #4caf50 0%, #388e3c 100%) !important;
    font-weight: 600;
    letter-spacing: 0.5px;
}

.login-button:hover {
    box-shadow: 0 0 20px rgba(76, 175, 80, 0.4);
}

:deep(.v-theme--dark) .login-card {
    background: rgba(30, 30, 30, 0.95) !important;
}
</style>

