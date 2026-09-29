export interface AutoTitleSessionState {
    lastProcessedSeq?: number;
    generatedTitle?: string;
    locked?: boolean;
    lastError?: string;
}
export interface AutoTitleState {
    schemaVersion: 1;
    sessions: Record<string, AutoTitleSessionState>;
}
export declare function emptyState(): AutoTitleState;
export declare function parseState(value: unknown): AutoTitleState;
export declare class AutoTitleStateStore {
    readonly path: string;
    private state;
    constructor(path: string);
    load(): Promise<AutoTitleState>;
    mutate(mutator: (state: AutoTitleState) => void): Promise<void>;
    private save;
}
