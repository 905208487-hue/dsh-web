/**
 * Composer refill: put recalled text back into the official conversation
 * composer. The shell's composer is a controlled contenteditable textbox
 * (`[role="textbox"][contenteditable="true"]`, falling back to a visible
 * textarea), so the text is written directly and an `input` event is
 * dispatched for the shell to pick it up.
 * @module @linxin666/dsh-recall/client/composer
 */
/** The conversation composer element (null when no chat view is open). */
export declare function composerElement(): HTMLElement | null;
/** Fill the composer with text (no-op when the composer is absent). */
export declare function fillComposer(text: string): void;
