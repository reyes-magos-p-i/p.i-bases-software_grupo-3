<script setup lang="ts">
import { computed } from 'vue'
import { create } from 'qrcode'

const props = withDefaults(defineProps<{ value: string; label?: string }>(), {
  label: 'Código QR',
})
const symbol = computed(() => {
  try {
    const { modules } = create(props.value, { errorCorrectionLevel: 'M' })
    const cells: string[] = []
    // Four clear modules on every side keep the symbol readable by scanners.
    for (let row = 0; row < modules.size; row++) {
      for (let column = 0; column < modules.size; column++) {
        if (modules.get(row, column)) cells.push(`M${column + 4} ${row + 4}h1v1h-1z`)
      }
    }
    return { size: modules.size + 8, path: cells.join('') }
  } catch {
    return null
  }
})
</script>

<template>
  <figure class="qr-code">
    <svg
      v-if="symbol"
      :viewBox="`0 0 ${symbol.size} ${symbol.size}`"
      role="img"
      :aria-label="label"
      shape-rendering="crispEdges"
    >
      <rect width="100%" height="100%" class="qr-background" />
      <path :d="symbol.path" class="qr-modules" />
    </svg>
    <p v-else role="alert">No se pudo mostrar el código QR.</p>
    <figcaption><slot /></figcaption>
  </figure>
</template>

<style scoped>
.qr-code {
  display: grid;
  justify-items: center;
  gap: 12px;
  margin: 0;
  text-align: center;
}
svg {
  display: block;
  width: min(232px, 100%);
  height: auto;
  aspect-ratio: 1;
}
.qr-background {
  fill: var(--content-background);
}
.qr-modules {
  fill: var(--page-background);
}
figcaption {
  max-width: 30ch;
  font-size: 0.9rem;
  color: var(--text-secondary);
}
p {
  color: var(--error-color);
}
</style>
