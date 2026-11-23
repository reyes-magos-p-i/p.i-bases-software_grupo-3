<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, useTemplateRef, watch } from 'vue'
import { isAxiosError } from 'axios'

import BaseModal from '@/components/common/BaseModal.vue'
import DialogSection from '@/components/common/DialogSection.vue'
import NotificationPopup from '@/components/common/NotificationPopup.vue'
import LimitedTextInput from '@/components/common/LimitedTextInput.vue'
import ReusableSearchDropdown from '@/components/common/ReusableSearchDropdown.vue'
import PromotionImageUpload from '@/components/image/PromotionImageUpload.vue'
import {
  uploadPromotionPoster,
  getPromotionPosterUrl,
 } from '@/services/image-handler.service'
import { createPromotion, getPromotion, updatePromotion } from '@/services/promotion.service'
import type { PromotionDetail } from '@/types/promotion-read'
import type {
  CinemaOption,
  PromotionErrors,
  PromotionForm,
  ProjectionFormat,
  PromotionType,
  Technology,
} from '@/types/promotion'
import {
  buildPromotionPayload,
  PROMOTION_POSTER_PATH_LIMIT,
  PROMOTION_TEXT_LIMIT,
  PROMOTION_TITLE_LIMIT,
  validatePromotion,
} from '@/utils/promotion-validation'
import DatePicker from '@/components/common/DatePicker.vue'
import SimpleDropdown from '@/components/common/SimpleDropdown.vue'
import LoadingState from '../common/LoadingState.vue'

const props = withDefaults(defineProps<{
  cinemas: CinemaOption[]
  mode?: 'create' | 'edit' | 'view'
  promotionId?: number | null
}>(), { mode: 'create', promotionId: null })
const isView = computed(() => props.mode === 'view')
const isEdit = computed(() => props.mode === 'edit')
let populating = false
const originalCinemaIds = ref<number[]>([])
const availableCinemas = computed(() => {
  const options = [...props.cinemas]
  if (isEdit.value) {
    const known = new Set(options.map((item) => item.id))
    for (const id of originalCinemaIds.value) {
      if (!known.has(id)) options.push({ id, name: `Sucursal #${id}` })
    }
  }
  return options
})
const emit = defineEmits<{
  close: []
  saved: []
  'session-expired': []
  forbidden: []
}>()

function emptyForm(): PromotionForm { return {
  promotionType: '', amount: '', beginDate: '', endDate: '',
  allDay: true, beginHour: '', endHour: '', projectionFormat: '', technology: '',
  promotionTitle: '', description: '', conditions: '', posterPath: null,
  weekdays: [], branchIds: [],
} }
const form = reactive<PromotionForm>(emptyForm())
const saving = ref(false)
const loadingDetails = ref(false)
const detailLoaded = ref(false)
const detailError = ref('')
const posterFailed = ref(false)
const inputsDisabled = computed(() => saving.value || isView.value || loadingDetails.value || (isEdit.value && !detailLoaded.value))
let detailRequest: AbortController | undefined
let detailVersion = 0
const error = ref('')
const validationNotice = ref('')
const fieldErrors = reactive<PromotionErrors>({})
const formElement = useTemplateRef<HTMLFormElement>('form-element')
const selectedPoster = ref<File | null>(null)
const endAtMidnight = ref(false)
const existingPosterUrl = computed(() =>
  getPromotionPosterUrl(form.posterPath),
)
const cinemaOptions = computed(() => {
  const options = availableCinemas.value.map((item) => ({ value: item.id, label: item.name }))
  // Details must still identify associations not present in the active cinema catalog.
  if (isView.value) {
    const known = new Set(options.map((item) => item.value))
    for (const id of form.branchIds) {
      if (!known.has(id)) options.push({ value: id, label: `Sucursal #${id}` })
    }
  }
  return options
})
const allCinemasSelected = computed(() => availableCinemas.value.length > 0
  && availableCinemas.value.every((cinema) => form.branchIds.includes(cinema.id)))
const maxAmount = computed(() => form.promotionType === 'percentage' ? 100 : 4000)
const weekdays = [
  { value: 1, label: 'Lunes' }, { value: 2, label: 'Martes' },
  { value: 3, label: 'Miércoles' }, { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' }, { value: 6, label: 'Sábado' },
  { value: 7, label: 'Domingo' },
]

const promotionTypeOptions: { id: PromotionType; name: string }[] = [
  { id: 'percentage', name: 'Porcentaje' },
  { id: 'fixed', name: 'Monto fijo de descuento' },
]

const projectionFormatOptions: { id: ProjectionFormat; name: string }[] = [
  { id: '2D', name: '2D' },
  { id: '3D', name: '3D' },
]

const technologyOptions: { id: Technology; name: string }[] = [
  { id: 'STANDARD', name: 'Estándar' },
  { id: 'IMAX', name: 'IMAX' },
  { id: '70MM', name: '70mm' },
]

const promotionTypeModel = computed<PromotionType | null>({
  get: () => form.promotionType || null,
  set: (value) => {
    form.promotionType = value ?? ''
    delete fieldErrors.promotionType
    delete fieldErrors.amount
  },
})

const projectionFormatModel = computed<ProjectionFormat | null>({
  get: () => form.projectionFormat || null,
  set: (value) => {
    form.projectionFormat = value ?? ''
    delete fieldErrors.projectionFormat
    delete fieldErrors.technology
  },
})

const technologyModel = computed<Technology | null>({
  get: () => form.technology || null,
  set: (value) => {
    form.technology = value ?? ''
    delete fieldErrors.technology
  },
})

watch(endAtMidnight, (enabled) => {
  if (isView.value || populating) return
  form.endHour = enabled ? '24:00' : ''
  delete fieldErrors.endHour
}, { flush: 'sync' })
watch(selectedPoster, () => { delete fieldErrors.poster })

function selectAllCinemas() {
  form.branchIds = [...new Set(availableCinemas.value.map((cinema) => cinema.id))]
  delete fieldErrors.branchIds
}
function clearHoursErrors() {
  delete fieldErrors.beginHour
  delete fieldErrors.endHour
}
async function focusFirstError() {
  await nextTick()
  const invalid = formElement.value?.querySelector<HTMLElement>('[aria-invalid="true"]')
  const target = invalid?.matches('input, select, textarea, button')
    ? invalid : invalid?.querySelector<HTMLElement>('input, select, textarea, button')
  target?.focus()
}
function apiMessages(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.filter((item) => typeof item === 'string').join(' ')
  return ''
}
async function save() {
  if (saving.value || isView.value || loadingDetails.value || (isEdit.value && !detailLoaded.value)) return
  const editId = isEdit.value ? props.promotionId : null
  const version = detailVersion
  error.value = ''
  validationNotice.value = ''
  for (const key of Object.keys(fieldErrors)) delete fieldErrors[key as keyof PromotionErrors]
  Object.assign(fieldErrors, validatePromotion(form, availableCinemas.value, selectedPoster.value))
  if (Object.keys(fieldErrors).length) {
    validationNotice.value = 'Revisa los campos indicados antes de continuar.'
    await focusFirstError()
    return
  }

  saving.value = true
  try {
    if (selectedPoster.value) {
      const uploaded = await uploadPromotionPoster(selectedPoster.value)
      if (version !== detailVersion) return
      if (typeof uploaded.path !== 'string' || !uploaded.path
        || uploaded.path.length > PROMOTION_POSTER_PATH_LIMIT) {
        fieldErrors.poster = 'No se recibió una ruta válida para el póster. Vuelve a seleccionarlo.'
        validationNotice.value = 'Revisa el póster seleccionado.'
        return
      }
      // Retain the uploaded path if creation fails, so retrying does not upload again.
      form.posterPath = uploaded.path
      selectedPoster.value = null
    }
    const payload = buildPromotionPayload(form)
    if (editId !== null) await updatePromotion(editId, payload)
    else await createPromotion(payload)
    if (version !== detailVersion) return
    emit('saved')
    emit('close')
  } catch (failure: unknown) {
    if (version !== detailVersion) return
    if (isAxiosError(failure)) {
      if (failure.response?.status === 401) { emit('session-expired'); return }
      if (failure.response?.status === 403) { emit('forbidden'); return }
      if (failure.response?.status === 404 && editId !== null) {
        detailLoaded.value = false
        detailError.value = 'La promoción no existe o ya no está disponible.'
        return
      }
      if ([400, 409, 413, 415].includes(failure.response?.status ?? 0)) {
        validationNotice.value = apiMessages(failure.response?.data?.message)
          || 'Revisa los datos, las sucursales y la imagen seleccionada.'
        return
      }
    }
    error.value = editId !== null
      ? 'No se pudo actualizar la promoción. Vuelve a intentarlo.'
      : 'No se pudo crear la promoción. Vuelve a intentarlo.'
  } finally {
    saving.value = false
  }
}

function populateDetails(detail: PromotionDetail) {
  populating = true
  originalCinemaIds.value = [...detail.branchIds]
  Object.assign(form, {
    promotionType: detail.promotionType,
    amount: String(detail.promotionAmount),
    beginDate: detail.beginDate,
    endDate: detail.endDate,
    allDay: detail.beginHour === null && detail.endHour === null,
    beginHour: detail.beginHour ?? '',
    endHour: detail.endHour ?? '',
    projectionFormat: detail.projectionFormat ?? '',
    technology: detail.technology ?? '',
    promotionTitle: detail.promotionTitle,
    description: detail.description,
    conditions: detail.conditions ?? '',
    posterPath: detail.posterPath,
    weekdays: [...detail.weekdays],
    branchIds: [...detail.branchIds],
  })
  endAtMidnight.value = detail.endHour === '24:00'
  populating = false
}

async function loadDetails() {
  detailRequest?.abort()
  const version = ++detailVersion
  detailLoaded.value = false
  detailError.value = ''
  posterFailed.value = false
  loadingDetails.value = false
  if (props.mode === 'create') return
  if (!props.promotionId || !Number.isSafeInteger(props.promotionId) || props.promotionId < 1) {
    detailError.value = 'Selecciona una promoción válida.'
    return
  }
  const request = new AbortController()
  detailRequest = request
  loadingDetails.value = true
  try {
    const detail = await getPromotion(props.promotionId, request.signal)
    if (request.signal.aborted || version !== detailVersion) return
    populateDetails(detail)
    detailLoaded.value = true
  } catch (failure: unknown) {
    if (request.signal.aborted || version !== detailVersion) return
    if (isAxiosError(failure)) {
      if (failure.response?.status === 401) { emit('session-expired'); return }
      if (failure.response?.status === 403) { emit('forbidden'); return }
      if (failure.response?.status === 404) {
        detailError.value = 'La promoción no existe o ya no está disponible.'
        return
      }
    }
    detailError.value = 'No se pudo cargar la promoción. Vuelve a intentarlo.'
  } finally {
    if (version === detailVersion) loadingDetails.value = false
  }
}

watch(() => [props.mode, props.promotionId] as const, () => {
  originalCinemaIds.value = []
  Object.assign(form, emptyForm())
  selectedPoster.value = null
  endAtMidnight.value = false
  error.value = ''
  validationNotice.value = ''
  for (const key of Object.keys(fieldErrors)) delete fieldErrors[key as keyof PromotionErrors]
  void loadDetails()
}, { immediate: true })
onBeforeUnmount(() => { detailVersion++; detailRequest?.abort() })
</script>

<template>
  <BaseModal :open="true" :title="isView ? 'Detalle de promoción' : isEdit ? 'Editar promoción' : 'Crear promoción'" :close-disabled="saving" @close="emit('close')">
    <div class="promotion-create-content dialog-content">
       <LoadingState
        v-if="loadingDetails"
        class="detail-feedback"
        message="Cargando datos de la promocion…"
        compact
      />
      <div v-if="detailError" class="detail-error">
        <p role="alert">{{ detailError }}</p>
        <button type="button" @click="loadDetails">Reintentar</button>
      </div>
      <form ref="form-element" novalidate @submit.prevent="save"
        @input="validationNotice = ''" @change="validationNotice = ''">
        <fieldset v-if="mode === 'create' || detailLoaded" class="create-fieldset" :disabled="inputsDisabled">
          <div class="dialog-sections">
            <DialogSection title="Información general">
              <div class="general-layout">
                <div class="general-fields">
                  <div v-if="isView" class="field">
                    <label for="promotion-detail-id">ID de la promoción</label>
                    <input id="promotion-detail-id" :value="promotionId" disabled />
                  </div>
                  <LimitedTextInput v-model="form.promotionTitle" label="Nombre de la promoción"
                    :limit="PROMOTION_TITLE_LIMIT" :error="fieldErrors.promotionTitle" :disabled="inputsDisabled" required
                    @update:model-value="delete fieldErrors.promotionTitle" />
                  <LimitedTextInput v-model="form.description" label="Descripción"
                    :limit="PROMOTION_TEXT_LIMIT" :error="fieldErrors.description" :disabled="inputsDisabled" multiline :rows="4" required
                    @update:model-value="delete fieldErrors.description" />
                  <LimitedTextInput v-model="form.conditions" label="Condiciones (opcional)"
                    :limit="PROMOTION_TEXT_LIMIT" :error="fieldErrors.conditions" :disabled="inputsDisabled" multiline :rows="3"
                    @update:model-value="delete fieldErrors.conditions" />
                  <SimpleDropdown
                    v-model="promotionTypeModel"
                    label="Tipo de promoción"
                    placeholder="Seleccionar tipo"
                    :options="promotionTypeOptions"
                    :disabled="inputsDisabled"
                    :error="fieldErrors.promotionType"
                    required
                  />
                  <div>
                    <div v-if="!isView" class="selection-actions">
                      <span class="hint">Selecciona una o más sucursales.</span>
                      <button type="button" class="small-action" :disabled="inputsDisabled || !availableCinemas.length || allCinemasSelected"
                        @click="selectAllCinemas">Seleccionar todas</button>
                      <button type="button" class="small-action" :disabled="inputsDisabled || !form.branchIds.length"
                        @click="form.branchIds = []; delete fieldErrors.branchIds">Limpiar</button>
                    </div>
                    <ReusableSearchDropdown v-model="form.branchIds" label="Sucursales"
                      placeholder="Buscar sucursales..." :options="cinemaOptions" :disabled="inputsDisabled" required
                      :error="fieldErrors.branchIds" @update:model-value="delete fieldErrors.branchIds" />
                    <p v-if="!isView" class="hint" role="status">{{ form.branchIds.length }} de {{ availableCinemas.length }} sucursales seleccionadas.</p>
                    <p v-if="isView" class="hint" role="status">{{ form.branchIds.length }} sucursales asociadas.</p>
                    <p v-if="!isView && !availableCinemas.length" class="form-error">No hay sucursales disponibles. Carga el catálogo antes de crear la promoción.</p>
                  </div>
                </div>
                <aside class="poster-column">
                  <template v-if="isView">
                    <p>Póster de la promoción</p>
                    <img v-if="existingPosterUrl && !posterFailed" :src="existingPosterUrl"
                      alt="Póster de la promoción" class="detail-poster" @error="posterFailed = true" />
                    <p v-else class="hint">{{ posterFailed ? 'No se pudo cargar el póster.' : 'Sin póster.' }}</p>
                  </template>
                 <PromotionImageUpload v-else
                    v-model="selectedPoster"
                    label="Póster de la promoción (opcional)"
                    :existing-image-url="existingPosterUrl"
                    :disabled="inputsDisabled"
                  />
                  <button v-if="isEdit && form.posterPath" type="button" class="small-action"
                    :disabled="inputsDisabled" @click="form.posterPath = null; selectedPoster = null; delete fieldErrors.poster">
                    Quitar póster
                  </button>
                  <p v-if="!isView" class="hint">JPEG, PNG o WebP. Máximo 5 MB.</p>
                  <p v-if="fieldErrors.poster" class="form-error" role="alert">{{ fieldErrors.poster }}</p>
                </aside>
              </div>
            </DialogSection>

            <DialogSection title="Vigencia y aplicación">
              <p class="hint section-hint">Las restricciones se aplican a la fecha y hora de inicio de la función.</p>
              <div class="form-grid">
                <div class="field">
                  <label for="promo-begin-date">Fecha inicial *</label>

                  <DatePicker
                    id="promo-begin-date"
                    v-model="form.beginDate"
                    min="0001-01-01"
                    max="9999-12-31"
                    required
                    :disabled="inputsDisabled"
                    :aria-invalid="!!fieldErrors.beginDate"
                    :aria-describedby="
                      fieldErrors.beginDate ? 'promo-begin-date-error' : undefined
                    "
                    @update:model-value="
                      delete fieldErrors.beginDate;
                      delete fieldErrors.endDate
                    "
                  />

                  <p
                    v-if="fieldErrors.beginDate"
                    id="promo-begin-date-error"
                    class="form-error"
                  >
                    {{ fieldErrors.beginDate }}
                  </p>
                </div>

                <div class="field">
                  <label for="promo-end-date">Fecha final *</label>

                  <DatePicker
                    id="promo-end-date"
                    v-model="form.endDate"
                    :min="form.beginDate || '0001-01-01'"
                    max="9999-12-31"
                    required
                    :disabled="inputsDisabled"
                    :aria-invalid="!!fieldErrors.endDate"
                    :aria-describedby="
                      fieldErrors.endDate ? 'promo-end-date-error' : undefined
                    "
                    @update:model-value="delete fieldErrors.endDate"
                  />

                  <p
                    v-if="fieldErrors.endDate"
                    id="promo-end-date-error"
                    class="form-error"
                  >
                    {{ fieldErrors.endDate }}
                  </p>
                </div>
                <label class="check-label full-width">
                  <input v-model="form.allDay" type="checkbox" :disabled="inputsDisabled" @change="clearHoursErrors" />
                  Válida todo el día
                </label>
                <template v-if="!form.allDay">
                  <div class="field">
                    <label for="promo-begin-hour">Hora inicial *</label>
                    <input id="promo-begin-hour" v-model="form.beginHour" type="time" step="60" required :disabled="inputsDisabled"
                      :aria-invalid="!!fieldErrors.beginHour" aria-describedby="promo-begin-hour-error"
                      @input="clearHoursErrors" />
                    <p v-if="fieldErrors.beginHour" id="promo-begin-hour-error" class="form-error">{{ fieldErrors.beginHour }}</p>
                  </div>
                  <div class="field">
                    <label for="promo-end-hour">Hora final *</label>
                    <input v-if="!endAtMidnight" id="promo-end-hour" v-model="form.endHour" type="time" step="60" required
                      :disabled="inputsDisabled" :aria-invalid="!!fieldErrors.endHour" aria-describedby="promo-end-hour-error"
                      @input="delete fieldErrors.endHour" />
                    <input v-else id="promo-end-hour" value="24:00" readonly :disabled="inputsDisabled" aria-label="Hora final: fin del día, 24:00" />
                    <label class="check-label">
                      <input v-model="endAtMidnight" type="checkbox" :disabled="inputsDisabled" /> Hasta el final del día (24:00)
                    </label>
                    <p v-if="fieldErrors.endHour" id="promo-end-hour-error" class="form-error">{{ fieldErrors.endHour }}</p>
                  </div>
                  <p class="hint full-width">La hora inicial se incluye y la final se excluye. El rango no puede cruzar medianoche.</p>
                </template>

                <fieldset class="weekdays full-width" :aria-invalid="!!fieldErrors.weekdays" aria-describedby="promo-days-hint promo-days-error">
                  <legend>Días de la semana</legend>
                  <div class="day-options">
                    <label v-for="day in weekdays" :key="day.value" class="check-label day-option">
                      <input v-model="form.weekdays" type="checkbox" :value="day.value" :disabled="inputsDisabled"
                        @change="delete fieldErrors.weekdays" /> {{ day.label }}
                    </label>
                  </div>
                  <p id="promo-days-hint" class="hint">Sin días seleccionados, aplica todos los días.</p>
                  <p v-if="fieldErrors.weekdays" id="promo-days-error" class="form-error">{{ fieldErrors.weekdays }}</p>
                </fieldset>

                <div class="field">
                  <label for="promo-amount">{{ form.promotionType === 'percentage' ? 'Porcentaje de descuento (%)' : 'Monto de descuento' }} *</label>
                  <input id="promo-amount" v-model="form.amount" type="text" inputmode="decimal" maxlength="16"
                    required :disabled="inputsDisabled" placeholder="Ej.: 25,50"
                    :aria-invalid="!!fieldErrors.amount" aria-describedby="promo-amount-hint promo-amount-error"
                    @input="delete fieldErrors.amount" />
                  <p id="promo-amount-hint" class="hint">Mayor que cero, máximo {{ maxAmount }}. Hasta dos decimales.</p>
                  <p v-if="fieldErrors.amount" id="promo-amount-error" class="form-error">{{ fieldErrors.amount }}</p>
                </div>
                <SimpleDropdown
                  v-model="projectionFormatModel"
                  label="Formato de proyección"
                  placeholder="Cualquier formato"
                  :options="projectionFormatOptions"
                  :disabled="inputsDisabled"
                  :error="fieldErrors.projectionFormat"
                />
                <SimpleDropdown
                  v-model="technologyModel"
                  label="Tecnología"
                  placeholder="Cualquier tecnología"
                  :options="technologyOptions"
                  :disabled="inputsDisabled"
                  :error="fieldErrors.technology"
                />
              </div>
            </DialogSection>
          </div>
        </fieldset>

        <p v-if="validationNotice" class="form-error" role="alert">{{ validationNotice }}</p>
        <NotificationPopup v-if="error" type="error" :message="error" :duration="0"
          placement="bottom-right" @close="error = ''" />
        <footer class="form-footer">
          <button type="button" class="secondary" :disabled="saving" @click="emit('close')">{{ isView ? 'Cerrar' : 'Cancelar' }}</button>
          <button v-if="!isView" type="submit" class="primary" :disabled="inputsDisabled || !availableCinemas.length">
            {{ saving ? (isEdit ? 'Guardando...' : 'Creando...') : (isEdit ? 'Guardar cambios' : 'Crear promoción') }}
          </button>
        </footer>
      </form>
    </div>
  </BaseModal>
</template>

<style scoped>
:global(.app-modal-card:has(.promotion-create-content)) { width: min(960px, 100%); max-width: 960px; }
.promotion-create-content { padding: 24px; overflow-y: auto; }
.create-fieldset { min-width: 0; margin: 0; padding: 0; border: 0; }
.dialog-sections, .general-fields { display: grid; gap: 20px; }
.general-layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 24px; align-items: start; }
.detail-poster { width: 100%; aspect-ratio: 16 / 9; object-fit: contain; }
.detail-error { color: var(--error-color); }
.general-fields, .poster-column { min-width: 0; }
.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px 20px; }
.full-width { grid-column: 1 / -1; }
.field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.field > label, legend { font-weight: 600; }
.field > input, .field > select { width: 100%; box-sizing: border-box; min-height: 44px; padding: 10px 12px; border: 1px solid var(--border-color, #888); border-radius: var(--radius-small, 6px); background: var(--content-background, #fff); color: inherit; font: inherit; }
.field > [aria-invalid="true"] { border-color: var(--error-color, #b42318); }
.hint { margin: 6px 0 0; font-size: 0.875rem; line-height: 1.5; }
.section-hint { margin: 0 0 16px; }
.form-error { margin: 6px 0; color: var(--error-color, #b42318); font-size: 0.9rem; }
.check-label { display: flex; align-items: center; gap: 8px; min-height: 36px; }
.check-label input { accent-color: var(--primary-color); }
.selection-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
.selection-actions .hint { flex: 1 1 180px; }
.small-action { padding: 7px 10px; border: 1px solid var(--primary-color, #666); border-radius: var(--radius-small, 6px); background: var(--content-background, #fff); color: inherit; font: inherit; cursor: pointer; }
.weekdays { min-width: 0; margin: 0; padding: 12px; border: 1px solid var(--border-color, #888); border-radius: var(--radius-small, 6px); }
.day-options { display: flex; flex-wrap: wrap; gap: 8px 16px; }
.form-footer { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 12px; margin-top: 24px; }
.form-footer button { min-height: 44px; padding: 10px 20px; border: 1px solid var(--primary-color); border-radius: var(--radius-small); font: inherit; cursor: pointer; }
.primary { background: var(--button-confirm-background); border-color: var(--button-confirm-background); color: var(--button-confirm-text); }
.secondary { background: var(--content-background); color: var(--button-secondary-text); }
button:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
button:disabled { opacity: 0.5; cursor: not-allowed; }
@media (max-width: 700px) { .general-layout { grid-template-columns: 1fr; } .poster-column { width: 100%; max-width: none; justify-self: center; } }
@media (max-width: 575px) { .form-grid { grid-template-columns: 1fr; } .promotion-create-content { padding: 16px; } }
</style>
