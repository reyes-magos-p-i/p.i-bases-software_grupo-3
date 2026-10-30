<script setup lang="ts">
import AppHeader from '@/components/layout/AppHeader.vue'
import AppFooter from '@/components/layout/AppFooter.vue'
import HeroCarousel from '@/components/landing/HeroCarousel.vue'
import MovieCatalog from '@/components/landing/MovieCatalog.vue'
import NotificationPopup from '@/components/common/NotificationPopup.vue'
import { usePortalMovies } from '@/composables/usePortalMovies'

const { movies, loading, error, warning, reload, dismissWarning } = usePortalMovies()
</script>

<template>
  <AppHeader overlay />
  <main>
    <HeroCarousel :movies="movies" />
    <NotificationPopup
      v-if="warning"
      type="alert"
      :message="warning"
      :duration="0"
      @close="dismissWarning"
    />
    <MovieCatalog :movies="movies" :loading="loading" :error="error" @retry="reload" />
  </main>
  <AppFooter />
</template>
