# Plan: Fix Chat Ending Duplicate Toast and Wave Ignore State (Revised and Hardened)

## Bug 1 -- Duplicate Toast on Chat End + Missing Toast for Other User

### Root Cause

When user A ends a chat:

1. endChat('manual') in useChat.ts updates the DB and immediately sets chatState.endedReason = 'manual' and chatState.wasEndedByMe = true
2. Chat.tsx has a useEffect that listens to endedReason and shows a toast
3. Supabase Realtime emits an UPDATE event for the same conversation
4. The Realtime handler sets chatState again with the same values
5. The useEffect runs again, producing a second toast

For user B:
- The Realtime handler sets endedReason = 'manual' and wasEndedByMe = false
- However, the toast effect may not run reliably if clearEndedReason() was triggered too early or the effect does not detect a proper state transition
- Result: sometimes no toast appears for user B

### Correct Fix (Do NOT Skip State Sync)

Do NOT skip updating state in Realtime when updated.encerrado_por === user.id

Skipping state sync introduces divergence after reload or remount.

Instead, prevent duplicate toasts by ensuring the toast effect only fires on a real state transition.

### Implementation

File: src/hooks/useChat.ts

- Keep the Realtime UPDATE handler always syncing DB to state
- Always update endedReason and wasEndedByMe based on DB
- Ensure the assignment is idempotent and reflects DB truth
- Do not add conditional skip based on updated.encerrado_por === user.id

File: src/pages/Chat.tsx

Modify the toast useEffect so it fires only on transition from NOT ended to ended.

Implementation logic:

1. Create a ref, for example previousEndedRef
2. In useEffect:
   - If previousEndedRef.current is null
   - AND chatState.endedReason === 'manual'
   - THEN show toast
3. After evaluation, update previousEndedRef.current with chatState.endedReason

Toast rules:
- If wasEndedByMe === true → show "Conversa encerrada por você"
- If wasEndedByMe === false → show "Conversa encerrada pela outra pessoa"

This guarantees:
- User who ends sees exactly one toast
- Other user sees exactly one toast
- Reload does not retrigger toast
- Realtime keeps state consistent

Risk: Low
- No removal of logic
- No sync skipped
- No impact on presence, visibility, block, mute or cooldown
- Fix isolated to UI side effects

------------------------------------------------------------------

## Bug 2 -- Ignore Wave Does Not Update Persistent State

### Root Cause

ignoreWave only:
- Removes wave from local UI state
- Updates visualizado: true in DB

It does NOT change status from 'pending'

Consequences:
- deriveFacts still detects status === 'pending'
- Button remains "Responder aceno"
- Sender remains "Aceno enviado"
- Any refetch or Realtime restores previous UI state

This is a persistence bug, not a UI bug.

### Domain Decision

Reuse existing allowed status 'expired'

Allowed by constraint:
- 'pending'
- 'accepted'
- 'expired'

Decision:
'expired' represents a terminal non-accepted wave (timeout or manual ignore)

No new status
No migration

### Implementation

File: src/hooks/useWaves.ts

Rewrite ignoreWave:

1. Optimistically remove from local state
2. Decrease unread counter
3. Update DB with:
   - status: 'expired'
   - visualizado: true
4. Log error if update fails
5. Do not rely only on local filtering

DB must remain source of truth.

### Realtime Propagation

Because useInteractionData subscribes to waves:

When status changes:
- User B sees immediate local update
- User A receives Realtime UPDATE
- Refetch removes wave from pending
- Both return to InteractionState.NONE

No manual refresh required.

File: src/pages/Waves.tsx

Adjust toast text.

Title:
"Aceno ignorado"

No misleading description.

------------------------------------------------------------------

## Validation Checklist (Mandatory)

- Confirm RLS allows para_user_id to UPDATE waves
- Confirm no UNIQUE constraint blocks re-wave after ignore
- Confirm deriveFacts only treats status === 'pending' as active
- Confirm accepted waves remain unaffected

------------------------------------------------------------------

## Files to Change

src/pages/Chat.tsx
- Add transition-based toast guard using previous state ref

src/hooks/useChat.ts
- Keep full state sync in Realtime without skip logic

src/hooks/useWaves.ts
- Update ignoreWave to set status: 'expired'

src/pages/Waves.tsx
- Adjust ignore toast text

------------------------------------------------------------------

## Execution Order

1. useWaves.ts
2. Waves.tsx
3. Chat.tsx
4. useChat.ts verification

------------------------------------------------------------------

## No Backend Structural Changes

- No migration
- No new status
- No constraint changes
- No Edge Function updates
- No RLS changes expected (verify only)

------------------------------------------------------------------

## Regression Risk: Low

Bug 1:
- Duplicate prevention handled at UI transition layer
- Eliminates race condition without breaking sync

Bug 2:
- Converts visual-only action into real persistent mutation
- Reuses existing allowed status
- Compatible with current deriveFacts logic

No impact on:
- Presence
- Visibility in location
- Blocks
- Mutes
- Conversations table