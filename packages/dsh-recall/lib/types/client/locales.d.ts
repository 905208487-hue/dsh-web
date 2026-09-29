/**
 * Client locale dictionary for the recall namespace (zh is the key source).
 * @module @linxin666/dsh-recall/client/locales
 */
export declare const NS = "dsh-web-ui-recall";
export declare const zh: {
    'recall.button': string;
    'recall.hint': string;
    'recall.confirm': string;
    'recall.failed': string;
};
export declare const en: {
    'recall.button': string;
    'recall.hint': string;
    'recall.confirm': string;
    'recall.failed': string;
};
/** Dictionary keys of the recall namespace. */
export type RecallKey = keyof typeof zh;
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** dsh-recall UI copy. */
        'dsh-web-ui-recall': RecallKey;
    }
}
