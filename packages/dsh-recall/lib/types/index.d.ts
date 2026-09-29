/**
 * Host entry of the dsh-recall plugin: registers the recall rollback route
 * (POST /api/dsh-recall/rollback, loopback-fenced) on the harness web server.
 * @module @linxin666/dsh-recall
 */
import type { Context } from '@deepseek-ai/cordis';
export declare const name = "dsh-recall";
export declare const inject: readonly ["webServer"];
/** Register the recall rollback route. */
export declare function apply(ctx: Context): void;
