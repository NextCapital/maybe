# PendingValueError

## Overview

`PendingValueError` is a custom `Error` subclass thrown when calling `value()` or `valueOrError()` on a `Maybe` that is still pending (its underlying promise has not yet resolved or rejected).

**Why it exists:** Without a specific error type, callers cannot distinguish "value not available yet" from other runtime errors. `PendingValueError` enables targeted `catch` handling — particularly useful in debugging, where it immediately signals a Maybe was accessed before settlement.

## Implementation

**Location:** [`js/maybe/PendingValueError.ts`](../../../js/maybe/PendingValueError.ts)

```typescript
export default class PendingValueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PendingValueError';
  }
}
```

The class extends `Error` and sets `this.name = 'PendingValueError'` so error messages display the correct type name.

## When It Is Thrown

| Method | Condition | Message |
|--------|-----------|---------|
| `maybe.value()` | `isPending() === true` | `"cannot get value for a Maybe that is not ready"` |
| `maybe.valueOrError()` | `isPending() === true` | `"cannot get value or error for a Maybe that is not ready"` |

Both call sites are in [`js/maybe/Maybe.ts`](../../../js/maybe/Maybe.ts).

## Usage Pattern

Always guard access with a state check:

```typescript
const maybe = Maybe.from(somePromise);

// WRONG — will throw PendingValueError if promise hasn't settled
const value = maybe.value();

// CORRECT — guard with isResolved() first
if (maybe.isResolved()) {
  const value = maybe.value(); // safe
}
```

## Relationship to React Suspense

`PendingValueError` is distinct from Suspense. `suspend()` throws the **promise** (not a `PendingValueError`) when pending, which React's Suspense boundary catches. `PendingValueError` is thrown only by `value()` and `valueOrError()`.

## Testing

Tested in [`js/maybe/Maybe.test.ts`](../../../js/maybe/Maybe.test.ts) — the `value` and `valueOrError` describe blocks verify `PendingValueError` is thrown when the Maybe is pending.

## Related Documentation

- [Maybe Component](maybe.md) — The class that throws this error
- [Maybe Lifecycle Flow](../flows/maybe-lifecycle.md) — State transitions that determine when this error is thrown
