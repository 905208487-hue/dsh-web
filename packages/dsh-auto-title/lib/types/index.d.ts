import type { Context, Volatile } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { type AutoTitleConfig } from './host/service.ts';
export declare const inject: string[];
/**
 * Plugin config, validated by the same-named schemastery schema.
 *
 * This schema IS the plugin's settings form: the Host serves one configuration
 * form per profile entry from the entry's own Config, and it only does so for
 * fields marked volatile. A field without that marker is skipped by the form
 * projection and refused by the settings write path, so every editable field
 * here is volatile and read live at use time.
 */
export interface Config {
    /** Master switch for background title maintenance. */
    enabled?: Volatile<boolean>;
    /** Optional `provider/model` route; empty falls back to the session's last used model. */
    modelRoute?: Volatile<string>;
    /** Poll interval in milliseconds. */
    intervalMs?: Volatile<number>;
    /** How many recent user turns are sent to the title model. */
    recentTurns?: Volatile<number>;
    /** Maximum excerpt size in characters sent to the title model. */
    maxContextChars?: Volatile<number>;
    /** Upper bound of sessions processed per poll. */
    maxSessionsPerTick?: Volatile<number>;
    /** Whether subagent sessions are renamed too. */
    includeSubagents?: Volatile<boolean>;
    /** Lock a session when its title is changed outside this plugin. */
    protectExternalTitles?: Volatile<boolean>;
}
/**
 * The same fields as {@link Config}, widened to also accept plain values: a
 * programmatic mount (a test or a hand-built Host context) passes resolved
 * values while the Loader passes volatile references, and the reader below
 * answers both.
 */
export interface AutoTitleConfigInput {
    enabled?: Volatile<boolean> | boolean;
    modelRoute?: Volatile<string> | string;
    intervalMs?: Volatile<number> | number;
    recentTurns?: Volatile<number> | number;
    maxContextChars?: Volatile<number> | number;
    maxSessionsPerTick?: Volatile<number> | number;
    includeSubagents?: Volatile<boolean> | boolean;
    protectExternalTitles?: Volatile<boolean> | boolean;
}
/** The schema is inferred, not annotated: volatile fields accept a plain value and parse to a live reference. */
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    enabled: z<boolean, boolean, "volatile-defined">;
    modelRoute: z<string, string, "volatile-defined">;
    intervalMs: z<number, number, "volatile-defined">;
    recentTurns: z<number, number, "volatile-defined">;
    maxContextChars: z<number, number, "volatile-defined">;
    maxSessionsPerTick: z<number, number, "volatile-defined">;
    includeSubagents: z<boolean, boolean, "volatile-defined">;
    protectExternalTitles: z<boolean, boolean, "volatile-defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    enabled: z<boolean, boolean, "volatile-defined">;
    modelRoute: z<string, string, "volatile-defined">;
    intervalMs: z<number, number, "volatile-defined">;
    recentTurns: z<number, number, "volatile-defined">;
    maxContextChars: z<number, number, "volatile-defined">;
    maxSessionsPerTick: z<number, number, "volatile-defined">;
    includeSubagents: z<boolean, boolean, "volatile-defined">;
    protectExternalTitles: z<boolean, boolean, "volatile-defined">;
}>>, "plain">;
declare module '@deepseek-ai/cordis' {
    interface Events {
        /**
         * Volatile config values were committed into the running fiber without a
         * remount; dispatched to the owning fiber only. Spelled here because the
         * Loader package is not a dependency of this plugin, with the Loader's own
         * shape so the two declarations merge when a Host program carries both.
         * @param paths - changed config paths as key arrays; every value is committed before dispatch.
         * @mode emit
         */
        'loader/volatile-update'(paths: readonly (readonly string[])[]): void;
    }
}
/**
 * Read one config field's current value. The Loader hands schema-volatile
 * fields as stable references it commits in place, so a live value must be read
 * at use time rather than captured when the plugin activates.
 * @param field - the config field as the Loader handed it.
 * @param fallback - value to use when the field is absent.
 * @returns the effective field value.
 */
export declare function readConfigField<T>(field: Volatile<T> | T | undefined, fallback: T): T;
/** Snapshot the live config into the plain shape the service consumes. */
export declare function readAutoTitleConfig(config: AutoTitleConfigInput | undefined): AutoTitleConfig;
export declare const apply: (ctx: Context, config?: Config) => void;
