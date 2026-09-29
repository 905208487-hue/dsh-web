/**
 * Client entry: registers the recall locale and mounts the trigger at the
 * open conversation's tail.
 * @module @linxin666/dsh-recall/client
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
export declare const inject: readonly ["locale"];
/** Mount the recall trigger behind the conversation flow tail. */
export declare function apply(ctx: ClientContext): void;
