<script setup lang="ts">
defineProps<{ step: number }>()
const labels = ['Función', 'Asientos', 'Resumen', 'Compra lista']
</script>
<template>
  <nav aria-label="Pasos de compra">
    <ol>
      <li
        v-for="(label, index) in labels"
        :key="label"
        :class="{ current: step === index + 1, completed: step > index + 1 }"
        :aria-current="step === index + 1 ? 'step' : undefined"
      >
        <span>{{ index + 1 }}</span
        >{{ label }}
      </li>
    </ol>
  </nav>
</template>
<style scoped>
ol {
  display: flex;
  justify-content: space-between;
  list-style: none;
  padding: 0;
  gap: 12px;
  margin: 24px 0 32px;
}
li {
  display: grid;
  justify-items: center;
  gap: 8px;
  flex: 1;
  color: var(--text-on-dark-secondary);
  font-size: 0.9rem;
}
li span {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border: 1px solid var(--border-on-dark);
  border-radius: 50%;
}
.current,
.completed {
  color: var(--text-on-dark);
}
.current span,
.completed span {
  background: var(--accent-color);
  color: var(--page-background);
  border-color: var(--accent-color);
}
.current {
  font-weight: 700;
}
@media (max-width: 480px) {
  ol {
    gap: 4px;
  }
  li {
    font-size: 0.75rem;
  }
}
</style>
