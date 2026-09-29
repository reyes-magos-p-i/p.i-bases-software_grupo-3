<script setup lang="ts">
import AppHeader from '@/components/layout/AppHeader.vue'
import AppFooter from '@/components/layout/AppFooter.vue'

import HeroCarousel from '@/components/landing/HeroCarousel.vue'
import MovieCatalog from '@/components/landing/MovieCatalog.vue'
import CustomGoogleButton from '@/components/Google/CustomGoogleButton.vue';

</script>

<template>
  <AppHeader />

  <main>
    <div class="landing-container home-content">
      <HeroCarousel />


      <MovieCatalog />
    </div>
 
  </main>

  <AppFooter />
</template>

<style scoped>
main {
  padding-top: 32px;
}

.home-content {
  padding-bottom: 24px;
}
</style>
