<script setup lang="ts">
import NotificationPopup from '@/components/common/NotificationPopup.vue'
import { dismissPasswordExpiry, passwordExpiryNotice } from '@/services/password-expiry-notice'

/** Long enough to read it; hovering pauses the timer. */
const DURATION_MS = 10000
</script>

<template>
  <div v-if="passwordExpiryNotice.message.value" class="password-expiry-notice">
    <NotificationPopup
      type="alert"
      :message="passwordExpiryNotice.message.value"
      :duration="DURATION_MS"
      @close="dismissPasswordExpiry"
    />
  </div>
</template>

<style scoped>
.password-expiry-notice {
  position: fixed;
  right: 1rem;
  bottom: 1rem;
  z-index: 1080;
}
</style>
