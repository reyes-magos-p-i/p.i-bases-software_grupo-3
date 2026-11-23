<script setup lang="ts">
import { computed, useId } from 'vue'
import DatePicker from '@/components/common/DatePicker.vue'
import { validDate } from '@/utils/date-only'

// SCRUM-437: release and presale dates decide the portal section (Cartelera, Preventas, Estrenos).
const releaseDate = defineModel<string>('releaseDate', { required: true })
const presaleStart = defineModel<string>('presaleStart', { required: true })
const props = defineProps<{
  releaseDateError?: string
  presaleStartError?: string
  disabled?: boolean
}>()
const emit = defineEmits<{ 'clear-error': [field: 'releaseDate' | 'presaleStart'] }>()
const id = useId()

// The presale must start before the release, so the latest valid day is the day before it.
const presaleMax = computed(() => {
  if (!validDate(releaseDate.value)) return ''
  const day = new Date(releaseDate.value + 'T00:00:00Z')
  day.setUTCDate(day.getUTCDate() - 1)
  return day.toISOString().slice(0, 10)
})

function describedBy(field: 'release' | 'presale', error?: string) {
  return `${id}-${field}-hint` + (error ? ` ${id}-${field}-error` : '')
}
</script>

<template>
  <div class="schedule-fields">
    <div class="schedule-field">
      <label :for="`${id}-release`">Fecha de estreno</label>
      <DatePicker
        :id="`${id}-release`"
        v-model="releaseDate"
        name="releaseDate"
        :disabled="props.disabled"
        :aria-invalid="!!props.releaseDateError"
        :aria-describedby="describedBy('release', props.releaseDateError)"
        @update:model-value="emit('clear-error', 'releaseDate')"
      />
      <small :id="`${id}-release-hint`" class="field-hint">
        Opcional. Sin fecha, la película se muestra en Cartelera.
      </small>
      <small
        v-if="props.releaseDateError"
        :id="`${id}-release-error`"
        class="field-error"
        role="alert"
      >
        {{ props.releaseDateError }}
      </small>
    </div>

    <div class="schedule-field">
      <label :for="`${id}-presale`">Inicio de preventa</label>
      <DatePicker
        :id="`${id}-presale`"
        v-model="presaleStart"
        name="presaleStart"
        :max="presaleMax"
        :disabled="props.disabled"
        :aria-invalid="!!props.presaleStartError"
        :aria-describedby="describedBy('presale', props.presaleStartError)"
        @update:model-value="emit('clear-error', 'presaleStart')"
      />
      <small :id="`${id}-presale-hint`" class="field-hint">
        Opcional. Desde ese día se vende en Preventas, antes del estreno.
      </small>
      <small
        v-if="props.presaleStartError"
        :id="`${id}-presale-error`"
        class="field-error"
        role="alert"
      >
        {{ props.presaleStartError }}
      </small>
    </div>
  </div>
</template>

<style scoped>
.schedule-fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr));
  gap: 16px;
}

.schedule-field {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 6px;
}

.schedule-field label {
  font-weight: 500;
}

.field-hint {
  color: var(--text-secondary);
  font-size: 0.875rem;
}

.field-error {
  color: var(--error-color);
  font-size: 0.875rem;
}
</style>
