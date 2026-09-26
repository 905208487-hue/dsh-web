/**
 * Composer refill: put recalled text back into the official conversation
 * composer. The shell's composer is a controlled contenteditable textbox
 * (`[role="textbox"][contenteditable="true"]`, falling back to a visible
 * textarea), so the text is written directly and an `input` event is
 * dispatched for the shell to pick it up.
 * @module @linxin666/dsh-recall/client/composer
 */

/** The conversation composer element (null when no chat view is open). */
export function composerElement(): HTMLElement | null {
  const pane = document.querySelector('[data-pane="conversation"]')
  if (pane === null) return null
  for (const el of pane.querySelectorAll<HTMLElement>('[role="textbox"][contenteditable="true"], textarea')) {
    if (el.offsetParent !== null) return el
  }
  return null
}

/** Fill the composer with text (no-op when the composer is absent). */
export function fillComposer(text: string): void {
  const el = composerElement()
  if (el === null || text.length === 0) return
  el.focus()
  if (el instanceof HTMLTextAreaElement) {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
    if (setter !== undefined) setter.call(el, text)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    return
  }
  // Contenteditable path: replace children, keep one text node, and emit the
  // input event the shell's onChange listens for.
  el.textContent = ''
  el.appendChild(el.ownerDocument.createTextNode(text))
  const sel = el.ownerDocument.getSelection()
  sel?.removeAllRanges()
  const range = el.ownerDocument.createRange()
  range.selectNodeContents(el)
  range.collapse(false)
  sel?.addRange(range)
  el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }))
}