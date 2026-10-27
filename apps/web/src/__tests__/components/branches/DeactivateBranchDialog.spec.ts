import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import DeactivateBranchDialog from '@/components/branches/DeactivateBranchDialog.vue'
import type { BranchListItem } from '@/types/branch'

const page = new DOMWrapper(document.body)
const branch: BranchListItem = {
  id: 21,
  name: 'Sucursal Heredia Oeste',
  companyId: 23,
  companyName: 'Cinetadel del Pacifico',
}
let wrapper: VueWrapper | undefined

async function render(props: Record<string, unknown> = {}) {
  wrapper = mount(DeactivateBranchDialog, { props: { branch, ...props }, attachTo: document.body })
  await flushPromises()
  return wrapper
}
const button = (text: string) => page.findAll('button').find((item) => item.text() === text)!

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: vi.fn(function (this: HTMLDialogElement) {
      this.open = true
    }),
  })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value: vi.fn(function (this: HTMLDialogElement) {
      this.open = false
    }),
  })
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
})

describe('DeactivateBranchDialog', () => {
  it('asks for confirmation with Confirmar and Cancelar (UT-037)', async () => {
    const view = await render()
    expect(page.get('.question').text()).toBe(
      '¿Está seguro de que desea desactivar la sucursal Sucursal Heredia Oeste?',
    )
    expect(page.get('.company').text()).toBe('Compañía: Cinetadel del Pacifico')
    expect(page.get('.deactivation-warning').text()).toContain('Esta acción es irreversible.')
    await button('Confirmar').trigger('click')
    expect(view.emitted('confirm')).toHaveLength(1)
  })

  it('closes without confirming (UT-038)', async () => {
    const view = await render()
    await button('Cancelar').trigger('click')
    expect(view.emitted('close')).toHaveLength(1)
    expect(view.emitted('confirm')).toBeUndefined()
  })

  it('names a branch without a name by its ID', async () => {
    await render({ branch: { ...branch, id: 25, name: null, companyName: null } })
    expect(page.get('.question').text()).toBe(
      '¿Está seguro de que desea desactivar la sucursal SU-025?',
    )
    expect(page.find('.company').exists()).toBe(false)
  })

  it('blocks both buttons while saving', async () => {
    const view = await render({ saving: true })
    expect(button('Desactivando…').attributes('disabled')).toBeDefined()
    expect(button('Cancelar').attributes('disabled')).toBeDefined()
    await page.get('.app-modal-close').trigger('click')
    expect(view.emitted('close')).toBeUndefined()
  })

  it('shows the error and only allows a retry when it can help (UT-039, UT-040)', async () => {
    const view = await render()
    await view.setProps({ error: 'No se pudo desactivar la sucursal, intenta de nuevo' })
    await flushPromises()
    const alert = page.get('.deactivation-error')
    expect(alert.text()).toBe('No se pudo desactivar la sucursal, intenta de nuevo')
    expect(document.activeElement).toBe(alert.element)
    expect(button('Confirmar').attributes('disabled')).toBeUndefined()

    await view.setProps({ error: 'La sucursal no existe o ya fue desactivada', blocked: true })
    expect(button('Confirmar').attributes('disabled')).toBeDefined()
  })

  it('renders nothing without a branch', async () => {
    await render({ branch: null })
    expect(page.find('.branch-deactivation-content').exists()).toBe(false)
  })
})
