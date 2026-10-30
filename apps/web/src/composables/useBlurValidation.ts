import { onBeforeUnmount, onMounted } from 'vue'

const ACTION_SELECTOR =
  'button, a[href], [role="button"], [aria-haspopup], summary, select, input[type="button"], input[type="submit"], input[type="reset"], input[type="checkbox"], input[type="radio"]'

function isAction(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    (target instanceof HTMLDialogElement || target.closest(ACTION_SELECTOR) !== null)
  )
}

export function useBlurValidation() {
  let pointerAction = false
  let releaseTimer: ReturnType<typeof setTimeout> | undefined

  function reset() {
    clearTimeout(releaseTimer)
    releaseTimer = undefined
    pointerAction = false
  }

  function pointerDown(event: PointerEvent) {
    reset()
    pointerAction = event.button === 0 && isAction(event.target)
  }

  function pointerUp() {
    if (!pointerAction) return
    // Touch focus can move after pointerup; keep the intent until click or the next task.
    releaseTimer = setTimeout(reset, 0)
  }

  onMounted(() => {
    document.addEventListener('pointerdown', pointerDown, true)
    document.addEventListener('pointerup', pointerUp, true)
    for (const type of ['pointercancel', 'click', 'keydown'] as const) {
      document.addEventListener(type, reset, true)
    }
    window.addEventListener('blur', reset)
  })

  onBeforeUnmount(() => {
    reset()
    document.removeEventListener('pointerdown', pointerDown, true)
    document.removeEventListener('pointerup', pointerUp, true)
    for (const type of ['pointercancel', 'click', 'keydown'] as const) {
      document.removeEventListener(type, reset, true)
    }
    window.removeEventListener('blur', reset)
  })

  return (event: FocusEvent): boolean => !pointerAction && !isAction(event.relatedTarget)
}
