import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TheaterForm from '@/components/theaters/TheaterForm.vue'

const props = { submitLabel: 'Guardar', submittingLabel: 'Guardando…' }

describe('TheaterForm layout protection', () => {
  it('keeps embedded content before the final form actions', () => {
    const wrapper = mount(TheaterForm, {
      props,
      slots: { 'before-actions': '<section data-seat-editor>Editor de asientos</section>' },
    })
    expect(wrapper.get('footer').element.previousElementSibling).toBe(
      wrapper.get('.dialog-sections').element,
    )
    expect(wrapper.get('.dialog-sections').element.lastElementChild).toBe(
      wrapper.get('[data-seat-editor]').element,
    )
    expect(wrapper.get('form').element.lastElementChild).toBe(wrapper.get('footer').element)
    wrapper.unmount()
  })
  it('numbers both editable groups without changing field values or names', async () => {
    const wrapper = mount(TheaterForm, { props: { ...props, numbered: true } })
    expect(wrapper.findAll('.dialog-section-title').map((title) => title.text())).toEqual([
      '1 Datos de la sala',
      '2 Capacidad y distribución',
    ])
    expect(
      wrapper.findAll('.dialog-section [name]').map((field) => field.attributes('name')),
    ).toEqual(['cinema', 'projectorName', 'status', 'numberOfSeats', 'dimensionX', 'dimensionY'])
    await wrapper.get('[name="dimensionX"]').setValue(8)
    await wrapper.setProps({ numbered: false })
    expect(wrapper.find('.dialog-section-number').exists()).toBe(false)
    expect(wrapper.get<HTMLInputElement>('[name="dimensionX"]').element.value).toBe('8')
    wrapper.unmount()
  })
  it('keeps protected dimensions read-only while allowing the other fields to be edited', async () => {
    const view = mount(TheaterForm, { props })
    view.vm.fill({
      theaterId: 7,
      cinema: 'Centro',
      numberOfSeats: 6,
      dimensionX: 2,
      dimensionY: 3,
      projectorName: 'IMAX',
      status: 'Disponible',
      isActive: true,
      canResize: false,
    })
    await view.vm.$nextTick()
    for (const name of ['numberOfSeats', 'dimensionX', 'dimensionY']) {
      expect(view.get(`[name="${name}"]`).attributes('readonly')).toBeDefined()
    }
    expect(view.get('[name="projectorName"]').attributes('disabled')).toBeUndefined()
    expect(view.text()).toContain('Sus dimensiones y cantidad de asientos se conservan')
    view.vm.reset()
    await view.vm.$nextTick()
    expect(view.get('[name="dimensionX"]').attributes('readonly')).toBeUndefined()
    view.unmount()
  })
})

describe('TheaterForm projector select', () => {
  it('shows "No hay proyectores" when there are no projectors', () => {
    const select = mount(TheaterForm, { props }).get('[name="projectorName"]')

    expect(select.text()).toContain('No hay proyectores')
  })

  it('does not show it while options are loading or when projectors exist', () => {
    const loading = mount(TheaterForm, { props: { ...props, optionsLoading: true } })
    const loaded = mount(TheaterForm, {
      props: { ...props, projectors: [{ projectorId: 1, name: 'IMAX' }] },
    })

    expect(loading.get('[name="projectorName"]').text()).not.toContain('No hay proyectores')
    expect(loaded.get('[name="projectorName"]').text()).not.toContain('No hay proyectores')
  })
})

describe('TheaterForm cinema select', () => {
  it('keeps the complete branch value and label when its visible text must fit a narrow column', async () => {
    const name = 'Cinetadel Multiplaza del Este · Sucursal con un nombre especialmente largo'
    const view = mount(TheaterForm, {
      props: { ...props, cinemas: [{ branchId: 1, name, companyId: 1 }] },
    })
    const select = view.get<HTMLSelectElement>('[name="cinema"]')
    await select.setValue(name)
    expect(select.element.value).toBe(name)
    const options = select.findAll('option')
    expect(options[options.length - 1]!.text()).toBe(name)
    const label = view.get(`label[for="${select.attributes('id')}"]`)
    expect(label.text()).toContain('Sucursal')
    view.unmount()
  })

  it('shows "No hay sucursales" when there are no cinemas', () => {
    const select = mount(TheaterForm, { props }).get('[name="cinema"]')

    expect(select.text()).toContain('No hay sucursales')
  })

  it('does not show it while options are loading or when cinemas exist', () => {
    const loading = mount(TheaterForm, { props: { ...props, optionsLoading: true } })
    const loaded = mount(TheaterForm, {
      props: { ...props, cinemas: [{ branchId: 1, name: 'Centro', companyId: 1 }] },
    })

    expect(loading.get('[name="cinema"]').text()).not.toContain('No hay sucursales')
    expect(loaded.get('[name="cinema"]').text()).not.toContain('No hay sucursales')
  })
})

describe('TheaterForm status select', () => {
  it('shows "No hay estados" when there are no statuses', () => {
    const select = mount(TheaterForm, { props }).get('[name="status"]')

    expect(select.text()).toBe('No hay estados')
  })

  it('does not show it while options are loading', () => {
    const select = mount(TheaterForm, { props: { ...props, optionsLoading: true } }).get(
      '[name="status"]',
    )

    expect(select.text()).toBe('')
  })

  it('lists the statuses and selects the first by default', () => {
    const wrapper = mount(TheaterForm, {
      props: {
        ...props,
        statuses: [
          { theaterStatusId: 1, name: 'Disponible' },
          { theaterStatusId: 2, name: 'En función' },
        ],
      },
    })
    const select = wrapper.get<HTMLSelectElement>('[name="status"]')

    expect(select.text()).not.toContain('No hay estados')
    expect(select.findAll('option').map((option) => option.text())).toEqual([
      'Disponible',
      'En función',
    ])
    expect(select.element.value).toBe('Disponible')
  })
})
