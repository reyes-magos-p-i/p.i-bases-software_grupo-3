<script setup lang="ts">
import { ref } from 'vue'
import SeatSelector from './SeatSelector.vue'
import type { Seat } from '@/types/seats.ts'
import { getTheaterSeats } from '@/services/theater.service.ts'

const theaterId = ref(7)
const dimensionX = ref(6)
const dimensionY = ref(9)
const seats = ref<Seat[]>([])
const selectedSeats = ref<Seat[]>([])



function handleSelection(selection: Seat[]) {
  selectedSeats.value = selection
}

// Replace seats.value with the normalized seats returned by your API.
// Example seat:
// { theaterId: 7, rowNumber: 1, columnNumber: 1,
//   type: 'vip', state: 'free' }
</script>

<template>
  <SeatSelector
    :theater-id="theaterId"
    :rows="dimensionX"
    :columns="dimensionY"
    :seats="seats"
    :max-selections="3"
    @selection-change="handleSelection"
  />
</template>
