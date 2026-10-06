import { createRouter, createWebHistory } from 'vue-router'

import HomeView from '@/views/HomeView.vue'
import PlaceHolder from '@/views/PlaceHolder.vue'
import TermsConditions from '@/views/TermsConditions.vue'
import RefundPolicy from '@/views/RefundPolicy.vue'
import PrivacyPolicy from '@/views/PrivacyPolicy.vue'
import { requireEmployeeSession } from './employee-session.guard'
import { requireClientSession } from './client-session.guard'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),

  routes: [
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
      path: '/:pathMatch(.*)*',
      name: 'NotFound',
      component: PlaceHolder,
    },
    {
      path: '/terms-and-conditions',
      name: 'terms',
      component: TermsConditions,
    },
    {
      path: '/refund-policy',
      name: 'refund-policy',
      component: RefundPolicy,
    },
    {
      path: '/privacy-policy',
      name: 'privacy-policy',
      component: PrivacyPolicy,
    },
  ],
})
router.beforeEach(requireClientSession)
router.beforeEach(requireEmployeeSession)

export default router
