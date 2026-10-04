import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { AxiosError, type AxiosResponse } from 'axios'
import DeactivateUserDialog from '@/components/users/DeactivateUserDialog.vue'
import type { UserDeactivationSelection } from '@/types/user'

const { deactivateUser } = vi.hoisted(() => ({ deactivateUser: vi.fn() }))
vi.mock('@/services/user.service', () => ({ deactivateUser }))
const page = new DOMWrapper(document.body)
const prototype = HTMLDialogElement.prototype
const originalShow = Object.getOwnPropertyDescriptor(prototype, 'showModal')
const originalClose = Object.getOwnPropertyDescriptor(prototype, 'close')
let wrapper: VueWrapper<InstanceType<typeof DeactivateUserDialog>> | undefined
const selection: UserDeactivationSelection = {
  section: 'clients',
  id: 42,
  name: 'Ana Núñez',
  displayId: 'CL42',
}
function failure(status?: number, message?: string | string[]) {
  return new AxiosError(
    'HTTP failure',
    undefined,
    undefined,
    undefined,
    status ? ({ status, data: { message } } as AxiosResponse) : undefined,
  )
}
async function render(selectionValue: UserDeactivationSelection | null = selection) {
  wrapper = mount(DeactivateUserDialog, {
    props: { selection: selectionValue },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}
function button(text: string) {
  const result = page.findAll('button').find((item) => item.text() === text)
  if (!result) throw new Error('Missing button ' + text)
  return result
}
beforeEach(() => {
  deactivateUser.mockReset().mockResolvedValue(undefined)
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
  for (const [key, descriptor] of [
    ['showModal', originalShow],
    ['close', originalClose],
  ] as const) {
    if (descriptor) Object.defineProperty(prototype, key, descriptor)
    else Reflect.deleteProperty(prototype, key)
  }
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('DeactivateUserDialog', () => {
  it('waits for a selected user without submitting', async () => {
    await render(null)
    expect(page.get<HTMLDialogElement>('dialog').element.open).toBe(false)
    expect(deactivateUser).not.toHaveBeenCalled()
  })
  it('identifies the selected user, warns about access and keeps cancellation available', async () => {
    await render()
    expect(page.text()).toContain('Ana Núñez')
    expect(page.text()).toContain('CL42')
    expect(page.text()).toContain('perderá el acceso')
    expect(page.text()).toContain('se conservarán')
    await button('Cancelar').trigger('click')
    expect(wrapper?.emitted('close')).toHaveLength(1)
    expect(deactivateUser).not.toHaveBeenCalled()
  })
  it('submits exactly the selected user after confirmation and emits success', async () => {
    await render()
    await button('Confirmar desactivación').trigger('click')
    await flushPromises()
    expect(deactivateUser).toHaveBeenCalledWith(selection)
    expect(wrapper?.emitted('deactivated')).toHaveLength(1)
  })
  it('prevents duplicate confirmation and closing while saving', async () => {
    let resolve!: () => void
    deactivateUser.mockImplementation(
      () =>
        new Promise<void>((done) => {
          resolve = done
        }),
    )
    await render()
    await button('Confirmar desactivación').trigger('click')
    expect(button('Cancelar').attributes('disabled')).toBeDefined()
    await button('Desactivando…').trigger('click')
    await button('Cancelar').trigger('click')
    await page.get('dialog').trigger('cancel')
    expect(deactivateUser).toHaveBeenCalledTimes(1)
    expect(wrapper?.emitted('close')).toBeUndefined()
    resolve()
    await flushPromises()
    expect(wrapper?.emitted('deactivated')).toHaveLength(1)
  })
  it.each([
    [401, 'La sesión ha expirado.', 'session-expired'],
    [403, 'No tienes permiso', 'forbidden'],
    [404, 'no existe o ya está inactivo', undefined],
    [409, 'Debe permanecer al menos un administrador activo.', undefined],
    [500, 'No se pudo confirmar', undefined],
    [undefined, 'No se pudo confirmar', undefined],
  ])('handles %s without exposing backend details or retrying', async (status, text, event) => {
    deactivateUser.mockRejectedValue(
      failure(status as number | undefined, 'private database detail'),
    )
    await render()
    await button('Confirmar desactivación').trigger('click')
    await flushPromises()
    expect(page.get('[role="alert"]').text()).toContain(text as string)
    expect(page.text()).not.toContain('private database detail')
    expect(button('Confirmar desactivación').attributes('disabled')).toBeDefined()
    expect(deactivateUser).toHaveBeenCalledTimes(1)
    expect(wrapper?.emitted(event ?? 'session-expired')?.length ?? 0).toBe(event ? 1 : 0)
    expect(document.activeElement).toBe(page.get('[role="alert"]').element)
    await button('Cancelar').trigger('click')
    expect(wrapper?.emitted('close')).toHaveLength(1)
  })
  it.each([
    'No puedes desactivar tu propia cuenta.',
    'Debe permanecer al menos un administrador activo.',
  ])('explains protected accounts: %s', async (message) => {
    deactivateUser.mockRejectedValue(failure(409, message))
    await render()
    await button('Confirmar desactivación').trigger('click')
    await flushPromises()
    expect(page.get('[role="alert"]').text()).toBe(message)
  })
  it('ignores completion after unmounting', async () => {
    let resolve!: () => void
    deactivateUser.mockImplementation(
      () =>
        new Promise<void>((done) => {
          resolve = done
        }),
    )
    const view = await render()
    await button('Confirmar desactivación').trigger('click')
    view.unmount()
    wrapper = undefined
    resolve()
    await flushPromises()
    expect(view.emitted('deactivated')).toBeUndefined()
  })
})
