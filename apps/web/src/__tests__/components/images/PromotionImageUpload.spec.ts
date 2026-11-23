// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'

import PromotionImageUpload from '@/components/image/PromotionImageUpload.vue'

// Test only this wrapper's contract. ImageUpload's validation and preview behavior
// belong in ImageUpload.spec.ts; this stub does not implement either behavior.
vi.mock('@/components/image/ImageUpload.vue', () => ({
  default: {
    name: 'ImageUpload',
    props: ['modelValue', 'label', 'disabled', 'existingImageUrl'],
    emits: ['update:modelValue', 'filename-change'],
    template: '<div class="image-upload"><button type="button" :disabled="disabled">Select image</button></div>',
  },
}))

let wrapper: VueWrapper
function render(props = {}) {
  wrapper = mount(PromotionImageUpload, { props })
  return wrapper
}
function child() {
  return wrapper.findComponent({ name: 'ImageUpload' })
}

afterEach(() => { wrapper?.unmount() })

describe('PromotionImageUpload', () => {
  it('forwards the default props and null file model', () => {
    render()
    expect(child().props()).toEqual({
      modelValue: null,
      label: 'Póster de la promoción',
      disabled: false,
      existingImageUrl: null,
    })
  })

  it('forwards a custom label, disabled state, and existing image URL', () => {
    render({
      label: 'Banner de la promoción',
      disabled: true,
      existingImageUrl: '/api/image-handler/promotions/banner.webp',
    })
    expect(child().props('label')).toBe('Banner de la promoción')
    expect(child().props('disabled')).toBe(true)
    expect(child().props('existingImageUrl')).toBe('/api/image-handler/promotions/banner.webp')
  })

  it('updates child props when the parent changes them', async () => {
    render()
    await wrapper.setProps({
      label: 'Nueva imagen',
      disabled: true,
      existingImageUrl: '/api/image-handler/promotions/new.webp',
    })
    expect(child().props('label')).toBe('Nueva imagen')
    expect(child().props('disabled')).toBe(true)
    expect(child().props('existingImageUrl')).toBe('/api/image-handler/promotions/new.webp')
    await wrapper.setProps({ disabled: false, existingImageUrl: null })
    expect(child().props('disabled')).toBe(false)
    expect(child().props('existingImageUrl')).toBeNull()
  })

  it('passes an initial File to ImageUpload without changing it', () => {
    const file = new File(['image'], 'banner.png', { type: 'image/png' })
    render({ modelValue: file })
    expect(child().props('modelValue')).toBe(file)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('reflects file model changes made by the parent', async () => {
    render()
    const file = new File(['image'], 'banner.webp', { type: 'image/webp' })
    await wrapper.setProps({ modelValue: file })
    expect(child().props('modelValue')).toBe(file)
    await wrapper.setProps({ modelValue: null })
    expect(child().props('modelValue')).toBeNull()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('emits an updated file when ImageUpload selects one', async () => {
    render()
    const file = new File(['image'], 'banner.png', { type: 'image/png' })
    child().vm.$emit('update:modelValue', file)
    await nextTick()
    expect(wrapper.emitted('update:modelValue')).toEqual([[file]])
  })

  it('emits null when ImageUpload clears the selection', async () => {
    const file = new File(['image'], 'banner.png', { type: 'image/png' })
    render({ modelValue: file })
    child().vm.$emit('update:modelValue', null)
    await nextTick()
    expect(wrapper.emitted('update:modelValue')).toEqual([[null]])
  })

  it('forwards the filename-change event', async () => {
    render()
    child().vm.$emit('filename-change', 'banner.webp')
    await nextTick()
    expect(wrapper.emitted('filename-change')).toEqual([['banner.webp']])
  })

  it('forwards null filenames when the child clears its filename', async () => {
    render()
    child().vm.$emit('filename-change', null)
    await nextTick()
    expect(wrapper.emitted('filename-change')).toEqual([[null]])
  })

  it('keeps file and filename events separate', async () => {
    render()
    child().vm.$emit('filename-change', 'banner.png')
    await nextTick()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    const file = new File(['image'], 'banner.png', { type: 'image/png' })
    child().vm.$emit('update:modelValue', file)
    await nextTick()
    expect(wrapper.emitted('filename-change')).toEqual([['banner.png']])
    expect(wrapper.emitted('update:modelValue')).toEqual([[file]])
  })

  it('applies the wrapper class used by the landscape styles', () => {
    render()
    expect(child().classes()).toContain('promotion-image-upload')
  })
})
