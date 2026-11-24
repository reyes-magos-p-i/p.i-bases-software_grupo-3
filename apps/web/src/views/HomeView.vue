<script setup lang="ts">
import { computed } from 'vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppFooter from '@/components/layout/AppFooter.vue'
import HeroCarousel from '@/components/landing/HeroCarousel.vue'
import PortalSection from '@/components/landing/PortalSection.vue'
import { usePortalSection } from '@/composables/usePortalSection'
import type { PortalSection as PortalSectionKey } from '@/types/portal'

// SCRUM-437: Cartelera, Preventas and Estrenos, the same for visitors and clients.
const SECTIONS: {
  key: PortalSectionKey
  title: string
  subtitle: string
  emptyMessage: string
  errorMessage: string
}[] = [
  {
    key: 'cartelera',
    title: 'Cartelera',
    subtitle: 'Funciones disponibles desde hoy',
    emptyMessage: 'No hay películas en cartelera por ahora.',
    errorMessage: 'No se pudo cargar la cartelera.',
  },
  {
    key: 'preventas',
    title: 'Preventas',
    subtitle: 'Asegura tu butaca antes del estreno',
    emptyMessage: 'No hay películas en preventa por ahora.',
    errorMessage: 'No se pudieron cargar las preventas.',
  },
  {
    key: 'estrenos',
    title: 'Estrenos',
    subtitle: 'Lo que llega pronto a Cinetadel',
    emptyMessage: 'No hay próximos estrenos por ahora.',
    errorMessage: 'No se pudieron cargar los estrenos.',
  },
]

const state = {
  cartelera: usePortalSection('cartelera'),
  preventas: usePortalSection('preventas'),
  estrenos: usePortalSection('estrenos'),
}

// The featured carousel shows the movies of Cartelera.
const featured = computed(() =>
  state.cartelera.movies.value.map((movie) => ({
    id: movie.id,
    title: movie.title,
    posterImage: movie.posterImage ?? '',
  })),
)
</script>

<template>
  <AppHeader overlay />
  <main>
    <HeroCarousel :movies="featured" />
    <PortalSection
      v-for="section in SECTIONS"
      :key="section.key"
      :section="section.key"
      :title="section.title"
      :subtitle="section.subtitle"
      :empty-message="section.emptyMessage"
      :error-message="section.errorMessage"
      :movies="state[section.key].movies.value"
      :loading="state[section.key].loading.value"
      :failed="state[section.key].failed.value"
      @retry="state[section.key].reload()"
    />
  </main>

  <AppFooter />
</template>

<style scoped>
main {
  padding-bottom: 64px;
  background-color: var(--page-background);
}
</style>
