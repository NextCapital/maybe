# Maybe Lifecycle

## Overview

Understanding the Maybe lifecycle is essential for predicting when values are available synchronously versus asynchronously. The lifecycle determines whether `value()` returns immediately, throws [PendingValueError](../components/pending-value-error.md), or re-throws a rejection error.

This document covers the three states, four construction paths, and transitions from pending to final state.

## State Model

A Maybe exists in exactly one of three states at any time, tracked by two private booleans: `_isReady` and `_isError`.

| State | `_isReady` | `_isError` | Active Field | Description |
|-------|-----------|-----------|-------------|-------------|
| **Resolved** | `true` | `false` | `_value` holds `T` | Value is available synchronously via `value()` |
| **Rejected** | `true` | `true` | `_error` holds `E` | Error is available; `value()` re-throws the error |
| **Pending** | `false` | `false` | `_wrappedPromise` holds `Promise<T>` | Awaiting async resolution; `value()` throws `PendingValueError` |

State is immutable once set: `pending→resolved` and `pending→rejected` are the only transitions. There is no way to reset a Maybe.

State is exposed through four query methods:

| Method | Returns `true` when |
|--------|-------------------|
| `isResolved()` | `_isReady && !_isError` |
| `isRejected()` | `_isReady && _isError` |
| `isPending()` | `!_isReady` |
| `isReady()` | `_isReady` (resolved or rejected) |

### Evidence

- [Maybe.ts](../../../js/maybe/Maybe.ts#L17-L19) — `_isReady` and `_isError` field declarations
- [Maybe.ts](../../../js/maybe/Maybe.ts#L21-L25) — `_value`, `_error`, `_wrappedPromise` field declarations
- [Maybe.ts](../../../js/maybe/Maybe.ts#L231-L255) — `isReady()`, `isPending()`, `isResolved()`, `isRejected()` implementations

## Construction Paths

There are four ways to create a Maybe instance. Each path determines the initial state.

### From Raw Value (immediate resolved)

**When:** The argument to `Maybe.from(value)` or `new Maybe(value)` is not a Promise and not a Maybe.

The constructor checks `PromiseUtils.isThenable(thing)` — if `false`, the Maybe resolves immediately:
- `_isReady = true` (since `!isPromise`)
- `_value = thing`
- `_isError = false`
- `_wrappedPromise = null`

The Maybe resolves in the same tick. `value()` returns immediately.

```ts
const maybe = Maybe.from(42);
maybe.isResolved(); // true — no microtask delay
maybe.value();      // 42
```

`Maybe.from()` has one optimization: if the argument is already a Maybe, it returns the same instance.

### From Promise (pending → eventual resolution/rejection)

**When:** The argument to `Maybe.from(promise)` or `new Maybe(promise)` is thenable (detected by [PromiseUtils](../components/promise-utils.md)`.isThenable(thing)`).

The constructor creates a pending Maybe and attaches handlers to the promise:

1. `_isReady = false`
2. `_wrappedPromise = thing.then(_handleResolve, _handleReject)`
3. `_wrappedPromise.catch(() => {})` — suppresses unhandled rejection warnings caused by the re-reject in `_handleReject`

The Maybe transitions to resolved or rejected when the source promise settles — always in a later microtask.

```ts
const maybe = Maybe.from(fetchData());
maybe.isPending(); // true
// later, after the promise settles:
maybe.isResolved(); // true
```

### From Error (immediate rejected)

**When:** Using `Maybe.fromError(error)` or `new Maybe(undefined, true, error)`.

The constructor creates an immediately rejected Maybe:

- `_isReady = true`
- `_isError = true`
- `_error = error`
- `_value = undefined`

The Maybe is rejected in the same tick. `value()` throws the error immediately.

```ts
const maybe = Maybe.fromError(new Error('failed'));
maybe.isRejected(); // true
maybe.value();      // throws Error('failed')
```

### From Another Maybe (state adoption)

**When:** `new Maybe(otherMaybe)` is called with a Maybe instance. (Note: `Maybe.from(otherMaybe)` returns the same instance and does not construct a new one.)

The constructor delegates to `_become(otherMaybe, false)`:

- **If resolved or rejected:** Copies all state fields immediately.
- **If pending:** Copies current state, then registers `otherMaybe.when(_handleResolve, _handleReject)` to adopt the eventual state.

```ts
const pending = Maybe.from(fetchData());
const adopted = new Maybe(pending);
adopted.isPending(); // true — will resolve when `pending` resolves
```

### Evidence

- [Maybe.ts](../../../js/maybe/Maybe.ts#L99-L108) — `Maybe.from()` implementation: returns same instance for Maybes
- [Maybe.ts](../../../js/maybe/Maybe.ts#L135-L140) — `Maybe.fromError()` implementation
- [Maybe.ts](../../../js/maybe/Maybe.ts#L196-L224) — Constructor: `_isReady`, `_value`, `_isError` assignment, promise attachment, `_become` delegation
- [PromiseUtils.ts](../../../js/promise-utils/PromiseUtils.ts#L85-L93) — `isThenable()` implementation

## State Transitions

### Promise Resolution (`_handleResolve`)

When the wrapped promise resolves, `_handleResolve(value)` executes:

1. **If `value` is a Maybe:** Delegates to `_become(value, true)` for recursive adoption. The Maybe adopts the state of the resolved Maybe (which may itself be pending).
2. **Otherwise:** Sets `_isReady = true`, `_value = value`, `_wrappedPromise = null`. Returns the value to preserve promise chaining.

### Promise Rejection (`_handleReject`)

When the wrapped promise rejects, `_handleReject(error)` executes:

1. **If `error` is a Maybe:** Delegates to `_become(error, true)` for recursive adoption.
2. **Otherwise:** Sets `_isReady = true`, `_isError = true`, `_error = error`, `_value = undefined`, `_wrappedPromise = null`. Returns `Promise.reject(error)` to preserve promise chaining.

### Recursive Maybe Adoption (`_become`)

`_become(otherMaybe, fromPromise)` copies the full state of another Maybe:

1. Copies all state fields from `otherMaybe`.
2. Sets `_wrappedPromise = null`.
3. **If pending:** Registers `otherMaybe.when(_handleResolve, _handleReject)` and stores the resulting promise as `_wrappedPromise`. The wrapped promise is not copied directly because it must run `_handleResolve`/`_handleReject` in the context of *this* instance.
4. Calls `.catch(() => {})` to suppress unhandled rejection warnings.

This enables recursive adoption: if a promise resolves to a Maybe that is itself pending, the original Maybe remains pending until the inner Maybe settles.

### Evidence

- [Maybe.ts](../../../js/maybe/Maybe.ts#L520-L528) — `_handleResolve` implementation
- [Maybe.ts](../../../js/maybe/Maybe.ts#L538-L549) — `_handleReject` implementation
- [Maybe.ts](../../../js/maybe/Maybe.ts#L487-L507) — `_become` implementation: state copy, conditional `when()` chaining, wrapped promise comment

## D2 Diagram

```d2
direction: down

construction: Construction {
  raw: "Maybe.from(value)" {shape: rectangle}
  promise: "Maybe.from(promise)" {shape: rectangle}
  error: "Maybe.fromError(error)" {shape: rectangle}
  adopt: "new Maybe(otherMaybe)" {shape: rectangle}
}

pending: Pending {
  style.fill: "#fff3cd"
}

resolved: Resolved {
  style.fill: "#d4edda"
}

rejected: Rejected {
  style.fill: "#f8d7da"
}

construction.raw -> resolved: "immediate"
construction.promise -> pending: "attaches .then()"
construction.error -> rejected: "immediate"
construction.adopt -> pending: "if otherMaybe pending"
construction.adopt -> resolved: "if otherMaybe resolved"
construction.adopt -> rejected: "if otherMaybe rejected"

pending -> resolved: "_handleResolve(value)"
pending -> rejected: "_handleReject(error)"
```

## Tick Timing

A Maybe created from a raw value or error resolves in the **same tick**. A Maybe created from a promise resolves in a **later microtask** — even if the source promise is already settled.

The constructor attaches handlers via `.then(_handleResolve, _handleReject)`. The Promise spec requires `.then()` callbacks to execute asynchronously, regardless of settlement status:

- `Maybe.from(Promise.resolve(42))` is **pending** immediately after construction, even though the promise has resolved.
- `_handleResolve` runs in the next microtask.
- Calling `value()` synchronously after constructing from a settled promise throws `PendingValueError`.

Use `isReady()` or `isResolved()` to guard synchronous access, or use `when()` / `promise()` to handle the value asynchronously.

### Evidence

- [Maybe.ts](../../../js/maybe/Maybe.ts#L213-L219) — Promise path in constructor: `.then()` attachment guarantees microtask-deferred resolution
- [Maybe.ts](../../../js/maybe/Maybe.ts#L199-L204) — Raw value path: `_isReady = !isPromise` is `true` immediately

## Related Documentation

- [Maybe](../components/maybe.md) — Full component reference for the Maybe class
- [PromiseUtils](../components/promise-utils.md) — Utility methods including `isThenable()` for promise detection
- [PendingValueError](../components/pending-value-error.md) — Error thrown when accessing `value()` on a pending Maybe
