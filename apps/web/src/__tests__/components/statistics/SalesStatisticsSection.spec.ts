import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import SalesStatisticsSection from '@/components/statistics/SalesStatisticsSection.vue'
import SalesPeriodFilter from '@/components/statistics/SalesPeriodFilter.vue'
import DataChart from '@/components/common/DataChart.vue'
import NotificationPopup from '@/components/common/NotificationPopup.vue'
import { getSalesStatistics } from '@/services/sales-statistics.service'
import { invalidateEmployeeSession } from '@/services/employee-session.service'
import { salesGroup, salesStatistics } from '../../helpers/sales-statistics'
import type { SalesStatistics } from '@/types/sales-statistics'

vi.mock('@/services/sales-statistics.service', () => ({ getSalesStatistics: vi.fn() }))
vi.mock('@/services/employee-session.service', () => ({ invalidateEmployeeSession: vi.fn() }))
let view: VueWrapper
let router: ReturnType<typeof createRouter>
const deferred = () => {
  let resolve!: (value: SalesStatistics) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<SalesStatistics>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
async function render() {
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { render: () => null } },
      { path: '/dashboard', component: { render: () => null } },
    ],
  })
  await router.push('/dashboard')
  view = mount(SalesStatisticsSection, { global: { plugins: [router] } })
  return view
}
beforeEach(() => {
  vi.mocked(invalidateEmployeeSession).mockClear()
  vi.mocked(getSalesStatistics).mockReset().mockResolvedValue(salesStatistics())
})
afterEach(() => view?.unmount())

describe('SalesStatisticsSection', () => {
  it('shows the reusable loading indicator immediately and then the real totals and province donut', async () => {
    const pending = deferred()
    vi.mocked(getSalesStatistics).mockReturnValueOnce(pending.promise)
    await render()
    expect(view.get('.loading-state').text()).toContain('Cargando estadísticas')
    expect(view.find('.stat-cards').exists()).toBe(false)
    pending.resolve(salesStatistics())
    await flushPromises()
    expect(view.findAll('.stat-card')).toHaveLength(4)
    expect(view.get('.report-button').attributes('disabled')).toBeDefined()
    expect(view.findAllComponents(DataChart).map((chart) => chart.props('type'))).toEqual([
      'line',
      'donut',
      'bar',
      'bar',
    ])
    expect(view.get('.statistics-heading').text()).not.toContain('EL NEGOCIO EN CIFRAS')
    expect(view.get('.statistics-heading').text()).not.toContain('Consulta la evolución')
    expect(view.get('h1').text()).toBe('Estadísticas de ventas')
    expect(view.get('.filters-card .period-range').text()).toContain('—')
    const children = Array.from(view.element.children)
    expect(children.indexOf(view.get('.chart-toolbar').element)).toBeGreaterThan(
      children.indexOf(view.get('.stat-cards').element),
    )
    expect(view.find('.chart-toolbar #sales-metric').exists()).toBe(true)
    expect(view.find('.statistics-footnote').exists()).toBe(false)
    expect(view.text()).not.toContain('colones costarricenses')
    await view.get('button[aria-label="Información de las estadísticas"]').trigger('click')
    await flushPromises()
    expect(new DOMWrapper(document.body).get('[role="dialog"]').text()).toContain(
      'clientes e invitados',
    )
  })
  it('switches all metrics consistently and capitalizes catalog labels', async () => {
    await render()
    await flushPromises()
    await view.get('#sales-metric').setValue('tickets')
    expect(view.findAllComponents(DataChart)[0]!.props('points')[0]!.value).toBe(2)
    await view.get('#sales-ranking').setValue('genres')
    const chart = view.findAllComponents(DataChart)[2]!
    expect(chart.props('points')[0]!.label).toBe('Acción')
    expect(view.text()).not.toContain('cada categoría correspondiente')
    await view.get('button[aria-label="Información sobre las categorías"]').trigger('click')
    await flushPromises()
    expect(new DOMWrapper(document.body).get('[role="dialog"]').text()).toContain(
      'cada categoría correspondiente',
    )
    await view.get('#sales-ranking').setValue('languages')
    expect(chart.props('points')[0]!.label).toBe('Español')
    await view.get('#sales-ranking').setValue('branches')
    expect(chart.props('points')[0]!.label).toBe('Sucursal Centro')
    await view.get('#sales-metric').setValue('purchases')
    expect(chart.props('points')[0]!.value).toBe(2)
    await view.get('#sales-audience').setValue('genders')
    expect(view.findAllComponents(DataChart)[3]!.props('type')).toBe('donut')
    expect(view.find('.age-filter').exists()).toBe(false)
  })
  it('ranks by the selected metric, uses stable ties and limits rankings to ten', async () => {
    const data = salesStatistics()
    data.rankings.movies = Array.from({ length: 12 }, (_, i) =>
      salesGroup(`Movie ${i}`, i === 11 ? 20000 : 1000, 1, 1),
    )
    data.rankings.provinces = [salesGroup('Heredia'), salesGroup('Alajuela')]
    vi.mocked(getSalesStatistics).mockResolvedValueOnce(data)
    await render()
    await flushPromises()
    const charts = view.findAllComponents(DataChart)
    expect(charts[2]!.props('points')).toHaveLength(10)
    expect(charts[2]!.props('points')[0]!.label).toBe('Movie 11')
    expect(charts[1]!.props('points')[0]!.label).toBe('Alajuela')
  })
  it('keeps a no-sales period empty and can load another period', async () => {
    const empty = salesStatistics()
    empty.summary = { revenue: 0, purchases: 0, tickets: 0, averagePurchase: 0 }
    empty.series = []
    vi.mocked(getSalesStatistics).mockResolvedValueOnce(empty)
    await render()
    await flushPromises()
    expect(view.text()).toContain('No hubo ventas en este periodo')
    expect(view.findComponent(DataChart).exists()).toBe(false)
    view
      .getComponent(SalesPeriodFilter)
      .vm.$emit('apply', { dateFrom: '2026-10-01', dateTo: '2026-10-31' })
    await flushPromises()
    expect(view.findComponent(DataChart).exists()).toBe(true)
    expect(view.text()).toContain('01/10/2026 — 31/10/2026')
    expect(
      view
        .findAll('.chart-card h3')
        .every((title) => title.text().includes('del 01/10/2026 al 31/10/2026')),
    ).toBe(true)
  })
  it.each(['ages', 'ageRanges'] as const)(
    'shows at most ten horizontal %s bars ranked by the selected metric',
    async (dimension) => {
      const source = salesStatistics()
      source.rankings[dimension] = Array.from({ length: 12 }, (_, index) =>
        salesGroup(String(index), (index + 1) * 1000, 12 - index, 1),
      )
      vi.mocked(getSalesStatistics).mockResolvedValueOnce(source)
      await render()
      await flushPromises()
      await view.get('#sales-audience').setValue(dimension)
      const chart = view.findAllComponents(DataChart)[3]!
      expect(chart.props('type')).toBe('bar')
      expect(chart.props('points')).toHaveLength(10)
      expect(chart.props('points').map((point) => point.key)).toEqual([
        '11',
        '10',
        '9',
        '8',
        '7',
        '6',
        '5',
        '4',
        '3',
        '2',
      ])
      expect(chart.props('xLabel')).toBe('Ingresos')
      expect(chart.props('yLabel')).toBe(
        dimension === 'ages' ? 'Edad (años)' : 'Rango de edad (años)',
      )
      expect(chart.find('.chart-viewport').exists()).toBe(false)
      expect(chart.findAll('.bar-button')).toHaveLength(10)
      await view.get('#sales-metric').setValue('tickets')
      expect(chart.props('points').map((point) => point.key)).toEqual([
        '0',
        '1',
        '2',
        '3',
        '4',
        '5',
        '6',
        '7',
        '8',
        '9',
      ])
      expect(chart.props('xLabel')).toBe('Boletos vendidos')
      expect(getSalesStatistics).toHaveBeenCalledTimes(1)
    },
  )
  it('applies the age filter before the top ten limit and orders tied ages numerically', async () => {
    const source = salesStatistics()
    source.rankings.ages = Array.from({ length: 12 }, (_, index) =>
      salesGroup(String(index), 12000, 2, 1),
    )
    vi.mocked(getSalesStatistics).mockResolvedValueOnce(source)
    await render()
    await flushPromises()
    await view.get('#sales-audience').setValue('ages')
    const chart = view.findAllComponents(DataChart)[3]!
    expect(chart.props('points').map((point) => point.key)).toEqual([
      '0',
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
    ])
    await view.get('#sales-age-range').setValue('custom')
    await view.get('#sales-age-from').setValue('10')
    await view.get('#sales-age-to').setValue('11')
    await view.get('form.age-filter').trigger('submit')
    expect(chart.props('points').map((point) => point.key)).toEqual(['10', '11'])
    expect(getSalesStatistics).toHaveBeenCalledTimes(1)
    expect(view.findAll('.stat-card')).toHaveLength(4)
  })
  it.each([
    [0, 'No hay categorías con ventas'],
    [1, 'La categoría con más ventas'],
    [7, 'Las 7 categorías con más ventas'],
    [12, 'Las 10 categorías con más ventas'],
  ] as const)('uses the actual ranking count for %s categories', async (amount, caption) => {
    const source = salesStatistics()
    source.rankings.movies = Array.from({ length: amount }, (_, index) =>
      salesGroup(`Movie ${index}`),
    )
    vi.mocked(getSalesStatistics).mockResolvedValueOnce(source)
    await render()
    await flushPromises()
    expect(view.findAll('.chart-card')[2]!.get('header p').text()).toBe(caption)
    expect(view.find('details').exists()).toBe(false)
    expect(view.findAllComponents(DataChart)[0]!.props()).toMatchObject({
      xLabel: 'Fecha de compra',
      yLabel: 'Ingresos',
    })
  })
  it('validates and filters custom ages locally without replacing the other charts', async () => {
    const source = salesStatistics()
    source.rankings.ages = [salesGroup('0'), salesGroup('17')]
    vi.mocked(getSalesStatistics).mockResolvedValueOnce(source)
    await render()
    await flushPromises()
    const salesChart = view.findAllComponents(DataChart)[0]!.element
    await view.get('#sales-age-range').setValue('custom')
    expect(view.find('#sales-age-error').exists()).toBe(false)
    await view.get('#sales-age-from').setValue('0')
    await view.get('form.age-filter').trigger('submit')
    expect(view.get('#sales-age-error').text()).toContain('Completa')
    expect(getSalesStatistics).toHaveBeenCalledTimes(1)
    await view.get('#sales-age-to').setValue('17')
    await view.get('form.age-filter').trigger('submit')
    await flushPromises()
    expect(getSalesStatistics).toHaveBeenCalledTimes(1)
    expect(view.findAllComponents(DataChart)[0]!.element).toBe(salesChart)
    expect(view.find('.loading-state').exists()).toBe(false)
    expect(view.findAllComponents(DataChart)[3]!.props('points')).toEqual([
      { key: '0-17', label: '0–17 años', value: 12000 },
    ])
    expect(view.get('.applied-age-range').text()).toBe('0–17 años')
    expect(view.findAll('.stat-card')[2]!.text()).toContain('2')
  })
  it('supports predefined ages and clears only age restrictions when choosing all ages', async () => {
    await render()
    await flushPromises()
    await view.get('#sales-age-range').setValue('18-24')
    await flushPromises()
    expect(getSalesStatistics).toHaveBeenCalledTimes(1)
    expect(view.findAllComponents(DataChart)[3]!.props('points')).toEqual([])
    await view.get('#sales-audience').setValue('genders')
    expect(view.findAllComponents(DataChart)[3]!.props('points')).toHaveLength(2)
    await view.get('#sales-audience').setValue('ages')
    expect(view.findAllComponents(DataChart)[3]!.props('title')).toContain('Edades del comprador')
    await view.get('#sales-age-range').setValue('all')
    await flushPromises()
    const calls = vi.mocked(getSalesStatistics).mock.calls
    expect(calls[calls.length - 1]![0]).not.toHaveProperty('minAge')
    expect(calls[calls.length - 1]![0]).toHaveProperty('dateFrom')
    expect(getSalesStatistics).toHaveBeenCalledTimes(1)
    expect(view.findAllComponents(DataChart)[3]!.props('points')).toHaveLength(2)
  })
  it('shows an empty age selection without hiding general sales and uses a clear senior label', async () => {
    await render()
    await flushPromises()
    await view.get('#sales-age-range').setValue('65-9999')
    await flushPromises()
    expect(view.get('.applied-age-range').text()).toBe('65 años o más')
    expect(view.findAllComponents(DataChart)[3]!.props('points')).toEqual([])
    expect(view.findAll('.stat-card')).toHaveLength(4)
    expect(view.text()).not.toContain('No hubo ventas en este periodo')
    expect(getSalesStatistics).toHaveBeenCalledTimes(1)
  })
  it('puts demographic and province explanations behind information buttons', async () => {
    await render()
    await flushPromises()
    expect(view.text()).not.toContain('fecha de nacimiento')
    expect(view.text()).not.toContain('provincia registrada actualmente')
    const body = new DOMWrapper(document.body)
    await view.get('button[aria-label="Información sobre los compradores"]').trigger('click')
    await flushPromises()
    expect(body.get('[role="dialog"]').text()).toContain('fecha de nacimiento')
    expect(body.get('[role="dialog"]').text()).toContain('no modifica las demás estadísticas')
    await view.get('button[aria-label="Información sobre las provincias"]').trigger('click')
    await flushPromises()
    expect(
      body
        .findAll('[role="dialog"]')
        .some((panel) => panel.text().includes('provincia registrada actualmente')),
    ).toBe(true)
  })
  it('reports a load failure at the bottom right, hides stale charts and permits retrying', async () => {
    await render()
    await flushPromises()
    vi.mocked(getSalesStatistics).mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 503, data: {} },
    })
    view
      .getComponent(SalesPeriodFilter)
      .vm.$emit('apply', { dateFrom: '2026-10-01', dateTo: '2026-10-31' })
    await flushPromises()
    expect(view.findComponent(DataChart).exists()).toBe(false)
    const popup = view.getComponent(NotificationPopup)
    expect(popup.props('placement')).toBe('bottom-right')
    expect(popup.props('message')).toContain('Error 503')
    expect(view.findAll('[role="alert"]')).toHaveLength(1)
    expect(view.get('.statistics-state').text()).not.toContain('Error 503')
    popup.vm.$emit('close')
    await flushPromises()
    expect(view.findComponent(NotificationPopup).exists()).toBe(false)
    await view.get('.statistics-state button').trigger('click')
    await flushPromises()
    expect(view.findComponent(DataChart).exists()).toBe(true)
  })
  it('returns expired sessions to the employee login', async () => {
    vi.mocked(getSalesStatistics).mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 401 },
    })
    await render()
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/?login=employee&reason=expired')
    expect(invalidateEmployeeSession).toHaveBeenCalledTimes(1)
    expect(view.findComponent(DataChart).exists()).toBe(false)
  })
  it.each(['resolve', 'reject'] as const)(
    'ignores a late %s from an old period',
    async (outcome) => {
      const first = deferred(),
        second = deferred()
      vi.mocked(getSalesStatistics)
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise)
      await render()
      const oldSignal = vi.mocked(getSalesStatistics).mock.calls[0]![1]!
      view
        .getComponent(SalesPeriodFilter)
        .vm.$emit('apply', { dateFrom: '2026-10-01', dateTo: '2026-10-31' })
      await flushPromises()
      expect(oldSignal.aborted).toBe(true)
      const newest = salesStatistics()
      newest.summary.purchases = 5
      second.resolve(newest)
      await flushPromises()
      if (outcome === 'resolve') first.resolve(salesStatistics())
      else first.reject(new Error('Old period failed'))
      await flushPromises()
      expect(view.findAll('.stat-card')[2]!.text()).toContain('5')
      expect(view.findComponent(NotificationPopup).exists()).toBe(false)
      expect(view.text()).toContain('01/10/2026 — 31/10/2026')
    },
  )
  it('aborts the active request on unmount and ignores its failure', async () => {
    const pending = deferred()
    vi.mocked(getSalesStatistics).mockReturnValueOnce(pending.promise)
    await render()
    const signal = vi.mocked(getSalesStatistics).mock.calls[0]![1]!
    view.unmount()
    pending.reject(new Error('Aborted'))
    await flushPromises()
    expect(signal.aborted).toBe(true)
  })
})
