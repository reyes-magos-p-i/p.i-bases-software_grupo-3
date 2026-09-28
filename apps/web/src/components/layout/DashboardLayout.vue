<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, useId, useTemplateRef } from 'vue'
import type { UserRole } from '@/types/user'
import DashboardHeader from './DashboardHeader.vue'
import DashboardSidebar from './DashboardSidebar.vue'

withDefaults(
  defineProps<{
    role: UserRole
    userName?: string
    activeSection?: string
    availableSections?: readonly string[]
    canLogout?: boolean
  }>(),
  { availableSections: () => [] },
)
const emit = defineEmits<{ navigate: [section: string]; logout: [] }>()
const instanceId = useId()
const menuId = instanceId + '-menu'
const contentId = instanceId + '-content'
const collapsed = ref(false)
const isMobile = ref(false)
const menuOpen = ref(false)
const mobileMenu = useTemplateRef<HTMLDialogElement>('mobile-menu')
const content = useTemplateRef<HTMLElement>('content')
let viewport: MediaQueryList
let menuOpener: HTMLElement | null = null

function openMenu() {
  if (!mobileMenu.value || menuOpen.value) return
  menuOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null
  mobileMenu.value.showModal()
  menuOpen.value = true
}

async function onMenuClosed() {
  if (!menuOpen.value) return
  menuOpen.value = false
  const previousFocus = menuOpener
  menuOpener = null
  await nextTick()
  if (previousFocus?.isConnected) previousFocus.focus()
  else content.value?.focus()
}

function closeMenu() {
  mobileMenu.value?.close()
  // Restore focus even when a viewport change removes the dialog before its close event fires.
  void onMenuClosed()
}

function keepMenuFocus(event: KeyboardEvent) {
  const buttons = mobileMenu.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
  const first = buttons?.[0]
  const last = buttons?.[buttons.length - 1]
  if (!first || !last) return

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

function updateViewport() {
  closeMenu()
  isMobile.value = viewport.matches
}

function navigate(section: string) {
  emit('navigate', section)
  closeMenu()
}

function logout() {
  emit('logout')
  closeMenu()
}

onMounted(() => {
  viewport = window.matchMedia('(max-width: 767px)')
  isMobile.value = viewport.matches
  viewport.addEventListener('change', updateViewport)
})
onUnmounted(() => viewport.removeEventListener('change', updateViewport))
</script>

<template>
  <div class="dashboard-layout" :class="{ 'is-collapsed': collapsed }">
    <a class="skip-link" :href="'#' + contentId">Saltar al contenido</a>

    <aside v-if="!isMobile" class="desktop-sidebar" aria-label="Menú del dashboard">
      <DashboardSidebar
        :role="role"
        :active-section="activeSection"
        :available-sections="availableSections"
        :can-logout="canLogout"
        :collapsed="collapsed"
        @toggle-collapse="collapsed = !collapsed"
        @navigate="navigate"
        @logout="logout"
      />
    </aside>
    <dialog
      v-else
      :id="menuId"
      ref="mobile-menu"
      class="mobile-menu"
      aria-label="Menú del dashboard"
      @cancel.prevent="closeMenu"
      @close="onMenuClosed"
      @click.self="closeMenu"
      @keydown.tab="keepMenuFocus"
    >
      <DashboardSidebar
        :role="role"
        :active-section="activeSection"
        :available-sections="availableSections"
        :can-logout="canLogout"
        mobile
        @close="closeMenu"
        @navigate="navigate"
        @logout="logout"
      />
    </dialog>

    <div class="dashboard-workspace">
      <DashboardHeader
        :role="role"
        :user-name="userName"
        :mobile="isMobile"
        :menu-open="menuOpen"
        :menu-id="menuId"
        @open-menu="openMenu"
      >
        <template v-if="$slots.profile" #profile><slot name="profile" /></template>
      </DashboardHeader>
      <main :id="contentId" ref="content" class="dashboard-content" tabindex="-1">
        <slot />
      </main>
    </div>
  </div>
</template>

<style scoped>
.dashboard-layout {
  display: grid;
  grid-template-columns: 16rem minmax(0, 1fr);
  min-height: 100dvh;
  color: var(--color-dark);
  background: var(--color-light_gray);
}

.dashboard-layout.is-collapsed {
  grid-template-columns: 5rem minmax(0, 1fr);
}

.desktop-sidebar {
  position: sticky;
  top: 0;
  height: 100dvh;
  min-width: 0;
}

.dashboard-workspace {
  min-width: 0;
}

.dashboard-content {
  padding: 24px 32px;
  overflow-wrap: anywhere;
}

.skip-link {
  position: fixed;
  top: 8px;
  left: 8px;
  z-index: 10;
  padding: 12px 16px;
  border-radius: var(--radius-small);
  color: var(--color-primary);
  background: var(--color-white);
  transform: translateY(calc(-100% - 16px));
}

.skip-link:focus {
  transform: translateY(0);
}

.skip-link:focus-visible,
.dashboard-content:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: -2px;
}

.mobile-menu {
  position: fixed;
  inset: 0 auto 0 0;
  width: min(19rem, calc(100% - 32px));
  max-width: none;
  height: 100dvh;
  max-height: none;
  margin: 0;
  padding: 0;
  border: 0;
  background: var(--color-primary);
}

.mobile-menu::backdrop {
  background: color-mix(in srgb, var(--color-black) 50%, transparent);
}

@media (max-width: 767px) {
  .dashboard-layout,
  .dashboard-layout.is-collapsed {
    grid-template-columns: minmax(0, 1fr);
  }

  .dashboard-content {
    padding: 20px 16px;
  }
}
</style>
