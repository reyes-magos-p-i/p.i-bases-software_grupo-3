import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { AxiosError, type AxiosResponse } from 'axios'
import UserDetailDialog from '@/components/users/UserDetailDialog.vue'
import type { ClientDetail, EmployeeDetail, UserDetail, UserDetailSelection } from '@/types/user'

const { getUserDetail } = vi.hoisted(() => ({ getUserDetail: vi.fn() }))
vi.mock('@/services/user.service', () => ({ getUserDetail }))
const page = new DOMWrapper(document.body)
const prototype = HTMLDialogElement.prototype
const originalShow = Object.getOwnPropertyDescriptor(prototype, 'showModal')
const originalClose = Object.getOwnPropertyDescriptor(prototype, 'close')
let wrapper: VueWrapper<InstanceType<typeof UserDetailDialog>> | undefined
let opener: HTMLButtonElement
let bodyStyle: string | null
let rootStyle: string | null
const client: ClientDetail = {
  id: 42,
  role: 'CLIENT',
  firstName: 'Ana',
  secondName: 'María',
  firstSurname: 'Núñez',
  secondSurname: null,
  birthday: '2000-02-29',
  phoneNumber: '88888888',
  email: 'ana@example.com',
  gender: 'N',
  language: 'es',
  createdAt: '2026-10-04T05:30:00.000Z',
  address: {
    id: 7,
    provinceId: 1,
    provinceName: 'San José',
    cantonId: 2,
    cantonName: 'Central',
    districtId: 3,
    districtName: 'Carmen',
    details: 'Casa azul',
  },
}
const employee: EmployeeDetail = {
  id: 42,
  role: 'ADMINISTRATOR',
  firstName: 'José',
  secondName: null,
  firstSurname: 'Solano',
  secondSurname: 'Rojas',
  birthday: '1990-01-01',
  phoneNumber: '88888888',
  email: 'jose@example.com',
  address: client.address,
  createdAt: null,
  branchId: 5,
  branchName: 'Centro',
  hireDate: '2026-10-01',
}
function failure(status: number) {
  return new AxiosError('HTTP failure', undefined, undefined, undefined, {
    status,
  } as AxiosResponse)
}
function field(label: string) {
  const element = page.findAll('.detail-field').find((item) => item.get('dt').text() === label)
  if (!element) throw new Error('Missing field: ' + label)
  return element.get('dd').text()
}
async function render(selection: UserDetailSelection | null = { section: 'clients', id: 42 }) {
  wrapper = mount(UserDetailDialog, { props: { selection }, attachTo: document.body })
  await flushPromises()
  return wrapper
}
beforeEach(() => {
  bodyStyle = document.body.getAttribute('style')
  rootStyle = document.documentElement.getAttribute('style')
  getUserDetail.mockReset().mockResolvedValue(client)
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
  opener = document.createElement('button')
  document.body.append(opener)
  opener.focus()
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
  for (const [element, style] of [
    [document.body, bodyStyle],
    [document.documentElement, rootStyle],
  ] as const) {
    if (style === null) element.removeAttribute('style')
    else element.setAttribute('style', style)
  }
  vi.restoreAllMocks()
})

describe('UserDetailDialog', () => {
  it('waits for a selection without querying or locking the page', async () => {
    await render(null)
    expect(getUserDetail).not.toHaveBeenCalled()
    expect(page.get<HTMLDialogElement>('dialog').element.open).toBe(false)
    expect(document.body.style.position).not.toBe('fixed')
  })
  it('shows distinct personal fields and the full address as read-only values', async () => {
    await render()
    expect(field('ID')).toBe('CL42')
    expect(page.findAll('dt').some((item) => item.text() === 'Rol')).toBe(false)
    expect(field('Primer nombre')).toBe('Ana')
    expect(field('Segundo nombre')).toBe('María')
    expect(field('Primer apellido')).toBe('Núñez')
    expect(field('Segundo apellido')).toBe('Sin registrar')
    expect(field('Fecha de nacimiento')).toBe('29/02/2000')
    expect(field('Número de celular')).toBe('88888888')
    expect(field('Correo electrónico')).toBe('ana@example.com')
    expect(field('Provincia')).toBe('San José')
    expect(field('Cantón')).toBe('Central')
    expect(field('Distrito')).toBe('Carmen')
    expect(field('Detalle de dirección')).toBe('Casa azul')
    expect(field('Género')).toBe('Prefiero no decirlo')
    expect(field('Idioma')).toBe('Español')
    expect(field('Fecha de registro')).toBe('03/10/2026')
    expect(page.find('input, select, textarea').exists()).toBe(false)
    expect(page.text()).not.toContain('Historial de compras')
    expect(page.get('h2').text()).toBe('Detalle de cliente')
  })
  it.each(['EMPLOYEE', 'ADMINISTRATOR'] as const)(
    'shows %s branch and hire date without timezone conversion',
    async (role) => {
      getUserDetail.mockResolvedValue({ ...employee, role })
      await render({ section: 'employees', id: 42 })
      expect(field('ID')).toBe(role === 'ADMINISTRATOR' ? 'ADM42' : 'EMP42')
      expect(field('Rol')).toBe(role === 'ADMINISTRATOR' ? 'Administrador' : 'Empleado')
      expect(field('Sucursal')).toBe('Centro')
      expect(field('Fecha de contratación')).toBe('01/10/2026')
      expect(field('Fecha de registro')).toBe('Desconocida')
      expect(page.text()).not.toContain('Género')
      expect(getUserDetail).toHaveBeenCalledWith(
        { section: 'employees', id: 42 },
        expect.any(AbortSignal),
      )
    },
  )
  it('preserves unknown and missing values without inventing them', async () => {
    getUserDetail.mockResolvedValue({
      ...client,
      address: null,
      birthday: null,
      createdAt: null,
      phoneNumber: null,
      gender: null,
      language: 'pt',
      secondName: ' ',
    })
    await render()
    expect(field('Dirección')).toBe('Sin registrar')
    expect(field('Fecha de nacimiento')).toBe('Desconocida')
    expect(field('Fecha de registro')).toBe('Desconocida')
    expect(field('Número de celular')).toBe('Sin registrar')
    expect(field('Segundo nombre')).toBe('Sin registrar')
    expect(field('Género')).toBe('Sin registrar')
    expect(field('Idioma')).toBe('pt')
  })
  it('shows loading and allows retrying connection failures', async () => {
    let reject!: (reason: Error) => void
    getUserDetail.mockReturnValueOnce(
      new Promise((_, fail) => {
        reject = fail
      }),
    )
    await render()
    expect(page.get('[role="status"]').text()).toContain('Cargando datos')
    reject(new Error('Connection unavailable'))
    await flushPromises()
    expect(page.get('[role="alert"]').text()).toContain('No se pudo mostrar')
    await page.get('[role="alert"] button').trigger('click')
    await flushPromises()
    expect(field('Primer nombre')).toBe('Ana')
  })
  it.each([401, 403, 404])(
    'reports HTTP %s without retaining personal data or retrying',
    async (status) => {
      getUserDetail.mockRejectedValue(failure(status))
      const view = await render()
      expect(page.find('.detail-grid').exists()).toBe(false)
      expect(page.find('[role="alert"] button').exists()).toBe(false)
      expect(page.get('[role="alert"]').text()).toMatch(
        status === 404 ? /ya no existe/u : status === 403 ? /permiso/u : /sesión/u,
      )
      expect(view.emitted('session-expired')?.length ?? 0).toBe(status === 401 ? 1 : 0)
      expect(view.emitted('forbidden')?.length ?? 0).toBe(status === 403 ? 1 : 0)
    },
  )
  it('cancels old selections and ignores late responses even when IDs overlap between tables', async () => {
    let finish!: (value: UserDetail) => void
    getUserDetail.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const view = await render()
    const firstSignal = getUserDetail.mock.calls[0]?.[1] as AbortSignal
    getUserDetail.mockResolvedValue(employee)
    await view.setProps({ selection: { section: 'employees', id: 42 } })
    await flushPromises()
    finish(client)
    await flushPromises()
    expect(firstSignal.aborted).toBe(true)
    expect(field('Primer nombre')).toBe('José')
    expect(field('ID')).toBe('ADM42')
  })
  it('closes through the header, aborts requests and restores focus and scroll', async () => {
    getUserDetail.mockReturnValue(new Promise(() => {}))
    const view = await render()
    const signal = getUserDetail.mock.calls[0]?.[1] as AbortSignal
    expect(document.body.style.position).toBe('fixed')
    await page.get('.app-modal-close').trigger('click')
    expect(view.emitted('close')).toHaveLength(1)
    expect(signal.aborted).toBe(true)
    await view.setProps({ selection: null })
    expect(page.get<HTMLDialogElement>('dialog').element.open).toBe(false)
    expect(document.activeElement).toBe(opener)
    expect(document.body.style.position).not.toBe('fixed')
  })
  it('supports closing with Escape and the footer button', async () => {
    const view = await render()
    await page.get('dialog').trigger('cancel')
    expect(view.emitted('close')).toHaveLength(1)
    await view.setProps({ selection: null })
    await view.setProps({ selection: { section: 'clients', id: 42 } })
    await flushPromises()
    await page.get('.detail-footer button').trigger('click')
    expect(view.emitted('close')).toHaveLength(2)
  })
  it('cancels pending reads on unmount', async () => {
    getUserDetail.mockReturnValue(new Promise(() => {}))
    const view = await render()
    const signal = getUserDetail.mock.calls[0]?.[1] as AbortSignal
    view.unmount()
    wrapper = undefined
    expect(signal.aborted).toBe(true)
  })
})
