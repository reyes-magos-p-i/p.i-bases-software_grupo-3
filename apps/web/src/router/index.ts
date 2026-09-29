import { createRouter, createWebHistory } from 'vue-router'

import HomeView from '@/views/HomeView.vue'
import PlaceHolder from '@/views/PlaceHolder.vue'
import TermsConditions from '@/views/TermsConditions.vue'
import RefundPolicy from '@/views/RefundPolicy.vue'
import PrivacyPolicy from '@/views/PrivacyPolicy.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),

  routes: [
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

if (import.meta.env.DEV) {
  router.addRoute({
    path: '/dev/dashboard',
    name: 'dashboard-preview',
    component: () => import('@/views/DashboardPreview.vue'),
  })
}

export default router
