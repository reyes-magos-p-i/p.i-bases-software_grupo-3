<script setup lang="ts">
defineProps<{ message: string }>()
</script>

<template>
  <div class="loading-state" role="status" aria-live="polite" aria-atomic="true">
    <svg class="loading-indicator" viewBox="40 40 248 248" aria-hidden="true" focusable="false">
      <path
        d="
          M 276 228
          Q 178 228 169 226.5
          Q 160 225 152 221.5
          Q 144 218 134.5 210
          Q 125 202 120 194
          Q 115 186 112.5 175.5
          Q 110 165 110.5 157
          Q 111 149 112.5 144
          Q 114 139 117.5 132.5
          Q 121 126 126 120.5
          Q 131 115 132 115
          Q 133 115 137.5 111
          Q 142 107 148.5 104
          Q 155 101 163 99
          Q 171 97 203 97
          L 235 97
          L 285 46
          Q 160 46 147.5 49
          Q 135 52 125 56.5
          Q 115 61 114.5 62
          Q 114 63 107.5 66.5
          Q 101 70 99.5 72
          Q 98 74 97 74
          Q 96 74 87.5 82.5
          Q 79 91 79 92
          Q 79 93 77.5 94
          Q 76 95 76 96
          Q 76 97 72 102
          Q 68 107 64.5 114
          Q 61 121 58.5 128.5
          Q 56 136 54.5 144.5
          Q 53 153 53 164.5
          Q 53 176 55.5 186.5
          Q 58 197 63 207
          Q 68 217 69 217.5
          Q 70 218 72 222
          Q 74 226 76 227.5
          Q 78 229 78 230
          Q 78 231 80.5 233
          Q 83 235 83 236
          Q 83 237 95 247.5
          Q 107 258 117.5 263.5
          Q 128 269 136.5 271.5
          Q 145 274 150.5 275
          Q 156 276 171.5 276
          Q 187 276 199 273.5
          Q 211 271 223 266
          Q 235 261 235.5 260
          Q 236 259 242 256
          Q 248 253 253.5 248
          Q 259 243 260 243
          Q 261 243 268.5 235.5
          Z
        "
      />
    </svg>
    <p class="loading-message">{{ message }}</p>
  </div>
</template>

<style scoped>
.loading-state {
  display: grid;
  width: 100%;
  min-height: clamp(17rem, 40vh, 26rem);
  place-content: center;
  justify-items: center;
  gap: 1.25rem;
  padding: 2rem;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-medium);
  background: var(--table-background);
  color: var(--text-primary);
}

.loading-indicator {
  display: block;
  width: 96px;
  height: 96px;
  fill: var(--page-background);
  animation: loading-reveal 1.67s ease-in-out infinite;
  animation-delay: -0.26s;
}

.loading-message {
  margin: 0;
  font-size: 0.95rem;
  line-height: 1.5;
  text-align: center;
  overflow-wrap: anywhere;
}

@keyframes loading-reveal {
  0%,
  9.58% {
    clip-path: inset(100% 0 0);
  }
  33.53%,
  59.88% {
    clip-path: inset(0);
  }
  83.83%,
  100% {
    clip-path: inset(100% 0 0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .loading-indicator {
    animation: none;
    clip-path: none;
  }
}
</style>
