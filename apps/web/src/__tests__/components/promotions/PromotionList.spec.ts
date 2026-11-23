// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import PromotionList from '@/components/promotions/PromotionList.vue'
import type { PromotionListItem } from '@/types/promotion-read'

// Use the actual CrudTable and SimpleDropdown components.
vi.mock('@/composables/useBlurValidation', () => ({ useBlurValidation: () => () => true }))
vi.mock('@/utils/display-text', () => ({ displayText: (value: string) => value }))

const items: PromotionListItem[] = [
  { promotionId: 2, promotionTitle: 'Árbol', promotionType: 'percentage', technology: 'STANDARD', projectionFormat: '2D', beginDate: '2026-01-10', endDate: '2026-08-01' },
  { promotionId: 10, promotionTitle: 'Bosque', promotionType: 'fixed', technology: 'IMAX', projectionFormat: '3D', beginDate: '2026-02-01', endDate: '2026-07-01' },
  { promotionId: 1, promotionTitle: 'Cine', promotionType: 'percentage', technology: null, projectionFormat: null, beginDate: '2026-03-01', endDate: '2026-06-01' },
]
let wrapper: VueWrapper
function render(extra = {}) {
  wrapper = mount(PromotionList, { props: { promotions: items, ...extra } })
  return wrapper
}
function ids() {
  return wrapper.findAll('tbody tr').filter((row) => !row.find('.empty').exists())
    .map((row) => Number(row.get('td').text()))
}
async function select(label: string, value: string) {
  const field = wrapper.findAll('.simple-dropdown').find((item) => item.get('label').text() === label)
  if (!field) throw new Error(`Missing dropdown ${label}`)
  await field.get('select').setValue(value)
}
afterEach(() => wrapper?.unmount())

describe('PromotionList', () => {
  it('renders all requested columns and view/edit actions', () => {
    render()
    expect(wrapper.findAll('thead th').map((cell) => cell.text())).toEqual([
      'ID', 'Nombre', 'Tipo de promoción', 'Tecnología', 'Formato', 'Fecha inicial', 'Fecha final', 'Acciones',
    ])
    expect(ids()).toEqual([10, 2, 1])
    expect(wrapper.text()).toContain('3 de 3 promociones.')
    expect(wrapper.text()).toContain('10/01/2026')
    expect(wrapper.text()).toContain('Cualquiera')
    expect(wrapper.find('[aria-label="Modificar"]').exists()).toBe(false)
    expect(wrapper.find('[aria-label="Desactivar"]').exists()).toBe(false)
  })

  it('searches titles without case or accent sensitivity', async () => {
    render()
    await wrapper.get('input[type="search"]').setValue(' ARBOL ')
    expect(ids()).toEqual([10, 2, 1])
    await wrapper.get('form.search-bar').trigger('submit')
    expect(ids()).toEqual([2])
    expect(wrapper.text()).toContain('1 de 3 promociones.')
  })

  it('places search and clear buttons in the search form and disables clear initially', () => {
    render()
    const form = wrapper.get('form.search-bar')
    expect(form.attributes('novalidate')).toBeDefined()
    expect(form.get('label').attributes('for')).toBe(form.get('input').attributes('id'))
    expect(form.get('button[type="submit"]').text()).toBe('Buscar')
    expect(form.get('.secondary-button').attributes('disabled')).toBeDefined()
  })

  it('rejects searches over 150 characters without changing the results', async () => {
    render()
    await wrapper.get('input[type="search"]').setValue('a'.repeat(151))
    await wrapper.get('form.search-bar').trigger('submit')
    expect(wrapper.get('input[type="search"]').attributes('aria-invalid')).toBe('true')
    expect(wrapper.get('[role="alert"]').text()).toContain('150')
    expect(ids()).toEqual([10, 2, 1])
    await wrapper.get('.secondary-button').trigger('click')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.get('.secondary-button').attributes('disabled')).toBeDefined()
  })

  it('enables clear for dropdown changes and draft text', async () => {
    render()
    await select('Dirección', 'asc')
    expect(wrapper.get('.secondary-button').attributes('disabled')).toBeUndefined()
    await wrapper.get('.secondary-button').trigger('click')
    await wrapper.get('input[type="search"]').setValue('Unsubmitted')
    expect(wrapper.get('.secondary-button').attributes('disabled')).toBeUndefined()
    await wrapper.get('.secondary-button').trigger('click')
    expect(wrapper.get('input[type="search"]').element).toHaveProperty('value', '')
    expect(ids()).toEqual([10, 2, 1])
  })

  it('combines type, technology and format filters', async () => {
    render()
    await select('Tipo de promoción', 'percentage')
    expect(ids()).toEqual([2, 1])
    await select('Tecnología', 'STANDARD')
    await select('Formato', '2D')
    expect(ids()).toEqual([2])
    await select('Formato', '3D')
    expect(ids()).toEqual([])
    expect(wrapper.text()).toContain('No hay datos')
  })

  it('filters specifically for unrestricted technology and format', async () => {
    render()
    await select('Tecnología', 'any')
    await select('Formato', 'any')
    expect(ids()).toEqual([1])
  })

  it('filters fixed amount promotions', async () => {
    render()
    await select('Tipo de promoción', 'fixed')
    expect(ids()).toEqual([10])
  })

  const ascending = [
    { column: 'promotionId', ids: [1, 2, 10] },
    { column: 'promotionTitle', ids: [2, 10, 1] },
    { column: 'promotionType', ids: [10, 1, 2] },
    { column: 'technology', ids: [1, 2, 10] },
    { column: 'projectionFormat', ids: [2, 10, 1] },
    { column: 'beginDate', ids: [2, 10, 1] },
    { column: 'endDate', ids: [1, 10, 2] },
  ]
  it.each(ascending)('sorts $column ascending', async ({ column, ids: expected }) => {
    render()
    await select('Ordenar por', column)
    await select('Dirección', 'asc')
    expect(ids()).toEqual(expected)
  })
  it.each(ascending)('sorts $column descending', async ({ column, ids: expected }) => {
    render()
    await select('Ordenar por', column)
    await select('Dirección', 'desc')
    expect(ids()).toEqual([...expected].reverse())
  })

  it('resets search, filters and ordering', async () => {
    render()
    await wrapper.get('input[type="search"]').setValue('Bosque')
    await wrapper.get('form.search-bar').trigger('submit')
    await select('Tipo de promoción', 'fixed')
    await select('Ordenar por', 'promotionTitle')
    await select('Dirección', 'asc')
    await wrapper.get('.secondary-button').trigger('click')
    expect(ids()).toEqual([10, 2, 1])
    expect(wrapper.get('input[type="search"]').element).toHaveProperty('value', '')
  })

  it('emits the numeric promotion ID when its view button is clicked', async () => {
    render()
    await wrapper.get('[aria-label="Ver promoción 2"]').trigger('click')
    expect(wrapper.emitted('view')).toEqual([[2]])
  })

  it('does not mutate the input list while sorting', async () => {
    const original = JSON.stringify(items)
    render()
    await select('Ordenar por', 'promotionTitle')
    await select('Dirección', 'asc')
    expect(JSON.stringify(items)).toBe(original)
  })

  it('shows an empty table for an empty catalog', () => {
    render({ promotions: [] })
    expect(wrapper.text()).toContain('0 de 0 promociones.')
    expect(wrapper.text()).toContain('No hay datos')
  })

  it('shows loading feedback instead of an empty result and disables filters', () => {
    render({ loading: true })
    expect(wrapper.text()).toContain('Cargando promociones...')
    expect(wrapper.find('table').exists()).toBe(false)
    expect(wrapper.get('input[type="search"]').attributes('disabled')).toBeDefined()
    expect(wrapper.findAll('select').every((input) => input.attributes('disabled') !== undefined)).toBe(true)
  })

  it('shows a fetch error and emits retry', async () => {
    render({ error: 'Error al cargar' })
    expect(wrapper.get('[role="alert"]').text()).toBe('Error al cargar')
    expect(wrapper.find('table').exists()).toBe(false)
    const retry = wrapper.findAll('button').find((button) => button.text() === 'Reintentar')!
    await retry.trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)
  })
  it('emits the numeric promotion ID when edit is clicked', async () => {
    render()
    await wrapper.get('[aria-label="Editar promoción 2"]').trigger('click')
    expect(wrapper.emitted('edit')).toEqual([[2]])
    expect(wrapper.emitted('view')).toBeUndefined()
  })

})
