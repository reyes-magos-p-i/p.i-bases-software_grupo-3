<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const selectedProvince = ref('')
const selectedCinema = ref('')

const cinemasByProvince: Record<string, string[]> = {
  'San José': [
    'Cinetadel San Pedro',
    'Cinetadel Escazú',
  ],

  Alajuela: [
    'Cinetadel Alajuela',
  ],

  Heredia: [
    'Cinetadel Heredia',
  ],
}

const availableCinemas = computed(() => {
  return cinemasByProvince[selectedProvince.value] ?? []
})

watch(selectedProvince, () => {
  selectedCinema.value = ''
})
</script>

<template>
  <section class="branch-selector">
    <h2>
      Selecciona tu sucursal
    </h2>

    <div class="selector-fields">
      <div class="selector-field">
        <label for="province">
          Provincia
        </label>

        <select
          id="province"
          v-model="selectedProvince"
          class="form-select"
        >
          <option
            value=""
            disabled
          >
            Seleccione una provincia
          </option>

          <option
            v-for="(_, province) in cinemasByProvince"
            :key="province"
            :value="province"
          >
            {{ province }}
          </option>
        </select>
      </div>

      <div class="selector-field">
        <label for="cinema">
          Cine
        </label>

        <select
          id="cinema"
          v-model="selectedCinema"
          class="form-select"
          :disabled="!selectedProvince"
        >
          <option
            value=""
            disabled
          >
            Seleccione un cine
          </option>

          <option
            v-for="cinema in availableCinemas"
            :key="cinema"
            :value="cinema"
          >
            {{ cinema }}
          </option>
        </select>
      </div>
    </div>
  </section>
</template>

<style scoped>
.branch-selector {
  margin-top: 36px;
}

.branch-selector h2 {
  margin-bottom: 18px;

  font-size: 1.35rem;
  font-weight: 600;
}

.selector-fields {
  display: flex;
  flex-wrap: wrap;

  gap: 20px;
}

.selector-field {
  width: min(280px, 100%);
}

.selector-field label {
  display: block;

  margin-bottom: 6px;

  font-size: 0.9rem;
  font-weight: 500;
}

.form-select:focus {
  border-color: var(--focus-color);

  box-shadow: 0 0 0 0.25rem var(--focus-shadow);
}
</style>