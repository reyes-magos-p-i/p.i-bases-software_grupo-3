// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import PromotionView from '@/components/promotions/PromotionView.vue'
import { getPromotion } from '@/services/promotion.service'
import type { PromotionDetail } from '@/types/promotion-read'

vi.mock('@/services/promotion.service', () => ({ getPromotion: vi.fn() }))
vi.mock('@/services/image-handler.service', () => ({
  getPromotionPosterUrl: (path?: string | null) => path ? `/api/image-handler/promotions/${path.split('/').pop()}` : null,
}))
const { open, close } = vi.hoisted(() => ({ open: vi.fn(), close: vi.fn() }))
vi.mock('@/components/projections/ProjectionDialogShell.vue', () => ({
  default: defineComponent({ name: 'ProjectionDialogShell', props: ['title'], emits: ['close'],
    setup(_, { expose }) { expose({ open, close }) },
    template: '<div><h2>{{ title }}</h2><slot /></div>',
  }),
}))
vi.mock('@/components/common/LoadingState.vue', () => ({
  default: defineComponent({ props: ['message', 'compact'], template: '<p role="status">{{ message }}</p>' }),
}))
function detail(overrides: Partial<PromotionDetail> = {}): PromotionDetail {
  return {
    promotionId: 42, promotionTitle: 'Tarde de cine', promotionType: 'percentage',
    promotionAmount: 25, description: 'Una descripción\ncon dos líneas.', conditions: 'Sujeto a disponibilidad.',
    beginDate: '2026-11-17', endDate: '2026-12-31', beginHour: '14:30', endHour: '24:00',
    projectionFormat: '2D', technology: 'STANDARD', weekdays: [4, 2], branchIds: [1, 99],
    posterPath: '/uploads/promotions/banner.webp', ...overrides,
  }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (value: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
let wrapper: VueWrapper
function render(promotionId: number | null = 42) {
  wrapper = mount(PromotionView, { props: { promotionId, cinemas: [{ id: 1, name: 'Central' }] } })
  return wrapper
}
function field(label: string) {
  return wrapper.findAll('.detail-field').find((item) => item.get('dt').text() === label)!.get('dd').text()
}
beforeEach(() => { vi.clearAllMocks(); vi.mocked(getPromotion).mockReset().mockResolvedValue(detail()) })
afterEach(() => wrapper?.unmount())

describe('PromotionView', () => {
  it('opens the standard shell and displays all promotion fields without inputs', async () => {
    render(); await flushPromises()
    expect(open).toHaveBeenCalledTimes(1)
    expect(getPromotion).toHaveBeenCalledWith(42, expect.any(AbortSignal))
    expect(wrapper.get('h2').text()).toBe('Detalle de promoción')
    expect(wrapper.get('h3').text()).toBe('Tarde de cine')
    expect(field('ID de promoción')).toBe('42')
    expect(field('Tipo de promoción')).toBe('Porcentaje')
    expect(field('Descuento')).toBe('25 %')
    expect(field('Descripción')).toContain('con dos líneas.')
    expect(field('Condiciones')).toBe('Sujeto a disponibilidad.')
    expect(field('Fecha inicial')).toBe('17/11/2026')
    expect(field('Fecha final')).toBe('31/12/2026')
    expect(field('Horario')).toBe('14:30 – 24:00')
    expect(field('Días de la semana')).toBe('Martes, Jueves')
    expect(field('Formato')).toBe('2D')
    expect(field('Tecnología')).toBe('Estándar')
    expect(field('Sucursales')).toBe('Central, Sucursal #99')
    expect(wrapper.find('input, textarea, select, form').exists()).toBe(false)
    expect(wrapper.get('img').attributes('src')).toBe('/api/image-handler/promotions/banner.webp')
    expect(wrapper.get('img').attributes('alt')).toBe('Póster de Tarde de cine')
  })
  it('shows loading while the request is pending', async () => {
    const pending = deferred<PromotionDetail>(); vi.mocked(getPromotion).mockReturnValueOnce(pending.promise)
    render(); await nextTick(); await nextTick()
    expect(wrapper.get('[role="status"]').text()).toContain('Cargando')
    expect(wrapper.find('dl').exists()).toBe(false)
    pending.resolve(detail()); await flushPromises()
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
  })
  it('formats fixed discounts as CRC currency', async () => {
    vi.mocked(getPromotion).mockResolvedValueOnce(detail({ promotionType: 'fixed', promotionAmount: 3500.5 }))
    render(); await flushPromises()
    expect(field('Tipo de promoción')).toBe('Monto fijo')
    expect(field('Descuento')).toBe(new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC' }).format(3500.5))
  })
  it.each([['IMAX', 'IMAX'], ['70MM', '70mm']] as const)('displays technology %s', async (technology, expected) => {
    vi.mocked(getPromotion).mockResolvedValueOnce(detail({ technology }))
    render(); await flushPromises()
    expect(field('Tecnología')).toBe(expected)
  })
  it('does not reorder the weekdays returned by the service', async () => {
    const response = detail({ weekdays: [7, 1, 4] })
    vi.mocked(getPromotion).mockResolvedValueOnce(response)
    render(); await flushPromises()
    expect(field('Días de la semana')).toBe('Lunes, Jueves, Domingo')
    expect(response.weekdays).toEqual([7, 1, 4])
  })

  it('shows optional restriction fallbacks', async () => {
    vi.mocked(getPromotion).mockResolvedValueOnce(detail({ beginHour: null, endHour: null, weekdays: [], branchIds: [], projectionFormat: null, technology: null, conditions: null, posterPath: null }))
    render(); await flushPromises()
    expect(field('Horario')).toBe('Todo el día')
    expect(field('Días de la semana')).toBe('Todos los días')
    expect(field('Formato')).toBe('Cualquier formato')
    expect(field('Tecnología')).toBe('Cualquier tecnología')
    expect(field('Condiciones')).toBe('Sin condiciones adicionales')
    expect(field('Sucursales')).toBe('Sin sucursales asociadas')
    expect(wrapper.text()).toContain('Sin póster.')
  })
  it('handles a broken poster', async () => {
    render(); await flushPromises(); await wrapper.get('img').trigger('error')
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.text()).toContain('No se pudo cargar el póster.')
  })
  it.each([[401, 'sessionExpired'], [403, 'forbidden']] as const)('emits the event for HTTP %s', async (status, event) => {
    vi.mocked(getPromotion).mockRejectedValueOnce({ isAxiosError: true, response: { status } })
    render(); await flushPromises()
    expect(wrapper.emitted(event)).toHaveLength(1)
  })
  it.each([
    [{ isAxiosError: true, response: { status: 404 } }, 'Esta promoción ya no está disponible.'],
    [new Error('Offline'), 'No se pudo cargar el detalle, intenta de nuevo.'],
  ])('shows a request failure and supports retry', async (failure, message) => {
    vi.mocked(getPromotion).mockRejectedValueOnce(failure)
    render(); await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain(message)
    await wrapper.get('.link-button').trigger('click'); await flushPromises()
    expect(getPromotion).toHaveBeenCalledTimes(2)
    expect(wrapper.find('dl').exists()).toBe(true)
  })
  it('does not request a null ID and loads when it becomes available', async () => {
    render(null); await flushPromises()
    expect(getPromotion).not.toHaveBeenCalled()
    await wrapper.setProps({ promotionId: 42 }); await flushPromises()
    expect(wrapper.find('dl').exists()).toBe(true)
  })
  it.each([0, -1, 1.5, NaN])('rejects invalid ID %s without a request', async (id) => {
    render(id); await flushPromises()
    expect(getPromotion).not.toHaveBeenCalled()
    expect(wrapper.get('[role="alert"]').text()).toContain('válida')
  })
  it('aborts an old request and ignores its late result', async () => {
    const pending = deferred<PromotionDetail>(); vi.mocked(getPromotion).mockReturnValueOnce(pending.promise)
    render(); await flushPromises()
    const signal = vi.mocked(getPromotion).mock.calls[0]![1]!
    await wrapper.setProps({ promotionId: 43 }); await flushPromises()
    expect(signal.aborted).toBe(true)
    pending.resolve(detail({ promotionTitle: 'Stale response' })); await flushPromises()
    expect(wrapper.get('h3').text()).toBe('Tarde de cine')
  })
  it('aborts and clears detail when the ID becomes null', async () => {
    const pending = deferred<PromotionDetail>(); vi.mocked(getPromotion).mockReturnValueOnce(pending.promise)
    render(); await flushPromises()
    const signal = vi.mocked(getPromotion).mock.calls[0]![1]!
    await wrapper.setProps({ promotionId: null })
    expect(signal.aborted).toBe(true)
    expect(close).toHaveBeenCalled()
    pending.resolve(detail()); await flushPromises()
    expect(wrapper.find('dl').exists()).toBe(false)
  })
  it('closes and emits close through the footer', async () => {
    render(); await flushPromises(); await wrapper.get('.secondary-button').trigger('click')
    expect(close).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted('close')).toHaveLength(1)
  })
  it('forwards shell close and cancels loading', async () => {
    const pending = deferred<PromotionDetail>(); vi.mocked(getPromotion).mockReturnValueOnce(pending.promise)
    render(); await flushPromises()
    const signal = vi.mocked(getPromotion).mock.calls[0]![1]!
    wrapper.getComponent({ name: 'ProjectionDialogShell' }).vm.$emit('close')
    expect(signal.aborted).toBe(true)
    expect(wrapper.emitted('close')).toHaveLength(1)
  })
  it('aborts when unmounted without reporting a cancellation error', async () => {
    const pending = deferred<PromotionDetail>(); vi.mocked(getPromotion).mockReturnValueOnce(pending.promise)
    render(); await flushPromises()
    const signal = vi.mocked(getPromotion).mock.calls[0]![1]!
    wrapper.unmount(); pending.reject(new Error('Cancelled')); await flushPromises()
    expect(signal.aborted).toBe(true)
    expect(wrapper.emitted('sessionExpired')).toBeUndefined()
  })
})
