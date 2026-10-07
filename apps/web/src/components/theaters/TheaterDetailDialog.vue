<script setup lang="ts">
import BaseModal from '@/components/common/BaseModal.vue'
import type { Theater } from '@/types/theater'

defineProps<{ theater: Theater | null }>()
const emit = defineEmits<{ close: [] }>()

function close() {
  emit('close')
}
</script>

<template>
  <BaseModal :open="theater !== null" title="Detalle de sala" @close="close">
    <div v-if="theater" class="theater-detail-content">
      <dl class="detail-grid">
        <div><dt>ID</dt><dd>S{{ theater.theaterId }}</dd></div>
        <div><dt>Sucursal</dt><dd>{{ theater.branchId }}</dd></div>
        <div><dt>Número de asientos</dt><dd>{{ theater.numberOfSeats }}</dd></div>
        <div><dt>Dimensiones</dt><dd>{{ theater.dimensionX }} x {{ theater.dimensionY }}</dd></div>
        <div><dt>Proyector</dt><dd>{{ theater.projectorName }}</dd></div>
        <div><dt>Estado</dt><dd>{{ theater.isActive ? theater.status : 'Inactiva' }}</dd></div>
      </dl>
      <footer>
        <button type="button" class="detail-button" @click="close">Cerrar</button>
      </footer>
    </div>
  </BaseModal>
</template>

<style scoped>
:global(.app-modal-card:has(.theater-detail-content)) {
  width: min(640px, 100%);
  max-width: 640px;
}
.theater-detail-content { padding: 8px 0 0; }
.detail-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px 20px; margin: 0; }
.detail-grid > div { padding: 12px; border: 1px solid #e3e5e8; border-radius: var(--radius-small); background: var(--color-white); }
dt { color: var(--color-dark); font-size: .8rem; font-weight: 700; }
dd { margin: 4px 0 0; overflow-wrap: anywhere; }
footer { display: flex; justify-content: flex-end; margin-top: 24px; }
.detail-button { min-height: 42px; padding: 9px 16px; border: 1px solid var(--color-primary); border-radius: var(--radius-small); color: var(--color-primary); background: var(--color-white); font: inherit; }
@media (max-width: 520px) { .detail-grid { grid-template-columns: 1fr; } }
</style>
