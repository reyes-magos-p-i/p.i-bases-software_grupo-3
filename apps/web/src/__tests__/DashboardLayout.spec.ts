import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import DashboardLayout from '@/components/layout/DashboardLayout.vue'
import type { UserRole } from '@/types/user'

const sections = [
  ['dashboard', 'Tablero'],
  ['rooms', 'Salas'],
  ['movies', 'Películas'],
  ['employees', 'Empleados'],
  ['clients', 'Clientes'],
  ['screenings', 'Proyecciones'],
  ['branches', 'Sucursales'],
  ['password', 'Cambiar contraseña'],
  ['account', 'Ajustes de cuenta'],
  ['help', 'Asistencia'],
] as const
const wrappers: VueWrapper[] = []
let viewport: MediaQueryList
const dialogPrototype = HTMLDialogElement.prototype
const originalShowModal = Object.getOwnPropertyDescriptor(dialogPrototype, 'showModal')
const originalClose = Object.getOwnPropertyDescriptor(dialogPrototype, 'close')

function renderLayout(
  props: Partial<InstanceType<typeof DashboardLayout>['$props']> = {},
  slots: Record<string, string> = {},
) {
  const wrapper = mount(DashboardLayout, {
    attachTo: document.body,
    props: { role: 'ADMINISTRATOR', ...props },
    slots,
  })
  wrappers.push(wrapper)
  return wrapper
}

async function resize(mobile: boolean) {
  Object.defineProperty(viewport, 'matches', { value: mobile, configurable: true })
  viewport.dispatchEvent(new Event('change'))
  await nextTick()
}

async function openMenu(wrapper: VueWrapper) {
  const button = wrapper.get<HTMLButtonElement>('[aria-label="Abrir menú"]')
  button.element.focus()
  await button.trigger('click')
  return button
}

beforeEach(() => {
  viewport = Object.assign(new EventTarget(), {
    matches: false,
    media: '(max-width: 767px)',
    addListener: vi.fn(),
    removeListener: vi.fn(),
    onchange: null,
  }) as MediaQueryList
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => viewport),
  )

  // jsdom does not implement the native dialog methods or browser focus behavior.
  Object.defineProperties(dialogPrototype, {
    showModal: {
      configurable: true,
      value: vi.fn(function (this: HTMLDialogElement) {
        this.setAttribute('open', '')
        this.querySelector<HTMLButtonElement>('button')?.focus()
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
})

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount()
  for (const [name, descriptor] of [
    ['showModal', originalShowModal],
    ['close', originalClose],
  ] as const) {
    if (descriptor) Object.defineProperty(dialogPrototype, name, descriptor)
    else Reflect.deleteProperty(dialogPrototype, name)
  }
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('DashboardLayout', () => {
  it('shows every named section for an administrator without unnamed options or notifications', () => {
    const wrapper = renderLayout()
    const navigation = wrapper.get('nav')

    expect(navigation.findAll('button')).toHaveLength(10)
    for (const [, label] of sections) {
      expect(navigation.find('[aria-label="' + label + ' (Pendiente)"]').exists()).toBe(true)
    }
    expect(wrapper.text()).not.toContain('***')
    expect(wrapper.find('.bi-bell').exists()).toBe(false)
  })

  it('hides only dashboard and employees for an employee, even if the parent enables them', () => {
    const wrapper = renderLayout({
      role: 'EMPLOYEE',
      availableSections: sections.map(([id]) => id),
    })
    const navigation = wrapper.get('nav')

    expect(navigation.findAll('button')).toHaveLength(8)
    for (const [id, label] of sections) {
      expect(navigation.find('[aria-label="' + label + '"]').exists()).toBe(
        id !== 'dashboard' && id !== 'employees',
      )
    }
    expect(wrapper.get('header').text()).toContain('Rol: Empleado')
  })

  it.each(['CLIENT', 'UNKNOWN'] as UserRole[])(
    'does not expose staff navigation for %s',
    (role) => {
      const wrapper = renderLayout({ role, availableSections: sections.map(([id]) => id) })

      expect(wrapper.get('nav').findAll('button')).toHaveLength(0)
      expect(wrapper.emitted('navigate')).toBeUndefined()
    },
  )

  it('updates visible options when the supplied role changes', async () => {
    const wrapper = renderLayout({ activeSection: 'employees', availableSections: ['employees'] })
    expect(wrapper.get('.sidebar-title').text()).toBe('Empleados')

    await wrapper.setProps({ role: 'EMPLOYEE' })

    expect(wrapper.find('[aria-label="Empleados"]').exists()).toBe(false)
    expect(wrapper.get('.sidebar-title').text()).toBe('Cinetadel')
    expect(wrapper.emitted('navigate')).toBeUndefined()
  })

  it('identifies unavailable sections and logout as pending without emitting actions', async () => {
    const wrapper = renderLayout()
    const buttons = wrapper.findAll('nav button, .logout-button')

    expect(buttons).toHaveLength(11)
    for (const button of buttons) {
      expect(button.attributes('disabled')).toBeDefined()
      expect(button.text()).toContain('Pendiente')
      await button.trigger('click')
    }
    expect(wrapper.emitted('navigate')).toBeUndefined()
    expect(wrapper.emitted('logout')).toBeUndefined()
  })

  it('marks the current available section and delegates navigation to the parent', async () => {
    const wrapper = renderLayout({
      activeSection: 'employees',
      availableSections: ['employees', 'clients'],
    })

    expect(wrapper.get('[aria-current="page"]').attributes('aria-label')).toBe('Empleados')
    expect(wrapper.findAll('[aria-current="page"]')).toHaveLength(1)
    await wrapper.get('[aria-label="Clientes"]').trigger('click')

    expect(wrapper.emitted('navigate')).toEqual([['clients']])
    expect(wrapper.get('[aria-current="page"]').attributes('aria-label')).toBe('Empleados')
    await wrapper.setProps({ activeSection: 'clients' })
    expect(wrapper.get('[aria-current="page"]').attributes('aria-label')).toBe('Clientes')
  })

  it('does not mark an unavailable section as an active page', () => {
    const wrapper = renderLayout({ activeSection: 'employees' })

    expect(wrapper.find('[aria-current="page"]').exists()).toBe(false)
  })

  it('emits logout only after the parent enables it', async () => {
    const wrapper = renderLayout()
    await wrapper.setProps({ canLogout: true })
    await wrapper.get('[aria-label="Cerrar sesión"]').trigger('click')

    expect(wrapper.emitted('logout')).toEqual([[]])
  })

  it('collapses and expands the desktop menu while preserving accessible option names', async () => {
    const wrapper = renderLayout({ availableSections: ['clients'] })
    const toggle = wrapper.get('[aria-label="Plegar menú"]')
    expect(toggle.attributes('aria-controls')).toBe(wrapper.get('nav').attributes('id'))

    await toggle.trigger('click')

    expect(wrapper.classes()).toContain('is-collapsed')
    expect(wrapper.find('.sidebar-title').exists()).toBe(false)
    expect(wrapper.get('[aria-label="Clientes"]').attributes('title')).toBe('Clientes')
    expect(wrapper.get('[aria-label="Expandir menú"]').attributes('aria-expanded')).toBe('false')
    await wrapper.get('[aria-label="Clientes"]').trigger('click')
    expect(wrapper.emitted('navigate')).toEqual([['clients']])

    await wrapper.get('[aria-label="Expandir menú"]').trigger('click')
    expect(wrapper.classes()).not.toContain('is-collapsed')
    expect(wrapper.get('[aria-label="Plegar menú"]').attributes('aria-expanded')).toBe('true')
    expect(wrapper.get('.sidebar-title').text()).toBe('Cinetadel')
  })

  it('renders supplied identity and content without inventing a session or profile picture', () => {
    const wrapper = renderLayout({ userName: 'Ana Solano' }, { default: '<h1>Crear usuario</h1>' })

    expect(wrapper.get('header').text()).toContain('Rol: Administrador')
    expect(wrapper.get('header').text()).toContain('Ana Solano')
    expect(wrapper.get('main h1').text()).toBe('Crear usuario')
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.get('.skip-link').attributes('href')).toBe(
      '#' + wrapper.get('main').attributes('id'),
    )
  })

  it('allows future profile content through a slot', () => {
    const wrapper = renderLayout({}, { profile: '<span class="custom-profile">AS</span>' })

    expect(wrapper.get('header .custom-profile').text()).toBe('AS')
    expect(wrapper.find('header .bi-person-circle').exists()).toBe(false)
    expect(wrapper.find('.user-name').exists()).toBe(false)
  })

  it('assigns unique content and navigation identifiers to each layout instance', () => {
    const wrapper = mount({
      components: { DashboardLayout },
      template: '<DashboardLayout role="ADMINISTRATOR" /><DashboardLayout role="EMPLOYEE" />',
    })
    wrappers.push(wrapper)
    const [first, second] = wrapper.findAllComponents(DashboardLayout)

    expect(first?.get('main').attributes('id')).not.toBe(second?.get('main').attributes('id'))
    expect(first?.get('nav').attributes('id')).not.toBe(second?.get('nav').attributes('id'))
  })

  it('unsubscribes from viewport changes when unmounted', () => {
    const add = vi.spyOn(viewport, 'addEventListener')
    const remove = vi.spyOn(viewport, 'removeEventListener')
    const wrapper = renderLayout()
    const handler = add.mock.calls[0]?.[1]

    wrapper.unmount()

    expect(add).toHaveBeenCalledWith('change', expect.any(Function))
    expect(remove).toHaveBeenCalledWith('change', handler)
  })

  describe('mobile navigation', () => {
    beforeEach(async () => {
      await resize(true)
    })

    it('opens a native modal with a labelled close control', async () => {
      const wrapper = renderLayout()
      await nextTick()
      expect(wrapper.find('aside').exists()).toBe(false)
      const opener = await openMenu(wrapper)
      const dialog = wrapper.get<HTMLDialogElement>('dialog')

      expect(dialog.element.showModal).toHaveBeenCalledOnce()
      expect(dialog.element.open).toBe(true)
      expect(dialog.attributes('aria-label')).toBe('Menú del dashboard')
      expect(opener.attributes('aria-controls')).toBe(dialog.attributes('id'))
      expect(opener.attributes('aria-expanded')).toBe('true')
      expect(document.activeElement).toBe(wrapper.get('[aria-label="Cerrar menú"]').element)
      await opener.trigger('click')
      expect(dialog.element.showModal).toHaveBeenCalledOnce()
    })

    it.each(['button', 'escape', 'backdrop', 'native-close'])(
      'closes through %s and restores focus to the opener',
      async (method) => {
        const wrapper = renderLayout()
        await nextTick()
        const opener = await openMenu(wrapper)
        const dialog = wrapper.get<HTMLDialogElement>('dialog')

        if (method === 'button') await wrapper.get('[aria-label="Cerrar menú"]').trigger('click')
        if (method === 'escape') await dialog.trigger('cancel')
        if (method === 'backdrop') await dialog.trigger('click')
        if (method === 'native-close') {
          dialog.element.close()
          await nextTick()
        }

        expect(dialog.element.open).toBe(false)
        expect(opener.attributes('aria-expanded')).toBe('false')
        expect(document.activeElement).toBe(opener.element)
      },
    )

    it('does not close when clicking inside the menu', async () => {
      const wrapper = renderLayout()
      await nextTick()
      await openMenu(wrapper)

      await wrapper.get('.sidebar-title').trigger('click')

      expect(wrapper.get<HTMLDialogElement>('dialog').element.open).toBe(true)
    })

    it('wraps keyboard focus at both ends of the enabled menu controls', async () => {
      const wrapper = renderLayout({ availableSections: ['employees', 'clients'] })
      await nextTick()
      await openMenu(wrapper)
      const close = wrapper.get<HTMLButtonElement>('[aria-label="Cerrar menú"]')
      const last = wrapper.get<HTMLButtonElement>('[aria-label="Clientes"]')

      await close.trigger('keydown', { key: 'Tab', shiftKey: true })
      expect(document.activeElement).toBe(last.element)
      await last.trigger('keydown', { key: 'Tab' })
      expect(document.activeElement).toBe(close.element)

      const middle = wrapper.get<HTMLButtonElement>('[aria-label="Empleados"]')
      middle.element.focus()
      const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
      middle.element.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(false)
    })

    it('keeps focus on the close control when every action is pending', async () => {
      const wrapper = renderLayout()
      await nextTick()
      await openMenu(wrapper)
      const close = wrapper.get<HTMLButtonElement>('[aria-label="Cerrar menú"]')

      await close.trigger('keydown', { key: 'Tab' })
      expect(document.activeElement).toBe(close.element)
      await close.trigger('keydown', { key: 'Tab', shiftKey: true })
      expect(document.activeElement).toBe(close.element)
    })

    it('delegates navigation and closes the menu', async () => {
      const wrapper = renderLayout({ role: 'EMPLOYEE', availableSections: ['clients'] })
      await nextTick()
      const opener = await openMenu(wrapper)

      await wrapper.get('[aria-label="Clientes"]').trigger('click')

      expect(wrapper.emitted('navigate')).toEqual([['clients']])
      expect(wrapper.get<HTMLDialogElement>('dialog').element.open).toBe(false)
      expect(document.activeElement).toBe(opener.element)
    })

    it('delegates logout and closes the menu when enabled', async () => {
      const wrapper = renderLayout({ canLogout: true })
      await nextTick()
      await openMenu(wrapper)

      await wrapper.get('[aria-label="Cerrar sesión"]').trigger('click')

      expect(wrapper.emitted('logout')).toEqual([[]])
      expect(wrapper.get<HTMLDialogElement>('dialog').element.open).toBe(false)
    })

    it('closes on desktop resize and moves focus to the content when the opener disappears', async () => {
      const wrapper = renderLayout()
      await nextTick()
      await openMenu(wrapper)

      await resize(false)
      await nextTick()

      expect(wrapper.find('dialog').exists()).toBe(false)
      expect(wrapper.find('[aria-label="Abrir menú"]').exists()).toBe(false)
      expect(wrapper.find('aside').exists()).toBe(true)
      expect(document.activeElement).toBe(wrapper.get('main').element)
      await resize(true)
      expect(wrapper.get<HTMLDialogElement>('dialog').element.open).toBe(false)
    })

    it('shows full labels on mobile after collapsing the desktop sidebar', async () => {
      await resize(false)
      const wrapper = renderLayout({ availableSections: ['clients'] })
      await wrapper.get('[aria-label="Plegar menú"]').trigger('click')
      await resize(true)
      await openMenu(wrapper)

      expect(wrapper.get('[aria-label="Clientes"]').text()).toBe('Clientes')
      expect(wrapper.find('[aria-label="Expandir menú"]').exists()).toBe(false)
      await resize(false)
      expect(wrapper.find('[aria-label="Expandir menú"]').exists()).toBe(true)
    })
  })
})
