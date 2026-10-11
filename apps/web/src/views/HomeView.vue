<script setup lang="ts">
import AppHeader from '@/components/layout/AppHeader.vue'
import AppFooter from '@/components/layout/AppFooter.vue'
import HeroCarousel from '@/components/landing/HeroCarousel.vue'
import MovieCatalog from '@/components/landing/MovieCatalog.vue'



</script>

<template>
  <AppHeader />

  <main>
    <HeroCarousel />
    <div class="landing-container home-content">
      <MovieCatalog />
    </div>
    <Movie/>
  </main>
  <AppFooter />
</template>

<style scoped>


.home-content {
  padding-top: 32px;
  padding-bottom: 24px;
}
</style>
