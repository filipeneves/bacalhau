<template>
    <div class="danmaku-overlay" ref="overlayRef">
        <!-- Floating messages -->
        <div
            v-for="msg in activeMessages"
            :key="msg.id"
            class="danmaku-message"
            :style="{
                top: msg.top + 'px',
                color: msg.color,
                animationDuration: msg.duration + 's',
                fontSize: isMobile ? '14px' : '18px'
            }"
            @animationend="removeMessage(msg.id)"
        >
            {{ msg.text }}
        </div>

        <!-- Send message UI -->
        <div class="danmaku-input-area" :class="{ 'visible': inputVisible, 'mobile': isMobile }">
            <div class="danmaku-input-wrapper">
                <input
                    ref="inputRef"
                    v-model="messageText"
                    class="danmaku-input"
                    placeholder="Send a message..."
                    maxlength="200"
                    @keyup.enter="sendMessage"
                    @focus="inputFocused = true"
                    @blur="inputFocused = false"
                />
                <!-- Color picker -->
                <input
                    type="color"
                    v-model="messageColor"
                    class="danmaku-color-picker"
                    title="Message color"
                />
                <v-btn
                    icon
                    size="small"
                    variant="text"
                    color="white"
                    @click="sendMessage"
                    :disabled="!messageText.trim()"
                    class="danmaku-send-btn"
                >
                    <v-icon size="20">mdi-send</v-icon>
                </v-btn>
            </div>
        </div>

        <!-- Toggle button -->
        <v-btn
            icon
            size="small"
            variant="text"
            class="danmaku-toggle-btn"
            :class="{ 'mobile': isMobile }"
            @click.stop="toggleInput"
            title="Send danmaku message"
        >
            <v-icon :color="inputVisible ? 'primary' : 'white'" size="22">mdi-message-text-outline</v-icon>
        </v-btn>
    </div>
</template>

<script>
import { ref, reactive, onBeforeUnmount, computed } from 'vue';

export default {
    name: 'DanmakuOverlay',
    props: {
        isMobile: {
            type: Boolean,
            default: false
        }
    },
    emits: ['send'],
    
    setup(props, { emit }) {
        const overlayRef = ref(null);
        const inputRef = ref(null);
        const inputVisible = ref(false);
        const inputFocused = ref(false);
        const messageText = ref('');
        const messageColor = ref('#FFFFFF');
        const activeMessages = ref([]);
        
        // Track used vertical positions to avoid overlap
        let nextTrack = 0;
        const TRACK_HEIGHT = 36; // px between message tracks
        const MAX_TRACKS = 12;

        function getNextTop() {
            const overlayHeight = overlayRef.value?.clientHeight || 400;
            const maxTracks = Math.min(MAX_TRACKS, Math.floor((overlayHeight * 0.65) / TRACK_HEIGHT));
            const track = nextTrack % maxTracks;
            nextTrack++;
            return 20 + track * TRACK_HEIGHT; // Start 20px from top
        }

        function addMessage(msg) {
            const message = {
                id: msg.id || Date.now().toString(),
                text: msg.sender ? `${msg.sender}: ${msg.text}` : msg.text,
                color: msg.color || '#FFFFFF',
                top: getNextTop(),
                duration: 8 + Math.random() * 4 // 8-12 seconds
            };
            activeMessages.value.push(message);
        }

        function removeMessage(id) {
            activeMessages.value = activeMessages.value.filter(m => m.id !== id);
        }

        function toggleInput() {
            inputVisible.value = !inputVisible.value;
            if (inputVisible.value) {
                setTimeout(() => inputRef.value?.focus(), 100);
            }
        }

        function sendMessage() {
            const text = messageText.value.trim();
            if (!text) return;
            
            emit('send', { text, color: messageColor.value });
            messageText.value = '';
        }

        // Auto-hide input after inactivity
        let hideTimer = null;
        function resetHideTimer() {
            if (hideTimer) clearTimeout(hideTimer);
            if (!inputFocused.value) {
                hideTimer = setTimeout(() => {
                    if (!inputFocused.value) {
                        inputVisible.value = false;
                    }
                }, 10000);
            }
        }

        onBeforeUnmount(() => {
            if (hideTimer) clearTimeout(hideTimer);
        });

        return {
            overlayRef,
            inputRef,
            inputVisible,
            inputFocused,
            messageText,
            messageColor,
            activeMessages,
            addMessage,
            removeMessage,
            toggleInput,
            sendMessage
        };
    }
};
</script>

<style scoped>
.danmaku-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    pointer-events: none;
    overflow: hidden;
    z-index: 10;
}

.danmaku-message {
    position: absolute;
    right: -100%;
    white-space: nowrap;
    font-weight: 600;
    text-shadow: 
        1px 1px 2px rgba(0, 0, 0, 0.8),
        -1px -1px 2px rgba(0, 0, 0, 0.8),
        1px -1px 2px rgba(0, 0, 0, 0.8),
        -1px 1px 2px rgba(0, 0, 0, 0.8);
    animation: danmaku-scroll linear forwards;
    pointer-events: none;
    user-select: none;
    z-index: 11;
}

@keyframes danmaku-scroll {
    0% {
        transform: translateX(0);
        right: -100%;
    }
    100% {
        transform: translateX(-200vw);
        right: -100%;
    }
}

.danmaku-toggle-btn {
    position: absolute;
    bottom: 60px;
    right: 12px;
    pointer-events: auto;
    background: rgba(0, 0, 0, 0.5) !important;
    backdrop-filter: blur(4px);
    z-index: 15;
}

.danmaku-toggle-btn.mobile {
    bottom: 16px;
    right: 8px;
}

.danmaku-input-area {
    position: absolute;
    bottom: 60px;
    left: 50%;
    transform: translateX(-50%);
    pointer-events: auto;
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.2s ease, visibility 0.2s ease;
    z-index: 15;
}

.danmaku-input-area.visible {
    opacity: 1;
    visibility: visible;
}

.danmaku-input-area.mobile {
    bottom: 16px;
    left: 8px;
    right: 50px;
    transform: none;
    width: auto;
}

.danmaku-input-wrapper {
    display: flex;
    align-items: center;
    gap: 6px;
    background: rgba(0, 0, 0, 0.75);
    backdrop-filter: blur(8px);
    border-radius: 24px;
    padding: 4px 8px 4px 16px;
    border: 1px solid rgba(255, 255, 255, 0.15);
}

.danmaku-input {
    background: transparent;
    border: none;
    outline: none;
    color: white;
    font-size: 14px;
    width: 250px;
    max-width: 50vw;
}

.danmaku-input::placeholder {
    color: rgba(255, 255, 255, 0.5);
}

.danmaku-color-picker {
    width: 24px;
    height: 24px;
    border: none;
    border-radius: 50%;
    cursor: pointer;
    background: transparent;
    padding: 0;
    flex-shrink: 0;
}

.danmaku-color-picker::-webkit-color-swatch-wrapper {
    padding: 0;
}

.danmaku-color-picker::-webkit-color-swatch {
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-radius: 50%;
}

.danmaku-send-btn {
    flex-shrink: 0;
}
</style>
