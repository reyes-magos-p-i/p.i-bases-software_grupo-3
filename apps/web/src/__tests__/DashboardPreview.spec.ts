import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import DashboardPreview from '@/views/DashboardPreview.vue'
import DashboardLayout from '@/layout/DashboardLayout.vue'

let wrapper: VueWrapper | undefined
let router: Router
const routeHistories: Router['options']['history'][] = []
const dialogPrototype = HTMLDialogElement.prototype
const originalShowModal = Object.getOwnPropertyDescriptor(dialogPrototype, 'showModal')
const originalClose = Object.getOwnPropertyDescriptor(dialogPrototype, 'close')

beforeEach(() => {
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

async function renderPreview() {
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<h1>Portal principal</h1>' } },
      { path: '/dev/dashboard', component: DashboardPreview },
    ],
  })
  routeHistories.push(router.options.history)
  await router.push('/dev/dashboard')
  await router.isReady()
  wrapper = mount(DashboardPreview, { attachTo: document.body, global: { plugins: [router] } })
  return wrapper
}

describe('DashboardPreview', () => {
  it('starts with a clearly identified administrator preview in the employees section', async () => {
    const view = await renderPreview()

    expect(view.text()).toContain('Vista de desarrollo')
    expect(view.text()).toContain('Datos simulados')
    expect(view.get('header').text()).toContain('Usuario de prueba')
    expect(view.get('header').text()).toContain('Rol: Administrador')
    expect(view.get('h1').text()).toBe('Empleados')
    expect(view.get<HTMLSelectElement>('select').element.value).toBe('ADMINISTRATOR')
    expect(view.get('label').attributes('for')).toBe(view.get('select').attributes('id'))
    expect(
      view
        .get('.preview-controls select')
        .findAll('option')
        .map((option) => option.attributes('value')),
    ).toEqual(['ADMINISTRATOR', 'EMPLOYEE'])
  })

  it('switches between the two preview sections and updates the active menu item', async () => {
    const view = await renderPreview()

    await view.get('[aria-label="Clientes"]').trigger('click')
    expect(view.get('h1').text()).toBe('Clientes')
    expect(view.get('[aria-current="page"]').attributes('aria-label')).toBe('Clientes')
    await view.get('[aria-label="Empleados"]').trigger('click')
    expect(view.get('h1').text()).toBe('Empleados')
    expect(view.get('[aria-current="page"]').attributes('aria-label')).toBe('Empleados')
  })

  it('moves to clients and hides administrator options when selecting employee', async () => {
    const view = await renderPreview()

    await view.get('select').setValue('EMPLOYEE')

    expect(view.get('header').text()).toContain('Rol: Empleado')
    expect(view.get('h1').text()).toBe('Clientes')
    expect(view.get('[aria-current="page"]').attributes('aria-label')).toBe('Clientes')
    expect(view.get('nav').text()).not.toContain('Empleados')
    expect(view.get('nav').text()).not.toContain('Tablero')
    expect(view.get('nav').findAll('button')).toHaveLength(8)
  })

  it('preserves clients as the current section across role changes', async () => {
    const view = await renderPreview()
    await view.get('[aria-label="Clientes"]').trigger('click')

    await view.get('select').setValue('EMPLOYEE')
    await view.get('select').setValue('ADMINISTRATOR')

    expect(view.get('h1').text()).toBe('Clientes')
    expect(view.find('[aria-label="Empleados"]').exists()).toBe(true)
    expect(view.find('[aria-label="Tablero (Pendiente)"]').exists()).toBe(true)
  })

  it('leaves other features and logout disabled', async () => {
    const view = await renderPreview()
    const pending = view.findAll('nav button:disabled, .logout-button')

    expect(pending).toHaveLength(9)
    for (const button of pending) {
      expect(button.attributes('disabled')).toBeDefined()
      expect(button.text()).toContain('Pendiente')
      await button.trigger('click')
    }
    expect(view.get('h1').text()).toBe('Empleados')
    expect(router.currentRoute.value.path).toBe('/dev/dashboard')
  })

  it('ignores navigation outside the available preview sections', async () => {
    const view = await renderPreview()
    const layout = view.getComponent(DashboardLayout)

    layout.vm.$emit('navigate', 'dashboard')
    await flushPromises()
    expect(view.get('h1').text()).toBe('Empleados')

    await view.get('select').setValue('EMPLOYEE')
    layout.vm.$emit('navigate', 'employees')
    await flushPromises()
    expect(view.get('h1').text()).toBe('Clientes')
  })

  it('allows returning to the main portal', async () => {
    const view = await renderPreview()

    await view.get('.portal-link').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/')
  })

  it('opens the creation dialog from employees and returns focus when closed', async () => {
    const view = await renderPreview()
    const button = view.get<HTMLButtonElement>('.add-employee-button')
    const dialog = view.get<HTMLDialogElement>('.employee-dialog')
    expect(dialog.element.open).toBe(false)

    button.element.focus()
    await button.trigger('click')

    expect(dialog.element.open).toBe(true)
    expect(document.activeElement).toBe(view.get('[name="firstName"]').element)
    await view.get('[aria-label="Cerrar formulario"]').trigger('click')
    expect(dialog.element.open).toBe(false)
    expect(document.activeElement).toBe(button.element)
  })

  it('does not offer employee creation in clients or to the employee role', async () => {
    const view = await renderPreview()
    await view.get('[aria-label="Clientes"]').trigger('click')

    expect(view.find('.add-employee-button').exists()).toBe(false)
    expect(view.find('.employee-dialog').exists()).toBe(false)
    await view.get('[aria-label="Empleados"]').trigger('click')
    expect(view.find('.add-employee-button').exists()).toBe(true)
    await view.get('.preview-controls select').setValue('EMPLOYEE')
    expect(view.find('.add-employee-button').exists()).toBe(false)
    expect(view.find('.employee-dialog').exists()).toBe(false)
  })

  it('closes the dialog if the preview identity changes while it is open', async () => {
    const view = await renderPreview()
    await view.get('.add-employee-button').trigger('click')
    const dialog = view.get<HTMLDialogElement>('.employee-dialog').element

    await view.get('.preview-controls select').setValue('EMPLOYEE')

    expect(dialog.open).toBe(false)
    expect(view.find('.employee-dialog').exists()).toBe(false)
    expect(view.get('h1').text()).toBe('Clientes')
  })
})

describe('dashboard preview route', () => {
  it.each([true, false])('registers the route only when DEV is true (DEV=%s)', async (dev) => {
    vi.resetModules()
    vi.stubEnv('DEV', dev)
    const { default: applicationRouter } = await import('@/router')
    routeHistories.push(applicationRouter.options.history)

    expect(applicationRouter.hasRoute('dashboard-preview')).toBe(dev)
    expect(applicationRouter.resolve('/dev/dashboard').name).toBe(
      dev ? 'dashboard-preview' : 'NotFound',
    )
    expect(applicationRouter.resolve('/').name).toBe('home')
    expect(applicationRouter.resolve('/privacy-policy').name).toBe('privacy-policy')
  })

  it('loads the preview lazily in development', async () => {
    vi.resetModules()
    vi.stubEnv('DEV', true)
    const { default: applicationRouter } = await import('@/router')
    routeHistories.push(applicationRouter.options.history)
    const loadView = applicationRouter
      .getRoutes()
      .find((route) => route.name === 'dashboard-preview')?.components?.default

    expect(loadView).toBeTypeOf('function')
    const module = await (loadView as () => Promise<{ default: unknown }>)()
    expect(module.default).toBeDefined()
  })
})
