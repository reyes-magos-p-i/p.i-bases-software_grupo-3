import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import CancelProjectionDialog from '@/components/projections/CancelProjectionDialog.vue'
import type { ListedProjection } from '@/types/projection'

const { cancelProjection } = vi.hoisted(() => ({ cancelProjection: vi.fn() }))
vi.mock('@/services/projection.service', () => ({ cancelProjection }))

const page = new DOMWrapper(document.body)
const prototype = HTMLDialogElement.prototype
const projection: ListedProjection = {
  movieFunctionId: 21,
  movieId: 42,
  movieTitle: 'The Odyssey',
  branchId: 2,
  branchName: 'Mall Oxígeno',
  theaterId: 1,
  startTime: '2099-10-08T14:55',
  endTime: '2099-10-08T18:30',
  status: 'ACTIVE',
  price: 3500,
}
const httpError = (status: number, message?: unknown) => ({
  isAxiosError: true,
  response: { status, data: { message } },
})
let wrapper: VueWrapper | undefined

async function render(value: ListedProjection | null = projection) {
  wrapper = mount(CancelProjectionDialog, { props: { projection: value }, attachTo: document.body })
  await flushPromises()
}

function button(text: string) {
  const found = page.findAll('button').find((item) => item.text() === text)
  if (!found) throw new Error(`Missing button ${text}`)
  return found
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2099, 9, 1, 12, 0))
  cancelProjection.mockReset().mockResolvedValue({ ...projection, status: 'CANCELLED' })
  Object.defineProperties(prototype, {
    showModal: {
      configurable: true,
      value: vi.fn(function (this: HTMLDialogElement) {
        this.open = true
      }),
    },
    close: {
      configurable: true,
      value: vi.fn(function (this: HTMLDialogElement) {
        this.open = false
      }),
    },
  })
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.useRealTimers()
  vi.restoreAllMocks()
  Reflect.deleteProperty(prototype, 'showModal')
  Reflect.deleteProperty(prototype, 'close')
  document.body.innerHTML = ''
})

describe('CancelProjectionDialog', () => {
  it('stays closed without a projection', async () => {
    await render(null)
    expect(page.text()).not.toContain('¿Deseas cancelar')
  })

  it('explains the cancellation and confirms it', async () => {
    await render()
    const text = page.text()
    expect(text).toContain('¿Deseas cancelar la proyección MF-021 de The Odyssey?')
    expect(text).toContain('Mall Oxígeno · Sala 1 · 08/10/2099 2:55 pm – 6:30 pm')
    expect(text).toContain('La cancelación es irreversible desde esta interfaz.')
    expect(page.find('.cancel-urgent').exists()).toBe(false)

    await button('Cancelar proyección').trigger('click')
    await flushPromises()
    expect(cancelProjection).toHaveBeenCalledExactlyOnceWith(21)
    expect(wrapper!.emitted('cancelled')).toEqual([[{ ...projection, status: 'CANCELLED' }]])
  })

  it.each([
    [{ status: 'IN_PROGRESS' as const }, 'Esta función está en curso.'],
    [{ startTime: '2099-10-02T09:00' }, 'Esta función empieza en menos de 24 horas.'],
  ])('reinforces the refund warning for urgent projections %#', async (override, message) => {
    await render({ ...projection, ...override })
    expect(page.get('.cancel-urgent').text()).toContain(message)
    expect(page.get('.cancel-urgent').text()).toContain('coordina el reembolso en oficina de inmediato')
  })

  it.each([
    [httpError(409, 'La proyección ya está cancelada.'), 'La proyección ya está cancelada.', undefined],
    [httpError(409), 'No se pudo cancelar la proyección, intenta de nuevo.', undefined],
    [httpError(404), 'Esta proyección ya no está disponible.', undefined],
    [httpError(403), 'No tienes permisos para realizar esta acción.', 'forbidden'],
    [httpError(401), 'La sesión ha expirado. Inicia sesión nuevamente.', 'sessionExpired'],
    [new Error('Network Error'), 'No se pudo cancelar la proyección, intenta de nuevo.', undefined],
  ])('explains failure %#', async (error, message, event) => {
    cancelProjection.mockRejectedValueOnce(error)
    await render()
    await button('Cancelar proyección').trigger('click')
    await flushPromises()
    expect(page.get('.cancel-error').text()).toBe(message)
    expect(document.activeElement).toBe(page.get('.cancel-error').element)
    if (event) expect(wrapper!.emitted(event)).toHaveLength(1)
    expect(wrapper!.emitted('cancelled')).toBeUndefined()
  })

  it('closes unless the cancellation is running and clears errors on a new selection', async () => {
    let finish!: (value: unknown) => void
    cancelProjection.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)))
    await render()
    await button('Cancelar proyección').trigger('click')
    expect(button('Cancelando…').attributes('disabled')).toBeDefined()
    await button('Volver').trigger('click')
    expect(wrapper!.emitted('close')).toBeUndefined()
    finish(projection)
    await flushPromises()
    await button('Volver').trigger('click')
    expect(wrapper!.emitted('close')).toHaveLength(1)

    cancelProjection.mockRejectedValueOnce(new Error('offline'))
    await button('Cancelar proyección').trigger('click')
    await flushPromises()
    await wrapper!.setProps({ projection: { ...projection, movieFunctionId: 22 } })
    expect(page.find('.cancel-error').exists()).toBe(false)
  })

  it('ignores answers after unmounting', async () => {
    let fail!: (error: unknown) => void
    cancelProjection.mockReturnValueOnce(new Promise((_, reject) => (fail = reject)))
    await render()
    await button('Cancelar proyección').trigger('click')
    const unmounted = wrapper!
    unmounted.unmount()
    wrapper = undefined
    fail(httpError(500))
    await flushPromises()
    expect(unmounted.emitted('cancelled')).toBeUndefined()
  })
})
