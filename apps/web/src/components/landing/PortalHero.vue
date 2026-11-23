<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import MoviePoster from '@/components/common/MoviePoster.vue'
import type { PortalSectionMovie } from '@/types/portal'
import { formatRunningTime } from '@/utils/portal-format'

// SCRUM-438: featured movies of Cartelera (prototype "Destacada", option A). The real poster
// takes the place of the prototype's gradients. It rotates every 7 s unless the visitor pauses
// it, points at it, focuses it or prefers reduced motion.
const ROTATION_MS = 7000
const props = defineProps<{ movies: readonly PortalSectionMovie[] }>()

const featured = computed(() => props.movies.slice(0, 5))
const index = ref(0)
const paused = ref(false)
const holding = ref(false)
const current = computed(() => featured.value[index.value])
let timer: ReturnType<typeof setInterval> | undefined

watch(featured, () => {
  index.value = 0
})

function step(delta: 1 | -1) {
  const count = featured.value.length
  if (count) index.value = (index.value + delta + count) % count
}

function details(movie: PortalSectionMovie) {
  return [movie.classification, formatRunningTime(movie.runningTime)].filter(Boolean).join(' · ')
}

function leave(event: FocusEvent) {
  holding.value =
    event.relatedTarget instanceof Node &&
    (event.currentTarget as HTMLElement).contains(event.relatedTarget)
}

onMounted(() => {
  paused.value = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  timer = setInterval(() => {
    if (!paused.value && !holding.value) step(1)
  }, ROTATION_MS)
})
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <section
    class="hero"
    aria-label="Película destacada"
    @mouseenter="holding = true"
    @mouseleave="holding = false"
    @focusin="holding = true"
    @focusout="leave"
  >
    <div class="hero-bg" aria-hidden="true">
      <MoviePoster
        v-if="current"
        :key="current.id"
        :poster-image="current.posterImage"
        :title="current.title"
        class="hero-backdrop"
      />
    </div>
    <div class="hero-orb" aria-hidden="true"></div>
    <div class="hero-orb two" aria-hidden="true"></div>
    <div class="hero-shade" aria-hidden="true"></div>

    <div class="landing-container hero-content">
      <div class="hero-grid">
        <div v-if="current" class="hero-copy">
          <p class="eyebrow">En cartelera · Destacada</p>
          <h1 class="hero-title">{{ current.title }}</h1>
          <p class="meta">
            <span v-if="current.classification" class="classification">
              {{ current.classification }}
            </span>
            <span v-if="current.runningTime">{{ formatRunningTime(current.runningTime) }}</span>
            <template v-if="current.genres.length">
              <span class="separator" aria-hidden="true"></span>
              <span>{{ current.genres.join(', ') }}</span>
            </template>
          </p>
          <p v-if="current.synopsis" class="synopsis">{{ current.synopsis }}</p>
          <div class="actions">
            <RouterLink
              :to="{ name: 'buy-tickets', query: { movieId: current.id } }"
              class="hero-action buy-button"
              :aria-label="`Comprar boletos para ${current.title}`"
            >
              Comprar boletos
            </RouterLink>
            <RouterLink :to="{ path: '/', hash: '#cartelera' }" class="hero-action ghost-button">
              Ver cartelera
            </RouterLink>
          </div>
        </div>
        <div v-else class="hero-copy">
          <p class="eyebrow">Cinetadel</p>
          <h1 class="hero-title">Cartelera, preventas y estrenos</h1>
          <p class="synopsis">Todo lo que se proyecta en Cinetadel, en un solo lugar.</p>
        </div>

        <div v-if="current" class="hero-poster" aria-hidden="true">
          <MoviePoster
            :key="current.id"
            :poster-image="current.posterImage"
            :title="current.title"
          />
        </div>
      </div>

      <div v-if="featured.length > 1" class="thumbs-bar">
        <button
          type="button"
          class="circle-button"
          aria-label="Película anterior"
          @click="step(-1)"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M15 18l-6-6 6-6"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            />
          </svg>
        </button>
        <ul class="thumbs" aria-label="Elegir película destacada">
          <li v-for="(movie, position) in featured" :key="movie.id">
            <button
              type="button"
              class="thumb"
              :class="{ active: position === index }"
              :aria-current="position === index"
              @click="index = position"
            >
              <span class="thumb-art" aria-hidden="true">
                <MoviePoster :poster-image="movie.posterImage" :title="movie.title" />
              </span>
              <span class="thumb-text">
                <span class="thumb-title">{{ movie.title }}</span>
                <span class="thumb-meta">{{ details(movie) }}</span>
              </span>
            </button>
          </li>
        </ul>
        <button
          type="button"
          class="circle-button"
          aria-label="Siguiente película"
          @click="step(1)"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          </svg>
        </button>
        <button
          type="button"
          class="circle-button"
          :aria-label="paused ? 'Reanudar rotación' : 'Pausar rotación'"
          :aria-pressed="paused"
          @click="paused = !paused"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path v-if="paused" d="M8 5l11 7-11 7z" fill="currentColor" />
            <path
              v-else
              d="M8 5v14M16 5v14"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            />
          </svg>
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.hero {
  position: relative;
  display: flex;
  min-height: 760px;
  flex-direction: column;
  justify-content: flex-end;
  overflow: hidden;
  background: var(--surface-background);
  color: var(--text-on-dark);
}

.hero-bg {
  position: absolute;
  inset: 0;
}

.hero-backdrop {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 20%;
  filter: blur(2px) saturate(1.1);
  transform: scale(1.04);
}

.hero-orb {
  position: absolute;
  top: -20%;
  right: -8%;
  width: 62%;
  aspect-ratio: 1;
  border: 1px solid color-mix(in srgb, var(--text-on-dark) 12%, transparent);
  border-radius: 50%;
}

.hero-orb.two {
  top: 6%;
  right: 4%;
  width: 38%;
  border-color: color-mix(in srgb, var(--text-on-dark) 8%, transparent);
}

/* Solid page background behind the text, so it keeps its contrast over any poster. */
.hero-shade {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(
      90deg,
      var(--page-background) 0%,
      color-mix(in srgb, var(--page-background) 88%, transparent) 36%,
      color-mix(in srgb, var(--page-background) 30%, transparent) 72%,
      color-mix(in srgb, var(--page-background) 55%, transparent) 100%
    ),
    linear-gradient(0deg, var(--page-background) 0%, transparent 42%),
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--page-background) 85%, transparent) 0,
      transparent 170px
    );
}

.hero-content {
  position: relative;
}

.hero-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  align-items: end;
  gap: 56px;
  padding-top: 150px;
}

.hero-copy {
  min-width: 0;
}

.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 14px;
  color: var(--text-on-dark);
  font-size: 0.8125rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.eyebrow::before {
  width: 32px;
  height: 3px;
  border-radius: 2px;
  background: var(--primary-color);
  content: '';
}

.hero-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 7.5rem;
  font-weight: 400;
  letter-spacing: 0.02em;
  line-height: 0.88;
  overflow-wrap: anywhere;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  margin: 20px 0 0;
  color: var(--text-on-dark-secondary);
  font-size: 0.9375rem;
}

.classification {
  display: inline-grid;
  min-width: 40px;
  height: 24px;
  place-items: center;
  padding: 0 6px;
  border: 1px solid color-mix(in srgb, var(--text-on-dark) 55%, transparent);
  border-radius: 4px;
  color: var(--text-on-dark);
  font-size: 0.75rem;
  font-weight: 700;
}

.separator {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--text-on-dark-secondary);
}

.synopsis {
  display: -webkit-box;
  max-width: 560px;
  overflow: hidden;
  margin: 16px 0 0;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  color: var(--text-on-dark-secondary);
  font-size: 1.0625rem;
  line-height: 1.55;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 28px;
}

.hero-action {
  display: inline-flex;
  min-height: 54px;
  align-items: center;
  justify-content: center;
  padding: 0 28px;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 700;
  text-decoration: none;
}

.buy-button {
  background: var(--accent-color);
  color: var(--page-background);
}

.buy-button:hover {
  color: var(--page-background);
  filter: brightness(1.08);
}

.ghost-button {
  padding: 0 24px;
  border: 1px solid color-mix(in srgb, var(--text-on-dark) 60%, transparent);
  background: color-mix(in srgb, var(--page-background) 35%, transparent);
  color: var(--text-on-dark);
}

.ghost-button:hover {
  border-color: var(--text-on-dark);
  color: var(--text-on-dark);
}

.hero-poster {
  overflow: hidden;
  aspect-ratio: 2 / 3;
  border-radius: 16px;
  box-shadow: 0 30px 70px rgb(0 0 0 / 65%);
}

.hero-poster :deep(img) {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.thumbs-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 44px;
  padding-bottom: 36px;
}

.thumbs {
  display: grid;
  min-width: 0;
  flex: 1;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.thumb {
  display: flex;
  width: 100%;
  min-height: 76px;
  align-items: center;
  gap: 12px;
  padding: 8px 10px 8px 8px;
  border: 1px solid color-mix(in srgb, var(--text-on-dark) 12%, transparent);
  border-bottom: 3px solid transparent;
  border-radius: 10px;
  background: color-mix(in srgb, var(--surface-background) 78%, transparent);
  color: var(--text-on-dark);
  cursor: pointer;
  text-align: left;
  transition:
    background var(--transition-normal),
    border-color var(--transition-normal);
}

.thumb:hover {
  border-color: color-mix(in srgb, var(--text-on-dark) 30%, transparent);
  background: var(--surface-background);
}

.thumb.active {
  border-bottom-color: var(--primary-color);
  background: var(--surface-background);
}

.thumb-art {
  overflow: hidden;
  width: 38px;
  height: 57px;
  flex: none;
  border-radius: 5px;
}

.thumb-art :deep(img) {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.thumb-text {
  min-width: 0;
}

.thumb-title {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  font-size: 0.8125rem;
  font-weight: 700;
  line-height: 1.25;
}

.thumb-meta {
  display: block;
  margin-top: 3px;
  color: var(--text-on-dark-secondary);
  font-size: 0.75rem;
}

.circle-button {
  display: grid;
  width: 44px;
  height: 44px;
  flex: none;
  place-items: center;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--text-on-dark) 28%, transparent);
  border-radius: 50%;
  background: color-mix(in srgb, var(--surface-background) 85%, transparent);
  color: var(--text-on-dark);
  cursor: pointer;
}

.circle-button:hover {
  border-color: var(--text-on-dark);
}

.buy-button:focus-visible,
.ghost-button:focus-visible,
.thumb:focus-visible,
.circle-button:focus-visible {
  outline: 3px solid var(--focus-on-dark);
  outline-offset: 3px;
}

@media (width <= 1100px) {
  .hero-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .hero-poster {
    display: none;
  }

  .hero-title {
    font-size: 5.75rem;
  }

  .thumbs {
    display: flex;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .thumbs li {
    flex: 0 0 210px;
  }
}

@media (width <= 640px) {
  .hero {
    min-height: 640px;
  }

  .hero-grid {
    padding-top: 170px;
  }

  .hero-title {
    font-size: 4rem;
  }

  .synopsis {
    font-size: 1rem;
  }

  .actions {
    flex-direction: column;
  }

  .thumbs-bar {
    flex-wrap: wrap;
    margin-top: 28px;
  }

  .thumbs {
    flex: 1 0 100%;
    order: -1;
  }

  .thumbs li {
    flex: 0 0 180px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .thumb {
    transition: none;
  }
}
</style>
