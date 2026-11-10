<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { guestPurchaseLink } from '@/utils/guest-purchase-link'
const props = defineProps<{ accessCode: string }>()
const accessUrl = computed(() => guestPurchaseLink(props.accessCode))
const copied = ref(false),
  copyError = ref(false)
watch(
  () => props.accessCode,
  () => {
    copied.value = false
    copyError.value = false
  },
)
async function copy() {
  copied.value = false
  copyError.value = false
  try {
    await navigator.clipboard.writeText(accessUrl.value)
    copied.value = true
  } catch {
    copyError.value = true
  }
}
</script>
<template>
  <section class="guest-access" aria-label="Enlace privado de tu compra">
    <h2>Guarda el enlace de tu compra</h2>
    <p>
      Usa este enlace para volver a ver tus boletos. Mantenlo privado: quien lo tenga podrá
      consultar esta compra.
    </p>
    <div class="access-actions">
      <a :href="accessUrl" class="access-link" referrerpolicy="no-referrer">Ver mi compra</a>
      <button type="button" class="purchase-action" @click="copy">
        {{ copied ? 'Enlace copiado' : 'Copiar enlace' }}
      </button>
    </div>
    <p v-if="copyError" role="status">
      No se pudo copiar automáticamente. Selecciona el enlace y cópialo para guardarlo.
      <a :href="accessUrl" class="selectable-link" referrerpolicy="no-referrer">{{ accessUrl }}</a>
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
.selectable-link {
  display: block;
  overflow-wrap: anywhere;
  user-select: all;
  color: var(--accent-color);
  margin: 18px 0;
  font-size: 1rem;
}
.access-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 18px;
}
button,
.access-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 10px 18px;
  background: var(--accent-color);
  color: var(--page-background);
  border: 1px solid var(--accent-color);
  border-radius: var(--radius-small);
  font: inherit;
  font-weight: 600;
  text-decoration: none;
}
button:focus-visible,
a:focus-visible {
  outline: 3px solid var(--primary-color);
  outline-offset: 3px;
}
</style>
