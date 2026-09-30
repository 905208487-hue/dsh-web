/**
 * Independent-repository satellite rows.
 *
 * The community-index and preset-center plugins live in their own GitHub
 * repositories and are consumed as published npm packages: the aggregate mounts
 * them through `rows:` (external rows) instead of `patchFrom`/`deps`. External
 * rows mount the real package name directly and are never wrapped by the
 * fault-isolation shell, so this lane pins the invariants that make the
 * arrangement safe:
 *
 * 1. row ids stay byte-identical to the patchFrom era (`web-ui-<family>`), so
 *    existing profiles keep resolving;
 * 2. each active satellite is resolvable from the aggregate and exports
 *    `./package.json` — the subpath `scripts/aggregate.mjs` resolves external
 *    rows through (without it the generator hard-fails);
 * 3. the subpath exports for both active satellites and removed satellites stay
 *    in the package exports as compat tombstones, so a profile that recorded
 *    `@linxin666/dsh-web-all/pet` still imports instead of throwing
 *    ERR_PACKAGE_PATH_NOT_EXPORTED;
 * 4. the declared ranges exclude every active satellite build older than the
 *    0.1.7-rc.1 migration, because a profile upgrade keeps whatever version its
 *    lockfile already resolved.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const PACKAGE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)

/** Package name, aggregate row id and compat subpath of every active external satellite. */
const ACTIVE_SATELLITES = [
  {
    pkg: '@linxin666/dsh-client-ui-community-plugins',
    id: 'web-ui-community-plugins',
    subpath: './community-plugins',
  },
  {
    pkg: '@linxin666/dsh-client-ui-preset-center',
    id: 'web-ui-preset-center',
    subpath: './preset-center',
  },
] as const

/** Removed satellite subpaths remain importable for legacy profile rows only. */
const REMOVED_SATELLITE_TOMBSTONES = ['./pet', './skin-center'] as const

interface InsertRow {
  id: string
  name: string
  plugin?: string
}

/** Parse the generated patch's 4-space insert rows (id, name, optional config.plugin). */
function insertRows(): InsertRow[] {
  const lines = readFileSync(join(PACKAGE_DIR, 'cordis.patch.yml'), 'utf8').split(/\r?\n/)
  const rows: InsertRow[] = []
  for (let i = 0; i < lines.length; i++) {
    const id = lines[i]?.match(/^ {4}- id: (\S+)$/)
    if (!id) continue
    const name = lines[i + 1]?.match(/^ {6}name: '([^']+)'$/)
    if (!name) continue
    const row: InsertRow = { id: id[1] ?? '', name: name[1] ?? '' }
    const plugin = lines[i + 3]?.match(/^ {8}plugin: '([^']+)'$/)
    if (lines[i + 2] === '      config:' && plugin) row.plugin = plugin[1]
    rows.push(row)
  }
  return rows
}

const packageJson = JSON.parse(readFileSync(join(PACKAGE_DIR, 'package.json'), 'utf8')) as {
  exports: Record<string, string>
  dependencies: Record<string, string>
}

describe('satellite rows mount published npm packages', () => {
  it('operator keeps every active satellite row id byte-identical to the patchFrom era', () => {
    // Given the aggregate manifest mounts the active satellites through npm rows,
    const rows = insertRows()
    // When the operator installs the bundle into a profile,
    const installed = ACTIVE_SATELLITES.map(s => rows.find(r => r.id === s.id)?.id)
    // Then every active row keeps the id a profile recorded before the split.
    expect(installed).toEqual(ACTIVE_SATELLITES.map(s => s.id))
  })

  it('operator mounts the real package name directly instead of a family subpath', () => {
    // Given the active satellites are published packages rather than in-repo children,
    const rows = insertRows()
    // When the operator reads one generated row,
    const mounted = ACTIVE_SATELLITES.map(s => rows.find(r => r.id === s.id))
    // Then the row names the package itself and carries no shell wrapper.
    for (const [index, row] of mounted.entries()) {
      const satellite = ACTIVE_SATELLITES[index]
      expect(row?.name, `row ${satellite?.id} must name the package`).toBe(satellite?.pkg)
      expect(row?.plugin, `row ${satellite?.id} must not be shell-wrapped`).toBeUndefined()
      expect(row?.name.startsWith('@linxin666/dsh-web-all/')).toBe(false)
    }
  })

  it('operator does not mount the removed pet or skin-center rows', () => {
    // Given pet and skin-center content are not bundled by this aggregate,
    const rows = insertRows()
    // When the operator reads the generated patch,
    const ids = rows.map(row => row.id)
    // Then neither removed content row is mounted.
    expect(ids).not.toContain('web-ui-pet')
    expect(ids).not.toContain('web-ui-skin-center')
  })

  it('operator declares an explicit semver range rather than a workspace link', () => {
    // Given the active satellites now come from the registry,
    const declared = ACTIVE_SATELLITES.map(s => [s.pkg, packageJson.dependencies[s.pkg]] as const)
    // When the operator inspects the aggregate dependencies,
    const ranges = declared.map(([, range]) => range)
    // Then each active satellite is pinned by a resolvable semver range.
    expect(ranges.filter(range => typeof range === 'string')).toHaveLength(ACTIVE_SATELLITES.length)
    for (const range of ranges) {
      expect(range).not.toBe('workspace:*')
      expect(range).toMatch(/^\^?\d+\.\d+\.\d+/)
    }
  })

  it('operator drops the removed pet and skin-center runtime dependencies', () => {
    // Given removed satellites must not be installed by the aggregate,
    // When the operator inspects the aggregate dependencies,
    // Then their package names are absent from the runtime dependency map.
    expect(packageJson.dependencies['@linxin666/dsh-pet']).toBeUndefined()
    expect(packageJson.dependencies['@linxin666/dsh-client-ui-skin-center']).toBeUndefined()
  })

  it('operator cannot admit an active satellite build older than the host migration', () => {
    // Given the satellites version on their own line and a profile upgrade
    // keeps the version its lockfile already resolved,
    const floors = ACTIVE_SATELLITES.map(s => packageJson.dependencies[s.pkg])
    // When the operator inspects the declared ranges,
    // Then none of them admits 0.3.24: that build still injects the retired
    // settingsScope service, so a satisfied range would silently keep a client
    // half that waits for it forever.
    for (const range of floors) {
      const floor = String(range).replace(/^[^\d]*/, '').split('.').map(Number)
      const atOrAboveMigration = floor[0] > 0
        || floor[1] > 3
        || (floor[1] === 3 && floor[2] >= 25)
      expect(atOrAboveMigration).toBe(true)
    }
  })

  it('operator can resolve each active satellite package.json as the generator does', () => {
    // Given aggregate.mjs resolves an external row through the package manifest,
    const manifests = ACTIVE_SATELLITES.map(s => {
      const path = require.resolve(`${s.pkg}/package.json`, { paths: [PACKAGE_DIR] })
      return JSON.parse(readFileSync(path, 'utf8')) as {
        name: string
        exports?: Record<string, string>
      }
    })
    // When the operator resolves every active satellite,
    const resolved = manifests.map(manifest => [manifest.name, manifest.exports?.['./package.json']])
    // Then each one names itself and exports the manifest subpath the row needs.
    expect(resolved).toEqual(ACTIVE_SATELLITES.map(s => [s.pkg, './package.json']))
  })

  it('operator keeps historical subpath exports alive as compat tombstones for old profiles', () => {
    // Given profiles written before the split recorded the aggregate subpath,
    const subpaths = [...ACTIVE_SATELLITES.map(s => s.subpath), ...REMOVED_SATELLITE_TOMBSTONES]
    // When the operator inspects the generated exports map,
    const resolved = subpaths.map(subpath => [subpath, packageJson.exports[subpath]] as const)
    // Then every historical subpath still resolves to the shared shell re-export.
    expect(resolved).toEqual(subpaths.map(subpath => [subpath, './lib/shells/shell.js']))
  })

  it('operator no longer inlines the active satellites as client children', () => {
    // Given the active satellites ship their own loader client entry,
    const children = JSON.parse(
      readFileSync(join(PACKAGE_DIR, 'src/client/children.specifiers.json'), 'utf8'),
    ) as { name: string }[]
    // When the operator inspects the aggregate client mount list,
    const inlined = new Set(children.map(child => child.name))
    // Then none of them is inlined into the aggregate bundle any more.
    const stillInlined = ACTIVE_SATELLITES.filter(s => inlined.has(s.pkg)).map(s => s.pkg)
    expect(stillInlined).toEqual([])
  })
})
