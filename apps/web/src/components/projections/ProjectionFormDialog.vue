<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, useId, useTemplateRef, watch } from 'vue'
import placeholderPoster from '@/assets/images/placeholder.svg'
import { stripTrailingSlashes } from '@/services/movieFunctions'
import { searchAvailableMovies } from '@/services/projection.service'
import type {
  AvailableMovie,
  CreateProjectionRequest,
  ProjectionCinema,
  ProjectionTheater,
} from '@/types/projection'
import { addToTime, daysInRange, durationBetween, localNow } from '@/utils/projection-time'

const MAX_DAYS = 31
const SEARCH_DELAY_MS = 300

const props = withDefaults(
  defineProps<{
    cinemas?: readonly ProjectionCinema[]
    theaters?: readonly ProjectionTheater[]
    optionsLoading?: boolean
    optionsError?: string
    submitting?: boolean
    submissionErrors?: readonly string[]
    defaultPrice?: number
  }>(),
  {
    cinemas: () => [],
    theaters: () => [],
    optionsLoading: false,
    optionsError: '',
    submitting: false,
    submissionErrors: () => [],
    defaultPrice: undefined,
  },
)
const emit = defineEmits<{
  retryOptions: []
  submit: [data: CreateProjectionRequest]
  sessionExpired: []
}>()

const id = useId()
const dialog = useTemplateRef<HTMLDialogElement>('dialog')
const imagesBaseUrl = `${stripTrailingSlashes(String(import.meta.env.VITE_API_BASE_URL ?? ''))}/image`

const emptyDraft = () => ({
  movieQuery: '',
  branchId: '',
  theaterId: '',
  status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
  startDate: '',
  endDate: '',
  startTime: '',
  endTime: '',
  cleaningMinutes: '30',
  advertisementMinutes: '15',
  price: props.defaultPrice === undefined ? '' : String(props.defaultPrice),
})
const draft = reactive(emptyDraft())
// The default price arrives with the scheduling options; keep any value already typed.
watch(
  () => props.defaultPrice,
  (price) => {
    if (price !== undefined && draft.price === '') draft.price = String(price)
  },
)
const movie = ref<AvailableMovie | null>(null)
const results = ref<AvailableMovie[]>([])
const searching = ref(false)
const searchError = ref('')
const listOpen = ref(false)
const activeResult = ref(-1)
const endTimeEdited = ref(false)
const posterFailed = ref(false)
const touched = reactive<Record<string, boolean>>({})
const submitted = ref(false)
let searchTimer: ReturnType<typeof setTimeout> | undefined
let searchRequest: AbortController | undefined
let opener: HTMLElement | null = null

const branchTheaters = computed(() =>
  props.theaters.filter((theater) => String(theater.branchId) === String(draft.branchId)),
)
const minimumMinutes = computed(() =>
  movie.value
    ? Number(draft.advertisementMinutes) + movie.value.runningTime + Number(draft.cleaningMinutes)
    : null,
)
const suggestedEndTime = computed(() =>
  draft.startTime && minimumMinutes.value !== null
    ? addToTime(draft.startTime, minimumMinutes.value)
    : '',
)
const posterSource = computed(() =>
  movie.value && !posterFailed.value
    ? `${imagesBaseUrl}/${movie.value.posterImage}`
    : placeholderPoster,
)

function activityError(value: string) {
  const minutes = Number(value)
  return value === '' || !Number.isInteger(minutes) || minutes < 0 || minutes > 240
    ? 'Introduce minutos enteros entre 0 y 240.'
    : ''
}

function scheduleErrors() {
  const result: Record<string, string> = {}
  const now = localNow()
  if (!draft.startDate) result.startDate = 'Selecciona la fecha de la proyección.'
  else if (draft.startDate < now.slice(0, 10))
    result.startDate = 'La fecha de la proyección no puede estar en el pasado.'
  if (draft.endDate && draft.startDate && draft.endDate < draft.startDate)
    result.endDate = 'La fecha final no puede ser anterior a la fecha inicial.'
  else if (draft.endDate && draft.startDate && daysInRange(draft.startDate, draft.endDate) > MAX_DAYS)
    result.endDate = `El rango no puede superar ${MAX_DAYS} días.`
  if (!draft.startTime) result.startTime = 'Selecciona la hora de inicio.'
  else if (!result.startDate && `${draft.startDate}T${draft.startTime}` <= now)
    result.startTime = 'La hora de inicio no puede estar en el pasado.'
  if (!draft.endTime) result.endTime = 'Selecciona la hora de fin.'
  else if (
    draft.startTime &&
    minimumMinutes.value !== null &&
    durationBetween(draft.startTime, draft.endTime) < minimumMinutes.value
  )
    result.endTime = `La hora de fin debe ser igual o posterior a las ${suggestedEndTime.value} (anuncios + película + limpieza).`
  return result
}

const errors = computed(() => {
  const result: Record<string, string> = {}
  if (!movie.value || movie.value.title !== draft.movieQuery)
    result.movie = 'Selecciona una película disponible de la lista.'
  if (!props.cinemas.some((cinema) => String(cinema.branchId) === String(draft.branchId)))
    result.branchId = 'Selecciona una sucursal.'
  if (!branchTheaters.value.some((theater) => String(theater.theaterId) === String(draft.theaterId)))
    result.theaterId = 'Selecciona una sala disponible.'
  Object.assign(result, scheduleErrors())
  const cleaning = activityError(draft.cleaningMinutes)
  if (cleaning) result.cleaningMinutes = cleaning
  const advertisement = activityError(draft.advertisementMinutes)
  if (advertisement) result.advertisementMinutes = advertisement
  const price = Number(draft.price)
  if (draft.price === '' || !(price > 0) || !/^\d+(\.\d{1,2})?$/u.test(draft.price.trim()))
    result.price = 'El precio debe ser un número positivo en colones.'
  return result
})

function visibleError(field: string) {
  return touched[field] || submitted.value ? errors.value[field] : undefined
}

function describedBy(field: string) {
  const ids = [`${id}-${field}-hint`]
  if (visibleError(field)) ids.push(`${id}-${field}-error`)
  return ids.join(' ')
}

const scheduleSummary = computed(() => {
  if (!movie.value || minimumMinutes.value === null) return ''
  const parts = `Anuncios ${draft.advertisementMinutes || 0} min + película ${movie.value.runningTime} min + limpieza ${draft.cleaningMinutes || 0} min = ${minimumMinutes.value} min.`
  if (!draft.startTime || !draft.endTime) return parts
  const nextDay = draft.endTime <= draft.startTime ? ' del día siguiente' : ''
  return `${parts} La sala queda ocupada de ${draft.startTime} a ${draft.endTime}${nextDay}.`
})

function cancelSearch() {
  clearTimeout(searchTimer)
  searchRequest?.abort()
  searchRequest = undefined
  searching.value = false
}

async function runSearch() {
  const request = new AbortController()
  searchRequest = request
  searching.value = true
  searchError.value = ''
  try {
    const found = await searchAvailableMovies(Number(draft.branchId), draft.movieQuery, request.signal)
    if (request.signal.aborted) return
    results.value = found
    activeResult.value = found.length ? 0 : -1
  } catch (error) {
    if (request.signal.aborted) return
    results.value = []
    if ((error as { response?: { status?: number } }).response?.status === 401) emit('sessionExpired')
    else searchError.value = 'No se pudieron buscar películas. Inténtalo nuevamente.'
  } finally {
    if (searchRequest === request) {
      searching.value = false
      searchRequest = undefined
    }
  }
}

function scheduleSearch() {
  cancelSearch()
  if (!draft.branchId || (movie.value && movie.value.title === draft.movieQuery)) return
  searchTimer = setTimeout(() => void runSearch(), SEARCH_DELAY_MS)
}

function movieInput() {
  touched.movie = true
  listOpen.value = true
  if (movie.value && movie.value.title !== draft.movieQuery) movie.value = null
  scheduleSearch()
}

function selectMovie(selected: AvailableMovie) {
  movie.value = selected
  draft.movieQuery = selected.title
  posterFailed.value = false
  listOpen.value = false
  results.value = []
  cancelSearch()
}

function movieKeydown(event: KeyboardEvent) {
  if (!results.value.length) return
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    listOpen.value = true
    const step = event.key === 'ArrowDown' ? 1 : -1
    activeResult.value = (activeResult.value + step + results.value.length) % results.value.length
  } else if (event.key === 'Enter' && listOpen.value && activeResult.value >= 0) {
    event.preventDefault()
    selectMovie(results.value[activeResult.value]!)
  } else if (event.key === 'Escape') {
    listOpen.value = false
  }
}

watch(
  () => draft.branchId,
  () => {
    if (!branchTheaters.value.some((theater) => String(theater.theaterId) === draft.theaterId))
      draft.theaterId = ''
    movie.value = null
    results.value = []
    if (draft.movieQuery) scheduleSearch()
  },
)
watch(suggestedEndTime, (value) => {
  if (value && !endTimeEdited.value) draft.endTime = value
})

function editEndTime() {
  touched.endTime = true
  endTimeEdited.value = draft.endTime !== suggestedEndTime.value
}

function submit() {
  if (props.submitting || props.optionsLoading) return
  submitted.value = true
  if (Object.keys(errors.value).length) {
    void nextTick(() => dialog.value?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
    return
  }
  emit('submit', {
    movieId: movie.value!.movieId,
    theaterId: Number(draft.theaterId),
    startDate: draft.startDate,
    endDate: draft.endDate || draft.startDate,
    startTime: draft.startTime,
    endTime: draft.endTime,
    cleaningMinutes: Number(draft.cleaningMinutes),
    advertisementMinutes: Number(draft.advertisementMinutes),
    price: Number(draft.price),
    status: draft.status,
  })
}

function reset() {
  cancelSearch()
  Object.assign(draft, emptyDraft())
  movie.value = null
  results.value = []
  searchError.value = ''
  endTimeEdited.value = false
  submitted.value = false
  for (const key of Object.keys(touched)) delete touched[key]
}

function open() {
  if (!dialog.value || dialog.value.open) return
  opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
  dialog.value.showModal()
  dialog.value.querySelector<HTMLInputElement>('[name="movie"]')?.focus()
}

function restoreFocus() {
  if (opener?.isConnected) opener.focus()
  opener = null
}

function close() {
  if (props.submitting) return
  cancelSearch()
  dialog.value?.close()
  restoreFocus()
}

function complete() {
  reset()
  dialog.value?.close()
  restoreFocus()
}

onBeforeUnmount(cancelSearch)

defineExpose({ open, complete })
</script>

<template>
  <dialog
    ref="dialog"
    class="projection-dialog"
    :aria-labelledby="id + '-title'"
    @cancel.prevent="close"
  >
    <header class="dialog-heading">
      <h2 :id="id + '-title'">Agregar nueva proyección</h2>
      <button
        type="button"
        class="close-button"
        aria-label="Cerrar formulario"
        :disabled="submitting"
        @click="close"
      >
        <i class="bi bi-x-lg" aria-hidden="true"></i>
      </button>
    </header>
    <form novalidate :aria-busy="submitting" @submit.prevent="submit">
      <p class="required-note">
        Los campos con <span class="required-marker">*</span> son obligatorios.
      </p>
      <p v-if="optionsLoading" class="form-status" role="status">Cargando sucursales y salas…</p>
      <p v-if="optionsError" class="form-error" role="alert">
        {{ optionsError }}
        <button type="button" class="link-button" @click="emit('retryOptions')">Reintentar</button>
      </p>
      <p v-if="submissionErrors.length" class="form-error" role="alert" tabindex="-1">
        {{ submissionErrors.join(' ') }}
      </p>

      <div class="form-body">
        <div class="form-sections">
          <section class="form-section" :aria-labelledby="id + '-place-title'">
            <h3 :id="id + '-place-title'"><span>1</span> Película y sala</h3>
            <div class="section-grid">
              <div class="field">
                <label :for="id + '-branch'">Sucursal <span class="required-marker">*</span></label>
                <select
                  :id="id + '-branch'"
                  v-model="draft.branchId"
                  name="branchId"
                  :aria-invalid="!!visibleError('branchId')"
                  :aria-describedby="describedBy('branchId')"
                  @blur="touched.branchId = true"
                >
                  <option value="">Selecciona una sucursal</option>
                  <option v-for="cinema in cinemas" :key="cinema.branchId" :value="String(cinema.branchId)">
                    {{ cinema.name }}
                  </option>
                </select>
                <small :id="id + '-branchId-hint'" class="field-hint">
                  Define las salas y películas disponibles.
                </small>
                <small v-if="visibleError('branchId')" :id="id + '-branchId-error'" class="field-error">
                  {{ visibleError('branchId') }}
                </small>
              </div>

              <div class="field">
                <label :for="id + '-theater'">Sala <span class="required-marker">*</span></label>
                <select
                  :id="id + '-theater'"
                  v-model="draft.theaterId"
                  name="theaterId"
                  :disabled="!draft.branchId"
                  :aria-invalid="!!visibleError('theaterId')"
                  :aria-describedby="describedBy('theaterId')"
                  @blur="touched.theaterId = true"
                >
                  <option value="">{{ draft.branchId ? 'Selecciona una sala' : 'Elige primero la sucursal' }}</option>
                  <option
                    v-for="theater in branchTheaters"
                    :key="theater.theaterId"
                    :value="String(theater.theaterId)"
                  >
                    Sala {{ theater.theaterId }} ({{ theater.numberOfSeats }} asientos)
                  </option>
                </select>
                <small :id="id + '-theaterId-hint'" class="field-hint">Solo salas activas.</small>
                <small v-if="visibleError('theaterId')" :id="id + '-theaterId-error'" class="field-error">
                  {{ visibleError('theaterId') }}
                </small>
              </div>

              <div class="field">
                <label :for="id + '-status'">Estado</label>
                <select
                  :id="id + '-status'"
                  v-model="draft.status"
                  name="status"
                  :aria-describedby="id + '-status-hint'"
                >
                  <option value="ACTIVE">Activa</option>
                  <option value="INACTIVE">Inactiva</option>
                </select>
                <small :id="id + '-status-hint'" class="field-hint">
                  Activa: visible para la venta de boletos.
                </small>
              </div>

              <div class="field field-wide movie-field">
                <label :for="id + '-movie'">Película <span class="required-marker">*</span></label>
                <div class="search-input">
                  <i class="bi bi-search" aria-hidden="true"></i>
                  <input
                    :id="id + '-movie'"
                    v-model="draft.movieQuery"
                    name="movie"
                    type="search"
                    role="combobox"
                    autocomplete="off"
                    :placeholder="draft.branchId ? 'Escribe el título de la película' : 'Elige primero la sucursal'"
                    :disabled="!draft.branchId"
                    :aria-expanded="listOpen && results.length > 0"
                    :aria-controls="id + '-movies'"
                    :aria-activedescendant="activeResult >= 0 ? `${id}-movie-${activeResult}` : undefined"
                    :aria-invalid="!!visibleError('movie')"
                    :aria-describedby="describedBy('movie')"
                    @input="movieInput"
                    @keydown="movieKeydown"
                    @blur="listOpen = false"
                  />
                </div>
                <ul
                  v-show="listOpen && results.length"
                  :id="id + '-movies'"
                  class="movie-results"
                  role="listbox"
                >
                  <li
                    v-for="(result, index) in results"
                    :id="`${id}-movie-${index}`"
                    :key="result.movieId"
                    role="option"
                    :aria-selected="index === activeResult"
                    :class="{ 'is-active': index === activeResult }"
                    @mousedown.prevent="selectMovie(result)"
                  >
                    {{ result.title }} <span>{{ result.runningTime }} min</span>
                  </li>
                </ul>
                <small :id="id + '-movie-hint'" class="field-hint">
                  Escribe parte del título y elige una opción de la lista (flechas + Enter o clic).
                </small>
                <p v-if="searching" class="field-hint" role="status">Buscando películas…</p>
                <p v-else-if="searchError" class="field-error" role="alert">{{ searchError }}</p>
                <p
                  v-else-if="listOpen && draft.movieQuery && !results.length && !movie"
                  class="field-hint"
                  role="status"
                >
                  No hay películas disponibles con ese nombre en esta sucursal.
                </p>
                <small v-if="visibleError('movie')" :id="id + '-movie-error'" class="field-error">
                  {{ visibleError('movie') }}
                </small>
              </div>

              <p v-if="draft.status === 'INACTIVE'" class="form-warning field-wide" role="status">
                <i class="bi bi-exclamation-triangle" aria-hidden="true"></i>
                La proyección no será visible para los Clientes hasta activarla.
              </p>
            </div>
          </section>

          <section class="form-section" :aria-labelledby="id + '-schedule-title'">
            <h3 :id="id + '-schedule-title'"><span>2</span> Fecha y horario</h3>
            <div class="section-grid two-columns">
              <div class="field">
                <label :for="id + '-start-date'">Fecha <span class="required-marker">*</span></label>
                <input
                  :id="id + '-start-date'"
                  v-model="draft.startDate"
                  name="startDate"
                  type="date"
                  :min="localNow().slice(0, 10)"
                  :aria-invalid="!!visibleError('startDate')"
                  :aria-describedby="describedBy('startDate')"
                  @blur="touched.startDate = true"
                />
                <small :id="id + '-startDate-hint'" class="field-hint">Primer día de la proyección.</small>
                <small v-if="visibleError('startDate')" :id="id + '-startDate-error'" class="field-error">
                  {{ visibleError('startDate') }}
                </small>
              </div>
              <div class="field">
                <label :for="id + '-end-date'">Repetir hasta (opcional)</label>
                <input
                  :id="id + '-end-date'"
                  v-model="draft.endDate"
                  name="endDate"
                  type="date"
                  :min="draft.startDate || localNow().slice(0, 10)"
                  :aria-invalid="!!visibleError('endDate')"
                  :aria-describedby="describedBy('endDate')"
                  @blur="touched.endDate = true"
                />
                <small :id="id + '-endDate-hint'" class="field-hint">
                  Crea una proyección por día a la misma hora (máximo {{ MAX_DAYS }} días).
                </small>
                <small v-if="visibleError('endDate')" :id="id + '-endDate-error'" class="field-error">
                  {{ visibleError('endDate') }}
                </small>
              </div>

              <div class="field">
                <label :for="id + '-start-time'">Hora inicio <span class="required-marker">*</span></label>
                <input
                  :id="id + '-start-time'"
                  v-model="draft.startTime"
                  name="startTime"
                  type="time"
                  :aria-invalid="!!visibleError('startTime')"
                  :aria-describedby="describedBy('startTime')"
                  @blur="touched.startTime = true"
                />
                <small :id="id + '-startTime-hint'" class="field-hint">Inicio de los anuncios.</small>
                <small v-if="visibleError('startTime')" :id="id + '-startTime-error'" class="field-error">
                  {{ visibleError('startTime') }}
                </small>
              </div>
              <div class="field">
                <label :for="id + '-end-time'">Hora fin <span class="required-marker">*</span></label>
                <input
                  :id="id + '-end-time'"
                  v-model="draft.endTime"
                  name="endTime"
                  type="time"
                  :aria-invalid="!!visibleError('endTime')"
                  :aria-describedby="describedBy('endTime')"
                  @change="editEndTime"
                  @blur="touched.endTime = true"
                />
                <small :id="id + '-endTime-hint'" class="field-hint">
                  Se calcula sola; puedes ampliarla, no reducirla.
                </small>
                <small v-if="visibleError('endTime')" :id="id + '-endTime-error'" class="field-error">
                  {{ visibleError('endTime') }}
                </small>
              </div>
            </div>
          </section>

          <section class="form-section" :aria-labelledby="id + '-times-title'">
            <h3 :id="id + '-times-title'"><span>3</span> Tiempos de la función</h3>
            <div class="minutes-grid">
              <div class="field minutes-field">
                <label :for="id + '-advertisement'">Anuncios</label>
                <input
                  :id="id + '-advertisement'"
                  v-model="draft.advertisementMinutes"
                  name="advertisementMinutes"
                  type="number"
                  min="0"
                  max="240"
                  step="1"
                  :aria-invalid="!!visibleError('advertisementMinutes')"
                  @blur="touched.advertisementMinutes = true"
                />
                <span>minutos</span>
              </div>
              <i class="bi bi-plus-lg timeline-operator" aria-hidden="true"></i>
              <div class="field minutes-field">
                <label :for="id + '-duration'">Película</label>
                <input :id="id + '-duration'" :value="movie?.runningTime ?? '—'" type="text" readonly />
                <span>minutos</span>
              </div>
              <i class="bi bi-plus-lg timeline-operator" aria-hidden="true"></i>
              <div class="field minutes-field">
                <label :for="id + '-cleaning'">Limpieza</label>
                <input
                  :id="id + '-cleaning'"
                  v-model="draft.cleaningMinutes"
                  name="cleaningMinutes"
                  type="number"
                  min="0"
                  max="240"
                  step="1"
                  :aria-invalid="!!visibleError('cleaningMinutes')"
                  @blur="touched.cleaningMinutes = true"
                />
                <span>minutos</span>
              </div>
            </div>
            <small
              v-if="visibleError('cleaningMinutes') || visibleError('advertisementMinutes')"
              class="field-error"
            >
              {{ visibleError('cleaningMinutes') || visibleError('advertisementMinutes') }}
            </small>
            <p class="schedule-summary" aria-live="polite">
              <i class="bi bi-clock-history" aria-hidden="true"></i>
              {{ scheduleSummary || 'Selecciona una película para calcular el tiempo total de la función.' }}
            </p>
          </section>

          <section class="form-section" :aria-labelledby="id + '-price-title'">
            <h3 :id="id + '-price-title'"><span>4</span> Precio</h3>
            <div class="field price-field">
              <label :for="id + '-price'">Precio por persona <span class="required-marker">*</span></label>
              <div class="currency-input">
                <span aria-hidden="true">₡</span>
                <input
                  :id="id + '-price'"
                  v-model="draft.price"
                  name="price"
                  type="text"
                  inputmode="decimal"
                  placeholder="4500"
                  :aria-invalid="!!visibleError('price')"
                  :aria-describedby="describedBy('price')"
                  @blur="touched.price = true"
                />
              </div>
              <small :id="id + '-price-hint'" class="field-hint">
                Por persona, en colones.
                <template v-if="defaultPrice !== undefined">
                  Precio por defecto: ₡{{ defaultPrice }}; puedes modificarlo.
                </template>
              </small>
              <small v-if="visibleError('price')" :id="id + '-price-error'" class="field-error">
                {{ visibleError('price') }}
              </small>
            </div>
          </section>
        </div>

        <aside class="poster" aria-label="Película seleccionada">
          <img
            :src="posterSource"
            :alt="movie ? `Póster de ${movie.title}` : 'Sin película seleccionada'"
            @error="posterFailed = true"
          />
          <p v-if="movie" class="poster-title">{{ movie.title }}</p>
          <p v-else class="poster-empty">El póster aparecerá al elegir una película.</p>
        </aside>
      </div>

      <footer class="dialog-actions">
        <button type="button" class="secondary-button" :disabled="submitting" @click="close">
          Cancelar
        </button>
        <button type="submit" class="create-button" :disabled="submitting || optionsLoading">
          <i class="bi bi-plus-circle" aria-hidden="true"></i>
          {{ submitting ? 'Agregando…' : 'Agregar Proyección' }}
        </button>
      </footer>
    </form>
  </dialog>
</template>

<style scoped>
.projection-dialog { position: fixed; top: 50%; left: 50%; width: min(calc(100% - 32px), 1200px); max-height: 94dvh; margin: 0; padding: 0; border: 0; border-radius: var(--radius-medium); color: var(--color-dark); background: #e4e4e4; transform: translate(-50%, -50%); overflow: hidden; }
.projection-dialog[open] { display: flex; flex-direction: column; }
.projection-dialog::backdrop { background: color-mix(in srgb, var(--color-black) 55%, transparent); }
.dialog-heading { display: flex; flex-shrink: 0; justify-content: space-between; align-items: center; gap: 16px; padding: 20px 32px; color: var(--color-white); background: var(--color-primary); }
.dialog-heading h2 { margin: 0; font-size: 1.4rem; font-weight: 700; }
.close-button { display: grid; place-items: center; width: 44px; height: 44px; border: 0; border-radius: var(--radius-small); font-size: 1.5rem; color: inherit; background: transparent; }
form { display: grid; gap: 16px; min-height: 0; padding: 24px 32px; overflow-y: auto; }
.required-note, .form-status { margin: 0; font-size: .9rem; }
.required-marker { color: var(--color-error); font-weight: 700; }
.form-body { display: grid; grid-template-columns: minmax(0, 1fr) 280px; gap: 32px; align-items: start; }
.form-sections { display: grid; gap: 16px; }
.form-section { display: grid; gap: 12px; padding: 18px 20px; border-radius: var(--radius-medium); background: #f2f2f2; }
.form-section h3 { display: flex; gap: 10px; align-items: center; margin: 0; font-size: 1.05rem; font-weight: 700; }
.form-section h3 span { display: grid; place-items: center; width: 26px; height: 26px; border-radius: 50%; color: var(--color-white); font-size: .85rem; background: var(--color-primary); }
.section-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px 16px; }
.section-grid.two-columns { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.field { display: grid; gap: 4px; align-content: start; }
.field-wide { grid-column: 1 / -1; }
label { color: var(--color-dark); font-size: .95rem; font-weight: 600; }
input, select { width: 100%; min-height: 44px; padding: 8px 12px; border: 1px solid #c8c8c8; border-radius: var(--radius-small); font: inherit; background: var(--color-white); box-shadow: 0 1px 3px color-mix(in srgb, var(--color-black) 12%, transparent); }
input:focus, select:focus { outline: 2px solid var(--color-primary); outline-offset: 1px; }
input:disabled, select:disabled { color: var(--color-gray); background: #ececec; cursor: not-allowed; }
input[readonly] { background: #ececec; }
input[aria-invalid="true"], select[aria-invalid="true"] { border-color: var(--color-error); outline: 1px solid var(--color-error); }
.search-input { position: relative; }
.search-input .bi { position: absolute; top: 50%; left: 14px; color: var(--color-gray); transform: translateY(-50%); }
.search-input input { padding-left: 40px; }
.movie-field { position: relative; }
.movie-results { position: absolute; z-index: 2; top: 76px; right: 0; left: 0; max-height: 260px; margin: 0; padding: 4px; overflow-y: auto; list-style: none; border-radius: var(--radius-small); background: var(--color-white); box-shadow: 0 6px 16px color-mix(in srgb, var(--color-black) 25%, transparent); }
.movie-results li { display: flex; justify-content: space-between; gap: 12px; padding: 10px 12px; border-radius: var(--radius-small); cursor: pointer; }
.movie-results li span { color: var(--color-gray); }
.movie-results li.is-active, .movie-results li:hover { background: color-mix(in srgb, var(--color-primary) 10%, transparent); }
.minutes-grid { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
.minutes-field { justify-items: center; text-align: center; }
.minutes-field input { width: 96px; text-align: center; font-weight: 700; }
.minutes-field span { color: var(--color-medium_gray); font-size: .85rem; }
.timeline-operator { color: var(--color-gray); font-size: 1.1rem; }
.schedule-summary { display: flex; gap: 8px; align-items: flex-start; margin: 0; padding: 10px 12px; border-left: 4px solid var(--color-primary); border-radius: var(--radius-small); background: var(--color-white); }
.price-field { max-width: 280px; }
.currency-input { position: relative; }
.currency-input span { position: absolute; top: 50%; left: 14px; color: var(--color-gray); font-weight: 700; transform: translateY(-50%); }
.currency-input input { padding-left: 32px; }
.poster { position: sticky; top: 0; display: grid; gap: 8px; margin: 0; }
.poster img { width: 100%; aspect-ratio: 2 / 3; object-fit: cover; border-radius: var(--radius-small); background: var(--color-white); box-shadow: 0 4px 10px color-mix(in srgb, var(--color-black) 25%, transparent); }
.poster-title { margin: 0; font-weight: 700; text-align: center; }
.poster-empty { margin: 0; color: var(--color-medium_gray); font-size: .9rem; text-align: center; }
.field-error, .form-error { margin: 0; color: var(--color-error); }
.field-hint { margin: 0; color: #5f5f5f; font-size: .85rem; }
.form-warning { display: flex; gap: 8px; align-items: center; margin: 0; padding: 8px 12px; border-left: 4px solid #b54708; border-radius: var(--radius-small); background: #fffaeb; }
.link-button { border: 0; color: var(--color-primary); background: transparent; text-decoration: underline; }
.dialog-actions { display: flex; justify-content: flex-end; gap: 12px; padding-top: 4px; }
.secondary-button, .create-button { display: inline-flex; gap: 10px; align-items: center; min-height: 48px; padding: 10px 22px; border-radius: var(--radius-small); font: inherit; font-weight: 600; }
.secondary-button { border: 1px solid var(--color-primary); color: var(--color-primary); background: var(--color-white); }
.create-button { border: 0; color: var(--color-white); background: var(--color-primary); box-shadow: 0 2px 6px color-mix(in srgb, var(--color-black) 30%, transparent); }
.secondary-button:disabled, .create-button:disabled { opacity: .7; cursor: not-allowed; }
@media (max-width: 900px) {
  .form-body { grid-template-columns: 1fr; }
  .poster { position: static; order: -1; max-width: 200px; justify-self: center; }
}
@media (max-width: 640px) {
  form { padding: 20px 16px; }
  .dialog-heading { padding: 16px; }
  .section-grid, .section-grid.two-columns { grid-template-columns: 1fr; }
  .dialog-actions { flex-direction: column-reverse; }
  .secondary-button, .create-button { justify-content: center; }
}
</style>
