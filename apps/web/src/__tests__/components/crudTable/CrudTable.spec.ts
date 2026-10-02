import { describe, it, expect } from "vitest"
import { mount } from '@vue/test-utils'
import CrudTable from '../../../components/crudTable/CrudTable.vue'


describe('CrudTable', ()=> {
  it('displays the column names', () => {
    const wrapper = mount(CrudTable, {
      props: {
        columns: [
          { key: 'name', label: 'Name' },
          { key: 'email', label: 'Email' },
          { key: 'birthDate', label: 'BirthDate' }
        ],
        rows: [
          {
            id: 1,
            name: 'Silvio',
            email: 'silvio@example.com',
            birthDate: '02/05/1990'
          }
        ]
      }
  })

    expect(wrapper.text()).toContain('Name')
    expect(wrapper.text()).toContain('Email')
    expect(wrapper.text()).contain('BirthDate')
  })

  it('diplays the column names', ()=> {
    const wrapper = mount(CrudTable, {
      props: {
        columns: [
        { key: 'name', label:'Name'},
        { key: 'email', label:'Email'}
        ],
        rows: [
          {
            id: 1,
            name: 'Silvio',
            email: 'silvio.castilo@test.com'
          }
        ]
      }
    })
    expect(wrapper.text()).toContain('Silvio')
    expect(wrapper.text()).toContain('silvio.castilo@test.com')

  })
})
