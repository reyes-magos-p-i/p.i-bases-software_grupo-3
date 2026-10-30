import { describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import ReusableSearchDropdown from '@/components/common/ReusableSearchDropdown.vue'
import ClientPreferencesForm from '@/components/clients/ClientPreferencesForm.vue'
import type { ClientPreferenceSettings } from '@/types/client-preferences'

describe('ClientPreferencesForm', () => {
  const settings: ClientPreferenceSettings = {
    genres: [
      { id: 1, name: 'Acción' },
      { id: 2, name: 'Drama' },
      { id: 3, name: 'Comedia' },
    ],
    languages: [
      { id: 1, name: 'Español' },
      { id: 2, name: 'Inglés' },
    ],
    selected: { genreIds: [2], languageIds: [2] },
    maxSelections: 1000,
  }
  const render = (value = settings, pending = false) =>
    mount(ClientPreferencesForm, { props: { settings: structuredClone(value), pending } })
  const field = (name: string, id: number) => `[name="${name}"][value="${id}"]`

  async function openOptions(wrapper: VueWrapper, index = 0) {
    await wrapper
      .findAllComponents(ReusableSearchDropdown)
      [index]!.get('.search-input')
      .trigger('focus')
  }

  it('shows database options and previously saved selections accessibly', async () => {
    const wrapper = render()
    expect(wrapper.find('.dropdown-options').exists()).toBe(false)
    await openOptions(wrapper)
    await openOptions(wrapper, 1)
    expect(wrapper.text()).toContain('Acción')
    expect(wrapper.text()).toContain('Español')
    expect(wrapper.get<HTMLInputElement>(field('genreIds', 2)).element.checked).toBe(true)
    expect(wrapper.get<HTMLInputElement>(field('languageIds', 2)).element.checked).toBe(true)
    for (const checkbox of wrapper.findAll('input'))
      expect(wrapper.find(`label[for="${checkbox.attributes('id')}"]`).exists()).toBe(true)
    expect(wrapper.emitted('dirty')).toEqual([[false]])
    wrapper.unmount()
  })
  it('keeps multiple genres and languages selected without mutating saved preferences', async () => {
    const wrapper = render()
    await openOptions(wrapper)
    await openOptions(wrapper, 1)
    await wrapper.get(field('genreIds', 1)).setValue(true)
    await wrapper.get(field('languageIds', 1)).setValue(true)
    expect(wrapper.get<HTMLInputElement>(field('genreIds', 2)).element.checked).toBe(true)
    expect(wrapper.get<HTMLInputElement>(field('languageIds', 2)).element.checked).toBe(true)
    expect(wrapper.emitted('dirty')?.slice(-1)[0]).toEqual([true])
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('save')).toEqual([[{ genreIds: [1, 2], languageIds: [1, 2] }]])
    expect(settings.selected).toEqual({ genreIds: [2], languageIds: [2] })
    wrapper.unmount()
  })
  it('allows removing all saved preferences', async () => {
    const wrapper = render()
    for (const group of wrapper.findAll('fieldset')) await group.get('button').trigger('click')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('save')).toEqual([[{ genreIds: [], languageIds: [] }]])
    wrapper.unmount()
  })
  it('allows saving an initially empty configuration even without available catalogs', async () => {
    const wrapper = render({
      genres: [],
      languages: [],
      selected: { genreIds: [], languageIds: [] },
      maxSelections: 1000,
    })
    expect(wrapper.text()).toContain('No hay géneros disponibles')
    expect(wrapper.text()).toContain('No hay idiomas disponibles')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('save')).toEqual([[{ genreIds: [], languageIds: [] }]])
    wrapper.unmount()
  })
  it.each([{ ids: [99] }, { ids: [1, 1] }])(
    'rejects invalid initial IDs $ids and clears feedback when selection is cleared',
    async ({ ids }) => {
      const wrapper = render({ ...settings, selected: { genreIds: ids, languageIds: [] } })
      expect(wrapper.text()).not.toContain('Una de las opciones ya no está disponible')
      await wrapper.get('form').trigger('submit')
      expect(wrapper.emitted('save')).toBeUndefined()
      expect(wrapper.text()).toContain('Una de las opciones ya no está disponible')
      await wrapper.findAll('fieldset')[0]!.get('button').trigger('click')
      expect(wrapper.text()).not.toContain('Una de las opciones ya no está disponible')
      wrapper.unmount()
    },
  )
  it('respects the selection bound supplied by the backend', async () => {
    const wrapper = render({ ...settings, maxSelections: 1 })
    await openOptions(wrapper)
    expect(wrapper.get<HTMLInputElement>(field('genreIds', 1)).element.disabled).toBe(true)
    expect(wrapper.get<HTMLInputElement>(field('genreIds', 2)).element.disabled).toBe(false)
    await wrapper.setProps({
      settings: { ...settings, maxSelections: 1, selected: { genreIds: [1, 2], languageIds: [] } },
    })
    await wrapper.get('form').trigger('submit')
    expect(wrapper.text()).toContain('Selecciona como máximo 1 opción')
    expect(wrapper.emitted('save')).toBeUndefined()
    wrapper.unmount()
  })
  it('tracks reverting a checkbox and discards the local draft when settings are reloaded', async () => {
    const wrapper = render()
    await openOptions(wrapper)
    await openOptions(wrapper, 1)
    await wrapper.get(field('genreIds', 1)).setValue(true)
    await wrapper.get(field('genreIds', 1)).setValue(false)
    expect(wrapper.emitted('dirty')?.slice(-1)[0]).toEqual([false])
    await wrapper.setProps({
      settings: {
        ...settings,
        genres: [{ id: 3, name: 'Nombre actualizado' }],
        selected: { genreIds: [3], languageIds: [] },
      },
    })
    expect(wrapper.text()).toContain('Nombre actualizado')
    await openOptions(wrapper)
    expect(wrapper.get<HTMLInputElement>(field('genreIds', 3)).element.checked).toBe(true)
    await wrapper.get('.preferences-actions button[type="button"]').trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
    expect(wrapper.emitted('save')).toBeUndefined()
    wrapper.unmount()
  })
  it('prevents duplicate submission and cancellation while saving', async () => {
    const wrapper = render(settings, true)
    await wrapper.get('form').trigger('submit')
    await wrapper.get('.preferences-actions button[type="button"]').trigger('click')
    expect(wrapper.emitted('save')).toBeUndefined()
    expect(wrapper.emitted('cancel')).toBeUndefined()
    expect(wrapper.text()).toContain('Guardando…')
    expect(wrapper.findAll('input:disabled')).toHaveLength(2)
    wrapper.unmount()
  })
  it('capitalizes only display labels and keeps all original IDs and catalog names', async () => {
    const value = {
      ...settings,
      genres: [{ id: 1, name: 'acción' }],
      languages: [{ id: 2, name: 'inglés' }],
      selected: { genreIds: [], languageIds: [] },
    }
    const wrapper = render(value)
    await openOptions(wrapper)
    await openOptions(wrapper, 1)
    expect(wrapper.text()).toContain('Acción')
    expect(wrapper.text()).toContain('Inglés')
    await wrapper.get(field('genreIds', 1)).setValue(true)
    await wrapper.get(field('languageIds', 2)).setValue(true)
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('save')).toEqual([[{ genreIds: [1], languageIds: [2] }]])
    expect(value.genres[0]?.name).toBe('acción')
    expect(value.languages[0]?.name).toBe('inglés')
    wrapper.unmount()
  })
  it('finds a language in a large catalog without losing other selections', async () => {
    const wrapper = render({
      ...settings,
      languages: Array.from({ length: 184 }, (_, i) => ({ id: i + 1, name: `idioma ${i + 1}` })),
    })
    expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(0)
    const language = wrapper.findAllComponents(ReusableSearchDropdown)[1]!
    await language.get('.search-input').setValue('idioma 184')
    expect(language.findAll('.dropdown-option')).toHaveLength(1)
    await wrapper.get(field('languageIds', 184)).setValue(true)
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('save')).toEqual([[{ genreIds: [2], languageIds: [2, 184] }]])
    expect(language.findAll('.selected-option')).toHaveLength(2)
    wrapper.unmount()
  })
  it('clears a validation message after replacing an unavailable selection', async () => {
    const wrapper = render({ ...settings, selected: { genreIds: [99], languageIds: [] } })
    await wrapper.get('form').trigger('submit')
    await openOptions(wrapper)
    await wrapper.get(field('genreIds', 1)).setValue(true)
    expect(wrapper.text()).not.toContain('Una de las opciones ya no está disponible')
    wrapper.unmount()
  })
})
