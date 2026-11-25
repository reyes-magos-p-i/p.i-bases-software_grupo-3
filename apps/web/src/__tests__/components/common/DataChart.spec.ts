import { afterEach, describe, expect, it, vi } from 'vitest'
import { DOMWrapper, enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import DataChart from '@/components/common/DataChart.vue'
import FloatingPopover from '@/components/common/FloatingPopover.vue'

const points = [
  { key: 'a', label: 'Acción', value: 10 },
  { key: 'b', label: 'Drama', value: 30 },
]
afterEach(() => vi.unstubAllGlobals())
enableAutoUnmount(afterEach)
const body = new DOMWrapper(document.body)
describe('DataChart', () => {
  it('retains paid zero-value points without invalid coordinates after sharing the plot geometry', () => {
    const view = mount(DataChart, {
      props: { title: 'Ingresos', type: 'line', points: [{ key: 'zero', label: 'Hoy', value: 0 }] },
    })
    expect(view.get('polyline').attributes('points')).toBe('65,260')
    expect(view.get('.series-point').attributes('cy')).toBe('260')
    expect(view.get('.series-point').attributes('aria-label')).toBe('Hoy: 0')
    view.unmount()
  })
  it('renders ordered bars with values without a report data section', () => {
    const view = mount(DataChart, { props: { title: 'Géneros', type: 'bar', points } })
    expect(view.get('ol').attributes('aria-label')).toBe('Géneros')
    expect(view.findAll('.bar-fill')[0]?.attributes('style')).toContain('33.333')
    expect(view.find('details').exists()).toBe(false)
    expect(view.find('table').exists()).toBe(false)
    expect(view.text()).toContain('Acción')
    expect(view.text()).toContain('30')
    view.unmount()
  })
  it('keeps line points in the supplied order and exposes values without color alone', () => {
    const view = mount(DataChart, {
      props: { title: 'Ventas', type: 'line', points, formatValue: (value) => `₡${value}` },
    })
    const positions = view
      .get('polyline')
      .attributes('points')!
      .split(' ')
      .map((point) => point.split(',').map(Number))
    expect(positions[0]![0]!).toBeLessThan(positions[1]![0]!)
    expect(positions[0]![1]!).toBeGreaterThan(positions[1]![1]!)
    expect(view.findAll('.series-point')).toHaveLength(2)
    expect(view.get('.series-point').attributes('aria-label')).toBe('Acción: ₡10')
    expect(view.get('svg title').text()).toBe('Ventas')
    view.unmount()
  })
  it('draws columns and labels for a single age category', () => {
    const view = mount(DataChart, {
      props: { title: 'Edad', type: 'columns', points: [points[0]!] },
    })
    expect(view.findAll('rect')).toHaveLength(1)
    expect(view.get('rect').attributes('aria-label')).toBe('Acción: 10')
    expect(view.get('rect').attributes('height')).toBe('220')
    view.unmount()
  })
  it('computes donut proportions that cover the complete total', () => {
    const view = mount(DataChart, { props: { title: 'Provincias', type: 'donut', points } })
    const slices = view.findAll('circle[tabindex]')
    expect(slices[0]?.attributes('stroke-dasharray')).toBe('25 75')
    expect(slices[1]?.attributes('stroke-dasharray')).toBe('75 25')
    expect(slices[1]?.attributes('stroke-dashoffset')).toBe('-25')
    expect(view.get('.donut-total').text()).toBe('40')
    expect(view.get('.chart-legend').text()).toContain('75,0')
    view.unmount()
  })
  it('handles a zero total without dividing by zero or drawing misleading sectors', () => {
    const view = mount(DataChart, {
      props: { title: 'Provincias', type: 'donut', points: [{ ...points[0]!, value: 0 }] },
    })
    expect(view.find('svg').exists()).toBe(false)
    expect(view.text()).toContain('No hay importes')
    view.unmount()
  })
  it('handles empty data without rendering a chart or stale rows', async () => {
    const view = mount(DataChart, { props: { title: 'Ventas', type: 'line', points } })
    await view.get('.series-point').trigger('click')
    expect(view.getComponent(FloatingPopover).props('open')).toBe(true)
    await view.setProps({ points: [] })
    expect(view.get('[role="status"]').text()).toContain('No hay ventas')
    expect(view.find('svg').exists()).toBe(false)
    expect(view.getComponent(FloatingPopover).props('open')).toBe(false)
    view.unmount()
  })
  it('adapts the graph coordinate system to its container and disconnects on unmount', async () => {
    let resize!: ResizeObserverCallback
    const observe = vi.fn(),
      disconnect = vi.fn()
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          resize = callback
        }
        observe = observe
        disconnect = disconnect
      },
    )
    const view = mount(DataChart, { props: { title: 'Ventas', type: 'line', points } })
    expect(observe).toHaveBeenCalledWith(view.element)
    resize([{ contentRect: { width: 320 } } as ResizeObserverEntry], {} as ResizeObserver)
    await view.vm.$nextTick()
    expect(view.get('svg').attributes('viewBox')).toBe('0 0 320 310')
    view.unmount()
    expect(disconnect).toHaveBeenCalledTimes(1)
  })
  it('shows a floating tooltip on click without adding a block to the chart layout', async () => {
    const view = mount(DataChart, {
      props: { title: 'Ventas', type: 'line', points, formatValue: (value) => `₡${value}` },
    })
    const point = view.get('.series-point')
    expect(view.get('svg').attributes('role')).toBe('group')
    await point.trigger('click')
    await flushPromises()
    expect(body.get('[role="tooltip"]').text()).toContain('Acción₡10')
    expect(view.find('[role="tooltip"]').exists()).toBe(false)
    expect(view.find('.point-detail').exists()).toBe(false)
    expect(point.find('title').exists()).toBe(false)
    expect(point.attributes('aria-pressed')).toBe('true')
    expect(point.attributes('aria-describedby')).toBe(body.get('[role="tooltip"]').attributes('id'))
    await point.trigger('click')
    expect(body.find('[role="tooltip"]').exists()).toBe(false)
    expect(point.find('title').exists()).toBe(true)
    await point.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(body.find('[role="tooltip"]').exists()).toBe(true)
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await flushPromises()
    expect(body.find('[role="tooltip"]').exists()).toBe(false)
    await point.trigger('keydown', { key: ' ' })
    await flushPromises()
    expect(body.find('[role="tooltip"]').exists()).toBe(true)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()
    expect(body.find('[role="tooltip"]').exists()).toBe(false)
    view.unmount()
  })
  it.each([
    ['bar', '.bar-button'],
    ['columns', 'rect'],
    ['donut', 'circle[role="button"]'],
  ] as const)('opens the same accessible tooltip for %s values', async (type, selector) => {
    const view = mount(DataChart, { props: { title: 'Ventas', type, points } })
    const target = view.get(selector)
    await target.trigger('keydown', { key: 'Tab' })
    expect(body.find('[role="tooltip"]').exists()).toBe(false)
    await target.trigger('click')
    await flushPromises()
    expect(body.get('[role="tooltip"]').text()).toBe('Acción10')
    await view.setProps({ type: 'line' })
    expect(body.find('[role="tooltip"]').exists()).toBe(false)
  })
  it('keeps every category label readable, wrapping words and widening only the column viewport', () => {
    const categories = [
      'Menores de 18',
      '18–24',
      '25–34',
      '35–44',
      '45–54',
      '55–64',
      '65 o más',
      'Sin información',
    ]
    const view = mount(DataChart, {
      props: {
        title: 'Rangos de edad',
        type: 'columns',
        xLabel: 'Edad (años)',
        points: categories.map((label) => ({ key: label, label, value: 10 })),
      },
    })
    const labels = view.findAll('.category-label')
    expect(labels).toHaveLength(categories.length)
    expect(
      labels.map((label) =>
        label
          .findAll('tspan')
          .map((line) => line.text())
          .join(' '),
      ),
    ).toEqual(categories)
    const chartWidth = Number(view.get('svg').attributes('viewBox')!.split(' ')[2])
    expect(chartWidth).toBeGreaterThan(740)
    expect(view.get('svg').attributes('style')).toContain(`width: ${chartWidth}px`)
    expect(view.get('.column-axis-label').text()).toBe('Edad (años)')
  })
  it('labels both axes and adapts the plot space for them', async () => {
    const view = mount(DataChart, {
      props: {
        title: 'Ventas',
        type: 'line',
        points,
        xLabel: 'Fecha de compra',
        yLabel: 'Ingresos (₡)',
      },
    })
    expect(view.get('svg').attributes('viewBox')).toBe('0 0 740 350')
    expect(view.findAll('.axis-label').map((label) => label.text())).toEqual([
      'Fecha de compra',
      'Ingresos (₡)',
    ])
    await view.setProps({ type: 'bar', xLabel: 'Ingresos (₡)', yLabel: 'Películas' })
    expect(view.get('.bar-axis-labels').text()).toContain('PelículasIngresos (₡)')
    view.unmount()
  })
})
