# Agent Note: Sidebar Update Trigger Renders Text Badge When an Update Is Available

Status: superseded by [the family self-update is its own plugin row](../architecture/2026-09-25-self-update-own-plugin-row.md); the visible footer trigger is removed, so this note records the retired badge behavior.

## Problem

The retired `dsh-update` sidebar footer trigger used to render a check-for-updates download button (it was `dsh-remote-web-ui` before the self-update split; see [the split note](../architecture/2026-09-25-self-update-own-plugin-row.md)). When the background probe detected a newer release (`updateAvailable === true`), it only showed a small dot badge (`::after`) on the download icon. The visual indicator was subtle and easy to overlook.

## Decision

- **Text Badge Rendering**: When an update is detected, the sidebar update trigger displays an explicit "Update available" text badge (`update.badge` key) next to the download icon.
- **Wide vs Rail Mode Adaptation**:
  - **Wide expanded mode (`wide === true`)**: The button expands into a pill button (`border-radius: 999px`, `flex: none; width: auto; padding: 0 10px; gap: 6px;`), rendering the icon and text side by side and suppressing the floating corner dot to avoid visual clutter.
  - **Rail collapsed mode (`wide === false`, 56px rail)**: Retains the 36px circular geometry, hides the text label, and preserves the top-right corner dot badge so 56px rail layout is not disturbed.
- **Internationalization (i18n)**:
  - Chinese (`zh`): `'update.badge': '有更新'`
  - English (`en`): `'update.badge': 'Update available'`
  - Russian (`ru`): `'update.badge': 'Есть обновление'` (synchronized in `packages/dsh-i18n/src/client/ru/update.ts`).

## Alternatives considered

- Relying solely on hover `title` / tooltip: Missed by users who do not hover over the icon.
- Forcing text display in rail mode: Breaks the 56px rail geometry and causes awkward overflow clipping.

## Consequences

- While the footer trigger existed, users in the expanded sidebar immediately saw that a newer version was available.
- Switching between rail and wide modes remained fluid and maintained the `#1035` uniform rounding family.
