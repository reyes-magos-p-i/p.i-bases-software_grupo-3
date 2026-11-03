// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ImageUpload from '@/components/image/ImageUpload.vue'

const NativeURL = URL
const createObjectURL = vi.fn()
const revokeObjectURL = vi.fn()
const wrappers: ReturnType<typeof mount>[] = []

function render(props: Record<string, unknown> = {}) {
  const wrapper = mount(ImageUpload, {
    props: {
      ...props,
      'onUpdate:modelValue': (value: File | null) => {
        void wrapper.setProps({ modelValue: value })
      },
    },
  })
  wrappers.push(wrapper)
  return wrapper
}

function image(name = 'poster.png', type = 'image/png', size = 10) {
  return new File([new Uint8Array(size)], name, { type })
}

// The component only reads length and numeric indexes from FileList.
async function choose(wrapper: ReturnType<typeof render>, files: File[]) {
  const input = wrapper.get('input[type="file"]')
  Object.defineProperty(input.element, 'files', {
    configurable: true,
    value: files,
  })
  await input.trigger('change')
}

beforeEach(() => {
  createObjectURL.mockReset().mockReturnValue('blob:poster')
  revokeObjectURL.mockReset()
  vi.stubGlobal('URL', class extends NativeURL {
    static createObjectURL = createObjectURL
    static revokeObjectURL = revokeObjectURL
  })
})

afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('ImageUpload', () => {
  it('renders the default label, accepted types and initial filename event', () => {
    const wrapper = render()

    expect(wrapper.text()).toContain('Imagen')
    expect(wrapper.get('input').attributes('accept')).toBe('image/jpeg,image/png,image/webp')
    expect(wrapper.emitted('filename-change')).toEqual([[null]])
    expect(wrapper.find('img').exists()).toBe(false)
  })

  it('uses a custom accessible label and opens the picker', async () => {
    const wrapper = render({ label: 'Póster' })
    const zone = wrapper.get('.drop-zone')
    const labelId = zone.attributes('aria-labelledby')
    expect(wrapper.get(`[id="${labelId}"]`).text()).toBe('Póster')
    const click = vi.spyOn(wrapper.get('input').element, 'click')

    await zone.trigger('click')

    expect(click).toHaveBeenCalledOnce()
  })

  it.each(['image/jpeg', 'image/png', 'image/webp'])(
    'accepts %s and displays its preview and filename',
    async (type) => {
      const wrapper = render()
      const file = image('poster', type)

      await choose(wrapper, [file])

      expect(wrapper.emitted('update:modelValue')).toEqual([[file]])
      expect(wrapper.emitted('filename-change')).toEqual([[null], ['poster']])
      expect(createObjectURL).toHaveBeenCalledWith(file)
      expect(wrapper.get('img').attributes('src')).toBe('blob:poster')
      expect(wrapper.get('.filename').text()).toBe('poster')
      expect(wrapper.find('[role="alert"]').exists()).toBe(false)
      expect((wrapper.get('input').element as HTMLInputElement).value).toBe('')
    },
  )

  it.each([
    { files: () => [image(), image()], message: 'Seleccione solamente una imagen.' },
    { files: () => [image('poster.gif', 'image/gif')], message: 'Solo se permiten imágenes JPEG, PNG o WebP.' },
    { files: () => [image('poster.png', 'image/png', 0)], message: 'La imagen está vacía.' },
    { files: () => [image('poster.png', 'image/png', 5 * 1024 * 1024 + 1)], message: 'La imagen debe pesar como máximo 5 MB.' },
  ])('rejects invalid input: $message', async ({ files, message }) => {
    const wrapper = render()

    await choose(wrapper, files())

    expect(wrapper.get('[role="alert"]').text()).toBe(message)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(createObjectURL).not.toHaveBeenCalled()
  })

  it('accepts an image of exactly 5 MB', async () => {
    const wrapper = render()
    const file = image('poster.png', 'image/png', 5 * 1024 * 1024)

    await choose(wrapper, [file])

    expect(wrapper.emitted('update:modelValue')).toEqual([[file]])
  })

  it('ignores an empty file selection', async () => {
    const wrapper = render()
    await choose(wrapper, [])
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('keeps the previous selection when an invalid file is chosen, then clears the error on valid input', async () => {
    const wrapper = render()
    await choose(wrapper, [image()])
    await choose(wrapper, [image('invalid.gif', 'image/gif')])
    expect(wrapper.get('.filename').text()).toBe('poster.png')
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)

    await choose(wrapper, [image('new.png')])

    expect(wrapper.get('.filename').text()).toBe('new.png')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('shows an existing image and restores it after clearing the selection', async () => {
    const wrapper = render({ existingImageUrl: '/existing.jpg' })
    expect(wrapper.get('img').attributes('src')).toBe('/existing.jpg')
    await choose(wrapper, [image()])
    expect(wrapper.get('img').attributes('src')).toBe('blob:poster')

    await wrapper.findAll('button')[1]!.trigger('click')

    expect(wrapper.emitted('update:modelValue')?.slice(-1)[0]).toEqual([null])
    expect(wrapper.emitted('filename-change')?.slice(-1)[0]).toEqual([null])
    expect(wrapper.find('.filename').exists()).toBe(false)
    expect(wrapper.get('img').attributes('src')).toBe('/existing.jpg')
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:poster')
  })

  it('handles dragging, leaving and dropping an image', async () => {
    const wrapper = render()
    const zone = wrapper.get('.drop-zone')
    const file = image()
    const dataTransfer = { files: [file], dropEffect: 'none' }

    await zone.trigger('dragover', { dataTransfer })
    expect(zone.classes()).toContain('drop-zone--dragging')
    expect(dataTransfer.dropEffect).toBe('copy')
    await zone.trigger('dragleave')
    expect(zone.classes()).not.toContain('drop-zone--dragging')
    await zone.trigger('dragover', { dataTransfer })
    await zone.trigger('drop', { dataTransfer })

    expect(zone.classes()).not.toContain('drop-zone--dragging')
    expect(wrapper.emitted('update:modelValue')).toEqual([[file]])
  })

  it('disables the picker and ignores selection and dropping while disabled', async () => {
    const wrapper = render({ disabled: true, modelValue: image('original.png') })
    expect((wrapper.get('input').element as HTMLInputElement).disabled).toBe(true)
    expect(wrapper.findAll('button').every((button) => (button.element as HTMLButtonElement).disabled)).toBe(true)

    await choose(wrapper, [image('new.png')])
    await wrapper.get('.drop-zone').trigger('dragover')
    await wrapper.get('.drop-zone').trigger('drop', { dataTransfer: { files: [image()] } })
    await wrapper.findAll('button')[1]!.trigger('click')

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.get('.filename').text()).toBe('original.png')
    expect(wrapper.get('.drop-zone').classes()).not.toContain('drop-zone--dragging')
  })

  it('releases each preview URL when the model changes and on unmount', async () => {
    createObjectURL.mockReturnValueOnce('blob:first').mockReturnValueOnce('blob:second')
    const wrapper = render({ modelValue: image('first.png') })

    await wrapper.setProps({ modelValue: image('second.png') })

    expect(revokeObjectURL.mock.calls).toEqual([['blob:first']])
    expect(wrapper.get('img').attributes('src')).toBe('blob:second')
    wrappers.splice(wrappers.indexOf(wrapper), 1)
    wrapper.unmount()
    expect(revokeObjectURL.mock.calls).toEqual([['blob:first'], ['blob:second']])
  })
})
