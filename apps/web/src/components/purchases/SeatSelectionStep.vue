<script setup lang="ts">
import { computed, useId } from 'vue'
import SeatSelector from '@/components/Seats/SeatSelector.vue'
import { formatDateTime } from '@/utils/transaction-format'
import type { Seat } from '@/types/seats'
import type { SeatAvailability, TicketCategory } from '@/types/purchase'
const props = defineProps<{
  availability: SeatAvailability
  selected: Seat[]
  categories: Record<number, TicketCategory>
  disabled?: boolean
}>()
const emit = defineEmits<{
  selection: [seats: Seat[]]
  category: [position: number, category: TicketCategory]
  continue: []
  back: []
}>()
const id = useId()
const available = computed(
  () => props.availability.seats.filter((seat) => seat.state === 'free').length,
)
const position = (seat: Seat) =>
  (seat.rowNumber - 1) * props.availability.function.columns + seat.columnNumber
function categoryChange(seat: Seat, event: Event) {
  emit('category', position(seat), (event.target as HTMLSelectElement).value as TicketCategory)
}
</script>
<template>
  <section aria-label="Selección de asientos">
    <h2>Elige tus asientos</h2>
    <p>
      {{ availability.function.title }} · {{ availability.function.branchName }} · Sala
      {{ availability.function.theaterId }} · {{ formatDateTime(availability.function.startsAt) }}
    </p>
    <p>La selección no reserva los asientos. Confirmaremos su disponibilidad al pagar.</p>
    <p v-if="!available" role="status">Esta función no tiene asientos disponibles.</p>
    <SeatSelector
      :theater-id="availability.function.theaterId"
      :rows="availability.function.rows"
      :columns="availability.function.columns"
      :seats="availability.seats"
      :disabled="disabled"
      @selection-change="emit('selection', $event)"
    />
    <p aria-live="polite">
      {{ selected.length }} boletos seleccionados · {{ available }} asientos disponibles
    </p>
    <fieldset :disabled="disabled" class="categories">
      <legend>Tipo de boleto por asiento</legend>
      <p>Elige la categoría de cada persona.</p>
      <p>
        {{
          availability.categories.map((item) => `${item.label}: ${item.description}`).join(' · ')
        }}
      </p>
      <ul>
        <li v-for="seat in selected" :key="position(seat)">
          <label :for="id + '-' + position(seat)"
            >Fila {{ seat.rowNumber }}, asiento {{ seat.columnNumber
            }}{{ seat.type === 'vip' ? ' · VIP' : '' }}</label
          ><select
            class="purchase-select"
            :id="id + '-' + position(seat)"
            :value="categories[position(seat)] ?? 'GENERAL'"
            @change="categoryChange(seat, $event)"
          >
            <option
              v-for="category in availability.categories"
              :key="category.code"
              :value="category.code"
            >
              {{ category.label }}
            </option>
          </select>
        </li>
      </ul>
    </fieldset>
    <div class="step-actions">
      <button type="button" class="purchase-action" :disabled="disabled" @click="emit('back')">
        Cambiar función</button
      ><button
        type="button"
        class="purchase-action primary"
        :disabled="disabled || !available"
        @click="emit('continue')"
      >
        Revisar compra
      </button>
    </div>
  </section>
</template>
<style scoped>
.categories {
  border: 1px solid var(--border-on-dark);
  border-radius: var(--radius-medium);
  padding: 20px;
  margin: 24px 0;
}
.categories legend {
  float: none;
  width: auto;
  font-size: 1.1rem;
}
.categories ul {
  max-height: 320px;
  overflow: auto;
  list-style: none;
  padding: 0;
  display: grid;
  gap: 12px;
}
.categories li {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
}
.categories select {
  min-width: 160px;
}
.step-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  justify-content: space-between;
}
</style>
