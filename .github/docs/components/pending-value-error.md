# PendingValueError

## Overview

`PendingValueError` is a custom `Error` subclass thrown when calling `value()` or `valueOrError()` on a `Maybe` that is still pending. It enables targeted `catch` handling and immediately signals a Maybe was accessed before settlement.

## Implementation

```typescript
export default class PendingValueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PendingValueError';
  }
}
```

## When It Is Thrown

| Method | Condition | Message |
|--------|-----------|---------|
| `maybe.value()` | `isPending() === true` | `"cannot get value for a Maybe that is not ready"` |
| `maybe.valueOrError()` | `isPending() === true` | `"cannot get value or error for a Maybe that is not ready"` |

Always guard access with a state check:

```typescript
if (maybe.isResolved()) {
  const value = maybe.value(); // safe
}
```

## Relationship to React Suspense

`suspend()` throws the **promise** (not a `PendingValueError`) when pending. `PendingValueError` is thrown only by `value()` and `valueOrError()`.

## Related Documentation

- [Maybe Component](maybe.md) — The class that throws this error
- [Maybe Lifecycle Flow](../flows/maybe-lifecycle.md) — State transitions that determine when this error is thrown
