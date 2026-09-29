import type { TypertGateway } from '@deepseek-ai/dsh-api-gateway';
import { type LlmRuntime } from '@deepseek-ai/dsh-llm';
interface GatewayRequest {
    namespace: string;
    method: string;
    args: Record<string, unknown>;
    signal?: AbortSignal;
}
interface GatewayFace {
    invoke(request: GatewayRequest): Promise<unknown>;
    stream?(request: GatewayRequest): Promise<AsyncIterable<unknown>>;
}
export interface AutoTitleConfig {
    enabled: boolean;
    modelRoute: string;
    intervalMs: number;
    recentTurns: number;
    maxContextChars: number;
    maxSessionsPerTick: number;
    includeSubagents: boolean;
    protectExternalTitles: boolean;
}
export declare const DEFAULT_AUTO_TITLE_CONFIG: AutoTitleConfig;
export declare class AutoTitleService {
    private readonly getConfig;
    private readonly getLlm;
    private timer;
    private disposed;
    private ticking;
    private readonly gateway;
    private readonly store;
    /** Interval the live timer was armed with, so a config commit can re-arm only on change. */
    private armedIntervalMs;
    constructor(gateway: TypertGateway | GatewayFace, getConfig: () => AutoTitleConfig, getLlm: () => LlmRuntime | undefined, statePath?: string);
    /**
     * Arm the poll timer from the current config. Called once at activation and
     * again after every Volatile config commit, so an enable switch, a disabled
     * row and an interval edit all take effect without a remount.
     */
    applyConfig(): void;
    dispose(): void;
    tick(): Promise<void>;
    private process;
    private markProcessed;
    private generateTitle;
    private readSnapshot;
    private invoke;
    private stream;
}
export {};
