import { describe, expect, it } from 'vitest'
import { contrastRatio, cssValue } from '../../helpers/contrast'
import hero from '@/components/landing/PortalHero.vue?raw'
import section from '@/components/landing/PortalSection.vue?raw'
import card from '@/components/landing/PortalMovieCard.vue?raw'
import footer from '@/components/layout/AppFooter.vue?raw'
import accountMenu from '@/components/common/AccountMenu.vue?raw'
import sectionNavigation from '@/components/common/SectionNavigation.vue?raw'

// SCRUM-438 (UT-055 and UT-056): every text of the portal has at least 4.5:1 against its
// background, with and without a session. Colors come from the components and resolve to the
// real tokens. Texts over the page or the hero shade are measured against --page-background,
// the solid color the hero shade starts with.
const PAGE = 'var(--page-background)'
const color = (source: string, selector: string) => cssValue(source, selector, 'color')
const background = (source: string, selector: string) => cssValue(source, selector, 'background')

describe('Portal contrast', () => {
  it.each([
    ['hero eyebrow', color(hero, '.eyebrow'), PAGE],
    ['hero details', color(hero, '.meta'), PAGE],
    ['hero synopsis', color(hero, '.synopsis'), PAGE],
    ['hero buy button', color(hero, '.buy-button'), background(hero, '.buy-button')],
    ['hero ghost button', color(hero, '.ghost-button'), PAGE],
    ['section title', color(section, '.portal-section'), PAGE],
    ['section subtitle', color(section, '.section-subtitle'), PAGE],
    ['see all', color(section, '.see-all'), PAGE],
    [
      'empty and error message',
      color(section, '.state-text span'),
      background(section, '.section-state'),
    ],
    ['retry button', color(section, '.retry-button'), background(section, '.retry-button')],
    ['card details', color(card, '.card-meta'), PAGE],
    ['card genres and notes', color(card, '.card-genres,\n.card-note'), PAGE],
    ['card buy button', color(card, '.buy-button'), background(card, '.buy-button')],
    ['presale badge', color(card, '.badge-presale'), background(card, '.badge-presale')],
    ['footer heading', color(footer, '.footer-grid h2'), background(footer, '.site-footer')],
    [
      'footer texts',
      color(footer, '.footer-grid li a,\n.footer-grid li span'),
      background(footer, '.site-footer'),
    ],
    ['footer tagline', color(footer, '.footer-brand p'), background(footer, '.site-footer')],
    ['footer copyright', color(footer, '.footer-bottom'), background(footer, '.site-footer')],
  ])('%s without a session', (_text, foreground, behind) => {
    expect(contrastRatio(foreground, behind)).toBeGreaterThanOrEqual(4.5)
  })

  it.each([
    ['"Te gusta" tag', color(card, '.reason'), background(card, '.reason')],
    [
      'account menu',
      color(accountMenu, '.account-dropdown'),
      background(accountMenu, '.account-dropdown'),
    ],
    [
      'account details',
      color(accountMenu, '.account-detail span'),
      background(accountMenu, '.account-dropdown'),
    ],
    [
      'account sections',
      color(sectionNavigation, '.section-navigation--menu button'),
      background(accountMenu, '.account-dropdown'),
    ],
    [
      'current account section',
      color(sectionNavigation, '.section-navigation--menu button[aria-current]'),
      background(sectionNavigation, '.section-navigation--menu button[aria-current]'),
    ],
  ])('%s with a session', (_text, foreground, behind) => {
    expect(contrastRatio(foreground, behind)).toBeGreaterThanOrEqual(4.5)
  })
})
