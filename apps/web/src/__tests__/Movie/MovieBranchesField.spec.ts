import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import MovieBranchesField from '@/components/Movies/MovieBranchesField.vue'
import ReusableSearchDropdown from '@/components/common/ReusableSearchDropdown.vue'

const branches = [
  { id: 1, name: 'Cinetadel Multiplaza del Este' },
  { id: 27, name: 'Cinetadel Multiplaza Escazú' },
]

function mountField(props: Partial<InstanceType<typeof MovieBranchesField>['$props']> = {}) {
  return mount(MovieBranchesField, {
    props: { modelValue: [], branches, ...props },
  })
}

describe('MovieBranchesField', () => {
  it('offers every active branch without typing a search first', () => {
    const dropdown = mountField().getComponent(ReusableSearchDropdown)

    expect(dropdown.props('label')).toBe('Sucursales')
    expect(dropdown.props('minSearchLength')).toBe(0)
    expect(dropdown.props('options')).toEqual([
      { value: 1, label: 'Cinetadel Multiplaza del Este' },
      { value: 27, label: 'Cinetadel Multiplaza Escazú' },
    ])
  })

  it('selects every branch at once and clears the field error', async () => {
    const wrapper = mountField({ error: 'Selecciona únicamente sucursales activas.' })

    await wrapper.get('button.select-all').trigger('click')

    expect(wrapper.emitted('update:modelValue')).toEqual([[[1, 27]]])
    expect(wrapper.emitted('clear-error')).toHaveLength(1)
  })

  it('disables "Seleccionar todas" when everything is selected, there are no branches or it is disabled', () => {
    const button = (props: Parameters<typeof mountField>[0]) =>
      mountField(props).get<HTMLButtonElement>('button.select-all').element.disabled

    expect(button({})).toBe(false)
    expect(button({ modelValue: [1, 27] })).toBe(true)
    expect(button({ branches: [] })).toBe(true)
    expect(button({ disabled: true })).toBe(true)
  })

  it('forwards selections from the dropdown and clears the error', async () => {
    const wrapper = mountField()

    wrapper.getComponent(ReusableSearchDropdown).vm.$emit('update:modelValue', [27])

    expect(wrapper.emitted('update:modelValue')).toEqual([[[27]]])
    expect(wrapper.emitted('clear-error')).toHaveLength(1)
  })
})
