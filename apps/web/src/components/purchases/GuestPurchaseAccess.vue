<script setup lang="ts">
import { ref } from 'vue'
const props = defineProps<{ accessCode: string }>()
const copied = ref(false),
  copyError = ref(false)
async function copy() {
  copied.value = false
  copyError.value = false
  try {
    await navigator.clipboard.writeText(props.accessCode)
    copied.value = true
  } catch {
    copyError.value = true
  }
}
</script>
<template>
  <section class="guest-access" aria-label="Código privado de consulta">
    <h2>Guarda tu código de consulta</h2>
    <p>
      Lo necesitarás para ver tus boletos desde «Consultar compra» en el pie de página. Mantenlo
      privado: quien lo tenga podrá consultar esta compra.
    </p>
    <code>{{ accessCode }}</code>
    <button type="button" class="purchase-action" @click="copy">
      {{ copied ? 'Código copiado' : 'Copiar código' }}
    </button>
    <p v-if="copyError" role="status">
      No se pudo copiar automáticamente. Selecciona el código y cópialo para guardarlo.
    </p>
  </section>
</template>
<style scoped>
.guest-access {
  margin: 24px 0;
  padding: 24px;
  border-radius: var(--radius-medium);
  background: var(--surface-background);
  color: var(--text-on-dark);
  border: 1px solid var(--border-on-dark);
}
code {
  display: block;
  overflow-wrap: anywhere;
  user-select: all;
  color: var(--accent-color);
  margin: 18px 0;
  font-size: 1rem;
}
button {
  min-height: 44px;
  padding: 10px 18px;
  background: var(--accent-color);
  color: var(--page-background);
  border: 1px solid var(--accent-color);
  border-radius: var(--radius-small);
  font: inherit;
  font-weight: 600;
}
button:focus-visible {
  outline: 3px solid var(--primary-color);
  outline-offset: 3px;
}
</style>
