/** Pure naming helpers for the DSH auto-title host plugin. */
export interface NamingMessage {
    readonly role: 'user' | 'assistant';
    readonly text: string;
    readonly seq: number;
    readonly time: number;
    readonly turn?: number;
}
export interface NamingInput {
    readonly currentTitle?: string;
    readonly messages: readonly NamingMessage[];
}
export interface NamingCandidate {
    readonly title: string;
    readonly reason?: string;
}
/** Parse the title JSON object from a model reply. */
export declare function parseNamingReply(reply: string): NamingCandidate | undefined;
/** Validate one title candidate before it reaches the Host rename API. */
export declare function isValidTitle(title: string): boolean;
/** Extract plain text from a durable message content block. */
export declare function textFromContent(content: unknown): string;
/** Keep only the newest user turns and fit them within the model budget. */
export declare function compactMessages(messages: readonly NamingMessage[], recentTurns: number, maxChars: number): readonly NamingMessage[];
/** Build the model-facing prompt for one title update. */
export declare function buildNamingPrompt(input: NamingInput): string;
/** Return true when a user-visible title differs from the plugin's last write. */
export declare function isExternalTitleChange(currentTitle: string | undefined, generatedTitle: string | undefined): boolean;
