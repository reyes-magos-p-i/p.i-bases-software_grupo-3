<script setup lang="ts">
import { computed } from 'vue'
const props = withDefaults(defineProps<{ step: number; labels?: string[] }>(), {
  labels: () => ['Función', 'Asientos', 'Resumen', 'Compra lista'],
})
const labels = computed(() => (props.labels.length ? props.labels : ['Compra']))
const currentStep = computed(() => Math.max(1, Math.min(labels.value.length, props.step)))
const progress = computed(() =>
  labels.value.length < 2
    ? '0%'
    : `${((currentStep.value - 1) / (labels.value.length - 1)) * 100}%`,
)
</script>
<template>
  <nav
    aria-label="Pasos de compra"
    :style="{ '--step-count': labels.length, '--step-inset': `${50 / labels.length}%` }"
  >
    <div class="step-track" aria-hidden="true">
      <div class="step-progress" :style="{ width: progress }" />
    </div>
    <ol>
      <li
        v-for="(label, index) in labels"
        :key="label"
        :class="{ current: currentStep === index + 1, completed: currentStep > index + 1 }"
        :aria-current="currentStep === index + 1 ? 'step' : undefined"
      >
        <span>{{ index + 1 }}</span
        >{{ label }}
      </li>
    </ol>
  </nav>
</template>
<style scoped>
nav {
  position: relative;
  margin: 24px 0 32px;
}
.step-track {
  position: absolute;
  inset: 16px var(--step-inset) auto;
  height: 4px;
  background: var(--border-on-dark);
}
.step-progress {
  height: 100%;
  background: var(--accent-color);
  transition: width var(--transition-normal);
}
ol {
  display: grid;
  grid-template-columns: repeat(var(--step-count), minmax(0, 1fr));
  list-style: none;
  padding: 0;
  margin: 0;
}
li {
  display: grid;
  justify-items: center;
  gap: 8px;
  position: relative;
  min-width: 0;
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
  background: var(--page-background);
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
  li {
    font-size: 0.75rem;
  }
}
@media (prefers-reduced-motion: reduce) {
  .step-progress {
    transition: none;
  }
}
</style>
