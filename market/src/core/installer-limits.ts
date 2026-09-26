/**
 * Market installer limits owned by the site: the dsh-market.com build asserts
 * every catalog asset against the same ceiling the (removed) in-GUI installer
 * enforced, so the constant lives here now that the store plugin is gone.
 * @module market/core/installer-limits
 */

/** Upper bound on the files one installable asset may carry. */
export const MAX_FILES_PER_ASSET = 2000
