import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { AxiosError, type AxiosResponse } from 'axios'
import EditUserDialog from '@/components/users/EditUserDialog.vue'
import type { ClientDetail, EmployeeDetail, UserDetailSelection } from '@/types/user'

const { getUserDetail, getUserEditOptions, getEmployeeListOptions, updateUser } = vi.hoisted(
  () => ({
    getUserDetail: vi.fn(),
    getUserEditOptions: vi.fn(),
    getEmployeeListOptions: vi.fn(),
    updateUser: vi.fn(),
  }),
)
vi.mock('@/services/user.service', () => ({
  getUserDetail,
  getUserEditOptions,
  getEmployeeListOptions,
  updateUser,
}))
const page = new DOMWrapper(document.body)
const prototype = HTMLDialogElement.prototype
const originalShow = Object.getOwnPropertyDescriptor(prototype, 'showModal')
const originalClose = Object.getOwnPropertyDescriptor(prototype, 'close')
let wrapper: VueWrapper<InstanceType<typeof EditUserDialog>> | undefined
const client: ClientDetail = {
  id: 42,
  role: 'CLIENT',
  firstName: 'Ana',
  secondName: null,
  firstSurname: 'Núñez',
  secondSurname: null,
  birthday: '2000-02-29',
  phoneNumber: '88888888',
  email: 'ana@example.com',
  gender: null,
  language: 'es',
  createdAt: null,
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
  ...client,
  role: 'ADMINISTRATOR',
  branchId: 5,
  branchName: 'Centro',
  hireDate: '2026-10-01',
}
const catalogs = {
  provinces: [
    { id: 1, label: 'San José' },
    { id: 4, label: 'Heredia' },
  ],
  cantons: [
    { id: 2, label: 'Central', provinceId: 1 },
    { id: 40, label: 'Heredia', provinceId: 4 },
  ],
  districts: [
    { id: 3, label: 'Carmen', cantonId: 2 },
    { id: 200, label: 'Heredia', cantonId: 40 },
  ],
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
async function render(selection: UserDetailSelection | null = { section: 'clients', id: 42 }) {
  wrapper = mount(EditUserDialog, { props: { selection }, attachTo: document.body })
  await flushPromises()
  return wrapper
}
function button(text: string) {
  const result = page.findAll('button').find((item) => item.text() === text)
  if (!result) throw new Error('Missing button ' + text)
  return result
}
async function prepareEmail(value = 'new@example.com') {
  await page.get('input[name="email"]').setValue(value)
  await page.get('form').trigger('submit')
  await flushPromises()
}
async function confirm() {
  await button('Confirmar cambios').trigger('click')
  await flushPromises()
}
beforeEach(() => {
  getUserDetail.mockReset().mockResolvedValue(client)
  getUserEditOptions.mockReset().mockResolvedValue(catalogs)
  getEmployeeListOptions.mockReset().mockResolvedValue({
    branches: [
      { id: 5, label: 'Centro' },
      { id: 6, label: 'Norte' },
    ],
  })
  updateUser.mockReset().mockResolvedValue({ id: 42, role: 'CLIENT', email: 'new@example.com' })
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

describe('EditUserDialog', () => {
  it('waits for a selection without querying', async () => {
    await render(null)
    expect(getUserDetail).not.toHaveBeenCalled()
    expect(getUserEditOptions).not.toHaveBeenCalled()
    expect(page.get<HTMLDialogElement>('dialog').element.open).toBe(false)
  })
  it('shows immutable information and prefilled editable data without gender or password controls', async () => {
    await render()
    expect(getUserDetail).toHaveBeenCalledWith(
      { section: 'clients', id: 42 },
      expect.any(AbortSignal),
    )
    for (const value of ['CL42', '29/02/2000', 'Desconocida']) expect(page.text()).toContain(value)
    expect(page.get<HTMLInputElement>('input[name="email"]').element.value).toBe(client.email)
    expect(page.get<HTMLInputElement>('input[name="firstName"]').element.value).toBe('Ana')
    expect(page.get<HTMLInputElement>('input[name="firstSurname"]').element.value).toBe('Núñez')
    expect(page.find('input[readonly]').exists()).toBe(false)
    expect(page.findAll('label').some((item) => item.text().includes('Rol'))).toBe(false)
    for (const name of ['birthday', 'createdAt', 'hireDate', 'password', 'gender'])
      expect(page.find(`[name="${name}"]`).exists()).toBe(false)
    expect(page.find('select[name="role"]').exists()).toBe(false)
    expect(button('Guardar cambios').attributes('disabled')).toBeDefined()
  })
  it('saves trimmed names and clears optional names after confirmation', async () => {
    getUserDetail.mockResolvedValue({ ...client, secondName: 'María', secondSurname: 'Rojas' })
    await render()
    await page.get('input[name="firstName"]').setValue(' Alicia ')
    await page.get('input[name="secondName"]').setValue('')
    await page.get('input[name="firstSurname"]').setValue('')
    await page.get('input[name="secondSurname"]').setValue('')
    await page.get('form').trigger('submit')
    expect(page.text()).toContain('Primer nombre')
    expect(updateUser).not.toHaveBeenCalled()
    await confirm()
    expect(updateUser).toHaveBeenCalledWith(expect.anything(), {
      firstName: 'Alicia',
      secondName: null,
      firstSurname: null,
      secondSurname: null,
    })
  })
  it.each(['', 'é'.repeat(51), 'bad\uD800'])(
    'validates the edited first name %p',
    async (value) => {
      await render()
      await page.get('input[name="firstName"]').setValue(value)
      await page.get('form').trigger('submit')
      expect(page.get('input[name="firstName"]').attributes('aria-invalid')).toBe('true')
      expect(updateUser).not.toHaveBeenCalled()
    },
  )
  it.each(['firstSurname', 'secondSurname'])('requires edited staff %s', async (name) => {
    getUserDetail.mockResolvedValue({ ...employee, secondSurname: 'Rojas' })
    await render({ section: 'employees', id: 42 })
    await page.get(`input[name="${name}"]`).setValue('')
    await page.get('form').trigger('submit')
    expect(page.get(`input[name="${name}"]`).attributes('aria-invalid')).toBe('true')
    expect(updateUser).not.toHaveBeenCalled()
  })
  it('maps server name validation to the corresponding field', async () => {
    updateUser.mockRejectedValueOnce(failure(400, ['Segundo nombre: ingresa texto válido.']))
    await render()
    await page.get('input[name="secondName"]').setValue('María')
    await page.get('form').trigger('submit')
    await confirm()
    expect(page.get('input[name="secondName"]').attributes('aria-invalid')).toBe('true')
    expect(page.get('input[name="firstName"]').attributes('aria-invalid')).toBe('false')
  })
  it('requires confirmation, permits returning to edit, and sends only changed values', async () => {
    const view = await render()
    await prepareEmail(' New@Example.com ')
    expect(page.text()).toContain('reemplazarán los datos actuales')
    expect(updateUser).not.toHaveBeenCalled()
    await button('Volver a editar').trigger('click')
    expect(page.get<HTMLInputElement>('input[name="email"]').element.value).toBe('New@Example.com')
    await page.get('form').trigger('submit')
    await confirm()
    expect(updateUser).toHaveBeenCalledExactlyOnceWith(
      { section: 'clients', id: 42 },
      { email: 'new@example.com' },
    )
    expect(view.emitted('updated')?.[0]).toEqual([
      { section: 'clients', id: 42 },
      { id: 42, role: 'CLIENT', email: 'new@example.com' },
    ])
  })
  it('allows cancellation before confirmation without writing', async () => {
    const view = await render()
    await prepareEmail()
    await button('Cancelar').trigger('click')
    expect(view.emitted('close')).toHaveLength(1)
    expect(updateUser).not.toHaveBeenCalled()
  })
  it('shows distinct invalid email and mobile errors', async () => {
    await render()
    await page.get('input[name="phoneNumber"]').setValue('22222222')
    await prepareEmail('bad')
    for (const name of ['email', 'phoneNumber'])
      expect(page.get(`input[name="${name}"]`).attributes('aria-invalid')).toBe('true')
    expect(page.text()).toContain('correo electrónico válido')
    expect(page.text()).toContain('comience con 6, 7 u 8')
    expect(updateUser).not.toHaveBeenCalled()
  })
  it.each(['', 'a'.repeat(145) + '@example.com', 'bad\uD800@example.com'])(
    'rejects invalid edited email %p',
    async (value) => {
      await render()
      await prepareEmail(value)
      expect(page.get('input[name="email"]').attributes('aria-invalid')).toBe('true')
      expect(updateUser).not.toHaveBeenCalled()
    },
  )
  it('normalizes mobiles and permits clearing optional client fields', async () => {
    await render()
    await page.get('input[name="phoneNumber"]').setValue('+506 7777-7777')
    await page.get('input[name="addressEnabled"]').setValue(false)
    await page.get('form').trigger('submit')
    await confirm()
    expect(updateUser).toHaveBeenCalledWith(
      { section: 'clients', id: 42 },
      { phoneNumber: '77777777', address: null },
    )
  })
  it('permits clearing a client mobile', async () => {
    await render()
    await page.get('input[name="phoneNumber"]').setValue('')
    await page.get('form').trigger('submit')
    await confirm()
    expect(updateUser).toHaveBeenCalledWith(expect.anything(), { phoneNumber: null })
  })
  it('preserves historical malformed mobiles when another field changes', async () => {
    getUserDetail.mockResolvedValue({ ...client, phoneNumber: 'old-number' })
    await render()
    await prepareEmail()
    await confirm()
    expect(updateUser).toHaveBeenCalledWith(expect.anything(), { email: 'new@example.com' })
  })
  it('allows staff role changes and displays immutable hiring information', async () => {
    getUserDetail.mockResolvedValue(employee)
    await render({ section: 'employees', id: 42 })
    expect(page.text()).toContain('ADM42')
    expect(page.text()).toContain('01/10/2026')
    await page.get('select[name="role"]').setValue('EMPLOYEE')
    await page.get('form').trigger('submit')
    await confirm()
    expect(updateUser).toHaveBeenCalledWith({ section: 'employees', id: 42 }, { role: 'EMPLOYEE' })
  })
  it('confirms and saves a selected staff branch without changing other data', async () => {
    getUserDetail.mockResolvedValue(employee)
    await render({ section: 'employees', id: 42 })
    await page.get('select[name="branchId"]').setValue(6)
    await page.get('form').trigger('submit')
    expect(page.text()).toContain('Sucursal')
    expect(updateUser).not.toHaveBeenCalled()
    await confirm()
    expect(updateUser).toHaveBeenCalledWith({ section: 'employees', id: 42 }, { branchId: 6 })
  })
  it('does not query staff branches for clients', async () => {
    await render()
    expect(getEmployeeListOptions).not.toHaveBeenCalled()
    expect(page.find('select[name="branchId"]').exists()).toBe(false)
  })
  it('retains the draft and reports a branch removed before saving', async () => {
    getUserDetail.mockResolvedValue(employee)
    updateUser.mockRejectedValueOnce(failure(400, 'La sucursal seleccionada no existe.'))
    await render({ section: 'employees', id: 42 })
    await page.get('select[name="branchId"]').setValue(6)
    await page.get('form').trigger('submit')
    await confirm()
    expect(page.get('select[name="branchId"]').attributes('aria-invalid')).toBe('true')
    expect(page.get<HTMLSelectElement>('select[name="branchId"]').element.value).toBe('6')
    expect(wrapper?.emitted('updated')).toBeUndefined()
  })
  it('retries unavailable staff branches while preserving the draft', async () => {
    getUserDetail.mockResolvedValue(employee)
    getEmployeeListOptions.mockRejectedValueOnce(failure(500))
    await render({ section: 'employees', id: 42 })
    await page.get('input[name="firstName"]').setValue('Alicia')
    expect(page.get('select[name="branchId"]').attributes('disabled')).toBeDefined()
    await button('Reintentar sucursales').trigger('click')
    await flushPromises()
    expect(page.get('select[name="branchId"]').attributes('disabled')).toBeUndefined()
    expect(page.get<HTMLInputElement>('input[name="firstName"]').element.value).toBe('Alicia')
  })
  it('requires staff mobile if modified', async () => {
    getUserDetail.mockResolvedValue(employee)
    await render({ section: 'employees', id: 42 })
    await page.get('input[name="phoneNumber"]').setValue('')
    await page.get('form').trigger('submit')
    expect(page.text()).toContain('El número de celular es obligatorio.')
    expect(updateUser).not.toHaveBeenCalled()
  })
  it('validates multibyte addresses against the existing 255-byte limit', async () => {
    await render()
    await page.get('textarea').setValue('é'.repeat(128))
    await page.get('form').trigger('submit')
    expect(page.text()).toContain('128/255')
    expect(page.get('textarea').attributes('aria-invalid')).toBe('true')
    expect(updateUser).not.toHaveBeenCalled()
  })
  it('resets dependent selectors and validates before changing the district', async () => {
    await render()
    await page.get('select[name="provinceId"]').setValue(4)
    expect(page.get<HTMLSelectElement>('select[name="cantonId"]').element.value).toBe('0')
    expect(page.get<HTMLSelectElement>('select[name="districtId"]').element.value).toBe('0')
    await page.get('form').trigger('submit')
    expect(page.text()).toContain('Selecciona un cantón válido.')
    expect(page.text()).toContain('Selecciona un distrito válido.')
    await page.get('select[name="cantonId"]').setValue(40)
    await page.get('select[name="districtId"]').setValue(200)
    await page.get('form').trigger('submit')
    await confirm()
    expect(updateUser).toHaveBeenCalledWith(expect.anything(), {
      address: { districtId: 200, details: 'Casa azul' },
    })
  })
  it('adds an address to an existing client with no address', async () => {
    getUserDetail.mockResolvedValue({ ...client, address: null })
    await render()
    await page.get('input[name="addressEnabled"]').setValue(true)
    await page.get('form').trigger('submit')
    expect(page.text()).toContain('Selecciona una provincia.')
    await page.get('select[name="provinceId"]').setValue(1)
    await page.get('select[name="cantonId"]').setValue(2)
    await page.get('select[name="districtId"]').setValue(3)
    await page.get('form').trigger('submit')
    await confirm()
    expect(updateUser).toHaveBeenCalledWith(expect.anything(), {
      address: { districtId: 3, details: null },
    })
  })
  it('retries catalogs without clearing draft values', async () => {
    getUserEditOptions.mockRejectedValueOnce(failure(500))
    await render()
    expect(page.text()).toContain('Puedes editar los demás campos')
    expect(page.get('textarea').attributes('disabled')).toBeDefined()
    await page.get('input[name="email"]').setValue('new@example.com')
    await button('Reintentar opciones').trigger('click')
    await flushPromises()
    expect(page.get('textarea').attributes('disabled')).toBeUndefined()
    expect(page.get<HTMLInputElement>('input[name="email"]').element.value).toBe('new@example.com')
    await page.get('form').trigger('submit')
    await confirm()
    expect(updateUser).toHaveBeenCalledWith(expect.anything(), { email: 'new@example.com' })
  })
  it('allows email editing when catalogs remain unavailable', async () => {
    getUserEditOptions.mockRejectedValue(failure(500))
    await render()
    await button('Reintentar opciones').trigger('click')
    await flushPromises()
    await prepareEmail()
    await confirm()
    expect(updateUser).toHaveBeenCalledWith(expect.anything(), { email: 'new@example.com' })
  })
  it.each([401, 403, 404, 500])('handles loading error %s', async (code) => {
    getUserDetail.mockRejectedValueOnce(failure(code))
    const view = await render()
    expect(page.find('form').exists()).toBe(false)
    expect(view.emitted('session-expired')?.length ?? 0).toBe(code === 401 ? 1 : 0)
    expect(view.emitted('forbidden')?.length ?? 0).toBe(code === 403 ? 1 : 0)
    expect(page.text()).toContain(
      (
        {
          401: 'La sesión ha expirado',
          403: 'No tienes permiso',
          404: 'ya no existe',
          500: 'No se pudieron cargar',
        } as Record<number, string>
      )[code]!,
    )
    if (code === 500) {
      await button('Reintentar').trigger('click')
      await flushPromises()
    }
    expect(page.find('form').exists()).toBe(code === 500)
    expect(updateUser).not.toHaveBeenCalled()
  })
  it.each([401, 403, 404, 409, 400, 500, undefined])(
    'handles save failure %s without automatic retry or success',
    async (code) => {
      updateUser.mockRejectedValueOnce(failure(code, ['El distrito de la dirección no existe.']))
      const view = await render()
      await prepareEmail()
      await confirm()
      expect(view.emitted('updated')).toBeUndefined()
      expect(updateUser).toHaveBeenCalledTimes(1)
      expect(page.get<HTMLInputElement>('input[name="email"]').element.value).toBe(
        'new@example.com',
      )
      expect(view.emitted('session-expired')?.length ?? 0).toBe(code === 401 ? 1 : 0)
      expect(view.emitted('forbidden')?.length ?? 0).toBe(code === 403 ? 1 : 0)
      expect(page.get('input[name="email"]').attributes('aria-invalid')).toBe('false')
      expect(page.get('select[name="districtId"]').attributes('aria-invalid')).toBe(
        String(code === 400),
      )
      expect(button('Guardar cambios').attributes('disabled') !== undefined).toBe(
        code !== 400 && code !== 409,
      )
    },
  )
  it.each([
    'El correo electrónico ya está registrado para otro cliente.',
    'El correo electrónico ya está registrado para otro empleado.',
  ])('marks the email only for a known duplicate conflict: %s', async (message) => {
    updateUser.mockRejectedValueOnce(failure(409, message))
    await render()
    await prepareEmail()
    await confirm()
    expect(page.get('input[name="email"]').attributes('aria-invalid')).toBe('true')
    expect(page.text()).toContain('El correo electrónico ya está registrado para otro usuario.')
    expect(updateUser).toHaveBeenCalledTimes(1)
  })
  it('explains the last-administrator conflict without marking the email', async () => {
    getUserDetail.mockResolvedValueOnce(employee)
    updateUser.mockRejectedValueOnce(
      failure(409, 'Debe permanecer al menos un administrador activo.'),
    )
    await render({ section: 'employees', id: 42 })
    await page.get('select[name="role"]').setValue('EMPLOYEE')
    await page.get('form').trigger('submit')
    await confirm()
    expect(page.get('[role="alert"]').text()).toContain(
      'Debe permanecer al menos un administrador activo.',
    )
    expect(page.get('input[name="email"]').attributes('aria-invalid')).toBe('false')
    expect(page.get<HTMLSelectElement>('select[name="role"]').element.value).toBe('EMPLOYEE')
    expect(wrapper?.emitted('updated')).toBeUndefined()
    expect(updateUser).toHaveBeenCalledTimes(1)
  })
  it('shows a generic conflict without exposing unknown backend messages', async () => {
    updateUser.mockRejectedValueOnce(failure(409, 'private database detail'))
    await render()
    await prepareEmail()
    await confirm()
    expect(page.get('[role="alert"]').text()).toContain('entran en conflicto con el estado actual')
    expect(page.text()).not.toContain('private database detail')
    expect(page.get('input[name="email"]').attributes('aria-invalid')).toBe('false')
  })
  it('blocks duplicate writes and closing while saving', async () => {
    let resolve!: (result: { id: number; role: 'CLIENT'; email: string }) => void
    updateUser.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      }),
    )
    const view = await render()
    await prepareEmail()
    await button('Confirmar cambios').trigger('click')
    expect(button('Guardando…').attributes('disabled')).toBeDefined()
    await button('Guardando…').trigger('click')
    await page.get('button[aria-label="Cerrar"]').trigger('click')
    expect(view.emitted('close')).toBeUndefined()
    expect(updateUser).toHaveBeenCalledTimes(1)
    resolve({ id: 42, role: 'CLIENT', email: 'new@example.com' })
    await flushPromises()
    expect(view.emitted('updated')).toHaveLength(1)
  })
  it('ignores stale reads after selection changes', async () => {
    let resolve!: (detail: ClientDetail) => void
    getUserDetail.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      }),
    )
    const view = await render()
    const signal = getUserDetail.mock.calls[0]![1] as AbortSignal
    await view.setProps({ selection: { section: 'clients', id: 43 } })
    await flushPromises()
    expect(signal.aborted).toBe(true)
    resolve({ ...client, firstName: 'Stale' })
    await flushPromises()
    expect(page.text()).not.toContain('Stale')
    await view.setProps({ selection: null })
    await flushPromises()
    expect(page.find('form').exists()).toBe(false)
  })
})
