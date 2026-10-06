import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CrudTable from '../../../components/crudTable/CrudTable.vue'

describe('CrudTable', () => {
  it('allows a custom last action column without emitting the default events', async () => {
    const wrapper = mount(CrudTable, {
      props: { columns: [{ key: 'name', label: 'Nombre' }], rows: [{ id: 42, name: 'Ana' }] },
      slots: { actions: '<button disabled>{{ params.row.id }}: Ver</button>' },
    })
    expect(wrapper.findAll('th').slice(-1)[0]?.text()).toBe('Acciones')
    expect(wrapper.get('.actions').text()).toBe('42: Ver')
    await wrapper.get('.actions button').trigger('click')
    expect(wrapper.emitted()).toEqual({})
    wrapper.unmount()
  })
  it('preserves the view, edit and delete events with the original row', async () => {
    const row = { id: 1, name: 'Ana' }
    const wrapper = mount(CrudTable, {
      props: { columns: [{ key: 'name', label: 'Nombre' }], rows: [row] },
    })
    for (const [index, event] of ['view', 'edit', 'delete'].entries()) {
      await wrapper.findAll('button')[index]!.trigger('click')
      expect(wrapper.emitted(event)).toEqual([[row]])
    }
    wrapper.unmount()
  })
  it('supports read-only lists without changing the default actions', () => {
    const wrapper = mount(CrudTable, {
      props: {
        columns: [{ key: 'name', label: 'Nombre' }],
        rows: [],
        showActions: false,
        caption: 'Clientes',
      },
    })
    expect(wrapper.find('th').text()).toBe('Nombre')
    expect(wrapper.findAll('th')).toHaveLength(1)
    expect(wrapper.get('td').attributes('colspan')).toBe('1')
    expect(wrapper.get('caption').text()).toBe('Clientes')
    wrapper.unmount()
  })
  it('displays the column names', () => {
    const wrapper = mount(CrudTable, {
      props: {
        columns: [
          { key: 'name', label: 'Name' },
          { key: 'email', label: 'Email' },
          { key: 'birthDate', label: 'BirthDate' },
        ],
        rows: [
          {
            id: 1,
            name: 'Silvio',
            email: 'silvio@example.com',
            birthDate: '02/05/1990',
          },
        ],
      },
    })

    expect(wrapper.text()).toContain('Name')
    expect(wrapper.text()).toContain('Email')
    expect(wrapper.text()).contain('BirthDate')
  })

  it('diplays the column names', () => {
    const wrapper = mount(CrudTable, {
      props: {
        columns: [
          { key: 'name', label: 'Name' },
          { key: 'email', label: 'Email' },
        ],
        rows: [
          {
            id: 1,
            name: 'Silvio',
            email: 'silvio.castilo@test.com',
          },
        ],
      },
    })
    expect(wrapper.text()).toContain('Silvio')
    expect(wrapper.text()).toContain('silvio.castilo@test.com')
  })
})
