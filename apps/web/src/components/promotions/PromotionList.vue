<script setup lang="ts">
import { computed, ref } from 'vue'
import CrudTable from '../crudTable/CrudTable.vue'
import LimitedTextInput from '@/components/common/LimitedTextInput.vue'
import SimpleDropdown from '@/components/common/SimpleDropdown.vue'
import type { PromotionListItem } from '@/types/promotion-read'
import type { ProjectionFormat, PromotionType, Technology } from '@/types/promotion'

defineOptions({ name: 'PromotionList' })
const props = withDefaults(defineProps<{
  promotions: PromotionListItem[]
  loading?: boolean
  error?: string
}>(), { loading: false, error: '' })
const emit = defineEmits<{ view: [id: number]; retry: [] }>()

type SortColumn = keyof PromotionListItem
type Direction = 'asc' | 'desc'
const title = ref('')
const type = ref<PromotionType | null>(null)
const technology = ref<Technology | 'any' | null>(null)
const format = ref<ProjectionFormat | 'any' | null>(null)
const sortBy = ref<SortColumn | null>('promotionId')
const direction = ref<Direction | null>('desc')
const columns: { key: SortColumn; label: string }[] = [
  { key: 'promotionId', label: 'ID' },
  { key: 'promotionTitle', label: 'Nombre' },
  { key: 'promotionType', label: 'Tipo de promoción' },
  { key: 'technology', label: 'Tecnología' },
  { key: 'projectionFormat', label: 'Formato' },
  { key: 'beginDate', label: 'Fecha inicial' },
  { key: 'endDate', label: 'Fecha final' },
]
const typeOptions: { id: PromotionType; name: string }[] = [
  { id: 'percentage', name: 'Porcentaje' }, { id: 'fixed', name: 'Monto fijo' },
]
const technologyOptions: { id: Technology | 'any'; name: string }[] = [
  { id: 'STANDARD', name: 'Estándar' }, { id: 'IMAX', name: 'IMAX' },
  { id: '70MM', name: '70mm' }, { id: 'any', name: 'Sin restricción' },
]
const formatOptions: { id: ProjectionFormat | 'any'; name: string }[] = [
  { id: '2D', name: '2D' }, { id: '3D', name: '3D' }, { id: 'any', name: 'Sin restricción' },
]
const sortOptions = columns.map(({ key, label }) => ({ id: key, name: label }))
const directionOptions: { id: Direction; name: string }[] = [
  { id: 'asc', name: 'Ascendente' }, { id: 'desc', name: 'Descendente' },
]
const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true })
const typeName = (value: unknown) => value === 'percentage' ? 'Porcentaje' : 'Monto fijo'
const technologyName = (value: unknown) => value === 'STANDARD' ? 'Estándar' : value === '70MM' ? '70mm' : String(value ?? 'Cualquiera')
const dateLabel = (value: unknown) => String(value).split('-').reverse().join('/')
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim()
function sortValue(item: PromotionListItem, key: SortColumn): string | number {
  if (key === 'promotionType') return typeName(item[key])
  if (key === 'technology') return technologyName(item[key])
  return item[key] ?? 'Cualquiera'
}
const rows = computed(() => {
  const query = normalize(title.value)
  const result = props.promotions.filter((item) =>
    (!query || normalize(item.promotionTitle).includes(query))
    && (type.value === null || item.promotionType === type.value)
    && (technology.value === null || item.technology === (technology.value === 'any' ? null : technology.value))
    && (format.value === null || item.projectionFormat === (format.value === 'any' ? null : format.value)),
  )
  const key = sortBy.value ?? 'promotionId'
  const multiplier = (direction.value ?? 'desc') === 'asc' ? 1 : -1
  result.sort((a, b) => {
    const left = sortValue(a, key)
    const right = sortValue(b, key)
    const comparison = typeof left === 'number' && typeof right === 'number'
      ? left - right : collator.compare(String(left), String(right))
    return multiplier * (comparison || a.promotionId - b.promotionId)
  })
  return result.map((item) => ({ ...item, id: item.promotionId }))
})
function reset() {
  title.value = ''
  type.value = null
  technology.value = null
  format.value = null
  sortBy.value = 'promotionId'
  direction.value = 'desc'
}
</script>

<template>
  <section class="promotion-list" aria-label="Lista de promociones" :aria-busy="loading">
    <form class="promotion-filters" @submit.prevent>
      <LimitedTextInput v-model="title" label="Buscar por nombre" :limit="150"
        placeholder="Escribe el nombre de la promoción..." :disabled="loading" />
      <SimpleDropdown v-model="type" label="Tipo de promoción" :options="typeOptions"
        placeholder="Todos los tipos" :disabled="loading" />
      <SimpleDropdown v-model="technology" label="Tecnología" :options="technologyOptions"
        placeholder="Todas las tecnologías" :disabled="loading" />
      <SimpleDropdown v-model="format" label="Formato" :options="formatOptions"
        placeholder="Todos los formatos" :disabled="loading" />
      <SimpleDropdown v-model="sortBy" label="Ordenar por" :options="sortOptions"
        placeholder="ID" :disabled="loading" />
      <SimpleDropdown v-model="direction" label="Dirección" :options="directionOptions"
        placeholder="Descendente" :disabled="loading" />
      <button type="button" class="reset-filters" :disabled="loading" @click="reset">Restablecer filtros</button>
    </form>

    <p v-if="loading" role="status">Cargando promociones...</p>
    <div v-else-if="error" class="list-error">
      <p role="alert">{{ error }}</p>
      <button type="button" @click="emit('retry')">Reintentar</button>
    </div>
    <template v-else>
      <p role="status">{{ rows.length }} de {{ promotions.length }} promociones.</p>
      <CrudTable :columns="columns" :rows="rows" caption="Promociones">
        <template #cell-promotionType="{ value }">{{ typeName(value) }}</template>
        <template #cell-technology="{ value }">{{ technologyName(value) }}</template>
        <template #cell-projectionFormat="{ value }">{{ value ?? 'Cualquiera' }}</template>
        <template #cell-beginDate="{ value }">{{ dateLabel(value) }}</template>
        <template #cell-endDate="{ value }">{{ dateLabel(value) }}</template>
        <template #actions="{ row }">
          <button type="button" class="view-button" :aria-label="`Ver promoción ${row.promotionId}`" title="Ver"
            @click="emit('view', Number(row.promotionId))">
            <i class="bi bi-eye" aria-hidden="true" />
          </button>
        </template>
      </CrudTable>
    </template>
  </section>
</template>

<style scoped>
.promotion-list { display: grid; gap: 16px; margin-top: 24px; }
.promotion-filters { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; align-items: start; }
.reset-filters, .list-error button { min-height: 44px; padding: 10px 16px; border: 1px solid var(--border-color); border-radius: var(--radius-small); background: var(--content-background); color: var(--text-primary); font: inherit; cursor: pointer; }
.view-button { display: inline-flex; align-items: center; justify-content: center; width: 44px; min-height: 44px; padding: 8px; border: 0; border-radius: var(--radius-small); background: transparent; color: var(--text-primary); font-size: 1.125rem; cursor: pointer; }
.view-button:hover { background: var(--surface-hover); }
.list-error { color: var(--error-color); }
button:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
button:disabled { opacity: 0.5; cursor: not-allowed; }
@media (max-width: 850px) { .promotion-filters { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 575px) { .promotion-filters { grid-template-columns: 1fr; } }
</style>
