<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId, useTemplateRef, watch } from 'vue'
import FloatingPopover from './FloatingPopover.vue'
import {
  cartesianLayout,
  chartLabelIndexes,
  chartMaximum,
  chartRatio,
  donutSegments,
} from '@/utils/chart-geometry'

const props = withDefaults(
  defineProps<{
    title: string
    type: 'line' | 'bar' | 'columns' | 'donut'
    points: readonly { key: string; label: string; value: number }[]
    formatValue?: (value: number) => string
    xLabel?: string
    yLabel?: string
  }>(),
  {
    formatValue: (value: number) =>
      new Intl.NumberFormat('es-CR', { maximumFractionDigits: 2 }).format(value),
    xLabel: '',
    yLabel: '',
  },
)
const id = useId()
const chart = useTemplateRef<HTMLElement>('chart')
const width = ref(740)
const selectedKey = ref<string | null>(null)
const selectedAnchor = ref<Element | null>(null)
const selectedPoint = computed(() => props.points.find((point) => point.key === selectedKey.value))
const plotHeight = computed(() =>
  props.type === 'columns' ? 320 : props.xLabel || props.yLabel ? 350 : 310,
)
function selectPoint(key: string, anchor: EventTarget | null) {
  if (!(anchor instanceof Element)) return
  selectedKey.value = selectedKey.value === key ? null : key
  selectedAnchor.value = selectedKey.value ? anchor : null
}
function interaction(point: { key: string; label: string; value: number }) {
  return {
    role: 'button',
    tabindex: 0,
    'aria-label': `${point.label}: ${props.formatValue(point.value)}`,
    'aria-pressed': selectedKey.value === point.key,
    'aria-describedby': selectedKey.value === point.key ? `${id}-detail` : undefined,
    onClick: (event: MouseEvent) => selectPoint(point.key, event.currentTarget),
    onKeydown: (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      selectPoint(point.key, event.currentTarget)
    },
  }
}
watch([() => props.points, () => props.type], () => {
  selectedKey.value = null
  selectedAnchor.value = null
})
const plotLeft = computed(() => (props.yLabel ? 85 : 65))
const columnLabels = computed(() =>
  props.points.map((point) => {
    const lines: string[] = []
    for (const word of point.label.split(' ')) {
      const last = lines.length - 1
      if (last >= 0 && lines[last]!.length + word.length < 11) lines[last] += ` ${word}`
      else lines.push(word)
    }
    return lines
  }),
)
const columnSlot = computed(() =>
  Math.max(76, ...columnLabels.value.flat().map((line) => line.length * 7 + 16)),
)
const canvasWidth = computed(() =>
  props.type === 'columns'
    ? Math.max(width.value, plotLeft.value + 15 + props.points.length * columnSlot.value)
    : width.value,
)
const plotWidth = computed(() => canvasWidth.value - plotLeft.value - 15)
const compact = new Intl.NumberFormat('es-CR', { notation: 'compact', maximumFractionDigits: 1 })
const percentage = new Intl.NumberFormat('es-CR', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})
let observer: ResizeObserver | undefined
onMounted(() => {
  if (typeof ResizeObserver === 'undefined') return
  observer = new ResizeObserver((entries) => {
    const entry = entries[0]
    if (entry) width.value = Math.max(220, Math.round(entry.contentRect.width))
  })
  observer.observe(chart.value!)
})
onBeforeUnmount(() => observer?.disconnect())
const maximum = computed(() => chartMaximum(props.points.map((point) => point.value)))
const total = computed(() => props.points.reduce((sum, point) => sum + point.value, 0))
const layout = computed(() =>
  cartesianLayout(
    props.points.map((point) => point.value),
    {
      left: plotLeft.value,
      width: plotWidth.value,
      top: 40,
      bottom: 260,
    },
  ),
)
const x = (index: number) => layout.value.x(index)
const y = (value: number) => layout.value.y(value)
const coordinates = computed(() => layout.value.coordinates)
const area = computed(
  () => `${plotLeft.value},260 ${coordinates.value} ${x(props.points.length - 1)},260`,
)
const ticks = computed(() => layout.value.ticks)
const labelIndexes = computed(() => {
  if (props.type === 'columns') return props.points.map((_, index) => index)
  return chartLabelIndexes(props.points.length, width.value)
})
const segments = computed(() =>
  donutSegments(props.points).map((point, index) => ({
    ...point,
    color: `var(--chart-color-${(index % 8) + 1})`,
  })),
)
const columnWidth = computed(() =>
  Math.min(48, (plotWidth.value * 0.75) / Math.max(1, props.points.length)),
)
const columnX = (index: number) =>
  plotLeft.value + ((index + 0.5) * plotWidth.value) / props.points.length
</script>

<template>
  <div ref="chart" class="data-chart">
    <p v-if="!points.length" class="empty-chart" role="status">
      No hay ventas para esta selección.
    </p>
    <template v-else-if="type === 'bar'">
      <div v-if="xLabel || yLabel" class="bar-axis-labels">
        <span>{{ yLabel }}</span
        ><span>{{ xLabel }}</span>
      </div>
      <ol class="bar-chart" :aria-label="title">
        <li v-for="(point, index) in points" :key="point.key">
          <button type="button" class="bar-button" v-bind="interaction(point)">
            <div class="bar-label">
              <span>{{ point.label }}</span
              ><strong>{{ formatValue(point.value) }}</strong>
            </div>
            <div class="bar-track" aria-hidden="true">
              <div
                class="bar-fill"
                :style="{
                  width: `${chartRatio(point.value, maximum) * 100}%`,
                  background: `var(--chart-color-${(index % 2) + 1})`,
                }"
              />
            </div>
          </button>
        </li>
      </ol>
    </template>
    <div v-else-if="type === 'donut'" class="donut-layout">
      <template v-if="total > 0">
        <svg viewBox="0 0 240 240" role="group" :aria-labelledby="id + '-title'">
          <title :id="id + '-title'">{{ title }}</title>
          <circle cx="120" cy="120" r="85" class="donut-track" />
          <circle
            v-for="segment in segments"
            :key="segment.key"
            cx="120"
            cy="120"
            r="85"
            pathLength="100"
            fill="none"
            stroke-width="28"
            :stroke="segment.color"
            :stroke-dasharray="`${segment.size} ${100 - segment.size}`"
            :stroke-dashoffset="-segment.offset"
            transform="rotate(-90 120 120)"
            v-bind="interaction(segment)"
          >
            <title v-if="selectedKey !== segment.key">
              {{ segment.label }}: {{ formatValue(segment.value) }} ({{
                percentage.format(segment.size / 100)
              }})
            </title>
          </circle>
          <text
            x="120"
            y="115"
            text-anchor="middle"
            class="donut-total"
            :style="{ fontSize: `${Math.min(23, 200 / Math.max(1, formatValue(total).length))}px` }"
          >
            {{ formatValue(total) }}
          </text>
          <text x="120" y="138" text-anchor="middle" class="donut-caption">Total</text>
        </svg>
        <ul class="chart-legend">
          <li v-for="segment in segments" :key="segment.key">
            <span
              class="legend-dot"
              :style="{ background: segment.color }"
              aria-hidden="true"
            /><span>{{ segment.label }}</span
            ><strong>{{ formatValue(segment.value) }}</strong
            ><span class="legend-percentage">{{ percentage.format(segment.size / 100) }}</span>
          </li>
        </ul>
      </template>
      <p v-else class="empty-chart">No hay importes para representar en esta selección.</p>
    </div>
    <div v-else class="cartesian-chart">
      <div class="chart-viewport">
        <svg
          class="plot"
          :viewBox="`0 0 ${canvasWidth} ${plotHeight}`"
          :style="type === 'columns' ? { width: `${canvasWidth}px` } : undefined"
          role="group"
          :aria-labelledby="id + '-title'"
        >
          <title :id="id + '-title'">{{ title }}</title>
          <defs>
            <linearGradient :id="id + '-area'" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="var(--chart-color-1)" stop-opacity="0.25" />
              <stop offset="100%" stop-color="var(--chart-color-1)" stop-opacity="0" />
            </linearGradient>
          </defs>
          <g v-for="tick in ticks" :key="tick" aria-hidden="true">
            <line
              :x1="plotLeft"
              :x2="canvasWidth - 15"
              :y1="y(tick)"
              :y2="y(tick)"
              class="grid-line"
            />
            <text :x="plotLeft - 10" :y="y(tick) + 4" text-anchor="end">
              {{ compact.format(tick) }}
            </text>
          </g>
          <template v-if="type === 'line'">
            <polygon :points="area" :fill="`url(#${id}-area)`" />
            <polyline :points="coordinates" class="series-line" />
            <circle
              v-for="(point, index) in points"
              :key="point.key"
              :cx="x(index)"
              :cy="y(point.value)"
              :r="selectedKey === point.key ? 6 : 4"
              class="series-point"
              v-bind="interaction(point)"
            >
              <title v-if="selectedKey !== point.key">
                {{ point.label }}: {{ formatValue(point.value) }}
              </title>
            </circle>
          </template>
          <template v-else>
            <rect
              v-for="(point, index) in points"
              :key="point.key"
              :x="columnX(index) - columnWidth / 2"
              :y="y(point.value)"
              :width="columnWidth"
              :height="260 - y(point.value)"
              rx="4"
              :fill="`var(--chart-color-${(index % 2) + 1})`"
              v-bind="interaction(point)"
            >
              <title v-if="selectedKey !== point.key">
                {{ point.label }}: {{ formatValue(point.value) }}
              </title>
            </rect>
          </template>
          <text
            v-for="index in labelIndexes"
            :key="index"
            class="category-label"
            :x="type === 'line' ? x(index) : columnX(index)"
            y="290"
            :text-anchor="type === 'line' && index === points.length - 1 ? 'end' : 'middle'"
            aria-hidden="true"
          >
            <template v-if="type === 'line'">{{ points[index]?.label }}</template>
            <template v-else>
              <tspan
                v-for="(line, lineIndex) in columnLabels[index]"
                :key="lineIndex"
                :x="columnX(index)"
                :dy="lineIndex ? 16 : 0"
              >
                {{ line }}
              </tspan>
            </template>
          </text>
          <text
            v-if="xLabel && type === 'line'"
            class="axis-label"
            :x="plotLeft + plotWidth / 2"
            y="332"
            text-anchor="middle"
          >
            {{ xLabel }}
          </text>
          <text
            v-if="yLabel"
            class="axis-label"
            x="14"
            y="150"
            text-anchor="middle"
            transform="rotate(-90 14 150)"
          >
            {{ yLabel }}
          </text>
        </svg>
      </div>
      <p v-if="xLabel && type === 'columns'" class="column-axis-label">{{ xLabel }}</p>
    </div>
    <FloatingPopover
      :id="id + '-detail'"
      :open="!!selectedPoint"
      :anchor="selectedAnchor"
      :label="title"
      surface="dark"
      @close="selectedKey = null"
    >
      <div v-if="selectedPoint" class="chart-tooltip">
        <span>{{ selectedPoint.label }}</span
        ><strong>{{ formatValue(selectedPoint.value) }}</strong>
      </div>
    </FloatingPopover>
  </div>
</template>

<style scoped>
.data-chart {
  min-width: 0;
}
.plot {
  display: block;
  width: 100%;
}
.chart-viewport {
  max-width: 100%;
  overflow-x: auto;
}
.column-axis-label {
  margin: 8px 0 0;
  text-align: center;
  color: var(--text-on-dark-secondary);
  font-size: 0.8125rem;
  font-weight: 700;
}
.plot [role='button'] {
  cursor: pointer;
}
.bar-button {
  display: block;
  width: 100%;
  padding: 0;
  border: 0;
  color: inherit;
  background: transparent;
  text-align: left;
  cursor: pointer;
}
.plot text {
  fill: var(--text-on-dark-secondary);
  font-size: 12px;
}
.grid-line {
  stroke: var(--chart-grid-color);
  stroke-dasharray: 3 5;
}
.series-line {
  fill: none;
  stroke: var(--chart-color-1);
  stroke-width: 3;
  stroke-linejoin: round;
}
.series-point {
  fill: var(--surface-background);
  stroke: var(--chart-color-1);
  stroke-width: 2;
  cursor: pointer;
}
.series-point[aria-pressed='true'] {
  fill: var(--chart-color-1);
}
.axis-label {
  font-weight: 700;
}
.bar-axis-labels {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  color: var(--text-on-dark-secondary);
  font-size: 0.8125rem;
  margin-bottom: 16px;
}
.bar-axis-labels span:last-child {
  text-align: right;
}
.bar-chart,
.chart-legend {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 16px;
}
.bar-label {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 16px;
  margin-bottom: 8px;
  font-size: 0.875rem;
}
.bar-label span {
  overflow-wrap: anywhere;
}
.bar-label strong {
  white-space: nowrap;
}
.bar-track {
  height: 10px;
  overflow: hidden;
  border-radius: 20px;
  background: var(--chart-grid-color);
}
.bar-fill {
  height: 100%;
  border-radius: inherit;
}
.donut-layout {
  display: grid;
  justify-items: center;
  gap: 16px;
}
.donut-layout svg {
  display: block;
  width: min(100%, 260px);
}
.donut-track {
  fill: none;
  stroke: var(--chart-grid-color);
  stroke-width: 28;
}
.donut-total {
  fill: var(--text-on-dark);
  font-size: 23px;
  font-weight: 700;
}
.donut-caption {
  fill: var(--text-on-dark-secondary);
  font-size: 13px;
}
.chart-legend {
  width: 100%;
  gap: 10px;
  font-size: 0.875rem;
}
.chart-legend li {
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr) auto auto;
  gap: 8px;
  align-items: center;
}
.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.legend-percentage {
  color: var(--text-on-dark-secondary);
  min-width: 48px;
  text-align: right;
}
.empty-chart {
  text-align: center;
  padding: 48px 16px;
  color: var(--text-on-dark-secondary);
}
.chart-tooltip {
  display: grid;
  gap: 4px;
}
.chart-tooltip span {
  color: var(--text-on-dark-secondary);
}
@media (max-width: 480px) {
  .plot text {
    font-size: 14px;
  }
  .legend-percentage {
    min-width: 40px;
  }
}
</style>
