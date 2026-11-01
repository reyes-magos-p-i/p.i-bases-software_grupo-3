<script setup lang="ts">
import { computed, reactive, ref, useId, watch } from 'vue'
import ReusableSearchDropdown from '@/components/common/ReusableSearchDropdown.vue'
import type {
  ClientPreferenceSelection,
  ClientPreferenceSettings,
} from '@/types/client-preferences'

const props = defineProps<{ settings: ClientPreferenceSettings; pending?: boolean }>()
const emit = defineEmits<{
  save: [selection: ClientPreferenceSelection]
  cancel: []
  dirty: [dirty: boolean]
}>()
const id = useId()
const draft = reactive<ClientPreferenceSelection>({ genreIds: [], languageIds: [] })
const baseline = ref('')
const errors = reactive<Partial<Record<keyof ClientPreferenceSelection, string>>>({})
const normalized = (selection: ClientPreferenceSelection) => ({
  genreIds: [...selection.genreIds].sort((a, b) => a - b),
  languageIds: [...selection.languageIds].sort((a, b) => a - b),
})
watch(
  () => props.settings,
  (settings) => {
    Object.assign(draft, normalized(settings.selected))
    baseline.value = JSON.stringify(normalized(settings.selected))
    delete errors.genreIds
    delete errors.languageIds
  },
  { immediate: true },
)
const dirty = computed(() => JSON.stringify(normalized(draft)) !== baseline.value)
watch(dirty, (value) => emit('dirty', value), { immediate: true })
const displayOptions = (options: ClientPreferenceSettings['genres']) =>
  options.map((option) => ({
    value: option.id,
    label: option.name.charAt(0).toLocaleUpperCase('es') + option.name.slice(1),
  }))
const groups = computed(() => [
  {
    key: 'genreIds' as const,
    label: 'Géneros cinematográficos',
    options: props.settings.genres,
    empty: 'No hay géneros disponibles en este momento.',
  },
  {
    key: 'languageIds' as const,
    label: 'Idiomas de las películas',
    options: props.settings.languages,
    empty: 'No hay idiomas disponibles en este momento.',
  },
])

function submit() {
  if (props.pending) return
  for (const group of groups.value) {
    delete errors[group.key]
    const values = draft[group.key]
    if (
      new Set(values).size !== values.length ||
      values.some((value) => !group.options.some((option) => option.id === value))
    ) {
      errors[group.key] =
        'Una de las opciones ya no está disponible. Vuelve a cargar tus preferencias.'
    } else if (values.length > props.settings.maxSelections) {
      errors[group.key] =
        `Selecciona como máximo ${props.settings.maxSelections} ${props.settings.maxSelections === 1 ? 'opción' : 'opciones'}.`
    }
  }
  if (Object.keys(errors).length) return
  emit('save', normalized(draft))
}
function clear(key: keyof ClientPreferenceSelection) {
  draft[key] = []
  delete errors[key]
}
</script>

<template>
  <form class="preferences-form" novalidate :aria-busy="pending" @submit.prevent="submit">
    <h2>Preferencias</h2>
    <p>
      Selecciona los géneros e idiomas que más te gustan. Las películas que coincidan aparecerán
      primero en el portal; las demás seguirán disponibles.
    </p>
    <p class="preferences-note">
      Puedes dejar ambas selecciones vacías. Estos idiomas corresponden a las películas y no cambian
      el idioma registrado de tu cuenta.
    </p>
    <fieldset
      v-for="group in groups"
      :key="group.key"
      :disabled="pending"
      :aria-describedby="`${id}-${group.key}-error`"
    >
      <legend>{{ group.label }}</legend>
      <div class="selection-heading">
        <span>Seleccionados: {{ draft[group.key].length }}</span
        ><button
          type="button"
          :disabled="pending || !draft[group.key].length"
          @click="clear(group.key)"
        >
          Limpiar selección
        </button>
      </div>
      <ReusableSearchDropdown
        v-if="group.options.length"
        v-model="draft[group.key]"
        :options="displayOptions(group.options)"
        :label="`Seleccionar ${group.key === 'genreIds' ? 'géneros' : 'idiomas'}`"
        placeholder="Buscar o seleccionar…"
        :name="group.key"
        :disabled="pending"
        :max-selections="settings.maxSelections"
        :min-search-length="0"
        compact
        @update:model-value="delete errors[group.key]"
      />
      <p v-else class="empty-options">{{ group.empty }}</p>
      <p :id="`${id}-${group.key}-error`" class="field-error" aria-live="polite">
        {{ errors[group.key] }}
      </p>
    </fieldset>
    <div class="preferences-actions">
      <button type="button" :disabled="pending" @click="emit('cancel')">Cancelar</button
      ><button type="submit" class="primary" :disabled="pending">
        {{ pending ? 'Guardando…' : 'Guardar preferencias' }}
      </button>
    </div>
  </form>
</template>

<style scoped>
h2 {
  font-size: 1.5rem;
  font-weight: 700;
}
p {
  color: var(--text-secondary);
  line-height: 1.6;
}
.preferences-note {
  padding: 0.9rem 1rem;
  border-radius: var(--radius-small);
  background: var(--info-background);
}
fieldset {
  border: 0;
  padding: 0;
  margin: 1.5rem 0 0;
  min-width: 0;
}
legend {
  font-size: 1.1rem;
  font-weight: 700;
  margin-bottom: 0.4rem;
}
.selection-heading {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
  color: var(--text-secondary);
  font-size: 0.9rem;
}
.selection-heading button {
  padding: 0.3rem 0.65rem;
  font-size: 0.85rem;
}
.field-error {
  color: var(--error-color);
  font-size: 0.875rem;
  margin: 0.5rem 0 0;
}
.preferences-actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 1.5rem;
}
button {
  min-height: 44px;
  padding: 0.65rem 1rem;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-small);
  background: var(--button-secondary-background);
  color: var(--button-secondary-text);
  font-weight: 600;
}
.primary {
  background: var(--button-confirm-background);
  color: var(--button-confirm-text);
  border-color: transparent;
}
button:focus-visible {
  outline: 2px solid var(--focus-color);
  outline-offset: 2px;
}
:disabled {
  opacity: 0.65;
  cursor: default;
}
</style>
