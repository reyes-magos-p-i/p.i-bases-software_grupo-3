<script setup lang="ts">
import { onMounted, useTemplateRef, watch } from 'vue'
import TheaterDialogShell from './TheaterDialogShell.vue'
import type { Theater } from '@/types/theater'

const props = defineProps<{ theater: Theater | null }>()
const emit = defineEmits<{ close: [] }>()
const shell = useTemplateRef('shell')

function syncDialog() {
  if (props.theater) shell.value?.open()
  else shell.value?.close()
}

onMounted(syncDialog)
watch(() => props.theater, syncDialog, { flush: 'post' })
</script>

<template>
  <TheaterDialogShell ref="shell" title="Detalle de sala" close-label="Cerrar" @close="emit('close')">
    <div v-if="theater" class="theater-detail-content">
      <div class="detail-grid">
        <div class="readonly-field"><label>ID</label><div class="readonly-input">{{ theater.theaterId }}</div></div>
        <div class="readonly-field"><label>Sucursal</label><div class="readonly-input">{{ theater.cinema }}</div></div>
        <div class="readonly-field"><label>Número de asientos</label><div class="readonly-input">{{ theater.numberOfSeats }}</div></div>
        <div class="dimension-grid">
          <div class="readonly-field"><label>Filas</label><div class="readonly-input">{{ theater.dimensionX }}</div></div>
          <div class="readonly-field"><label>Columnas</label><div class="readonly-input">{{ theater.dimensionY }}</div></div>
        </div>
        <div class="readonly-field"><label>Proyector</label><div class="readonly-input">{{ theater.projectorName }}</div></div>
        <div class="readonly-field"><label>Estado</label><div class="readonly-input">{{ theater.isActive ? theater.status : 'Inactiva' }}</div></div>
      </div>
      <footer class="dialog-actions">
        <button type="button" class="secondary-button" @click="shell?.close(); emit('close')">Cerrar</button>
      </footer>
    </div>
  </TheaterDialogShell>
</template>

<style scoped>
.theater-detail-content { display: grid; gap: 8px; padding: 24px; overflow-y: auto; font: inherit; }
.detail-grid { display: grid; gap: 8px; }
.dimension-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 8px; }
.readonly-field { display: grid; gap: 8px; }
.readonly-input { min-height: 42px; padding: 8px 10px; border: 1px solid #a9adb5; border-radius: var(--radius-small); font: inherit; background: #f7f7f8; }
.dialog-actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 24px; }
.secondary-button { min-height: 42px; padding: 9px 16px; border: 1px solid var(--color-primary); border-radius: var(--radius-small); color: var(--color-primary); background: var(--color-white); font: inherit; }
@media (max-width: 520px) { .dimension-grid { grid-template-columns: 1fr; } }
</style>
