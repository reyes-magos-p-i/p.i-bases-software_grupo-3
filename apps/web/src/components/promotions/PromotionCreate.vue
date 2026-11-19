<script setup lang="ts">
import { computed, nextTick, reactive, ref, useTemplateRef, watch } from 'vue'
import { isAxiosError } from 'axios'

import BaseModal from '@/components/common/BaseModal.vue'
import DialogSection from '@/components/common/DialogSection.vue'
import NotificationPopup from '@/components/common/NotificationPopup.vue'
import LimitedTextInput from '@/components/common/LimitedTextInput.vue'
import ReusableSearchDropdown from '@/components/common/ReusableSearchDropdown.vue'
import ImageUpload from '@/components/image/ImageUpload.vue'
import { uploadPoster, getPosterUrl } from '@/services/image-handler.service'
import { createPromotion } from '@/services/promotion.service'
import type { CinemaOption, PromotionErrors, PromotionForm } from '@/types/promotion'
import {
  buildPromotionPayload,
  PROMOTION_POSTER_PATH_LIMIT,
  PROMOTION_TEXT_LIMIT,
  PROMOTION_TITLE_LIMIT,
  validatePromotion,
} from '@/utils/promotion-validation'

const props = defineProps<{ cinemas: CinemaOption[] }>()
const emit = defineEmits<{
  close: []
  saved: []
  'session-expired': []
  forbidden: []
}>()

const form = reactive<PromotionForm>({
  promotionType: '', amount: '', beginDate: '', endDate: '',
  allDay: true, beginHour: '', endHour: '', projectionFormat: '', technology: '',
  promotionTitle: '', description: '', conditions: '', posterPath: null,
  weekdays: [], branchIds: [],
})
const saving = ref(false)
const error = ref('')
const validationNotice = ref('')
const fieldErrors = reactive<PromotionErrors>({})
const formElement = useTemplateRef<HTMLFormElement>('form-element')
const selectedPoster = ref<File | null>(null)
const endAtMidnight = ref(false)
const existingPosterUrl = computed(() => getPosterUrl(form.posterPath))
const cinemaOptions = computed(() => props.cinemas.map((item) => ({ value: item.id, label: item.name })))
const allCinemasSelected = computed(() => props.cinemas.length > 0
  && props.cinemas.every((cinema) => form.branchIds.includes(cinema.id)))
const maxAmount = computed(() => form.promotionType === 'percentage' ? 100 : 4000)
const weekdays = [
  { value: 1, label: 'Lunes' }, { value: 2, label: 'Martes' },
  { value: 3, label: 'Miércoles' }, { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' }, { value: 6, label: 'Sábado' },
  { value: 7, label: 'Domingo' },
]

watch(endAtMidnight, (enabled) => {
  form.endHour = enabled ? '24:00' : ''
  delete fieldErrors.endHour
})
watch(selectedPoster, () => { delete fieldErrors.poster })

function selectAllCinemas() {
  form.branchIds = [...new Set(props.cinemas.map((cinema) => cinema.id))]
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
  if (saving.value) return
  error.value = ''
  validationNotice.value = ''
  for (const key of Object.keys(fieldErrors)) delete fieldErrors[key as keyof PromotionErrors]
  Object.assign(fieldErrors, validatePromotion(form, props.cinemas, selectedPoster.value))
  if (Object.keys(fieldErrors).length) {
    validationNotice.value = 'Revisa los campos indicados antes de continuar.'
    await focusFirstError()
    return
  }

  saving.value = true
  try {
    if (selectedPoster.value) {
      const uploaded = await uploadPoster(selectedPoster.value)
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
    await createPromotion(buildPromotionPayload(form))
    emit('saved')
    emit('close')
  } catch (failure: unknown) {
    if (isAxiosError(failure)) {
      if (failure.response?.status === 401) { emit('session-expired'); return }
      if (failure.response?.status === 403) { emit('forbidden'); return }
      if ([400, 409, 413, 415].includes(failure.response?.status ?? 0)) {
        validationNotice.value = apiMessages(failure.response?.data?.message)
          || 'Revisa los datos, las sucursales y la imagen seleccionada.'
        return
      }
    }
    error.value = 'No se pudo crear la promoción. Vuelve a intentarlo.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseModal :open="true" title="Crear promoción" :close-disabled="saving" @close="emit('close')">
    <div class="promotion-create-content dialog-content">
      <form ref="form-element" novalidate @submit.prevent="save"
        @input="validationNotice = ''" @change="validationNotice = ''">
        <fieldset class="create-fieldset" :disabled="saving">
          <div class="dialog-sections">
            <DialogSection title="Información general">
              <div class="general-layout">
                <div class="general-fields">
                  <LimitedTextInput v-model="form.promotionTitle" label="Nombre de la promoción"
                    :limit="PROMOTION_TITLE_LIMIT" :error="fieldErrors.promotionTitle" required
                    @update:model-value="delete fieldErrors.promotionTitle" />
                  <LimitedTextInput v-model="form.description" label="Descripción"
                    :limit="PROMOTION_TEXT_LIMIT" :error="fieldErrors.description" multiline :rows="4" required
                    @update:model-value="delete fieldErrors.description" />
                  <LimitedTextInput v-model="form.conditions" label="Condiciones (opcional)"
                    :limit="PROMOTION_TEXT_LIMIT" :error="fieldErrors.conditions" multiline :rows="3"
                    @update:model-value="delete fieldErrors.conditions" />
                  <div class="field">
                    <label for="promo-type">Tipo de promoción *</label>
                    <select id="promo-type" v-model="form.promotionType" required :disabled="saving"
                      :aria-invalid="!!fieldErrors.promotionType" aria-describedby="promo-type-error"
                      @change="delete fieldErrors.promotionType; delete fieldErrors.amount">
                      <option disabled value="">Seleccionar tipo</option>
                      <option value="percentage">Porcentaje</option>
                      <option value="fixed">Monto fijo de descuento</option>
                    </select>
                    <p v-if="fieldErrors.promotionType" id="promo-type-error" class="form-error">{{ fieldErrors.promotionType }}</p>
                  </div>
                  <div>
                    <div class="selection-actions">
                      <span class="hint">Selecciona una o más sucursales.</span>
                      <button type="button" class="small-action" :disabled="saving || !cinemas.length || allCinemasSelected"
                        @click="selectAllCinemas">Seleccionar todas</button>
                      <button type="button" class="small-action" :disabled="saving || !form.branchIds.length"
                        @click="form.branchIds = []; delete fieldErrors.branchIds">Limpiar</button>
                    </div>
                    <ReusableSearchDropdown v-model="form.branchIds" label="Sucursales"
                      placeholder="Buscar sucursales..." :options="cinemaOptions" required
                      :error="fieldErrors.branchIds" @update:model-value="delete fieldErrors.branchIds" />
                    <p class="hint" role="status">{{ form.branchIds.length }} de {{ cinemas.length }} sucursales seleccionadas.</p>
                    <p v-if="!cinemas.length" class="form-error">No hay sucursales disponibles. Carga el catálogo antes de crear la promoción.</p>
                  </div>
                </div>
                <aside class="poster-column">
                  <ImageUpload v-model="selectedPoster" label="Póster de la promoción (opcional)"
                    :existing-image-url="existingPosterUrl" :disabled="saving" />
                  <p class="hint">JPEG, PNG o WebP. Máximo 5 MB.</p>
                  <p v-if="fieldErrors.poster" class="form-error" role="alert">{{ fieldErrors.poster }}</p>
                </aside>
              </div>
            </DialogSection>

            <DialogSection title="Vigencia y aplicación">
              <p class="hint section-hint">Las restricciones se aplican a la fecha y hora de inicio de la función.</p>
              <div class="form-grid">
                <div class="field">
                  <label for="promo-begin-date">Fecha inicial *</label>
                  <input id="promo-begin-date" v-model="form.beginDate" type="date" required
                    min="0001-01-01" max="9999-12-31" :disabled="saving"
                    :aria-invalid="!!fieldErrors.beginDate" aria-describedby="promo-begin-date-error"
                    @input="delete fieldErrors.beginDate; delete fieldErrors.endDate" />
                  <p v-if="fieldErrors.beginDate" id="promo-begin-date-error" class="form-error">{{ fieldErrors.beginDate }}</p>
                </div>
                <div class="field">
                  <label for="promo-end-date">Fecha final *</label>
                  <input id="promo-end-date" v-model="form.endDate" type="date" required
                    :min="form.beginDate || '0001-01-01'" max="9999-12-31" :disabled="saving"
                    :aria-invalid="!!fieldErrors.endDate" aria-describedby="promo-end-date-error"
                    @input="delete fieldErrors.endDate" />
                  <p v-if="fieldErrors.endDate" id="promo-end-date-error" class="form-error">{{ fieldErrors.endDate }}</p>
                </div>
                <label class="check-label full-width">
                  <input v-model="form.allDay" type="checkbox" :disabled="saving" @change="clearHoursErrors" />
                  Válida todo el día
                </label>
                <template v-if="!form.allDay">
                  <div class="field">
                    <label for="promo-begin-hour">Hora inicial *</label>
                    <input id="promo-begin-hour" v-model="form.beginHour" type="time" step="60" required :disabled="saving"
                      :aria-invalid="!!fieldErrors.beginHour" aria-describedby="promo-begin-hour-error"
                      @input="clearHoursErrors" />
                    <p v-if="fieldErrors.beginHour" id="promo-begin-hour-error" class="form-error">{{ fieldErrors.beginHour }}</p>
                  </div>
                  <div class="field">
                    <label for="promo-end-hour">Hora final *</label>
                    <input v-if="!endAtMidnight" id="promo-end-hour" v-model="form.endHour" type="time" step="60" required
                      :disabled="saving" :aria-invalid="!!fieldErrors.endHour" aria-describedby="promo-end-hour-error"
                      @input="delete fieldErrors.endHour" />
                    <input v-else id="promo-end-hour" value="24:00" readonly aria-label="Hora final: fin del día, 24:00" />
                    <label class="check-label">
                      <input v-model="endAtMidnight" type="checkbox" :disabled="saving" /> Hasta el final del día (24:00)
                    </label>
                    <p v-if="fieldErrors.endHour" id="promo-end-hour-error" class="form-error">{{ fieldErrors.endHour }}</p>
                  </div>
                  <p class="hint full-width">La hora inicial se incluye y la final se excluye. El rango no puede cruzar medianoche.</p>
                </template>

                <fieldset class="weekdays full-width" :aria-invalid="!!fieldErrors.weekdays" aria-describedby="promo-days-hint promo-days-error">
                  <legend>Días de la semana</legend>
                  <div class="day-options">
                    <label v-for="day in weekdays" :key="day.value" class="check-label day-option">
                      <input v-model="form.weekdays" type="checkbox" :value="day.value" :disabled="saving"
                        @change="delete fieldErrors.weekdays" /> {{ day.label }}
                    </label>
                  </div>
                  <p id="promo-days-hint" class="hint">Sin días seleccionados, aplica todos los días.</p>
                  <p v-if="fieldErrors.weekdays" id="promo-days-error" class="form-error">{{ fieldErrors.weekdays }}</p>
                </fieldset>

                <div class="field">
                  <label for="promo-amount">{{ form.promotionType === 'percentage' ? 'Porcentaje de descuento (%)' : 'Monto de descuento' }} *</label>
                  <input id="promo-amount" v-model="form.amount" type="text" inputmode="decimal" maxlength="16"
                    required :disabled="saving" placeholder="Ej.: 25,50"
                    :aria-invalid="!!fieldErrors.amount" aria-describedby="promo-amount-hint promo-amount-error"
                    @input="delete fieldErrors.amount" />
                  <p id="promo-amount-hint" class="hint">Mayor que cero, máximo {{ maxAmount }}. Hasta dos decimales.</p>
                  <p v-if="fieldErrors.amount" id="promo-amount-error" class="form-error">{{ fieldErrors.amount }}</p>
                </div>
                <div class="field">
                  <label for="promo-format">Formato de proyección</label>
                  <select id="promo-format" v-model="form.projectionFormat" :disabled="saving"
                    :aria-invalid="!!fieldErrors.projectionFormat" aria-describedby="promo-format-error"
                    @change="delete fieldErrors.projectionFormat; delete fieldErrors.technology">
                    <option value="">Cualquier formato</option>
                    <option value="2D">2D</option>
                    <option value="3D" :disabled="form.technology === '70MM'">3D</option>
                  </select>
                  <p v-if="fieldErrors.projectionFormat" id="promo-format-error" class="form-error">{{ fieldErrors.projectionFormat }}</p>
                </div>
                <div class="field">
                  <label for="promo-technology">Tecnología</label>
                  <select id="promo-technology" v-model="form.technology" :disabled="saving"
                    :aria-invalid="!!fieldErrors.technology" aria-describedby="promo-tech-error"
                    @change="delete fieldErrors.technology">
                    <option value="">Cualquier tecnología</option>
                    <option value="STANDARD">Estándar</option>
                    <option value="IMAX">IMAX</option>
                    <option value="70MM" :disabled="form.projectionFormat === '3D'">70mm</option>
                  </select>
                  <p v-if="fieldErrors.technology" id="promo-tech-error" class="form-error">{{ fieldErrors.technology }}</p>
                </div>
              </div>
            </DialogSection>
          </div>
        </fieldset>

        <p v-if="validationNotice" class="form-error" role="alert">{{ validationNotice }}</p>
        <NotificationPopup v-if="error" type="error" :message="error" :duration="0"
          placement="bottom-right" @close="error = ''" />
        <footer class="form-footer">
          <button type="button" class="secondary" :disabled="saving" @click="emit('close')">Cancelar</button>
          <button type="submit" class="primary" :disabled="saving || !cinemas.length">
            {{ saving ? 'Creando...' : 'Crear promoción' }}
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
.general-layout { display: grid; grid-template-columns: minmax(0, 1fr) 240px; gap: 24px; align-items: start; }
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
@media (max-width: 700px) { .general-layout { grid-template-columns: 1fr; } .poster-column { width: 100%; max-width: 240px; justify-self: center; } }
@media (max-width: 575px) { .form-grid { grid-template-columns: 1fr; } .promotion-create-content { padding: 16px; } }
</style>
