<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import DatePicker from '@/components/common/DatePicker.vue'
import { formatDateTime, formatColones } from '@/utils/transaction-format'
import type { PurchaseMovie, PurchaseFunction } from '@/types/purchase'
const props = defineProps<{
  movie: PurchaseMovie
  functions: PurchaseFunction[]
  disabled?: boolean
}>()
const emit = defineEmits<{ select: [id: number] }>()
const id = useId(),
  branch = ref(''),
  date = ref('')
function clearFilters() {
  date.value = ''
  branch.value = ''
}
const branches = computed(() => [
  ...new Map(props.functions.map((item) => [item.branchId, item.branchName])).entries(),
])
const filtered = computed(() =>
  props.functions.filter(
    (item) =>
      (!branch.value || String(item.branchId) === branch.value) &&
      (!date.value || item.startsAt.slice(0, 10) === date.value),
  ),
)
</script>
<template>
  <section aria-label="Seleccionar función">
    <h1>{{ movie.title }}</h1>
    <p class="synopsis">{{ movie.synopsis }}</p>
    <div class="filters">
      <label :for="id + '-branch'"
        >Sucursal<select :id="id + '-branch'" v-model="branch">
          <option value="">Todas las sucursales</option>
          <option v-for="[key, name] in branches" :key="key" :value="String(key)">
            {{ name }}
          </option>
        </select></label
      >
      <div>
        <label :for="id + '-date'">Fecha</label><DatePicker :id="id + '-date'" v-model="date" />
      </div>
      <button v-if="date || branch" type="button" @click="clearFilters">Limpiar filtros</button>
    </div>
    <p v-if="!functions.length" role="status">
      Esta película no tiene funciones disponibles para comprar.
    </p>
    <p v-else-if="!filtered.length" role="status">
      No hay funciones disponibles con estos filtros.
    </p>
    <ul class="functions">
      <li v-for="item in filtered" :key="item.id">
        <div>
          <strong>{{ item.branchName }} · Sala {{ item.theaterId }}</strong>
          <p>{{ formatDateTime(item.startsAt) }}</p>
          <span
            >{{ item.format }} · {{ item.technology === 'STANDARD' ? 'Estándar' : item.technology
            }}{{ item.isPremiere ? ' · Estreno' : '' }}</span
          >
          <p>General desde {{ formatColones(item.price) }}</p>
        </div>
        <button type="button" class="primary" :disabled="disabled" @click="emit('select', item.id)">
          Seleccionar función
        </button>
      </li>
    </ul>
  </section>
</template>
<style scoped>
.synopsis {
  max-width: 75ch;
  line-height: 1.7;
}
.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  align-items: end;
  margin: 24px 0;
}
.filters label {
  display: grid;
  gap: 8px;
}
.functions {
  list-style: none;
  padding: 0;
  display: grid;
  gap: 14px;
}
.functions li {
  display: flex;
  gap: 20px;
  justify-content: space-between;
  align-items: center;
  border: 1px solid var(--border-on-dark);
  border-radius: var(--radius-medium);
  padding: 20px;
}
.functions p {
  margin: 8px 0;
}
.functions span {
  color: var(--text-on-dark-secondary);
}
@media (max-width: 580px) {
  .functions li {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
