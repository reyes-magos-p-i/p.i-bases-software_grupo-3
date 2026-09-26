<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'

defineProps<{ open: boolean; title: string }>()
const emit = defineEmits<{ (e: 'close'): void }>()

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="app-modal-backdrop" @click.self="emit('close')">
      <div class="app-modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <button class="app-modal-close" type="button" aria-label="Cerrar" @click="emit('close')">
          <i class="bi bi-x-lg"></i>
        </button>
        <h2 id="modal-title" class="app-modal-title">{{ title }}</h2>
        <slot />
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.app-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  overflow-y: auto;
  padding: 1rem;
}
.app-modal-card {
  position: relative;
  background: #fff;
  width: 100%;
  max-width: 480px;
  padding: 2rem 1.75rem;
  border-radius: 8px;
}
.app-modal-close {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  background: none;
  border: 0;
  font-size: 1.25rem;
}
.app-modal-title {
  text-align: center;
  font-style: italic;
  font-weight: 700;
  font-size: 1.5rem;
  margin-bottom: 1.25rem;
}
</style>