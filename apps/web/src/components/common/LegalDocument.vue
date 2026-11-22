<script setup lang="ts">
import { onMounted, useId } from 'vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppFooter from '@/components/layout/AppFooter.vue'

defineProps<{ title: string; updatedAt: string }>()
const headingId = useId()
const contentId = `${headingId}-content`
onMounted(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }))
</script>

<template>
  <a class="legal-skip-link" :href="`#${contentId}`">Ir al contenido</a>
  <AppHeader />
  <main
    :id="contentId"
    class="landing-container legal-page"
    :aria-labelledby="headingId"
    tabindex="-1"
  >
    <article class="legal-document">
      <nav class="legal-navigation" aria-label="Navegación del portal">
        <RouterLink to="/" class="portal-return-link">
          <i class="bi bi-arrow-left" aria-hidden="true"></i>
          Volver al portal
        </RouterLink>
      </nav>
      <header class="legal-heading">
        <h1 :id="headingId">{{ title }}</h1>
        <p class="legal-updated">Última actualización: {{ updatedAt }}</p>
      </header>
      <slot />
    </article>
  </main>
  <AppFooter />
</template>

<style scoped>
.legal-page {
  padding-block: clamp(28px, 5vw, 56px);
}
.legal-document {
  max-width: 76ch;
  margin-inline: auto;
  overflow-wrap: anywhere;
}
.legal-navigation {
  margin-bottom: 24px;
}
.legal-navigation a {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
}
.legal-heading {
  margin-bottom: 32px;
  padding-bottom: 24px;
  border-bottom: 1px solid var(--border-on-dark);
}
.legal-heading h1 {
  margin: 0 0 12px;
  color: var(--text-on-dark);
  font-size: clamp(1.75rem, 5vw, 2.5rem);
  font-weight: 700;
  line-height: 1.2;
}
.legal-updated {
  margin: 0;
  color: var(--text-on-dark-secondary);
  font-size: 0.875rem;
}
.legal-document :deep(section + section) {
  margin-top: 32px;
}
.legal-document :deep(h2) {
  margin: 0 0 12px;
  color: var(--text-on-dark);
  font-size: clamp(1.125rem, 3vw, 1.375rem);
  font-weight: 700;
  line-height: 1.4;
}
.legal-document :deep(p),
.legal-document :deep(li) {
  color: var(--text-on-dark-secondary);
  line-height: 1.75;
}
.legal-document :deep(ul),
.legal-document :deep(ol) {
  padding-inline-start: 1.5rem;
}
.legal-document :deep(li + li) {
  margin-top: 8px;
}
.legal-document :deep(a) {
  color: var(--accent-color);
  text-decoration: underline;
  text-underline-offset: 3px;
}
.legal-document :deep(a:focus-visible),
.legal-skip-link:focus-visible {
  outline-color: var(--focus-on-dark);
}
.legal-skip-link {
  position: absolute;
  z-index: 100;
  top: 8px;
  left: 8px;
  max-width: calc(100% - 16px);
  padding: 12px 16px;
  transform: translateY(-160%);
  border-radius: var(--radius-small);
  background: var(--surface-background);
  color: var(--text-on-dark);
}
.legal-skip-link:focus {
  transform: translateY(0);
}
</style>
