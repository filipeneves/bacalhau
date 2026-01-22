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
                                    <h2 class="text-h4">bacalhau</h2>
                                    <p class="text-caption text-grey mt-2">Authentication Required</p>
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
                                        color="primary"
                                        size="large"
                                        block
                                        :loading="loading"
                                        :disabled="!username || !password"
                                        class="mt-2"
                                    >
                                        <v-icon start>mdi-login</v-icon>
                                        Login
                                    </v-btn>
                                </v-form>
                            </v-card-text>

                            <v-card-text class="text-center text-caption text-grey pb-4">
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
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    min-height: 100vh;
}

.login-card {
    background: rgba(255, 255, 255, 0.95) !important;
}

.logo-container {
    width: 100%;
}

:deep(.v-theme--dark) .login-card {
    background: rgba(30, 30, 30, 0.95) !important;
}
</style>
