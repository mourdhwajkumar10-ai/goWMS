# Putaway RF Session Consolidation

**Date:** 2026-08-27
**Status:** Approved design

## Goal

Use one canonical, session-based putaway workflow for desktop and RF while preserving the existing RF visual structure and the receiving wizard's animation language. Remove duplicate operational paths and prevent operators from skipping physical item/bin verification.

## Scope

- Keep `/putaway` as the canonical operational screen.
- Make `/putaway-runner` a compatibility redirect to `/putaway`.
- Keep `/putaway/logs` as the audit screen.
- Migrate RF behavior from direct stock movement to putaway sessions.
- Preserve existing RF layout primitives, scan cards, tabs, scanner viewport, bottom scan bar, buttons, and animation classes.
- Remove only controls that conflict with the enforced sequence, such as unverified one-click placement and unscanned alternate-location switching.
- Keep receiving-wizard animation conventions; do not redesign the RF shell.

## Canonical RF skeleton

The RF screen keeps its existing structure:

1. `ScannerLayout` header and toast bar.
2. Modes/back controls.
3. Optional zone tabs.
4. Scanner viewport.
5. Bottom scan input bar.
6. Current work card.
7. Suggested-location card.
8. Sequence status card/action area.
9. Queue list.
10. Empty state.

Only the state/action content changes.

### RF states

```text
mode_select
  -> item_scan
  -> item_selected
  -> picked
  -> destination_scan
  -> destination_selected
  -> item_confirmation_scan
  -> ready_to_place
  -> placed
  -> complete
```

Invalid scans return to the same state and show a toast; they do not silently advance the workflow.

## Happy path

1. Operator chooses zone or item mode.
2. Operator scans or selects an item from the queue.
3. Server creates/reuses the operator's active putaway session.
4. Server validates and reserves source quantity.
5. RF shows the picked item and suggested bin.
6. Operator physically travels to the bin.
7. Operator scans the destination bin.
8. Server validates the bin and warehouse.
9. Operator scans the item again at the destination.
10. RF enables Place only after both scans match.
11. Server atomically moves the quantity and writes the audit record.
12. RF refreshes queue and repeats until empty.
13. Completion is accepted only when the server reports no pending picked quantities.

## Backend contract

Canonical operational endpoints:

- `GET /putaway/queue`
- `GET /putaway/queue/zones`
- `GET /putaway/suggest`
- `POST /putaway/sessions`
- `GET /putaway/sessions/:id`
- `POST /putaway/sessions/:id/pick`
- `POST /putaway/sessions/:id/place/:itemId`
- `POST /putaway/sessions/:id/complete`
- `DELETE /putaway/sessions/:id`
- `POST /putaway/sessions/:id/heartbeat`
- `POST /putaway/fit-exception`

The direct movement endpoints are not used by RF or desktop:

- `POST /putaway/`
- `POST /grn/putaway`

They must be deprecated/fail-closed after clients are migrated.

## Server-side controls

- Every putaway route requires `putaway.access`.
- Override placement requires `putaway.override`.
- A session item can only be placed by its owner unless an authorized override is used.
- Quantity must be positive and cannot exceed the picked quantity.
- Destination must belong to the session warehouse and be an active storage/pick-face location.
- Manual/non-suggested destination changes require supervisor authorization and an audit reason.
- Placement is transactional and idempotent.
- Completion rejects sessions with remaining picked quantity or unresolved pending stock.

## Edge cases

- Item scan not in queue: warn and remain in item-scan state.
- Destination scan not found: warn and remain in destination-scan state.
- Wrong item at destination: reject and remain in item-confirmation state.
- Wrong warehouse/disabled/non-storage destination: reject.
- Full, mixed, weight-limited, or volume-limited bin: show exception action.
- Partial placement: retain remaining quantity and request another destination.
- Duplicate scan or network retry: do not double move stock.
- Session refresh/reconnect: reload the active session and preserve state.
- Cancelled/expired session: release reservations and require a new session.
- Another operator's session: reject unless authorized supervisor override.
- Direct legacy API call: reject for normal operational use.
- Completion before physical placement: reject.

## UI items to retain

- Existing RF shell and `ScannerLayout`.
- Existing camera viewport and bottom scan input.
- Existing mode and zone selection.
- Existing queue and suggestion cards.
- Existing toast and scan feedback.
- Existing receiving-wizard-compatible animation classes.

## UI items to remove or replace

- Direct one-click placement that bypasses pick/session state.
- `Try next location` behavior that changes the target without a physical scan.
- Quantity editing that can exceed picked quantity or silently correct invalid input.
- Any completion action that trusts only client-side state.

## Implementation slices

1. Add/verify backend session completion and authorization contracts with tests.
2. Migrate RF selection/pick to session creation and session pick.
3. Add RF destination scan and item re-scan states without changing shell structure.
4. Route RF and desktop through the canonical session placement API.
5. Deprecate direct movement clients/routes.
6. Redirect the runner route and remove duplicate operational implementation after verification.
7. Run backend/frontend tests and build; manually verify RF sequence and animation preservation.
