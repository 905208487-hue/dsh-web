/**
 * Standalone tsdown config for the dsh-recall plugin skeleton.
 *
 * Uses the repo's shared client-bundle preset (shared/tsdown.client.ts). The
 * host half bundles the pure-JS `fzstd` decompressor inline (the dsh host
 * loader resolves only platform/peer specifiers, so a bare 'fzstd' import
 * would fail at plugin load); the client half stays dependency-free.
 */
import { clientBundle } from '../../shared/tsdown.client.ts'

export default clientBundle('@linxin666/dsh-recall', ['src/index.ts'], {
  lib: { noExternal: [/^fzstd$/] },
})
