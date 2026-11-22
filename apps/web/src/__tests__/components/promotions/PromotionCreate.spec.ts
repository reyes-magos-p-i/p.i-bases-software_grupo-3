// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, nextTick } from 'vue'

// Uses the real promotion-validation helper.
import type { PromotionDetail } from '@/types/promotion-read'
import PromotionCreate from '@/components/promotions/PromotionCreate.vue'
import { createPromotion, getPromotion } from '@/services/promotion.service'
import {
  getPromotionPosterUrl,
  uploadPromotionPoster,
} from '@/services/image-handler.service'

vi.mock('@/services/promotion.service', () => ({ createPromotion: vi.fn(), getPromotion: vi.fn() }))
vi.mock('@/services/image-handler.service', () => ({
  uploadPromotionPoster: vi.fn(),
  getPromotionPosterUrl: vi.fn((path: string | null) =>
    path ? `/api/image-handler/promotions/${path.split('/').pop()}` : null),
}))

const LoadingStub = defineComponent({
  name: 'LoadingState', props: { message: String, compact: Boolean },
  template: '<p role="status">{{ message }}</p>',
})

const BaseModalStub = defineComponent({
  name: 'BaseModal',
  props: ['open', 'title', 'closeDisabled'],
  emits: ['close'],
  template: '<section><h1>{{ title }}</h1><slot /></section>',
})
const DialogSectionStub = defineComponent({
  name: 'DialogSection',
  props: ['title'],
  template: '<section><h2>{{ title }}</h2><slot /></section>',
})
const TextStub = defineComponent({
  name: 'LimitedTextInput',
  props: ['modelValue', 'label', 'limit', 'error', 'required', 'multiline', 'rows', 'disabled'],
  emits: ['update:modelValue'],
  template: `<div><label>{{ label }}
    <input :value="modelValue" :disabled="disabled" :aria-invalid="!!error" />
    </label><p v-if="error" role="alert">{{ error }}</p></div>`,
})
const DropdownStub = defineComponent({
  name: 'SimpleDropdown',
  props: ['modelValue', 'label', 'options', 'placeholder', 'disabled', 'required', 'error'],
  emits: ['update:modelValue'],
  template: `<div><label>{{ label }}
    <select :disabled="disabled" :aria-invalid="!!error"><option>{{ placeholder }}</option></select>
    </label><p v-if="error" role="alert">{{ error }}</p></div>`,
})
const SearchStub = defineComponent({
  name: 'ReusableSearchDropdown',
  props: ['modelValue', 'label', 'options', 'placeholder', 'required', 'error', 'disabled'],
  emits: ['update:modelValue'],
  template: `<div><label>{{ label }}<input :aria-invalid="!!error" /></label>
    <p v-if="error" role="alert">{{ error }}</p></div>`,
})
const DateStub = defineComponent({
  name: 'DatePicker',
  props: { modelValue: String, min: String, max: String, disabled: Boolean, required: Boolean },
  emits: ['update:modelValue'],
  template: '<input :value="modelValue" :disabled="disabled" />',
})
const ImageStub = defineComponent({
  name: 'PromotionImageUpload',
  props: ['modelValue', 'label', 'existingImageUrl', 'disabled'],
  emits: ['update:modelValue'],
  template: '<div><button type="button" :disabled="disabled">Seleccionar imagen</button></div>',
})
const NotificationStub = defineComponent({
  name: 'NotificationPopup',
  props: ['message', 'type', 'duration', 'placement'],
  emits: ['close'],
  template: '<div role="alert">{{ message }}</div>',
})

const cinemas = [
  { id: 1, name: 'SU-001 — Central' },
  { id: 2, name: 'SU-002 — Norte' },
  { id: 3, name: 'SU-003 — Sur' },
]

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}
function apiError(status: number, message?: unknown) {
  // Axios.isAxiosError recognizes this flag; no network request is made.
  return { isAxiosError: true, response: { status, data: { message } } }
}

let wrapper: VueWrapper
function render(options = cinemas, extra: { mode?: 'create' | 'view'; promotionId?: number | null } = {}) {
  wrapper = mount(PromotionCreate, {
    props: { cinemas: options, ...extra },
    attachTo: document.body,
    global: {
      stubs: {
        LoadingState: LoadingStub,
        BaseModal: BaseModalStub,
        DialogSection: DialogSectionStub,
        LimitedTextInput: TextStub,
        SimpleDropdown: DropdownStub,
        ReusableSearchDropdown: SearchStub,
        DatePicker: DateStub,
        PromotionImageUpload: ImageStub,
        NotificationPopup: NotificationStub,
      },
    },
  })
  return wrapper
}
function control(name: string, label: string) {
  const found = wrapper.findAllComponents({ name }).find((item) => item.props('label') === label)
  if (!found) throw new Error(`Missing ${name}: ${label}`)
  return found
}
function button(text: string) {
  const found = wrapper.findAll('button').find((item) => item.text() === text)
  if (!found) throw new Error(`Missing button: ${text}`)
  return found
}
async function update(name: string, label: string, value: unknown) {
  control(name, label).vm.$emit('update:modelValue', value)
  await nextTick()
}
async function setDate(id: string, value: string) {
  const picker = wrapper.findAllComponents({ name: 'DatePicker' })
    .find((item) => item.attributes('id') === id)
  if (!picker) throw new Error(`Missing DatePicker: ${id}`)
  picker.vm.$emit('update:modelValue', value)
  await nextTick()
}
async function fillValid() {
  await update('LimitedTextInput', 'Nombre de la promoción', '  Tardes de cine  ')
  await update('LimitedTextInput', 'Descripción', '  Descuento en funciones elegibles.  ')
  await update('SimpleDropdown', 'Tipo de promoción', 'percentage')
  await setDate('promo-begin-date', '2026-11-17')
  await setDate('promo-end-date', '2026-12-31')
  await wrapper.get('#promo-amount').setValue('25,50')
  await update('ReusableSearchDropdown', 'Sucursales', [1, 2])
}
async function submit() {
  await wrapper.get('form').trigger('submit')
  await flushPromises()
}
async function selectPoster(file = new File(['image bytes'], 'banner.png', { type: 'image/png' })) {
  wrapper.findComponent({ name: 'PromotionImageUpload' }).vm.$emit('update:modelValue', file)
  await nextTick()
  return file
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getPromotion).mockReset().mockResolvedValue(detail())
  vi.mocked(createPromotion).mockReset().mockResolvedValue({ promotionId: 42 })
  vi.mocked(uploadPromotionPoster).mockReset().mockResolvedValue({
    filename: 'banner.webp', path: '/uploads/promotions/banner.webp',
  })
})
afterEach(() => {
  wrapper?.unmount()
  document.body.innerHTML = ''
})

describe('PromotionCreate: cinema selection', () => {
  it('maps the catalog to searchable options and starts with no selection', () => {
    render()
    expect(control('ReusableSearchDropdown', 'Sucursales').props('options')).toEqual(
      cinemas.map(({ id, name }) => ({ value: id, label: name })),
    )
    expect(wrapper.text()).toContain('0 de 3 sucursales seleccionadas.')
    expect(button('Seleccionar todas').attributes('disabled')).toBeUndefined()
    expect(button('Limpiar').attributes('disabled')).toBeDefined()
  })

  it('updates the selected count for individual selections', async () => {
    render()
    await update('ReusableSearchDropdown', 'Sucursales', [2])
    expect(wrapper.text()).toContain('1 de 3 sucursales seleccionadas.')
    expect(button('Limpiar').attributes('disabled')).toBeUndefined()
  })

  it('selects all cinemas and disables select all', async () => {
    render()
    await button('Seleccionar todas').trigger('click')
    expect(control('ReusableSearchDropdown', 'Sucursales').props('modelValue')).toEqual([1, 2, 3])
    expect(wrapper.text()).toContain('3 de 3 sucursales seleccionadas.')
    expect(button('Seleccionar todas').attributes('disabled')).toBeDefined()
  })

  it('clears the selection and allows selecting all again', async () => {
    render()
    await button('Seleccionar todas').trigger('click')
    await button('Limpiar').trigger('click')
    expect(control('ReusableSearchDropdown', 'Sucursales').props('modelValue')).toEqual([])
    expect(button('Limpiar').attributes('disabled')).toBeDefined()
    expect(button('Seleccionar todas').attributes('disabled')).toBeUndefined()
  })

  it('disables select all when all cinemas are selected individually', async () => {
    render()
    await update('ReusableSearchDropdown', 'Sucursales', [3, 1, 2])
    expect(button('Seleccionar todas').attributes('disabled')).toBeDefined()
  })

  it('selects newly available cinemas after the catalog changes', async () => {
    render(cinemas.slice(0, 2))
    await button('Seleccionar todas').trigger('click')
    await wrapper.setProps({ cinemas })
    expect(button('Seleccionar todas').attributes('disabled')).toBeUndefined()
    await button('Seleccionar todas').trigger('click')
    expect(control('ReusableSearchDropdown', 'Sucursales').props('modelValue')).toEqual([1, 2, 3])
  })

  it('shows an empty-catalog message and disables creation', () => {
    render([])
    expect(wrapper.text()).toContain('No hay sucursales disponibles.')
    expect(button('Seleccionar todas').attributes('disabled')).toBeDefined()
    expect(button('Crear promoción').attributes('disabled')).toBeDefined()
  })

  it('requires at least one cinema and clears its error after selecting all', async () => {
    render()
    await fillValid()
    await button('Limpiar').trigger('click')
    await submit()
    expect(control('ReusableSearchDropdown', 'Sucursales').props('error')).toBeTruthy()
    expect(createPromotion).not.toHaveBeenCalled()
    await button('Seleccionar todas').trigger('click')
    expect(control('ReusableSearchDropdown', 'Sucursales').props('error')).toBeUndefined()
  })
})

describe('PromotionCreate: validation and shared controls', () => {
  it('renders two sections and focuses the first invalid input', async () => {
    render()
    expect(wrapper.findAll('h2').map((heading) => heading.text())).toEqual([
      'Información general', 'Vigencia y aplicación',
    ])
    await submit()
    expect(createPromotion).not.toHaveBeenCalled()
    expect(uploadPromotionPoster).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Revisa los campos indicados')
    expect(document.activeElement?.getAttribute('aria-invalid')).toBe('true')
  })

  it('updates the final date minimum through the DatePicker model', async () => {
    render()
    await setDate('promo-begin-date', '2026-12-01')
    const end = wrapper.findAllComponents({ name: 'DatePicker' })
      .find((item) => item.attributes('id') === 'promo-end-date')!
    expect(end.props('min')).toBe('2026-12-01')
    expect(end.props('required')).toBe(true)
  })

  it('rejects reversed dates and clears their error on a new initial date', async () => {
    render()
    await fillValid()
    await setDate('promo-end-date', '2026-11-16')
    await submit()
    expect(wrapper.find('#promo-end-date-error').exists()).toBe(true)
    expect(createPromotion).not.toHaveBeenCalled()
    await setDate('promo-begin-date', '2026-11-15')
    expect(wrapper.find('#promo-end-date-error').exists()).toBe(false)
  })

  it.each(['0', '100.01', '25.123'])('rejects invalid percentage amount %s', async (amount) => {
    render()
    await fillValid()
    await wrapper.get('#promo-amount').setValue(amount)
    await submit()
    expect(wrapper.find('#promo-amount-error').exists()).toBe(true)
    expect(createPromotion).not.toHaveBeenCalled()
  })

  it('accepts a fixed discount of 4000 after changing the type', async () => {
    render()
    await fillValid()
    await update('SimpleDropdown', 'Tipo de promoción', 'fixed')
    await wrapper.get('#promo-amount').setValue('4000')
    await submit()
    expect(createPromotion).toHaveBeenCalledWith(expect.objectContaining({
      promotionType: 'fixed', promotionAmount: 4000,
    }))
  })

  it('maps null optional dropdown selections to unrestricted values', async () => {
    render()
    await fillValid()
    await update('SimpleDropdown', 'Formato de proyección', '2D')
    await update('SimpleDropdown', 'Tecnología', 'STANDARD')
    await update('SimpleDropdown', 'Formato de proyección', null)
    await update('SimpleDropdown', 'Tecnología', null)
    await submit()
    expect(createPromotion).toHaveBeenCalledWith(expect.objectContaining({
      projectionFormat: null, technology: null,
    }))
  })

  it('requires a promotion type when its dropdown is cleared', async () => {
    render()
    await fillValid()
    await update('SimpleDropdown', 'Tipo de promoción', null)
    await submit()
    expect(control('SimpleDropdown', 'Tipo de promoción').props('error')).toBeTruthy()
    expect(createPromotion).not.toHaveBeenCalled()
  })

  it('rejects 3D with 70MM', async () => {
    render()
    await fillValid()
    await update('SimpleDropdown', 'Formato de proyección', '3D')
    await update('SimpleDropdown', 'Tecnología', '70MM')
    await submit()
    expect(control('SimpleDropdown', 'Tecnología').props('error')).toBeTruthy()
    expect(createPromotion).not.toHaveBeenCalled()
  })

  it('requires hours when all-day is unchecked', async () => {
    render()
    await fillValid()
    await wrapper.get('label.full-width input[type="checkbox"]').setValue(false)
    await submit()
    expect(wrapper.find('#promo-begin-hour-error').exists()).toBe(true)
    expect(wrapper.find('#promo-end-hour-error').exists()).toBe(true)
    expect(createPromotion).not.toHaveBeenCalled()
  })

  it('sends 24:00 for the end-of-day option and sorted weekdays', async () => {
    render()
    await fillValid()
    await wrapper.get('label.full-width input[type="checkbox"]').setValue(false)
    await wrapper.get('#promo-begin-hour').setValue('22:00')
    const midnight = wrapper.findAll('label').find((label) => label.text().includes('Hasta el final del día'))!
    await midnight.get('input').setValue(true)
    await wrapper.get('.day-option input[value="4"]').setValue(true)
    await wrapper.get('.day-option input[value="2"]').setValue(true)
    await submit()
    expect(createPromotion).toHaveBeenCalledWith(expect.objectContaining({
      beginHour: '22:00', endHour: '24:00', weekdays: [2, 4],
    }))
  })
})

describe('PromotionCreate: saving and poster uploads', () => {
  it('sends a normalized payload without uploading an optional poster', async () => {
    render()
    await fillValid()
    await submit()
    expect(createPromotion).toHaveBeenCalledTimes(1)
    expect(createPromotion).toHaveBeenCalledWith({
      promotionType: 'percentage', promotionAmount: 25.5,
      beginDate: '2026-11-17', endDate: '2026-12-31',
      beginHour: null, endHour: null, projectionFormat: null, technology: null,
      promotionTitle: 'Tardes de cine', description: 'Descuento en funciones elegibles.',
      conditions: null, posterPath: null, weekdays: [], branchIds: [1, 2],
    })
    expect(uploadPromotionPoster).not.toHaveBeenCalled()
    expect(wrapper.emitted('saved')).toHaveLength(1)
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('uploads the poster before creating the promotion', async () => {
    render()
    await fillValid()
    const pending = deferred<{ filename: string; path: string }>()
    vi.mocked(uploadPromotionPoster).mockReturnValueOnce(pending.promise)
    const file = await selectPoster()
    await submit()
    expect(uploadPromotionPoster).toHaveBeenCalledWith(file)
    expect(createPromotion).not.toHaveBeenCalled()
    pending.resolve({ filename: 'banner.webp', path: '/uploads/promotions/banner.webp' })
    await flushPromises()
    expect(createPromotion).toHaveBeenCalledWith(expect.objectContaining({
      posterPath: '/uploads/promotions/banner.webp',
    }))
    expect(getPromotionPosterUrl).toHaveBeenCalledWith('/uploads/promotions/banner.webp')
  })

  it('reuses a successful upload if promotion creation fails and is retried', async () => {
    render()
    await fillValid()
    await selectPoster()
    vi.mocked(createPromotion).mockRejectedValueOnce(new Error('Connection failed'))
    await submit()
    expect(wrapper.emitted('saved')).toBeUndefined()
    expect(wrapper.findComponent({ name: 'NotificationPopup' }).exists()).toBe(true)
    await submit()
    expect(uploadPromotionPoster).toHaveBeenCalledTimes(1)
    expect(createPromotion).toHaveBeenCalledTimes(2)
    expect(createPromotion).toHaveBeenLastCalledWith(expect.objectContaining({
      posterPath: '/uploads/promotions/banner.webp',
    }))
    expect(wrapper.emitted('saved')).toHaveLength(1)
  })

  it.each(['', 'x'.repeat(501)])('rejects an invalid uploaded poster path', async (path) => {
    render()
    await fillValid()
    await selectPoster()
    vi.mocked(uploadPromotionPoster).mockResolvedValueOnce({ filename: 'banner.webp', path })
    await submit()
    expect(createPromotion).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('No se recibió una ruta válida')
    expect(button('Crear promoción').attributes('disabled')).toBeUndefined()
  })

  it('does not create the promotion if uploading fails', async () => {
    render()
    await fillValid()
    await selectPoster()
    vi.mocked(uploadPromotionPoster).mockRejectedValueOnce(apiError(413, 'Imagen demasiado grande.'))
    await submit()
    expect(createPromotion).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Imagen demasiado grande.')
    expect(wrapper.emitted('saved')).toBeUndefined()
  })

  it('blocks duplicate submissions and disables controls while saving', async () => {
    render()
    await fillValid()
    const pending = deferred<{ promotionId: number }>()
    vi.mocked(createPromotion).mockReturnValueOnce(pending.promise)
    await submit()
    expect(wrapper.get('.create-fieldset').attributes('disabled')).toBeDefined()
    expect(button('Seleccionar todas').attributes('disabled')).toBeDefined()
    expect(button('Limpiar').attributes('disabled')).toBeDefined()
    expect(button('Cancelar').attributes('disabled')).toBeDefined()
    expect(wrapper.findComponent({ name: 'BaseModal' }).props('closeDisabled')).toBe(true)
    expect(wrapper.findComponent({ name: 'PromotionImageUpload' }).props('disabled')).toBe(true)
    expect(wrapper.findAllComponents({ name: 'DatePicker' }).every((item) => item.props('disabled'))).toBe(true)
    await wrapper.get('form').trigger('submit')
    expect(createPromotion).toHaveBeenCalledTimes(1)
    pending.resolve({ promotionId: 42 })
    await flushPromises()
    expect(wrapper.emitted('saved')).toHaveLength(1)
  })

  it('emits close on cancel without saving', async () => {
    render()
    await button('Cancelar').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
    expect(createPromotion).not.toHaveBeenCalled()
  })

  it('forwards a modal close event', async () => {
    render()
    wrapper.findComponent({ name: 'BaseModal' }).vm.$emit('close')
    await nextTick()
    expect(wrapper.emitted('close')).toHaveLength(1)
  })
})

describe('PromotionCreate: API errors', () => {
  it.each([
    { status: 401, event: 'session-expired' },
    { status: 403, event: 'forbidden' },
  ])('emits $event for HTTP $status', async ({ status, event }) => {
    render()
    await fillValid()
    vi.mocked(createPromotion).mockRejectedValueOnce(apiError(status))
    await submit()
    expect(wrapper.emitted(event)).toHaveLength(1)
    expect(wrapper.emitted('saved')).toBeUndefined()
    expect(wrapper.emitted('close')).toBeUndefined()
    expect(button('Crear promoción').attributes('disabled')).toBeUndefined()
  })

  it.each([400, 409, 413, 415])('shows an API message for HTTP %s', async (status) => {
    render()
    await fillValid()
    vi.mocked(createPromotion).mockRejectedValueOnce(apiError(status, 'Revisa los datos enviados.'))
    await submit()
    expect(wrapper.text()).toContain('Revisa los datos enviados.')
    expect(wrapper.emitted('saved')).toBeUndefined()
  })

  it('joins API validation messages and ignores non-string entries', async () => {
    render()
    await fillValid()
    vi.mocked(createPromotion).mockRejectedValueOnce(apiError(400, ['Error uno.', 7, 'Error dos.']))
    await submit()
    expect(wrapper.text()).toContain('Error uno. Error dos.')
  })

  it('shows a fallback when the API provides no useful message', async () => {
    render()
    await fillValid()
    vi.mocked(createPromotion).mockRejectedValueOnce(apiError(400, {}))
    await submit()
    expect(wrapper.text()).toContain('Revisa los datos, las sucursales y la imagen seleccionada.')
  })

  it('shows a dismissible generic message for unexpected failures', async () => {
    render()
    await fillValid()
    vi.mocked(createPromotion).mockRejectedValueOnce(apiError(500))
    await submit()
    const notification = wrapper.findComponent({ name: 'NotificationPopup' })
    expect(notification.props('message')).toBe('No se pudo crear la promoción. Vuelve a intentarlo.')
    notification.vm.$emit('close')
    await nextTick()
    expect(wrapper.findComponent({ name: 'NotificationPopup' }).exists()).toBe(false)
  })
})


function detail(overrides: Partial<PromotionDetail> = {}): PromotionDetail {
  return {
    promotionId: 42, promotionType: 'fixed', promotionAmount: 3500.5,
    promotionTitle: 'Promoción guardada', description: 'Descripción guardada',
    conditions: 'Condiciones guardadas', posterPath: '/uploads/promotions/banner.webp',
    beginDate: '2026-11-17', endDate: '2026-12-31', beginHour: '22:00', endHour: '24:00',
    projectionFormat: '2D', technology: 'IMAX', weekdays: [2, 4], branchIds: [1, 99],
    ...overrides,
  }
}

describe('PromotionCreate: read-only view mode', () => {
  it('does not fetch details in the default create mode', () => {
    render()
    expect(getPromotion).not.toHaveBeenCalled()
  })

  it('loads details into disabled fields and displays the stored poster', async () => {
    render(cinemas, { mode: 'view', promotionId: 42 })
    expect(wrapper.getComponent({ name: 'LoadingState' }).props('message')).toBe('Cargando datos de la promocion…')
    expect(wrapper.getComponent({ name: 'LoadingState' }).props('compact')).toBe(true)
    await flushPromises()
    expect(getPromotion).toHaveBeenCalledWith(42, expect.any(AbortSignal))
    expect(wrapper.findComponent({ name: 'BaseModal' }).props('title')).toBe('Detalle de promoción')
    expect(control('LimitedTextInput', 'Nombre de la promoción').props('modelValue')).toBe('Promoción guardada')
    expect(control('LimitedTextInput', 'Descripción').props('modelValue')).toBe('Descripción guardada')
    expect(control('LimitedTextInput', 'Condiciones (opcional)').props('modelValue')).toBe('Condiciones guardadas')
    expect(control('SimpleDropdown', 'Tipo de promoción').props('modelValue')).toBe('fixed')
    expect(control('SimpleDropdown', 'Formato de proyección').props('modelValue')).toBe('2D')
    expect(control('SimpleDropdown', 'Tecnología').props('modelValue')).toBe('IMAX')
    expect(wrapper.get('#promotion-detail-id').element).toHaveProperty('value', '42')
    expect(wrapper.get('#promo-amount').element).toHaveProperty('value', '3500.5')
    expect(wrapper.get('#promo-begin-hour').element).toHaveProperty('value', '22:00')
    expect(wrapper.get('#promo-end-hour').element).toHaveProperty('value', '24:00')
    expect(control('ReusableSearchDropdown', 'Sucursales').props('modelValue')).toEqual([1, 99])
    expect(control('ReusableSearchDropdown', 'Sucursales').props('options')).toContainEqual({ value: 99, label: 'Sucursal #99' })
    expect(wrapper.get('.day-option input[value="2"]').element).toHaveProperty('checked', true)
    expect(wrapper.get('.day-option input[value="4"]').element).toHaveProperty('checked', true)
    expect(wrapper.get('.create-fieldset').attributes('disabled')).toBeDefined()
    expect(wrapper.findAllComponents({ name: 'LimitedTextInput' }).every((item) => item.props('disabled'))).toBe(true)
    expect(wrapper.findAllComponents({ name: 'SimpleDropdown' }).every((item) => item.props('disabled'))).toBe(true)
    expect(wrapper.findAllComponents({ name: 'DatePicker' }).every((item) => item.props('disabled'))).toBe(true)
    expect(wrapper.findComponent({ name: 'PromotionImageUpload' }).exists()).toBe(false)
    expect(wrapper.get('img.detail-poster').attributes('src')).toBe('/api/image-handler/promotions/banner.webp')
    expect(wrapper.find('button[type="submit"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Seleccionar todas')
    await submit()
    expect(createPromotion).not.toHaveBeenCalled()
    expect(uploadPromotionPoster).not.toHaveBeenCalled()
    await button('Cerrar').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('shows null restrictions and no poster without enabling creation', async () => {
    vi.mocked(getPromotion).mockResolvedValueOnce(detail({
      beginHour: null, endHour: null, posterPath: null, conditions: null,
      projectionFormat: null, technology: null, weekdays: [], branchIds: [],
    }))
    render([], { mode: 'view', promotionId: 42 })
    await flushPromises()
    expect(wrapper.text()).toContain('Sin póster.')
    expect(wrapper.text()).toContain('0 sucursales asociadas.')
    expect(wrapper.find('#promo-begin-hour').exists()).toBe(false)
    expect(control('SimpleDropdown', 'Formato de proyección').props('modelValue')).toBeNull()
    expect(control('SimpleDropdown', 'Tecnología').props('modelValue')).toBeNull()
    expect(wrapper.findAll('input[type="checkbox"]').slice(1).every((item) => !(item.element as HTMLInputElement).checked)).toBe(true)
  })

  it('shows a poster fallback when image loading fails', async () => {
    render(cinemas, { mode: 'view', promotionId: 42 })
    await flushPromises()
    await wrapper.get('img.detail-poster').trigger('error')
    expect(wrapper.text()).toContain('No se pudo cargar el póster.')
  })

  it('shows a not-found message and permits retry', async () => {
    vi.mocked(getPromotion).mockRejectedValueOnce(apiError(404))
    render(cinemas, { mode: 'view', promotionId: 42 })
    await flushPromises()
    expect(wrapper.text()).toContain('La promoción no existe')
    expect(wrapper.find('.create-fieldset').exists()).toBe(false)
    await button('Reintentar').trigger('click')
    await flushPromises()
    expect(getPromotion).toHaveBeenCalledTimes(2)
    expect(wrapper.find('.create-fieldset').exists()).toBe(true)
  })

  it.each([
    { status: 401, event: 'session-expired' }, { status: 403, event: 'forbidden' },
  ])('forwards authentication errors in view mode: $status', async ({ status, event }) => {
    vi.mocked(getPromotion).mockRejectedValueOnce(apiError(status))
    render(cinemas, { mode: 'view', promotionId: 42 })
    await flushPromises()
    expect(wrapper.emitted(event)).toHaveLength(1)
    expect(createPromotion).not.toHaveBeenCalled()
  })

  it('shows a generic detail load error for unexpected failures', async () => {
    vi.mocked(getPromotion).mockRejectedValueOnce(new Error('Offline'))
    render(cinemas, { mode: 'view', promotionId: 42 })
    await flushPromises()
    expect(wrapper.text()).toContain('No se pudo cargar la promoción.')
  })

  it('rejects view mode without a valid ID', async () => {
    render(cinemas, { mode: 'view' })
    await flushPromises()
    expect(wrapper.text()).toContain('Selecciona una promoción válida.')
    expect(getPromotion).not.toHaveBeenCalled()
  })

  it('ignores a stale detail response after the requested ID changes', async () => {
    const old = deferred<PromotionDetail>()
    vi.mocked(getPromotion).mockReturnValueOnce(old.promise).mockResolvedValueOnce(detail({ promotionId: 7, promotionTitle: 'Nueva' }))
    render(cinemas, { mode: 'view', promotionId: 42 })
    const signal = vi.mocked(getPromotion).mock.calls[0]![1]!
    await wrapper.setProps({ promotionId: 7 })
    await flushPromises()
    expect(signal.aborted).toBe(true)
    old.resolve(detail())
    await flushPromises()
    expect(control('LimitedTextInput', 'Nombre de la promoción').props('modelValue')).toBe('Nueva')
  })

  it('aborts pending detail fetches when unmounted', () => {
    const pending = deferred<PromotionDetail>()
    vi.mocked(getPromotion).mockReturnValueOnce(pending.promise)
    render(cinemas, { mode: 'view', promotionId: 42 })
    const signal = vi.mocked(getPromotion).mock.calls[0]![1]!
    wrapper.unmount()
    expect(signal.aborted).toBe(true)
    pending.resolve(detail())
  })
})
