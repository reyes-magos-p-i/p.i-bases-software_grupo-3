<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { stripTrailingSlashes } from '@/services/movieFunctions'
import type { PortalMovie } from '@/types/movie'
import placeholderImage from '../../assets/images/placeholder.svg'

interface CarouselSlide {
  image: string
  alt: string
  title: string
}
const props = defineProps<{ movies: readonly PortalMovie[] }>()
const slides = ref<CarouselSlide[]>([])
const currentIndex = ref(0)
const imagesBaseUrl = `${stripTrailingSlashes(String(import.meta.env.VITE_API_BASE_URL ?? ''))}/image`
watch(
  () => props.movies,
  (movies) => {
    slides.value = movies.length
      ? movies.slice(0, 4).map((movie) => ({
          image: `${imagesBaseUrl}/${movie.posterImage}`,
          alt: movie.title,
          title: movie.title,
        }))
      : [{ image: placeholderImage, alt: 'Cinetadel', title: 'Cinetadel' }]
    currentIndex.value = 0
  },
  { immediate: true },
)
let intervalId: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  intervalId = setInterval(nextSlide, 5000)
})
onUnmounted(() => {
  clearInterval(intervalId)
})
const currentSlide = computed(() => slides.value[currentIndex.value])
function nextSlide() {
  currentIndex.value = (currentIndex.value + 1) % slides.value.length
}
function previousSlide() {
  currentIndex.value = (currentIndex.value - 1 + slides.value.length) % slides.value.length
}
function selectSlide(index: number) {
  currentIndex.value = index
}
function handleImageError() {
  const slide = currentSlide.value
  if (slide && slide.image !== placeholderImage) slide.image = placeholderImage
}
</script>

<template>
  <section class="hero-carousel" aria-label="Películas destacadas">
    <Transition name="carousel-fade" mode="out-in">
      <div v-if="currentSlide" :key="currentIndex" class="carousel-slide">
        <img
          :src="currentSlide.image"
          :alt="currentSlide.alt"
          class="hero-image"
          @error="handleImageError"
        />

        <div class="hero-overlay"></div>
      </div>
    </Transition>

    <button
      type="button"
      class="carousel-control carousel-control-left"
      aria-label="Película anterior"
      @click="previousSlide"
    >
      <i class="bi bi-chevron-left" aria-hidden="true"></i>
    </button>

    <button
      type="button"
      class="carousel-control carousel-control-right"
      aria-label="Siguiente película"
      @click="nextSlide"
    >
      <i class="bi bi-chevron-right" aria-hidden="true"></i>
    </button>

    <div class="hero-carousel-indicators">
      <button
        v-for="(_, index) in slides"
        :key="index"
        type="button"
        class="indicator"
        :class="{ active: index === currentIndex }"
        :aria-label="`Mostrar película ${index + 1}`"
        @click="selectSlide(index)"
      ></button>
    </div>
  </section>
</template>

<style scoped>
.hero-carousel {
  position: relative;

  width: 100%;
  overflow: hidden;

  background-color: var(--surface-background);
}

.hero-image {
  display: block;

  width: 100%;
  aspect-ratio: 21 / 7.7;
  height: auto;

  object-fit: cover;
}

.hero-overlay {
  position: absolute;
  inset: 0;

  background: linear-gradient(
    90deg,
    var(--hero-overlay-start) 0%,
    var(--hero-overlay-end) 60%,
    transparent 100%
  );
}

.carousel-control {
  position: absolute;
  top: 50%;

  display: grid;
  place-items: center;

  width: 34px;
  height: 34px;

  border: 0;
  border-radius: 50%;

  color: var(--content-background);

  background-color: var(--carousel-control-background);

  transform: translateY(-50%);
}

.carousel-control-left {
  left: 16px;
}

.carousel-control-right {
  right: 16px;
}

.hero-carousel-indicators {
  position: absolute;

  left: 50%;
  bottom: 16px;

  display: flex;
  gap: 8px;

  transform: translateX(-50%);
}

.indicator {
  width: 10px;
  height: 10px;

  padding: 0;

  border: 1px solid var(--content-background);
  border-radius: 50%;

  background: transparent;
}

.indicator.active {
  background-color: var(--accent-color);
}

.carousel-slide {
  position: relative;
  width: 100%;
}

.carousel-fade-enter-active,
.carousel-fade-leave-active {
  transition: opacity 400ms ease;
}

.carousel-fade-enter-from,
.carousel-fade-leave-to {
  opacity: 0;
}

.carousel-fade-enter-to,
.carousel-fade-leave-from {
  opacity: 1;
}
</style>
