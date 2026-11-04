<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import MoviePoster from '@/components/common/MoviePoster.vue'
import type { PortalMovie } from '@/types/movie'

interface CarouselSlide {
  image: string
  alt: string
  title: string
}
const props = defineProps<{ movies: readonly PortalMovie[] }>()
const slides = ref<CarouselSlide[]>([])
const currentIndex = ref(0)
const paused = ref(false)
const interacting = ref(false)
watch(
  () => props.movies,
  (movies) => {
    slides.value = movies.length
      ? movies.slice(0, 4).map((movie) => ({
          image: movie.posterImage,
          alt: movie.title,
          title: movie.title,
        }))
      : [{ image: '', alt: 'Cinetadel', title: 'Cinetadel' }]
    currentIndex.value = 0
  },
  { immediate: true },
)
let intervalId: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  paused.value = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  intervalId = setInterval(() => {
    if (!paused.value && !interacting.value) nextSlide()
  }, 5000)
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
function leave(event: FocusEvent) {
  interacting.value =
    event.relatedTarget instanceof Node &&
    (event.currentTarget as HTMLElement).contains(event.relatedTarget)
}
</script>

<template>
  <section
    class="hero-carousel"
    aria-label="Películas destacadas"
    @mouseenter="interacting = true"
    @mouseleave="interacting = false"
    @focusin="interacting = true"
    @focusout="leave"
  >
    <Transition name="carousel-fade" mode="out-in">
      <div v-if="currentSlide" :key="currentIndex" class="carousel-slide">
        <MoviePoster
          :poster-image="currentSlide.image"
          :title="currentSlide.alt"
          class="hero-image"
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
        :aria-current="index === currentIndex ? 'true' : undefined"
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
  --poster-aspect-ratio: 21 / 7.7;
  display: block;

  width: 100%;
  aspect-ratio: 21 / 7.7;
  height: auto;

  object-fit: cover;
}

.hero-overlay {
  position: absolute;
  inset: 0;

  background:
    linear-gradient(180deg, var(--hero-overlay-start), transparent 140px),
    linear-gradient(
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

  width: 44px;
  height: 44px;

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
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;

  padding: 0;

  border: 0;
  border-radius: 50%;

  background: transparent;
}

.indicator::after {
  content: '';
  width: 10px;
  height: 10px;
  border: 1px solid var(--content-background);
  border-radius: 50%;
}
.indicator.active::after {
  background-color: var(--accent-color);
}
.hero-carousel button:focus-visible {
  outline-color: var(--focus-on-dark);
}
@media (max-width: 576px) {
  .hero-image {
    --poster-aspect-ratio: 4 / 3;
    aspect-ratio: 4 / 3;
  }
  .carousel-control {
    top: calc(50% + 24px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .carousel-fade-enter-active,
  .carousel-fade-leave-active {
    transition: none;
  }
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
