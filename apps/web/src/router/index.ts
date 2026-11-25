import { createRouter, createWebHistory } from 'vue-router'

import HomeView from '@/views/HomeView.vue'
import PlaceHolder from '@/views/PlaceHolder.vue'
import TermsConditions from '@/views/TermsConditions.vue'
import RefundPolicy from '@/views/RefundPolicy.vue'
import PrivacyPolicy from '@/views/PrivacyPolicy.vue'
import { requireEmployeeSession } from './employee-session.guard'
import { redirectClientWhenPasswordBlocked, requireClientSession } from './client-session.guard'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),

  // Footer links jump to a portal section (#cartelera, #preventas, #estrenos).
  scrollBehavior: (to, _from, savedPosition) =>
    to.hash ? { el: to.hash, behavior: 'smooth' } : (savedPosition ?? undefined),

  routes: [
    {
      path: '/account/profile',
      name: 'client-profile',
      component: () => import('@/views/ClientProfileView.vue'),
      meta: { requiresClient: true },
    },
    {
      path: '/historial-compras',
      redirect: { path: '/account/profile', query: { section: 'purchases' } },
    },
    {
      path: '/historial-compras/:id',
      redirect: (to) => ({
        path: '/account/profile',
        query: { section: 'purchases', purchaseId: to.params.id },
      }),
    },
    {
      path: '/account/confirm-email',
      name: 'client-email-confirmation',
      component: () => import('@/views/ClientEmailConfirmationView.vue'),
    },
    {
      path: '/recover-password',
      name: 'recover-password',
      component: () => import('@/views/ChangePasswordView.vue'),
      props: (route) => ({ recovery: true, recoveryToken: route.hash.slice(1) }),
    },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: () => import('@/views/DashboardView.vue'),
      meta: { requiresEmployee: true },
    },
    {
      path: '/verify-email',
      name: 'verify-email',
      component: () => import('@/views/EmailVerificationView.vue'),
    },
    {
      path: '/account/password',
      name: 'account-password',
      component: () => import('@/views/ChangePasswordView.vue'),
      meta: { requiresClient: true },
    },
    { path: '/dev/dashboard', redirect: '/dashboard' },
    {
      path: '/',
      name: 'home',
      component: HomeView,
    },
    {
      path: '/buy-tickets',
      name: 'buy-tickets',
      component: () => import('@/views/TicketPurchaseView.vue'),
    },
    {
      path: '/cancelled-tickets/:ticketId',
      name: 'cancelled-ticket',
      component: () => import('@/views/CancelledTicketView.vue'),
      meta: { requiresClient: true, returnAfterLogin: true },
    },
    {
      path: '/cancelled-tickets/:ticketId/refund',
      name: 'cancelled-ticket-refund',
      component: () => import('@/views/RefundInProgressView.vue'),
      meta: { requiresClient: true, returnAfterLogin: true },
    },
    {
      path: '/cancelled-tickets/:ticketId/changed',
      name: 'cancelled-ticket-changed',
      component: () => import('@/views/TicketChangedView.vue'),
      meta: { requiresClient: true, returnAfterLogin: true },
    },
    {
      path: '/guest-purchases/receipt',
      name: 'guest-purchase-receipt',
      component: () => import('@/views/GuestPurchaseReceiptView.vue'),
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'NotFound',
      component: PlaceHolder,
    },
    {
      path: '/terms-and-conditions',
      name: 'terms',
      component: TermsConditions,
      meta: { publicLegal: true },
    },
    {
      path: '/refund-policy',
      name: 'refund-policy',
      component: RefundPolicy,
      meta: { publicLegal: true },
    },
    {
      path: '/privacy-policy',
      name: 'privacy-policy',
      component: PrivacyPolicy,
      meta: { publicLegal: true },
    },
  ],
})
router.beforeEach(requireEmployeeSession)
router.beforeEach(requireClientSession)
redirectClientWhenPasswordBlocked(router)

export default router
