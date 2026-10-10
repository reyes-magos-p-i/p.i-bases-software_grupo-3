<script setup lang="ts">
import { onBeforeUnmount, onMounted, useId, useTemplateRef, watch } from 'vue'
import type { Theater } from '@/types/theater'

const props = defineProps<{ theater: Theater | null }>()
const emit = defineEmits<{ close: [] }>()
const id = useId()
const dialog = useTemplateRef<HTMLDialogElement>('dialog')
let opener: HTMLElement | null = null

function close() {
  if (dialog.value?.open) dialog.value.close()
  if (opener?.isConnected) opener.focus()
  opener = null
  emit('close')
}

function syncDialog() {
  const element = dialog.value
  if (!element) return
  if (props.theater && !element.open) {
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    element.showModal()
    element.querySelector<HTMLElement>('button:not([disabled])')?.focus()
  } else if (!props.theater && element.open) {
    element.close()
    opener = null
  }
}

onMounted(syncDialog)
watch(() => props.theater, syncDialog, { flush: 'post' })
onBeforeUnmount(() => {
  if (dialog.value?.open) dialog.value.close()
  if (opener?.isConnected) opener.focus()
})
</script>

<template>
  <dialog
    ref="dialog"
    class="theater-dialog"
    :aria-labelledby="id + '-title'"
    @cancel.prevent="close"
  >
    <header class="dialog-heading">
      <h2 :id="id + '-title'">Detalle de sala</h2>
      <button type="button" class="close-button" aria-label="Cerrar" @click="close">
        <i class="bi bi-x-lg" aria-hidden="true"></i>
      </button>
    </header>
    <div v-if="theater" class="theater-detail-content">
      <div class="detail-grid">
        <div class="readonly-field"><label>ID</label><div class="readonly-input">{{ theater.theaterId }}</div></div>
        <div class="readonly-field"><label>Sucursal</label><div class="readonly-input">{{ theater.branchId }}</div></div>
        <div class="readonly-field"><label>Número de asientos</label><div class="readonly-input">{{ theater.numberOfSeats }}</div></div>
        <div class="dimension-grid">
          <div class="readonly-field"><label>Filas</label><div class="readonly-input">{{ theater.dimensionX }}</div></div>
          <div class="readonly-field"><label>Columnas</label><div class="readonly-input">{{ theater.dimensionY }}</div></div>
        </div>
        <div class="readonly-field"><label>Proyector</label><div class="readonly-input">{{ theater.projectorName }}</div></div>
        <div class="readonly-field"><label>Estado</label><div class="readonly-input">{{ theater.isActive ? theater.status : 'Inactiva' }}</div></div>
      </div>
      <footer class="dialog-actions">
        <button type="button" class="secondary-button" @click="close">Cerrar</button>
      </footer>
    </div>
  </dialog>
</template>

<style scoped>
.theater-dialog { position: fixed; top: 50%; left: 50%; width: min(calc(100% - 32px), 620px); max-height: min(90dvh, 760px); margin: 0; padding: 0; border: 0; border-radius: var(--radius-medium); color: var(--color-dark); background: var(--color-white); transform: translate(-50%, -50%); }
.theater-dialog::backdrop { background: color-mix(in srgb, var(--color-black) 55%, transparent); }
.dialog-heading { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 20px 24px; color: var(--color-white); background: var(--color-primary); }
.dialog-heading h2 { margin: 0; font-size: 1.25rem; }
.close-button { display: grid; place-items: center; width: 40px; height: 40px; border: 0; border-radius: var(--radius-small); color: inherit; background: transparent; }
.theater-detail-content { display: grid; gap: 8px; padding: 24px; overflow-y: auto; font: inherit; }
.detail-grid { display: grid; gap: 8px; }
.dimension-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 8px; }
.readonly-field { display: grid; gap: 8px; }
.readonly-input { min-height: 42px; padding: 8px 10px; border: 1px solid #a9adb5; border-radius: var(--radius-small); font: inherit; background: #f7f7f8; }
.dialog-actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 24px; }
.secondary-button { min-height: 42px; padding: 9px 16px; border: 1px solid var(--color-primary); border-radius: var(--radius-small); color: var(--color-primary); background: var(--color-white); font: inherit; }
@media (max-width: 520px) { .dimension-grid { grid-template-columns: 1fr; } }
</style>
