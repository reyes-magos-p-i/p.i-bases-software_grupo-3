import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { AxiosError, type AxiosResponse } from 'axios'
import BranchDetailDialog from '@/components/branches/BranchDetailDialog.vue'
import type { BranchDetail } from '@/types/branch'

const { getBranch } = vi.hoisted(() => ({ getBranch: vi.fn() }))
vi.mock('@/services/branch.service', async () => {
  const actual = await vi.importActual<typeof import('@/services/branch.service')>(
    '@/services/branch.service',
  )
  return { ...actual, getBranch }
})

const NO_NAME = 'Esta sucursal no tiene nombre registrado'
const NO_COMPANY = 'Esta sucursal no tiene compañía asignada'
const INCOMPLETE = 'Hay datos incompletos en esta sucursal. Modifícala para completarlos.'
const page = new DOMWrapper(document.body)
const prototype = HTMLDialogElement.prototype
const originalShow = Object.getOwnPropertyDescriptor(prototype, 'showModal')
const originalClose = Object.getOwnPropertyDescriptor(prototype, 'close')
let wrapper: VueWrapper<InstanceType<typeof BranchDetailDialog>> | undefined
const branch: BranchDetail = {
  id: 2,
  name: 'Sucursal Heredia Centro',
  companyId: 2,
  companyName: 'Cinetadel S.A',
  status: 'ACTIVE',
}

function failure(status?: number) {
  return new AxiosError(
    'HTTP failure',
    undefined,
    undefined,
    undefined,
    status ? ({ status } as AxiosResponse) : undefined,
  )
}
function field(label: string) {
  const element = page.findAll('.detail-field').find((item) => item.get('dt').text() === label)
  if (!element) throw new Error('Missing field: ' + label)
  return element.get('.readonly-value').text()
}
async function render(branchId: number | null = 2) {
  wrapper = mount(BranchDetailDialog, { props: { branchId }, attachTo: document.body })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  getBranch.mockReset().mockResolvedValue(branch)
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
  document.body.removeAttribute('style')
  document.documentElement.removeAttribute('style')
  vi.restoreAllMocks()
})

describe('BranchDetailDialog', () => {
  it('stays closed without a selected branch', async () => {
    await render(null)
    expect(getBranch).not.toHaveBeenCalled()
    expect(page.get<HTMLDialogElement>('dialog').element.open).toBe(false)
  })

  it('UT-016/017/020: shows Nombre and Compañía as read-only values without alerts', async () => {
    await render()
    expect(getBranch).toHaveBeenCalledWith(2, expect.any(AbortSignal))
    expect(page.get<HTMLDialogElement>('dialog').element.open).toBe(true)
    expect(page.get('.app-modal-title').text()).toBe('Detalle de sucursal')
    expect(field('ID Sucursal')).toBe('SU-002')
    expect(field('Estado')).toBe('Activa')
    expect(field('Nombre')).toBe('Sucursal Heredia Centro')
    expect(field('Compañía')).toBe('Cinetadel S.A')
    expect(page.findAll('input, textarea, select')).toHaveLength(0)
    expect(page.text()).not.toContain(INCOMPLETE)
    expect(page.find('.field-alert').exists()).toBe(false)
  })

  it.each([
    'Sucursal Gran Centro Comercial Heredia Norte Oeste',
    'Sucursal Peñas Blancas San Ramón',
  ])('UT-018/019: shows the whole name %s', async (name) => {
    getBranch.mockResolvedValueOnce({ ...branch, name })
    await render()
    expect(field('Nombre')).toBe(name)
  })

  it.each([
    ['UT-021', { name: null }, [NO_NAME], 'Cinetadel S.A'],
    ['UT-022', { companyName: null }, [NO_COMPANY], 'Sucursal Heredia Centro'],
    ['UT-023', { name: null, companyName: null }, [NO_NAME, NO_COMPANY], null],
  ] as const)('%s: alerts about the missing data', async (_, missing, alerts, shown) => {
    getBranch.mockResolvedValueOnce({ ...branch, ...missing })
    await render()
    expect(page.get('.incomplete-notice').text()).toBe(INCOMPLETE)
    expect(page.findAll('.field-alert').map((alert) => alert.text())).toEqual(alerts)
    for (const label of ['Nombre', 'Compañía']) {
      const value = field(label)
      if (value !== '—') expect(value).toBe(shown)
    }
    expect(page.findAll('.readonly-value.missing')).toHaveLength(alerts.length)
  })

  it('shows an inactive branch as Inactiva', async () => {
    getBranch.mockResolvedValueOnce({ ...branch, status: 'INACTIVE' })
    await render()
    expect(field('Estado')).toBe('Inactiva')
  })

  it('asks to modify the loaded branch (SCRUM-33)', async () => {
    const view = await render()
    const modify = page.findAll('button').find((button) => button.text().includes('Modificar'))
    expect(modify?.attributes('disabled')).toBeUndefined()
    await modify!.trigger('click')
    expect(view.emitted('modify')).toEqual([[branch]])
  })

  it('shows the loading state while the detail is requested', async () => {
    getBranch.mockReturnValueOnce(new Promise(() => {}))
    await render()
    expect(page.get('[role="status"]').text()).toBe('Cargando datos de la sucursal…')
  })

  it('retries after a server error', async () => {
    getBranch.mockRejectedValueOnce(failure(500))
    await render()
    expect(page.get('[role="alert"]').text()).toContain(
      'No se pudo cargar la sucursal, intenta de nuevo',
    )
    await page
      .findAll('button')
      .find((button) => button.text() === 'Reintentar')!
      .trigger('click')
    await flushPromises()
    expect(getBranch).toHaveBeenCalledTimes(2)
    expect(field('Nombre')).toBe('Sucursal Heredia Centro')
  })

  it.each([
    [401, 'La sesión ha expirado. Inicia sesión nuevamente.', 'session-expired'],
    [403, 'No tiene permisos para acceder a esta sección', 'forbidden'],
    [404, 'La sucursal seleccionada no existe.', undefined],
  ] as const)('handles a %i answer', async (status, message, event) => {
    getBranch.mockRejectedValueOnce(failure(status))
    const view = await render()
    expect(page.get('[role="alert"]').text()).toBe(message)
    expect(page.findAll('button').some((button) => button.text() === 'Reintentar')).toBe(false)
    if (event) expect(view.emitted(event)).toHaveLength(1)
  })

  it('treats a network failure as retryable', async () => {
    getBranch.mockRejectedValueOnce(failure())
    await render()
    expect(page.text()).toContain('Reintentar')
  })

  it('closes from the footer button and ignores a late answer', async () => {
    let resolve!: (value: BranchDetail) => void
    getBranch.mockReturnValueOnce(new Promise((done) => (resolve = done)))
    const view = await render()
    await page
      .findAll('button')
      .find((button) => button.text() === 'Cerrar')!
      .trigger('click')
    expect(view.emitted('close')).toHaveLength(1)
    resolve(branch)
    await flushPromises()
    expect(page.find('.detail-field').exists()).toBe(false)
  })

  it('loads the newly selected branch and clears it when deselected', async () => {
    const view = await render()
    getBranch.mockResolvedValueOnce({ ...branch, id: 7, name: 'Sucursal Sin Compania' })
    await view.setProps({ branchId: 7 })
    await flushPromises()
    expect(field('ID Sucursal')).toBe('SU-007')
    await view.setProps({ branchId: null })
    await flushPromises()
    expect(page.find('.detail-field').exists()).toBe(false)
  })
})
