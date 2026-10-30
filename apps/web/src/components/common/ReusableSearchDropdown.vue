<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, useId, watch } from 'vue'

interface DropdownOption {
  value: number
  label: string
}
const props = withDefaults(
  defineProps<{
    options: DropdownOption[]
    label: string
    placeholder?: string
    disabled?: boolean
    minSearchLength?: number
    compact?: boolean
    maxSelections?: number
    name?: string
  }>(),
  {
    placeholder: 'Seach...',
    disabled: false,
    minSearchLength: 2,
    compact: false,
    maxSelections: Number.POSITIVE_INFINITY,
  },
)
const selected = defineModel<number[]>({ default: () => [] })
const id = useId()
const search = ref('')
const isOpen = ref(false)
const root = ref<HTMLElement | null>(null)
const filteredOptions = computed(() => {
  const query = search.value.trim().toLocaleLowerCase('es')
  if (query.length < props.minSearchLength) return []
  return props.options.filter((option) => option.label.toLocaleLowerCase('es').includes(query))
})
const selectedOptions = computed(() =>
  props.options.filter((option) => selected.value.includes(option.value)),
)
const visibleSelection = computed(() =>
  props.compact ? selectedOptions.value.slice(0, 3) : selectedOptions.value,
)
const expanded = computed(
  () => isOpen.value && !props.disabled && search.value.trim().length >= props.minSearchLength,
)

function open() {
  if (!props.disabled) isOpen.value = true
}
function close(restoreFocus = false) {
  if (restoreFocus) root.value?.querySelector<HTMLInputElement>('.search-input')?.focus()
  isOpen.value = false
}
function toggleMenu() {
  if (expanded.value) close()
  else open()
}
function toggleOption(value: number) {
  if (props.disabled) return
  if (selected.value.includes(value)) selected.value = selected.value.filter((id) => id !== value)
  else if (selected.value.length < props.maxSelections) selected.value = [...selected.value, value]
  search.value = ''
}
function removeOption(value: number) {
  if (!props.disabled) selected.value = selected.value.filter((id) => id !== value)
}
function handleClickOutside(event: Event) {
  if (root.value && !root.value.contains(event.target as Node)) close()
}
function handleFocusOut(event: FocusEvent) {
  if (!root.value?.contains(event.relatedTarget as Node | null)) close()
}
watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) close()
  },
)
onMounted(() => document.addEventListener('pointerdown', handleClickOutside))
onUnmounted(() => document.removeEventListener('pointerdown', handleClickOutside))
</script>

<template>
  <div
    ref="root"
    class="search-dropdown"
    :class="{ compact }"
    @focusout="handleFocusOut"
    @keydown.esc.stop.prevent="close(true)"
  >
    <label :for="`${id}-search`">{{ label }}</label>
    <div class="selected-options">
      <div class="search-control">
        <input
          :id="`${id}-search`"
          v-model="search"
          class="search-input"
          type="search"
          autocomplete="off"
          :placeholder="placeholder"
          :disabled="disabled"
          :aria-controls="expanded ? `${id}-options` : undefined"
          @focus="open"
          @click="open"
          @input="open"
        />
        <button
          v-if="compact"
          class="toggle-options"
          type="button"
          :disabled="disabled"
          :aria-label="`${expanded ? 'Cerrar' : 'Mostrar'} opciones de ${label}`"
          :aria-expanded="expanded"
          :aria-controls="expanded ? `${id}-options` : undefined"
          @click="toggleMenu"
        >
          <i class="bi bi-chevron-down" aria-hidden="true"></i>
        </button>
      </div>
      <span v-for="option in visibleSelection" :key="option.value" class="selected-option">
        {{ option.label }}
        <button
          class="remove-option"
          type="button"
          :disabled="disabled"
          :aria-label="`Quitar ${option.label}`"
          @click.stop="removeOption(option.value)"
        >
          ×
        </button>
      </span>
      <span
        v-if="compact && selectedOptions.length > visibleSelection.length"
        class="selection-overflow"
        >y {{ selectedOptions.length - visibleSelection.length }} más</span
      >
    </div>
    <ul v-if="expanded" :id="`${id}-options`" class="dropdown-options" :aria-label="label">
      <li v-for="option in filteredOptions" :key="option.value" class="dropdown-option">
        <label :for="`${id}-option-${option.value}`">
          <input
            :id="`${id}-option-${option.value}`"
            type="checkbox"
            :name="name"
            :value="option.value"
            :checked="selected.includes(option.value)"
            :disabled="selected.length >= maxSelections && !selected.includes(option.value)"
            @change="toggleOption(option.value)"
          />
          <span>{{ option.label }}</span>
        </label>
      </li>
      <li v-if="filteredOptions.length === 0" class="dropdown-empty">
        No se encontraron resultados
      </li>
    </ul>
  </div>
</template>

<style scoped>
.search-dropdown {
  position: relative;
  width: 100%;
  min-width: 0;
}

.search-dropdown label {
  display: block;
  margin-bottom: 6px;
  font-weight: 500;
}

.search-input {
  box-sizing: border-box;
  width: 100%;
  min-height: 44px;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-small);
  background: var(--content-background);
  color: var(--text-primary);
  font: inherit;
}

.search-control {
  position: relative;
  width: 100%;
}

.compact .search-input {
  padding-right: 44px;
}

.toggle-options {
  position: absolute;
  right: 0;
  top: 0;
  width: 44px;
  height: 44px;
  border: 0;
  border-radius: var(--radius-small);
  background: transparent;
  color: var(--text-primary);
}

.selection-overflow {
  align-self: center;
  color: var(--text-secondary);
  font-size: 0.875rem;
}

.selected-option {
  max-width: 100%;
  overflow-wrap: anywhere;
}

.selected-options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}

.selected-option {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-small);
  background: var(--content-background);
  color: var(--text-primary);
}

.remove-option {
  border: none;
  padding: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.toggle-options:focus-visible,
.search-input:focus-visible,
.remove-option:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}

.dropdown-options {
  position: absolute;
  top: 100%;
  left: 0;
  width: 100%;
  box-sizing: border-box;
  z-index: 100;

  margin: 4px 0 0;
  padding: 4px 0;
  max-height: 220px;
  overflow-y: auto;

  list-style: none;
  background: var(--content-background);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-small);
  box-shadow: 0 4px 12px var(--shadow-color);
  animation: dropdown-open 160ms ease-out;
}

.dropdown-option label {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  padding: 10px 12px;

  font: inherit;
  color: var(--text-primary);
  cursor: pointer;
}

.dropdown-option:hover {
  background: var(--surface-hover);
}

.dropdown-option input[type='checkbox'] {
  width: 18px;
  height: 18px;
  margin: 0;
  flex-shrink: 0;
  accent-color: var(--primary-color);
  cursor: pointer;
}

.dropdown-option:focus-within {
  outline: 2px solid var(--primary-color);
  outline-offset: -2px;
}

.dropdown-empty {
  padding: 10px 12px;
  color: var(--text-secondary);
}

@keyframes dropdown-open {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .dropdown-options {
    animation: none;
  }
}
</style>
