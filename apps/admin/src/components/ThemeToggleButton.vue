<script setup lang="ts">
import { computed } from "vue";

import { useThemeStore } from "@/stores/theme";

const themeStore = useThemeStore();
const themeClass = computed(() => (themeStore.isDark ? "is-light" : "is-dark"));
const themeLabel = computed(() => (themeStore.isDark ? "切换为浅色模式" : "切换为暗色模式"));
</script>

<template>
  <el-button
    class="theme-toggle-button"
    :class="themeClass"
    text
    native-type="button"
    :aria-label="themeLabel"
    :title="themeLabel"
    aria-live="polite"
    @click.stop="themeStore.toggle"
  >
    <svg aria-hidden="true" height="24" viewBox="0 0 24 24" width="24">
      <mask id="theme-toggle-moon" class="theme-toggle__moon">
        <rect fill="white" height="100%" width="100%" x="0" y="0" />
        <circle cx="40" cy="8" fill="black" r="11" />
      </mask>
      <circle
        class="theme-toggle__sun"
        cx="12"
        cy="12"
        fill="currentColor"
        mask="url(#theme-toggle-moon)"
        r="11"
      />
      <g class="theme-toggle__sun-beams" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="12" x2="12" y1="1" y2="3" />
        <line x1="12" x2="12" y1="21" y2="23" />
        <line x1="4.22" x2="5.64" y1="4.22" y2="5.64" />
        <line x1="18.36" x2="19.78" y1="18.36" y2="19.78" />
        <line x1="1" x2="3" y1="12" y2="12" />
        <line x1="21" x2="23" y1="12" y2="12" />
        <line x1="4.22" x2="5.64" y1="19.78" y2="18.36" />
        <line x1="18.36" x2="19.78" y1="5.64" y2="4.22" />
      </g>
    </svg>
  </el-button>
</template>

<style scoped>
.theme-toggle-button {
  color: var(--ax-primary);
  border: 0;
  background: transparent;
}

.theme-toggle-button:hover {
  color: var(--ax-primary);
}

.theme-toggle-button:hover > svg {
  animation: theme-toggle-shrink 0.3s ease-in-out;
}

.theme-toggle__moon > circle {
  transition: transform 0.5s cubic-bezier(0, 0, 0.3, 1);
}

.theme-toggle__sun {
  transform-origin: center;
  transition: transform 1.6s cubic-bezier(0.25, 0, 0.2, 1);
}

.theme-toggle__sun-beams {
  transform-origin: center;
  transition:
    transform 1.6s cubic-bezier(0.5, 1.5, 0.75, 1.25),
    opacity 0.6s cubic-bezier(0.25, 0, 0.3, 1);
}

.theme-toggle-button.is-light .theme-toggle__sun {
  transform: scale(0.5);
}

.theme-toggle-button.is-light .theme-toggle__sun-beams {
  transform: rotate(90deg);
}

.theme-toggle-button.is-dark .theme-toggle__moon > circle {
  transform: translateX(-20px);
}

.theme-toggle-button.is-dark .theme-toggle__sun-beams {
  opacity: 0;
}

@keyframes theme-toggle-shrink {
  50% {
    transform: scale(0.82);
  }
}
</style>
