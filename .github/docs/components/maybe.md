# Maybe

## Overview

Native Promises are opaque: you cannot inspect their state or access values synchronously. This forces async patterns everywhere, even when data is already available. The `Maybe` class solves this as a synchronous-first wrapper around values that _might_ be promises. If data is ready, act on it immediately. If not, wait — using the same API either way.

`Maybe` has three states:

| State | `_isReady` | `_isError` | Stored in |
|---|---|---|---|
| **resolved** | `true` | `false` | `_value` |
| **rejected** | `true` | `true` | `_error` |
| **pending** | `false` | — | `_wrappedPromise` |

A Maybe starts in one state and transitions at most once (pending → resolved or pending → rejected). Resolved and rejected are terminal.

**Source:** [Maybe.ts](../../../js/maybe/Maybe.ts)

---

## Construction

Use static factory methods. Prefer `Maybe.from()` for general use; use the constructor only when factories don't cover your case.

### `Maybe.from(thing)`

Returns `thing` unchanged if already a Maybe (identity shortcut). Otherwise wraps it in a new Maybe. Five overloads preserve `__state` through the type system:

```typescript
// Already-resolved Maybe passes through unchanged
const a = Maybe.from(existingResolvedMaybe); // Maybe<T, E> & { __state: 'resolved' }

// Promises always start pending
const b = Maybe.from(somePromise);           // Maybe<T> & { __state: 'pending' }

// Raw values resolve immediately
const c = Maybe.from(42);                    // Maybe<number> & { __state: 'resolved' }
```

### `new Maybe(thing, isError?, error?)`

The constructor branches on input type:

1. **Maybe input** — delegates to `_become()` to adopt the other Maybe's state.
2. **Thenable input** — attaches `.then(_handleResolve, _handleReject)` to track resolution. Suppresses unhandled rejection via `.catch(() => {})`.
3. **Plain value** — sets resolved state immediately. If `isError` is `true`, sets rejected state with `error`.

```typescript
// From the constructor (lines 196–224):
if (isPromise) {
  this._wrappedPromise = (thing).then(
    (value) => this._handleResolve(value),
    (e) => this._handleReject(e)
  ) as Promise<T>;

  // prevent unhandled rejection errors caused by the re-reject in _handleReject
  this._wrappedPromise!.catch(() => {});
}
```

### `Maybe.build(isReady, valueGetter, promiseGetter)`

Conditional construction: calls `valueGetter()` when data is already available, `promiseGetter()` when it is not. Avoids creating a promise just to wrap a synchronous value.

```typescript
const maybe = Maybe.build(
  cache.has(key),
  () => cache.get(key),
  () => fetchFromServer(key)
);
```

### `Maybe.fromError(error)`

Creates a rejected Maybe directly. Returns `Maybe<undefined, V> & { __state: 'rejected' }`.

```typescript
const failed = Maybe.fromError(new Error('bad input'));
// failed.isRejected() === true
```

### Evidence

- [Maybe.ts](../../../js/maybe/Maybe.ts) — `from()` (lines 82–107), `build()` (lines 113–123), `fromError()` (lines 135–137), constructor (lines 190–224)

---

## State Inspection

Guard value access by checking state first. All four methods return type predicates that narrow the phantom `__state`, enabling compiler-enforced safe access.

| Method | Returns `true` when | Type narrowing |
|---|---|---|
| `isReady()` | resolved OR rejected | `{ __state: 'resolved' \| 'rejected' }` |
| `isPending()` | still waiting | `{ __state: 'pending' }` |
| `isResolved()` | resolved with a value | `{ __state: 'resolved' }` |
| `isRejected()` | rejected with an error | `{ __state: 'rejected' }` |

```typescript
if (maybe.isResolved()) {
  // TypeScript knows __state is 'resolved' — value() returns T
  console.log(maybe.value());
} else if (maybe.isRejected()) {
  // TypeScript knows __state is 'rejected' — value() returns never (throws)
}
```

### Evidence

- [Maybe.ts](../../../js/maybe/Maybe.ts) — `isReady()` (line 229), `isPending()` (line 236), `isResolved()` (line 243), `isRejected()` (line 250)

---

## Value Access

### `value()`

Returns the resolved value `T`:

- **resolved** → returns `T`
- **rejected** → throws the stored error
- **pending** → throws [PendingValueError](pending-value-error.md)

Always check state before calling `value()`. The overloads enforce this at the type level: calling `value()` on a pending Maybe returns `never`.

```typescript
if (maybe.isResolved()) {
  const val = maybe.value(); // T — safe
}
```

### `valueOrError()`

Like `value()`, but returns the error instead of throwing it when rejected. Still throws [PendingValueError](pending-value-error.md) when pending.

- **resolved** → returns `T`
- **rejected** → returns `E`
- **pending** → throws `PendingValueError`

### `promise()`

Converts a Maybe back to a `Promise`. Works in all states:

- **resolved** → `Promise.resolve(value)`
- **rejected** → `Promise.reject(error)`
- **pending** → returns the internally tracked `_wrappedPromise`

Use `promise()` to interoperate with promise-based APIs or `await`.

### `suspend()`

For React Suspense. Returns the value if resolved, throws the error if rejected, or throws the promise if pending. React's Suspense boundary catches the thrown promise, suspends rendering, and retries on settlement.

```typescript
function MyComponent({ dataMaybe }: { dataMaybe: Maybe<Data> }) {
  const data = dataMaybe.suspend(); // throws promise if pending
  return <div>{data.name}</div>;
}
```

### Evidence

- [Maybe.ts](../../../js/maybe/Maybe.ts) — `value()` (lines 270–284), `valueOrError()` (lines 289–299), `promise()` (lines 321–333), `suspend()` (lines 468–480)
- [PendingValueError.ts](../../../js/maybe/PendingValueError.ts) — thrown by `value()` and `valueOrError()` when pending

---

## Chaining

### `when(onResolve?, onReject?)`

The Maybe equivalent of `Promise.then()`. Named `when` (not `then`) to prevent JavaScript from treating Maybe as a thenable — `await` and `Promise.resolve()` would unwrap it.

Behavior by state:

| State | `onResolve` provided | `onReject` provided | Result |
|---|---|---|---|
| resolved | yes | — | Calls `onResolve(value)`, wraps result in `Maybe.from()` |
| resolved | no | — | Returns same instance unchanged |
| rejected | — | yes | Calls `onReject(error)`, wraps result in `Maybe.from()` |
| rejected | — | no | Returns same instance unchanged |
| pending | either | either | Delegates to `_wrappedPromise.then(onResolve, onReject)` |

If a handler throws, the error is caught and wrapped via `Maybe.fromError()`.

```typescript
const result = maybe
  .when((value) => value * 2)
  .when(
    (doubled) => `Result: ${doubled}`,
    (error) => `Failed: ${error}`
  );
```

`when()` has 16 overloads providing precise type narrowing across all state × handler combinations. See [Type System Guide](../guides/type-system.md) for details.

### `catch(onReject)`

Shortcut to `when(undefined, onReject)`. Attaches only a rejection handler, like `Promise.catch()`.

### `finally(onFinally)`

Calls `onFinally()` on resolution or rejection, preserving the original value or error — the handler's return value is ignored (matching `Promise.finally()` semantics).

For detailed chaining flows and diagrams, see [Chaining Flow](../flows/chaining.md).

### Evidence

- [Maybe.ts](../../../js/maybe/Maybe.ts) — `when()` implementation (lines 396–426), `catch()` (lines 431–434), `finally()` (lines 443–452)

---

## Static Methods

### `Maybe.from(thing)`

See [Construction](#maybefromthing) above. Identity-returns existing Maybe instances; wraps everything else.

### `Maybe.build(isReady, valueGetter, promiseGetter)`

See [Construction](#maybebuildisready-valuegetter-promisegetter) above. Conditional sync/async construction.

### `Maybe.isMaybe(thing)`

Returns `true` if `thing` is a `Maybe` instance (`instanceof` check). Returns a type predicate `thing is Maybe<U, V>`.

```typescript
if (Maybe.isMaybe(unknown)) {
  // unknown is now typed as Maybe<U, V>
  unknown.isResolved();
}
```

### `Maybe.fromError(error)`

See [Construction](#maybefromerrorerror) above. Creates a rejected Maybe directly.

### `Maybe.all(array)`

Combines an array of Maybes like `Promise.all`. Three-phase evaluation:

1. **All resolved** → returns a resolved Maybe with an array of all values
2. **Any rejected** → returns the first rejected Maybe immediately
3. **Otherwise** → returns a pending Maybe wrapping `Promise.all` of all inner promises

```typescript
const combined = Maybe.all([maybeA, maybeB, maybeC]);

if (combined.isResolved()) {
  const [a, b, c] = combined.value(); // all values available synchronously
}
```

Four overloads narrow the return type based on input states using [MaybeTypes](maybe-types.md) constraints (`AllResolved`, `HasRejected`, `HasPending`). The `const` type parameter preserves tuple structure and literal types.

### Evidence

- [Maybe.ts](../../../js/maybe/Maybe.ts) — `isMaybe()` (line 130), `all()` (lines 168–186)
- [MaybeTypes.ts](../../../js/maybe/MaybeTypes.ts) — `AllResolved`, `HasRejected`, `HasPending`, `FirstRejected`, `UnwrapAll` constraint types

---

## Internal Mechanics

Three private methods handle state adoption and promise settlement, critical for debugging timing issues.

### `_become(otherMaybe, fromPromise)`

Adopts another Maybe's state by copying internal fields (`_isReady`, `_isError`, `_value`, `_error`). If the other Maybe is pending, registers a `when()` callback to adopt its eventual state.

```typescript
// From _become (lines 487–508):
this._isReady = otherMaybe._isReady;
this._isError = otherMaybe._isError;
this._value = otherMaybe._value;
this._error = otherMaybe._error;
this._wrappedPromise = null;

if (otherMaybe.isPending()) {
  const wrappedMaybe = otherMaybe.when(
    (value) => this._handleResolve(value),
    (error) => this._handleReject(error)
  );
  this._wrappedPromise = wrappedMaybe.promise() as Promise<T>;
  this._wrappedPromise.catch(() => {}); // suppress unhandled rejection
}
```

Key detail: `_become` does **not** reuse `otherMaybe._wrappedPromise` directly. It creates a new wrapped promise through `when()` so that `_handleResolve`/`_handleReject` execute in the context of _this_ instance.

### `_handleResolve(value)`

Called when a wrapped promise resolves. If `value` is a Maybe, delegates to `_become()` (recursive unwrapping). Otherwise sets resolved state and returns the value to preserve promise chain semantics.

### `_handleReject(error)`

Called when a wrapped promise rejects. If `error` is a Maybe, delegates to `_become()`. Otherwise sets rejected state and returns `Promise.reject(error)` to preserve chain semantics.

### Evidence

- [Maybe.ts](../../../js/maybe/Maybe.ts) — `_become()` (lines 485–508), `_handleResolve()` (lines 516–527), `_handleReject()` (lines 535–547)

---

## Type System Integration

Maybe uses three phantom type properties (`__state`, `__value`, `__error`) declared with `declare readonly` — zero runtime cost, existing only in TypeScript's type system.

- **`__state`** — enables type narrowing via intersection types. `isResolved()` and similar methods return type predicates adding `{ __state: 'resolved' }`, which overloads on `value()` and `when()` use for precise return types.
- **`__value` / `__error`** — type brands for extracting generic parameters from intersection types. Standard `infer` cannot extract `T` from `Maybe<T> & { __state: 'resolved' }` — these brands provide an alternative path via `{ __value: infer V }`.

The overload strategy is extensive: `when()` alone has 16 overloads covering every combination of input state and handler presence.

See [Type System Guide](../guides/type-system.md) for full details.

### Evidence

- [Maybe.ts](../../../js/maybe/Maybe.ts) — phantom type declarations (lines 36–76)
- [MaybeTypes.ts](../../../js/maybe/MaybeTypes.ts) — `UnwrapMaybe`, `UnwrapValue`, `UnwrapAll`, `AllResolved`, `HasRejected`, `HasPending`, `FirstRejected`

---

## Gotchas

### Tick timing with pending Maybes

When a Maybe wraps a promise, resolution happens on a subsequent microtask tick. Checking `isResolved()` immediately after construction returns `false`, even for `Promise.resolve()`. This is inherent to the event loop, not a bug.

### Avoid naming a method `then`

`when()` is deliberately not `then`. A `then` method would make Maybe thenable: `await maybe` and `Promise.resolve(maybe)` would unwrap it, breaking synchronous access.

### `instanceof` across module boundaries

`Maybe.isMaybe()` uses `instanceof`, which fails across multiple bundled copies of the library. Ensure a single resolved version of `@nextcapital/maybe` in your dependency tree.

### Unhandled rejection suppression

The constructor and `_become()` call `.catch(() => {})` on wrapped promises to prevent Node.js `unhandledRejection` warnings. The rejection is still tracked in `_error`. This suppression is necessary because `_handleReject` re-rejects the promise for chain semantics, which would otherwise trigger unhandled rejection detection.

### Handlers that throw

If a `when()` handler throws, the error is caught and wrapped via `Maybe.fromError()`. The chain continues with a rejected Maybe.

### Returning async functions from `when()`

If `onResolve` returns a Promise (including from `async` functions), the result becomes a pending Maybe. The chain is asynchronous from that point, even if the input was resolved.

---

## Evidence

- [Maybe.ts](../../../js/maybe/Maybe.ts) — primary implementation (551 lines)
- [MaybeTypes.ts](../../../js/maybe/MaybeTypes.ts) — type-level constraint utilities
- [PendingValueError.ts](../../../js/maybe/PendingValueError.ts) — error class for pending value access
- [Maybe Lifecycle](../flows/maybe-lifecycle.md) — state transition flows
- [Chaining Flow](../flows/chaining.md) — detailed `when()`/`catch()`/`finally()` flow diagrams
- [Type System Guide](../guides/type-system.md) — phantom types, overload resolution, and type brands
