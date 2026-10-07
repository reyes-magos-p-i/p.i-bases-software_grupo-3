import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import DashboardView from '@/views/DashboardView.vue'
import DashboardLayout from '@/components/layout/DashboardLayout.vue'
import ChangePasswordView from '@/views/ChangePasswordView.vue'
import CreateUserDialog from '@/components/users/CreateUserDialog.vue'
import UserListPanel from '@/components/users/UserListPanel.vue'
import { nextTick } from 'vue'
import {
  employeeSession,
  closeEmployeeSession,
  invalidateEmployeeSession,
  restoreEmployeeSession,
} from '@/services/employee-session.service'
import type { UserCreationOptions } from '@/types/user'

const {
  getUsers,
  getEmployeeListOptions,
  getUserCreationOptions,
  createUser,
  getTheaterCreationOptions,
  createTheater,
  getEmployeePasswordStatus,
} = vi.hoisted(
  () => ({
    getUsers: vi.fn(),
    getEmployeeListOptions: vi.fn(),
    getUserCreationOptions: vi.fn(),
    createUser: vi.fn(),
    getTheaterCreationOptions: vi.fn(),
    createTheater: vi.fn(),
    getEmployeePasswordStatus: vi.fn(),
  }),
)
vi.mock('@/services/user.service', () => ({
  getUsers,
  getEmployeeListOptions,
  getUserCreationOptions,
  createUser,
}))
vi.mock('@/services/theater.service', () => ({ getTheaterCreationOptions, createTheater }))
vi.mock('@/services/authService', async () => {
  const actual =
    await vi.importActual<typeof import('@/services/authService')>('@/services/authService')
  return { ...actual, getEmployeePasswordStatus }
})
vi.mock('@/services/employee-session.service', async () => {
  const { ref } = await import('vue')
  const user = ref<{ id: number; role: string; firstName: string; email?: string } | null>({
    id: 21,
    role: 'ADMINISTRATOR',
    firstName: 'Ana',
    email: 'ana@example.com',
  })
  return {
    employeeSession: { user },
    closeEmployeeSession: vi.fn(),
    invalidateEmployeeSession: vi.fn(() => {
      user.value = null
    }),
    restoreEmployeeSession: vi.fn(),
  }
})
async function setRole(role: 'ADMINISTRATOR' | 'EMPLOYEE') {
  Object.assign(employeeSession.user, {
    value: { id: 21, role, firstName: 'Ana', email: 'ana@example.com' },
  })
  await nextTick()
}
const catalogs: UserCreationOptions = {
  provinces: [
    { id: 1, label: 'San José' },
    { id: 4, label: 'Heredia' },
  ],
  cantons: [
    { id: 19, label: 'Curridabat', provinceId: 1 },
    { id: 40, label: 'Heredia', provinceId: 4 },
  ],
  districts: [
    { id: 102, label: 'Curridabat', cantonId: 19 },
    { id: 200, label: 'Heredia', cantonId: 40 },
  ],
  branches: [{ id: 1, label: 'Cinépolis Multiplaza del Este' }],
}

function pendingCatalogs() {
  let resolve!: (data: UserCreationOptions) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<UserCreationOptions>((res, rej) => {
    resolve = res
    reject = rej
  })
  getUserCreationOptions.mockReturnValueOnce(promise)
  return { resolve, reject }
}

let wrapper: VueWrapper | undefined
let router: Router
const routeHistories: Router['options']['history'][] = []
const dialogPrototype = HTMLDialogElement.prototype
const originalShowModal = Object.getOwnPropertyDescriptor(dialogPrototype, 'showModal')
const originalClose = Object.getOwnPropertyDescriptor(dialogPrototype, 'close')

beforeEach(() => {
  getUsers
    .mockReset()
    .mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10, totalPages: 0 })
  getEmployeePasswordStatus.mockReset().mockResolvedValue('valid')
  getEmployeeListOptions.mockReset().mockResolvedValue({ branches: [] })
  Object.assign(employeeSession.user, {
    value: { id: 21, role: 'ADMINISTRATOR', firstName: 'Ana', email: 'ana@example.com' },
  })
  vi.mocked(closeEmployeeSession).mockReset().mockResolvedValue(null)
  vi.mocked(invalidateEmployeeSession).mockClear()
  vi.mocked(restoreEmployeeSession).mockReset().mockResolvedValue({
    id: 21,
    role: 'ADMINISTRATOR',
    firstName: 'Ana',
    email: 'ana@example.com',
  })
  createUser.mockReset().mockResolvedValue({ id: 42, role: 'EMPLOYEE', email: 'ana@example.com' })
  getUserCreationOptions.mockReset().mockResolvedValue(catalogs)
  getTheaterCreationOptions.mockReset().mockResolvedValue({
    projectors: [
      { projectorId: 1, name: 'IMAX' },
      { projectorId: 2, name: '70mm' },
    ],
    cinemas: [{ branchId: 3, name: 'Cinépolis Central', companyId: 1 }],
  })
  createTheater.mockReset().mockResolvedValue({
    theaterId: 4,
    branchId: 3,
    numberOfSeats: 250,
    dimensionX: 20,
    dimensionY: 12,
    projectorName: 'IMAX',
    isActive: true,
    status: 'Disponible',
  })
  // jsdom does not implement the native dialog methods.
  Object.defineProperties(dialogPrototype, {
    showModal: {
      configurable: true,
      value: vi.fn(function (this: HTMLDialogElement) {
        this.setAttribute('open', '')
      }),
    },
    close: {
      configurable: true,
      value: vi.fn(function (this: HTMLDialogElement) {
        if (!this.open) return
        this.removeAttribute('open')
        this.dispatchEvent(new Event('close'))
      }),
    },
  })
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  for (const history of routeHistories.splice(0)) history.destroy()
  for (const [name, descriptor] of [
    ['showModal', originalShowModal],
    ['close', originalClose],
  ] as const) {
    if (descriptor) Object.defineProperty(dialogPrototype, name, descriptor)
    else Reflect.deleteProperty(dialogPrototype, name)
  }
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  document.body.innerHTML = ''
})

async function renderDashboard() {
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<h1>Portal principal</h1>' } },
      { path: '/dashboard', component: DashboardView },
    ],
  })
  routeHistories.push(router.options.history)
  await router.push('/dashboard')
  await router.isReady()
  wrapper = mount(DashboardView, { attachTo: document.body, global: { plugins: [router] } })
  return wrapper
}

describe('DashboardView', () => {
  it('shows the password section to administrators and returns from its embedded view', async () => {
    const view = await renderDashboard()
    await flushPromises()
    await view.get('[aria-label="Cambiar contraseña"]').trigger('click')
    await flushPromises()

    expect(view.getComponent(DashboardLayout).props('availableSections')).toContain('password')
    expect(view.findComponent(ChangePasswordView).props()).toMatchObject({
      embedded: true,
      accountType: 'employee',
    })
    expect(view.findAllComponents(UserListPanel)).toHaveLength(0)
    await view.findComponent(ChangePasswordView).vm.$emit('return-to-dashboard')
    await flushPromises()
    expect(view.findAllComponents(UserListPanel)).toHaveLength(1)
  })

  it('exposes the password recovery section to employees', async () => {
    await setRole('EMPLOYEE')
    const view = await renderDashboard()
    await flushPromises()

    expect(view.find('[aria-label="Cambiar contraseña"]').exists()).toBe(true)
    expect(view.getComponent(DashboardLayout).props('availableSections')).toContain('password')
  })

  it('provides the current staff ID to protect self deactivation', async () => {
    const view = await renderDashboard()
    await flushPromises()
    expect(view.getComponent(UserListPanel).props('currentUserId')).toBe(21)
  })
  it('refreshes the displayed name after editing the active administrator', async () => {
    const view = await renderDashboard()
    await flushPromises()
    vi.mocked(restoreEmployeeSession).mockImplementationOnce(async () => {
      const identity = { id: 21, role: 'ADMINISTRATOR' as const, firstName: 'Alicia' }
      Object.assign(employeeSession.user, { value: identity })
      return identity
    })
    view
      .getComponent(UserListPanel)
      .vm.$emit(
        'user-updated',
        { section: 'employees', id: 21 },
        { id: 21, role: 'ADMINISTRATOR', email: 'ana@example.com' },
      )
    await flushPromises()
    expect(restoreEmployeeSession).toHaveBeenCalledWith(true)
    expect(view.getComponent(DashboardLayout).props('userName')).toBe('Alicia')
  })
  it('refreshes session permissions after editing the active administrator', async () => {
    const view = await renderDashboard()
    await flushPromises()
    vi.mocked(restoreEmployeeSession).mockImplementationOnce(async () => {
      await setRole('EMPLOYEE')
      return { id: 21, role: 'EMPLOYEE', firstName: 'Ana' }
    })
    view
      .getComponent(UserListPanel)
      .vm.$emit(
        'user-updated',
        { section: 'employees', id: 21 },
        { id: 21, role: 'EMPLOYEE', email: 'ana@example.com' },
      )
    await flushPromises()
    expect(restoreEmployeeSession).toHaveBeenCalledWith(true)
    expect(getUsers.mock.calls[getUsers.mock.calls.length - 1]?.[0]).toBe('clients')
  })
  it('preserves the session when a different user is modified', async () => {
    const view = await renderDashboard()
    await flushPromises()
    view
      .getComponent(UserListPanel)
      .vm.$emit(
        'user-updated',
        { section: 'clients', id: 21 },
        { id: 21, role: 'CLIENT', email: 'ana@example.com' },
      )
    view
      .getComponent(UserListPanel)
      .vm.$emit(
        'user-updated',
        { section: 'employees', id: 42 },
        { id: 42, role: 'EMPLOYEE', email: 'ana@example.com' },
      )
    await flushPromises()
    expect(restoreEmployeeSession).not.toHaveBeenCalled()
  })
  it('loads each section and handles an expired listing session', async () => {
    const view = await renderDashboard()
    await flushPromises()
    expect(getUsers.mock.calls[0]?.[0]).toBe('employees')
    await view.get('[aria-label="Clientes"]').trigger('click')
    await flushPromises()
    expect(getUsers.mock.calls[getUsers.mock.calls.length - 1]?.[0]).toBe('clients')
    getUsers.mockRejectedValueOnce({ isAxiosError: true, response: { status: 401 } })
    await view.get('.search-bar').trigger('submit')
    await flushPromises()
    expect(invalidateEmployeeSession).toHaveBeenCalledTimes(1)
    expect(router.currentRoute.value.query.reason).toBe('expired')
  })
  it('uses the authenticated identity without development role controls', async () => {
    const view = await renderDashboard()
    await flushPromises()
    expect(view.text()).not.toContain('Vista de desarrollo')
    expect(view.text()).not.toContain('Usuario de prueba')
    expect(getUserCreationOptions).not.toHaveBeenCalled()
    expect(view.get('header').text()).toContain('Ana')
    expect(view.get('header').text()).toContain('Sesión iniciada como Administrador')
    expect(view.get('h1').text()).toBe('Empleados')
    expect(view.find('.preview-toolbar').exists()).toBe(false)
    expect(view.get('.logout-button').attributes('disabled')).toBeUndefined()
  })

  it('switches between the two dashboard sections and updates the active menu item', async () => {
    const view = await renderDashboard()

    await view.get('[aria-label="Clientes"]').trigger('click')
    expect(view.get('h1').text()).toBe('Clientes')
    expect(view.get('[aria-current="page"]').attributes('aria-label')).toBe('Clientes')
    await view.get('[aria-label="Empleados"]').trigger('click')
    expect(view.get('h1').text()).toBe('Empleados')
    expect(view.get('[aria-current="page"]').attributes('aria-label')).toBe('Empleados')
  })

  it('opens the password form when the employee password has expired', async () => {
    getEmployeePasswordStatus
      .mockResolvedValueOnce('expired')
      .mockResolvedValueOnce('expired')
    const view = await renderDashboard()
    await flushPromises()

    expect(view.get('[aria-current="page"]').attributes('aria-label')).toBe(
      'Cambiar contraseña',
    )
    expect(view.text()).toContain('Tu contraseña venció.')
  })

  it('prevents section navigation and logout while the password change is pending', async () => {
    const view = await renderDashboard()
    await view.get('[aria-label="Cambiar contraseña"]').trigger('click')
    const passwordView = view.getComponent(ChangePasswordView)
    passwordView.vm.$emit('submission-state', true)
    await nextTick()

    await view.get('[aria-label="Clientes"]').trigger('click')
    await view.get('.logout-button').trigger('click')

    expect(view.get('[aria-current="page"]').attributes('aria-label')).toBe(
      'Cambiar contraseña',
    )
    expect(view.get('.logout-button').attributes('disabled')).toBeDefined()
    expect(closeEmployeeSession).not.toHaveBeenCalled()
  })

  it('shows the sala creation action only to administrators', async () => {
    const view = await renderDashboard()

    await view.get('[aria-label="Salas"]').trigger('click')
    expect(view.get('.add-user-button').text()).toContain('Crear sala')

    await setRole('EMPLOYEE')
    expect(view.find('.add-user-button').exists()).toBe(false)
  })

  it('creates a theater with the selected options', async () => {
    const view = await renderDashboard()
    await view.get('[aria-label="Salas"]').trigger('click')
    await view.get('.add-user-button').trigger('click')
    await flushPromises()

    expect(getTheaterCreationOptions).toHaveBeenCalledTimes(1)
    expect(view.get('.theater-dialog h2').text()).toBe('Crear sala')
    expect(view.text()).not.toContain('El número de sala se genera automáticamente.')
    expect(view.get<HTMLSelectElement>('[name="status"]').element.value).toBe('Disponible')

    await view.get('[name="numberOfSeats"]').setValue('240')
    await view.get('[name="projectorName"]').setValue('IMAX')
    await view.get('[name="branchId"]').setValue('3')
    await view.get('[name="dimensionX"]').setValue('20')
    await view.get('[name="dimensionY"]').setValue('12')
    await view.get('.theater-dialog form').trigger('submit')
    await flushPromises()

    expect(createTheater).toHaveBeenCalledExactlyOnceWith({
      numberOfSeats: 240,
      dimensionX: 20,
      dimensionY: 12,
      projectorName: 'IMAX',
      branchId: 3,
      status: 'Disponible',
    })
    expect(view.get('.creation-result').text()).toContain('Sala 4 creada exitosamente')
    expect(view.get<HTMLDialogElement>('.theater-dialog').element.open).toBe(false)
  })

  it('rejects invalid theater seat counts before submitting', async () => {
    const view = await renderDashboard()
    await view.get('[aria-label="Salas"]').trigger('click')
    await view.get('.add-user-button').trigger('click')
    await flushPromises()
    await view.get('[name="numberOfSeats"]').setValue('5000')
    await view.get('.theater-dialog form').trigger('submit')

    expect(createTheater).not.toHaveBeenCalled()
    expect(view.get('.field-error').text()).toContain('entre 1 y 4999')
  })

  it('rejects theater seat counts that do not match the dimensions', async () => {
    const view = await renderDashboard()
    await view.get('[aria-label="Salas"]').trigger('click')
    await view.get('.add-user-button').trigger('click')
    await flushPromises()
    await view.get('[name="numberOfSeats"]').setValue('250')
    await view.get('[name="dimensionX"]').setValue('20')
    await view.get('[name="dimensionY"]').setValue('12')
    await view.get('.theater-dialog form').trigger('submit')

    expect(createTheater).not.toHaveBeenCalled()
    expect(view.get('.field-error').text()).toContain('igual a Dimensión X por Dimensión Y')
  })

  it('shows projections to administrators only', async () => {
    const view = await renderDashboard()
    await view.get('[aria-label="Proyecciones"]').trigger('click')

    expect(view.get('h1').text()).toBe('Proyecciones')
    expect(view.get('.add-user-button').text()).toContain('Agregar Proyección')
    expect(view.find('.creation-result').exists()).toBe(false)

    await setRole('EMPLOYEE')
    expect(view.get('h1').text()).toBe('Clientes')
    expect(view.find('[aria-label="Proyecciones"]').exists()).toBe(false)
  })

  it('moves to clients and hides administrator options when the server reports an employee role', async () => {
    const view = await renderDashboard()

    await setRole('EMPLOYEE')

    expect(view.get('header').text()).toContain('Sesión iniciada como Empleado')
    expect(view.get('h1').text()).toBe('Clientes')
    expect(view.get('[aria-current="page"]').attributes('aria-label')).toBe('Clientes')
    expect(view.get('nav').text()).not.toContain('Empleados')
    expect(view.get('nav').text()).not.toContain('Tablero')
    expect(view.get('nav').findAll('button')).toHaveLength(7)
  })

  it('preserves clients as the current section across role changes', async () => {
    const view = await renderDashboard()
    await view.get('[aria-label="Clientes"]').trigger('click')

    await setRole('EMPLOYEE')
    await setRole('ADMINISTRATOR')

    expect(view.get('h1').text()).toBe('Clientes')
    expect(view.find('[aria-label="Empleados"]').exists()).toBe(true)
    expect(view.find('[aria-label="Tablero (Pendiente)"]').exists()).toBe(true)
  })

  it('leaves unimplemented features disabled', async () => {
    const view = await renderDashboard()
    const pending = view.findAll('.sidebar-navigation button:disabled')

    expect(pending).toHaveLength(5)
    for (const button of pending) {
      expect(button.attributes('disabled')).toBeDefined()
      expect(button.text()).toContain('Pendiente')
      await button.trigger('click')
    }
    expect(view.get('h1').text()).toBe('Empleados')
    expect(router.currentRoute.value.path).toBe('/dashboard')
  })


  it('ignores navigation outside the available dashboard sections', async () => {
    const view = await renderDashboard()
    const layout = view.getComponent(DashboardLayout)

    layout.vm.$emit('navigate', 'dashboard')
    await flushPromises()
    expect(view.get('h1').text()).toBe('Empleados')

    await setRole('EMPLOYEE')
    layout.vm.$emit('navigate', 'employees')
    await flushPromises()
    expect(view.get('h1').text()).toBe('Clientes')
  })

  it('closes the session before returning to the portal', async () => {
    localStorage.setItem('accessToken', 'client-token')
    const view = await renderDashboard()

    await view.get('.logout-button').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/')
    expect(closeEmployeeSession).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('accessToken')).toBeNull()
  })

  it('does not navigate away when logout fails and permits a retry', async () => {
    vi.mocked(closeEmployeeSession).mockRejectedValueOnce(new Error('Offline'))
    const view = await renderDashboard()
    await view.get('.logout-button').trigger('click')
    await flushPromises()
    expect(view.get('[role="alert"]').text()).toContain('No se pudo confirmar el cierre')
    expect(router.currentRoute.value.path).toBe('/dashboard')
    await view.get('.logout-button').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/')
  })

  it('blocks duplicate logout and new actions until logout completes', async () => {
    let resolve!: (value: null) => void
    vi.mocked(closeEmployeeSession).mockReturnValueOnce(
      new Promise((res) => {
        resolve = res
      }),
    )
    const view = await renderDashboard()
    const layout = view.getComponent(DashboardLayout)
    layout.vm.$emit('logout')
    layout.vm.$emit('logout')
    layout.vm.$emit('navigate', 'clients')
    await nextTick()
    expect(view.text()).toContain('Cerrando sesión')
    expect(view.get('.logout-button').attributes('disabled')).toBeDefined()
    expect(view.get('.add-user-button').attributes('disabled')).toBeDefined()
    expect(view.get('h1').text()).toBe('Empleados')
    expect(closeEmployeeSession).toHaveBeenCalledTimes(1)
    resolve(null)
    await flushPromises()
  })

  it('shows no administrative content without a verified identity', async () => {
    Object.assign(employeeSession.user, { value: null })
    const view = await renderDashboard()
    expect(view.find('.dashboard-layout').exists()).toBe(false)
    expect(view.text()).toContain('No hay una sesión verificada')
  })

  it('starts employees in the clients section without any create action', async () => {
    await setRole('EMPLOYEE')
    const view = await renderDashboard()
    expect(view.get('h1').text()).toBe('Clientes')
    expect(view.find('.add-user-button').exists()).toBe(false)
    expect(view.find('[aria-label="Empleados"]').exists()).toBe(false)
  })

  it('opens the creation dialog from employees and returns focus when closed', async () => {
    const view = await renderDashboard()
    const button = view.get<HTMLButtonElement>('.add-user-button')
    const dialog = view.get<HTMLDialogElement>('.user-dialog')
    expect(dialog.element.open).toBe(false)

    button.element.focus()
    await button.trigger('click')

    expect(dialog.element.open).toBe(true)
    expect(document.activeElement).toBe(
      view.getComponent(CreateUserDialog).get('[name="firstName"]').element,
    )
    await view.get('[aria-label="Cerrar formulario"]').trigger('click')
    expect(dialog.element.open).toBe(false)
    expect(document.activeElement).toBe(button.element)
  })

  it('offers the matching creation form in each section only to administrators', async () => {
    const view = await renderDashboard()
    await view.get('[aria-label="Clientes"]').trigger('click')

    expect(view.get('.add-user-button').text()).toContain('Añadir cliente')
    expect(view.get('.user-dialog h2').text()).toBe('Crear cliente')
    expect(view.find('[name="role"]').exists()).toBe(false)
    await view.get('[aria-label="Empleados"]').trigger('click')
    expect(view.get('.add-user-button').text()).toContain('Añadir empleado')
    await setRole('EMPLOYEE')
    expect(view.find('.add-user-button').exists()).toBe(false)
    expect(view.find('.user-dialog').exists()).toBe(false)
  })

  it('closes the dialog if the authenticated identity changes while it is open', async () => {
    const view = await renderDashboard()
    await view.get('.add-user-button').trigger('click')
    const dialog = view.get<HTMLDialogElement>('.user-dialog').element

    await setRole('EMPLOYEE')

    expect(dialog.open).toBe(false)
    expect(view.find('.user-dialog').exists()).toBe(false)
    expect(view.get('h1').text()).toBe('Clientes')
  })
})

describe('catalog loading', () => {
  it('returns to employee login when the session expires during catalog loading', async () => {
    getUserCreationOptions.mockRejectedValueOnce({ isAxiosError: true, response: { status: 401 } })
    const view = await renderDashboard()
    await view.get('.add-user-button').trigger('click')
    await flushPromises()
    expect(invalidateEmployeeSession).toHaveBeenCalledTimes(1)
    expect(router.currentRoute.value.query).toEqual({ login: 'employee', reason: 'expired' })
    expect(createUser).not.toHaveBeenCalled()
  })

  it.each(['expired', 'unavailable'] as const)(
    'handles permission refresh failure: %s',
    async (reason) => {
      getUserCreationOptions.mockRejectedValueOnce({
        isAxiosError: true,
        response: { status: 403 },
      })
      if (reason === 'expired') vi.mocked(restoreEmployeeSession).mockResolvedValueOnce(null)
      else vi.mocked(restoreEmployeeSession).mockRejectedValueOnce(new Error('Offline'))
      const view = await renderDashboard()
      await view.get('.add-user-button').trigger('click')
      await flushPromises()
      expect(restoreEmployeeSession).toHaveBeenCalledWith(true)
      expect(router.currentRoute.value.query.reason).toBe(reason)
    },
  )

  it('loads on first open, fills dependent selectors and reuses the result when reopening', async () => {
    const view = await renderDashboard()
    await view.get('.add-user-button').trigger('click')
    await flushPromises()
    expect(getUserCreationOptions).toHaveBeenCalledTimes(1)
    expect(view.getComponent(CreateUserDialog).get('[name="branchId"]').text()).toContain(
      catalogs.branches[0]!.label,
    )
    await view.getComponent(CreateUserDialog).get('[name="provinceId"]').setValue('1')
    expect(
      view
        .get('[name="cantonId"]')
        .findAll('option')
        .map((option) => option.element.value),
    ).toEqual(['', '19'])
    await view.getComponent(CreateUserDialog).get('[name="cantonId"]').setValue('19')
    expect(
      view
        .get('[name="districtId"]')
        .findAll('option')
        .map((option) => option.element.value),
    ).toEqual(['', '102'])
    await view.getComponent(CreateUserDialog).get('[name="districtId"]').setValue('102')
    await view.getComponent(CreateUserDialog).get('[name="provinceId"]').setValue('4')
    expect(view.get<HTMLSelectElement>('[name="districtId"]').element.value).toBe('')
    await view.get('[aria-label="Cerrar formulario"]').trigger('click')
    await view.get('.add-user-button').trigger('click')
    expect(getUserCreationOptions).toHaveBeenCalledTimes(1)
    expect(view.get('.create-button').attributes('disabled')).toBeUndefined()
  })

  it('keeps the form editable while loading and prevents duplicate loads', async () => {
    const pending = pendingCatalogs()
    const view = await renderDashboard()
    await view.get('.add-user-button').trigger('click')
    expect(view.getComponent(CreateUserDialog).get('[role="status"]').text()).toContain('Cargando')
    await view.getComponent(CreateUserDialog).get('[name="firstName"]').setValue('Ana')
    view.getComponent(CreateUserDialog).vm.$emit('retryCatalogs')
    await flushPromises()
    expect(getUserCreationOptions).toHaveBeenCalledTimes(1)
    pending.resolve(catalogs)
    await flushPromises()
    expect(view.getComponent(CreateUserDialog).find('[role="status"]').exists()).toBe(false)
    expect(view.get<HTMLInputElement>('[name="firstName"]').element.value).toBe('Ana')
  })

  it.each([
    [{ isAxiosError: true, response: { status: 403 } }, 'No tienes permiso'],
    [{ isAxiosError: true, code: 'ECONNABORTED' }, 'tardando demasiado'],
    [{ isAxiosError: true, code: 'ETIMEDOUT' }, 'tardando demasiado'],
    [{ isAxiosError: true, response: { status: 500 } }, 'No se pudieron cargar'],
    [new Error('Private configuration details'), 'No se pudieron cargar'],
  ])('shows a useful error and preserves input after retry: %p', async (error, message) => {
    const pending = pendingCatalogs()
    const view = await renderDashboard()
    await view.get('.add-user-button').trigger('click')
    await view.getComponent(CreateUserDialog).get('[name="firstName"]').setValue('Ana')
    pending.reject(error)
    await flushPromises()
    expect(view.getComponent(CreateUserDialog).get('[role="alert"]').text()).toContain(message)
    expect(view.text()).not.toContain('Private configuration details')
    await view.get('.catalog-notice button').trigger('click')
    await flushPromises()
    expect(getUserCreationOptions).toHaveBeenCalledTimes(2)
    expect(view.getComponent(CreateUserDialog).find('[role="alert"]').exists()).toBe(false)
    expect(view.get<HTMLInputElement>('[name="firstName"]').element.value).toBe('Ana')
    expect(
      view.getComponent(CreateUserDialog).get('[name="branchId"]').attributes('disabled'),
    ).toBeUndefined()
  })

  it('distinguishes successfully loaded empty catalogs from an error', async () => {
    getUserCreationOptions.mockResolvedValue({
      provinces: [],
      cantons: [],
      districts: [],
      branches: [],
    })
    const view = await renderDashboard()
    await view.get('.add-user-button').trigger('click')
    await flushPromises()
    expect(view.getComponent(CreateUserDialog).find('[role="alert"]').exists()).toBe(false)
    expect(view.getComponent(CreateUserDialog).find('[role="status"]').exists()).toBe(false)
    expect(view.getComponent(CreateUserDialog).get('[name="provinceId"]').text()).toContain(
      'Sin provincias disponibles',
    )
  })

  it.each(['resolve', 'reject'] as const)(
    'cancels on navigation and ignores late %s from a previous request',
    async (outcome) => {
      const pending = pendingCatalogs()
      const view = await renderDashboard()
      await view.get('.add-user-button').trigger('click')
      const signal = getUserCreationOptions.mock.calls[0]![0] as AbortSignal
      await view.get('[aria-label="Clientes"]').trigger('click')
      expect(signal.aborted).toBe(true)
      await view.get('[aria-label="Empleados"]').trigger('click')
      const current = pendingCatalogs()
      await view.get('.add-user-button').trigger('click')
      if (outcome === 'resolve')
        pending.resolve({ ...catalogs, branches: [{ id: 99, label: 'Obsolete' }] })
      else pending.reject(new Error('Obsolete failure'))
      await flushPromises()
      expect(view.getComponent(CreateUserDialog).get('[role="status"]').text()).toContain(
        'Cargando',
      )
      expect(view.text()).not.toContain('Obsolete')
      current.resolve(catalogs)
      await flushPromises()
      expect(view.getComponent(CreateUserDialog).get('[name="branchId"]').text()).toContain(
        catalogs.branches[0]!.label,
      )
    },
  )

  it('cancels the pending request when leaving the view', async () => {
    const pending = pendingCatalogs()
    const view = await renderDashboard()
    await view.get('.add-user-button').trigger('click')
    const signal = getUserCreationOptions.mock.calls[0]![0] as AbortSignal
    view.unmount()
    wrapper = undefined
    expect(signal.aborted).toBe(true)
    pending.reject(new Error('Canceled'))
    await flushPromises()
  })
})

describe('employee creation', () => {
  async function filledForm(role = 'EMPLOYEE') {
    const view = await renderDashboard()
    await view.get('.add-user-button').trigger('click')
    await flushPromises()
    for (const [field, value] of Object.entries({
      firstName: 'Ana',
      firstSurname: 'Solano',
      secondSurname: 'Rojas',
      email: 'ana@example.com',
      birthday: '2000-02-29',
      hireDate: '2026-10-01',
      phoneNumber: '88888888',
      role,
      branchId: '1',
      provinceId: '1',
      cantonId: '19',
      districtId: '102',
    })) {
      await view
        .getComponent(CreateUserDialog)
        .get('[name="' + field + '"]')
        .setValue(value)
    }
    return view
  }

  it.each(['EMPLOYEE', 'ADMINISTRATOR'])(
    'creates %s and closes, resets and announces the result',
    async (role) => {
      const view = await filledForm(role)
      await view.getComponent(CreateUserDialog).get('form').trigger('submit')
      await flushPromises()
      expect(createUser).toHaveBeenCalledExactlyOnceWith({
        firstName: 'Ana',
        firstSurname: 'Solano',
        secondSurname: 'Rojas',
        email: 'ana@example.com',
        birthday: '2000-02-29',
        hireDate: '2026-10-01',
        phoneNumber: '88888888',
        role,
        branchId: 1,
        address: { districtId: 102 },
      })
      expect(getUsers).toHaveBeenCalledTimes(2)
      expect(view.get<HTMLDialogElement>('dialog').element.open).toBe(false)
      expect(view.get('.creation-result').text()).toContain('Cuenta creada para ana@example.com')
      expect(document.activeElement).toBe(view.get('.creation-result').element)
      await view.get('.add-user-button').trigger('click')
      expect(view.get<HTMLInputElement>('[name="firstName"]').element.value).toBe('')
      expect(view.getComponent(CreateUserDialog).get('[name="role"]').element).toHaveProperty(
        'value',
        'EMPLOYEE',
      )
    },
  )

  it('prevents duplicate requests, cancellation and navigation while saving', async () => {
    let resolve!: (value: unknown) => void
    createUser.mockReturnValue(
      new Promise((res) => {
        resolve = res
      }),
    )
    const view = await filledForm()
    await view.getComponent(CreateUserDialog).get('form').trigger('submit')
    await view.getComponent(CreateUserDialog).get('form').trigger('submit')
    view.getComponent(CreateUserDialog).vm.$emit('submit', { role: 'EMPLOYEE' })
    view.getComponent(DashboardLayout).vm.$emit('navigate', 'clients')
    view.getComponent(DashboardLayout).vm.$emit('logout')
    await view.get('dialog').trigger('cancel')
    expect(view.get('h1').text()).toBe('Empleados')
    expect(view.get<HTMLDialogElement>('dialog').element.open).toBe(true)
    expect(view.getComponent(CreateUserDialog).get('form').attributes('aria-busy')).toBe('true')
    expect(view.get('.close-button').attributes('disabled')).toBeDefined()
    expect(createUser).toHaveBeenCalledTimes(1)
    expect(closeEmployeeSession).not.toHaveBeenCalled()
    resolve({ id: 42, email: 'ana@example.com', role: 'EMPLOYEE' })
    await flushPromises()
  })

  it('treats an expired session during creation as unauthenticated rather than an uncertain creation', async () => {
    createUser.mockRejectedValueOnce({ isAxiosError: true, response: { status: 401 } })
    const view = await filledForm()
    await view.getComponent(CreateUserDialog).get('form').trigger('submit')
    await flushPromises()
    expect(invalidateEmployeeSession).toHaveBeenCalledTimes(1)
    expect(router.currentRoute.value.query).toEqual({ login: 'employee', reason: 'expired' })
    expect(createUser).toHaveBeenCalledTimes(1)
  })

  it.each([
    [400, ['Revisa el teléfono.'], 'Revisa el teléfono.'],
    [400, 'Revisa el correo.', 'Revisa el correo.'],
    [400, null, 'Revisa los datos'],
    [403, 'private', 'No tienes permiso'],
    [409, 'private', 'Ya existe una cuenta'],
  ])(
    'preserves data after %s and allows a corrected submission',
    async (status, message, expected) => {
      createUser.mockRejectedValueOnce({
        isAxiosError: true,
        response: { status, data: { message } },
      })
      const view = await filledForm()
      await view.getComponent(CreateUserDialog).get('form').trigger('submit')
      await flushPromises()
      expect(view.get('[role="alert"]').text()).toContain(expected)
      expect(view.get<HTMLInputElement>('[name="firstName"]').element.value).toBe('Ana')
      expect(view.get('.create-button').attributes('disabled')).toBeUndefined()
      await view.getComponent(CreateUserDialog).get('[name="phoneNumber"]').setValue('88887777')
      await view.getComponent(CreateUserDialog).get('form').trigger('submit')
      await flushPromises()
      expect(createUser).toHaveBeenCalledTimes(2)
      expect(view.get<HTMLDialogElement>('dialog').element.open).toBe(false)
    },
  )

  it('reports confirmed account creation with failed email without resubmitting', async () => {
    createUser.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 502,
        data: {
          statusCode: 502,
          message: 'El usuario fue creado, pero no se pudo enviar el correo con sus credenciales.',
        },
      },
    })
    const view = await filledForm()
    await view.getComponent(CreateUserDialog).get('form').trigger('submit')
    await flushPromises()
    expect(getUsers).toHaveBeenCalledTimes(2)
    expect(view.get<HTMLDialogElement>('dialog').element.open).toBe(false)
    expect(view.get('.creation-result').attributes('role')).toBe('alert')
    expect(view.get('.creation-result').text()).toContain('fue creada')
    expect(view.get('.creation-result').text()).toContain('No repitas')
    expect(createUser).toHaveBeenCalledTimes(1)
  })

  it.each([
    { isAxiosError: true, code: 'ERR_NETWORK' },
    { isAxiosError: true, code: 'ECONNABORTED' },
    { isAxiosError: true, response: { status: 500 } },
    { isAxiosError: true, response: { status: 502, data: 'Bad gateway' } },
    new Error('Private error'),
  ])('blocks repeated creation when the result is uncertain: %p', async (error) => {
    createUser.mockRejectedValue(error)
    const view = await filledForm()
    await view.getComponent(CreateUserDialog).get('form').trigger('submit')
    await flushPromises()
    expect(view.get('[role="alert"]').text()).toContain('No se pudo confirmar')
    expect(view.get('.create-button').attributes('disabled')).toBeDefined()
    await view.getComponent(CreateUserDialog).get('form').trigger('submit')
    await view.get('.form-actions .cancel-button').trigger('click')
    await view.get('.add-user-button').trigger('click')
    await view.getComponent(CreateUserDialog).get('form').trigger('submit')
    expect(createUser).toHaveBeenCalledTimes(1)
    expect(view.get<HTMLInputElement>('[name="email"]').element.value).toBe('ana@example.com')
  })

  it.each(['resolve', 'reject'])(
    'ignores a late %s after leaving the view and releases scroll',
    async (outcome) => {
      let resolve!: (value: unknown) => void
      let reject!: (reason: unknown) => void
      createUser.mockReturnValue(
        new Promise((res, rej) => {
          resolve = res
          reject = rej
        }),
      )
      const view = await filledForm()
      await view.getComponent(CreateUserDialog).get('form').trigger('submit')
      view.unmount()
      wrapper = undefined
      expect(document.body.style.position).not.toBe('fixed')
      if (outcome === 'resolve') resolve({ id: 42, email: 'ana@example.com' })
      else reject(new Error('Network error'))
      await flushPromises()
      expect(createUser).toHaveBeenCalledTimes(1)
    },
  )
})

describe('client creation', () => {
  async function clientForm() {
    createUser.mockResolvedValueOnce({ id: 43, role: 'CLIENT', email: 'cliente@example.com' })
    const view = await renderDashboard()
    await view.get('[aria-label="Clientes"]').trigger('click')
    await view.get('.add-user-button').trigger('click')
    await flushPromises()
    await view.getComponent(CreateUserDialog).get('[name="firstName"]').setValue('Cliente')
    await view.getComponent(CreateUserDialog).get('[name="email"]').setValue('cliente@example.com')
    return view
  }

  it('creates a client without address even if catalog loading fails and resets on success', async () => {
    getUserCreationOptions.mockRejectedValueOnce(new Error('Catalog unavailable'))
    const view = await clientForm()
    await view.getComponent(CreateUserDialog).get('form').trigger('submit')
    await flushPromises()
    expect(createUser).toHaveBeenCalledExactlyOnceWith({
      role: 'CLIENT',
      firstName: 'Cliente',
      email: 'cliente@example.com',
      language: 'es',
    })
    expect(view.get<HTMLDialogElement>('dialog').element.open).toBe(false)
    expect(view.get('.creation-result').text()).toContain('Cuenta creada para cliente@example.com')
    expect(document.activeElement).toBe(view.get('.creation-result').element)
    await view.get('.add-user-button').trigger('click')
    await flushPromises()
    expect(view.getComponent(CreateUserDialog).get('[name="firstName"]').element).toHaveProperty(
      'value',
      '',
    )
    expect(view.get('[type="checkbox"]').element).toHaveProperty('checked', false)
  })

  it('uses loaded geography for the client address without sending a branch or public registration fields', async () => {
    const view = await clientForm()
    await view.get('[type="checkbox"]').setValue(true)
    await view.getComponent(CreateUserDialog).get('[name="provinceId"]').setValue('1')
    await view.getComponent(CreateUserDialog).get('[name="cantonId"]').setValue('19')
    await view.getComponent(CreateUserDialog).get('[name="districtId"]').setValue('102')
    await view.getComponent(CreateUserDialog).get('[name="details"]').setValue('Casa azul')
    await view.getComponent(CreateUserDialog).get('form').trigger('submit')
    await flushPromises()
    expect(createUser).toHaveBeenCalledExactlyOnceWith({
      role: 'CLIENT',
      firstName: 'Cliente',
      email: 'cliente@example.com',
      language: 'es',
      address: { districtId: 102, details: 'Casa azul' },
    })
  })

  it.each([
    [400, ['Revisa el correo.'], 'Revisa el correo.'],
    [403, 'private', 'No tienes permiso'],
    [409, 'private', 'Ya existe una cuenta'],
  ])(
    'preserves client input after %s and clears errors when switching forms',
    async (status, message, expected) => {
      const view = await clientForm()
      createUser
        .mockReset()
        .mockRejectedValueOnce({ isAxiosError: true, response: { status, data: { message } } })
      await view.getComponent(CreateUserDialog).get('form').trigger('submit')
      await flushPromises()
      expect(view.get('[role="alert"]').text()).toContain(expected)
      expect(view.getComponent(CreateUserDialog).get('[name="email"]').element).toHaveProperty(
        'value',
        'cliente@example.com',
      )
      expect(view.get('.create-button').attributes('disabled')).toBeUndefined()
      await view.get('.close-button').trigger('click')
      await view.get('[aria-label="Empleados"]').trigger('click')
      await view.get('.add-user-button').trigger('click')
      await flushPromises()
      expect(view.find('[role="alert"]').exists()).toBe(false)
      expect(view.getComponent(CreateUserDialog).get('[name="email"]').element).toHaveProperty(
        'value',
        '',
      )
      await view.get('.close-button').trigger('click')
      await view.get('[aria-label="Clientes"]').trigger('click')
      expect(view.getComponent(CreateUserDialog).get('[name="email"]').element).toHaveProperty(
        'value',
        '',
      )
    },
  )

  it('reports a created client whose credentials could not be emailed', async () => {
    const view = await clientForm()
    createUser.mockReset().mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 502,
        data: {
          statusCode: 502,
          message: 'El usuario fue creado, pero no se pudo enviar el correo con sus credenciales.',
        },
      },
    })
    await view.getComponent(CreateUserDialog).get('form').trigger('submit')
    await flushPromises()
    expect(view.get<HTMLDialogElement>('dialog').element.open).toBe(false)
    expect(view.get('.creation-result').text()).toContain(
      'La cuenta de cliente@example.com fue creada',
    )
    expect(view.get('.creation-result').attributes('role')).toBe('alert')
    expect(createUser).toHaveBeenCalledTimes(1)
  })

  it.each([
    { isAxiosError: true, code: 'ECONNABORTED' },
    { isAxiosError: true, code: 'ERR_NETWORK' },
    { isAxiosError: true, response: { status: 500 } },
    { isAxiosError: true, response: { status: 502, data: 'Bad gateway' } },
  ])('preserves the uncertain-result block across section and role changes: %p', async (error) => {
    const view = await clientForm()
    createUser.mockReset().mockRejectedValueOnce(error)
    await view.getComponent(CreateUserDialog).get('form').trigger('submit')
    await flushPromises()
    await view.get('.close-button').trigger('click')
    await view.get('[aria-label="Empleados"]').trigger('click')
    await view.get('.add-user-button').trigger('click')
    await flushPromises()
    expect(view.get('[role="alert"]').text()).toContain('No se pudo confirmar')
    expect(view.get('.create-button').attributes('disabled')).toBeDefined()
    await view.getComponent(CreateUserDialog).get('form').trigger('submit')
    await view.get('.close-button').trigger('click')
    await setRole('EMPLOYEE')
    expect(view.find('.add-user-button').exists()).toBe(false)
    await setRole('ADMINISTRATOR')
    await view.get('.add-user-button').trigger('click')
    await view.getComponent(CreateUserDialog).get('form').trigger('submit')
    expect(view.get('[role="alert"]').text()).toContain('No se pudo confirmar')
    expect(createUser).toHaveBeenCalledTimes(1)
  })

  it('prevents duplicate client submissions and navigation while waiting for the API', async () => {
    const view = await clientForm()
    let resolve!: (value: unknown) => void
    createUser.mockReset().mockReturnValueOnce(
      new Promise((res) => {
        resolve = res
      }),
    )
    await view.getComponent(CreateUserDialog).get('form').trigger('submit')
    await view.getComponent(CreateUserDialog).get('form').trigger('submit')
    view.getComponent(DashboardLayout).vm.$emit('navigate', 'employees')
    await view.get('dialog').trigger('cancel')
    expect(view.get('h1').text()).toBe('Clientes')
    expect(view.get<HTMLDialogElement>('dialog').element.open).toBe(true)
    expect(view.get('[type="checkbox"]').attributes('disabled')).toBeDefined()
    expect(createUser).toHaveBeenCalledTimes(1)
    resolve({ id: 43, role: 'CLIENT', email: 'cliente@example.com' })
    await flushPromises()
  })

  it('ignores a creation event for a different section', async () => {
    const view = await clientForm()
    view.getComponent(CreateUserDialog).vm.$emit('submit', { role: 'EMPLOYEE' })
    await flushPromises()
    expect(createUser).not.toHaveBeenCalled()
  })
})

describe('dashboard routes', () => {
  it.each([true, false])('exposes only a protected dashboard regardless of DEV=%s', async (dev) => {
    vi.resetModules()
    vi.stubEnv('DEV', dev)
    const { default: applicationRouter } = await import('@/router')
    routeHistories.push(applicationRouter.options.history)
    expect(applicationRouter.hasRoute('dashboard')).toBe(true)
    expect(applicationRouter.resolve('/dashboard').meta.requiresEmployee).toBe(true)
    expect(
      applicationRouter.getRoutes().find((route) => route.path === '/dev/dashboard')?.redirect,
    ).toBe('/dashboard')
    expect(applicationRouter.resolve('/').name).toBe('home')
    expect(applicationRouter.resolve('/privacy-policy').name).toBe('privacy-policy')
  })
})
