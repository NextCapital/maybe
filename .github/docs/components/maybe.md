# Maybe

Synchronous-first wrapper around values that might be promises. If data is ready, act on it immediately. If not, wait — using the same API either way.

Three states:

| State | `_isReady` | `_isError` | Stored in |
|---|---|---|---|
| **resolved** | `true` | `false` | `_value` |
| **rejected** | `true` | `true` | `_error` |
| **pending** | `false` | — | `_wrappedPromise` |

A Maybe starts in one state and transitions at most once (pending → resolved or pending → rejected). Resolved and rejected are terminal.

## Lifecycle Diagram

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

## Construction

### `Maybe.from(thing)`

Returns `thing` unchanged if already a Maybe (identity shortcut). Otherwise wraps it in a new Maybe. Five overloads preserve `__state` through the type system:

```typescript
const a = Maybe.from(existingResolvedMaybe); // Maybe<T, E> & { __state: 'resolved' }
const b = Maybe.from(somePromise);           // Maybe<T> & { __state: 'pending' }
const c = Maybe.from(42);                    // Maybe<number> & { __state: 'resolved' }
```

### `new Maybe(thing, isError?, error?)`

The constructor branches on input type:

1. **Maybe input** — delegates to `_become()` to adopt the other Maybe's state.
2. **Thenable input** — attaches `.then(_handleResolve, _handleReject)` to track resolution. Suppresses unhandled rejection via `.catch(() => {})`.
3. **Plain value** — sets resolved state immediately. If `isError` is `true`, sets rejected state with `error`.

### `Maybe.build(isReady, valueGetter, promiseGetter)`

Conditional construction: calls `valueGetter()` when data is available, `promiseGetter()` when it is not.

```typescript
const maybe = Maybe.build(
  cache.has(key),
  () => cache.get(key),
  () => fetchFromServer(key)
);
```

### `Maybe.fromError(error)`

Creates a rejected Maybe directly. Returns `Maybe<undefined, V> & { __state: 'rejected' }`.

## State Inspection

All four methods return type predicates that narrow the phantom `__state`. For how phantom types and overloads work, see [Type System Guide](../guides/type-system.md).

| Method | Returns `true` when | Type narrowing |
|---|---|---|
| `isReady()` | resolved OR rejected | `{ __state: 'resolved' \| 'rejected' }` |
| `isPending()` | still waiting | `{ __state: 'pending' }` |
| `isResolved()` | resolved with a value | `{ __state: 'resolved' }` |
| `isRejected()` | rejected with an error | `{ __state: 'rejected' }` |

## Value Access

`PendingValueError` is a custom `Error` subclass thrown by `value()` and `valueOrError()` when the Maybe is still pending. It enables targeted `catch` handling to distinguish "value not available yet" from other runtime errors. `suspend()` throws the **promise** instead (for React Suspense), not a `PendingValueError`.

### `value()`

Returns the resolved value `T`:

- **resolved** → returns `T`
- **rejected** → throws the stored error
- **pending** → throws `PendingValueError`

Always check state before calling `value()`. The overloads enforce this at the type level: calling `value()` on a pending Maybe returns `never`.

```typescript
if (maybe.isResolved()) {
  const val = maybe.value(); // T — safe
}
```

### `valueOrError()`

Like `value()`, but returns the error instead of throwing it when rejected. Still throws `PendingValueError` when pending.

- **resolved** → returns `T`
- **rejected** → returns `E`
- **pending** → throws `PendingValueError`

### `promise()`

Converts a Maybe back to a `Promise` (`resolve`, `reject`, or the internal `_wrappedPromise`). Use to interoperate with promise-based APIs or `await`.

### `suspend()`

For React Suspense. Returns the value if resolved, throws the error if rejected, or throws the promise if pending.

```typescript
function MyComponent({ dataMaybe }: { dataMaybe: Maybe<Data> }) {
  const data = dataMaybe.suspend();
  return <div>{data.name}</div>;
}
```

## Chaining

### Dispatch Diagram

```d2
direction: down

title: when() Chain Resolution {
  shape: text
  style.font-size: 20
}

input: Input Maybe
check_state: Check State {shape: diamond}

input -> check_state

resolved_path: Resolved Path {
  has_handler: onResolve? {shape: diamond}
  call_handler: Call onResolve(value)
  wrap_result: Maybe.from(result)
  catch_error: Maybe.fromError(error)
  return_self: Return same instance
}

rejected_path: Rejected Path {
  has_handler: onReject? {shape: diamond}
  call_handler: Call onReject(error)
  wrap_result: Maybe.from(result)
  catch_error: Maybe.fromError(error)
  return_self: Return same instance
}

pending_path: Pending Path {
  delegate: promise.then(onResolve, onReject)
  wrap: Maybe.from(promise)
}

check_state -> resolved_path.has_handler: "resolved"
check_state -> rejected_path.has_handler: "rejected"
check_state -> pending_path.delegate: "pending"

resolved_path.has_handler -> resolved_path.call_handler: "yes"
resolved_path.has_handler -> resolved_path.return_self: "no"
resolved_path.call_handler -> resolved_path.wrap_result: "success"
resolved_path.call_handler -> resolved_path.catch_error: "throws"

rejected_path.has_handler -> rejected_path.call_handler: "yes"
rejected_path.has_handler -> rejected_path.return_self: "no"
rejected_path.call_handler -> rejected_path.wrap_result: "success"
rejected_path.call_handler -> rejected_path.catch_error: "throws"

pending_path.delegate -> pending_path.wrap: "settles"

output: Output Maybe
resolved_path.wrap_result -> output
resolved_path.catch_error -> output
resolved_path.return_self -> output
rejected_path.wrap_result -> output
rejected_path.catch_error -> output
rejected_path.return_self -> output
pending_path.wrap -> output
```

### `when(onResolve?, onReject?)`

The Maybe equivalent of `Promise.then()`. Named `when` (not `then`) to prevent JavaScript from treating Maybe as a thenable — see [design rationale](../README.md#why-when-instead-of-then).

| State | `onResolve` provided | `onReject` provided | Result |
|---|---|---|---|
| resolved | yes | — | Calls `onResolve(value)`, wraps result in `Maybe.from()` |
| resolved | no | — | Returns same instance unchanged |
| rejected | — | yes | Calls `onReject(error)`, wraps result in `Maybe.from()` |
| rejected | — | no | Returns same instance unchanged |
| pending | either | either | Delegates to `_wrappedPromise.then(onResolve, onReject)` |

If a handler throws, the error is caught and wrapped via `Maybe.fromError()`. Errors never escape the chain.

The handler's return type determines the resulting Maybe's state: raw values produce resolved Maybes, Promises produce pending Maybes, and existing Maybes pass through unchanged.

```typescript
const result = maybe
  .when((value) => value * 2)
  .when(
    (doubled) => `Result: ${doubled}`,
    (error) => `Failed: ${error}`
  );
```

### Synchronous chain resolution

When a Maybe is resolved and all handlers return raw values, the entire chain resolves synchronously — no promises, no microtask delays. This is the key advantage over Promise chaining.

```typescript
const result = Maybe.from(10)
  .when((v) => v * 2)   // resolved: 20
  .when((v) => v + 5);  // resolved: 25

result.isResolved(); // true — no async involved
result.value();      // 25
```

The chain becomes asynchronous the moment a handler returns a Promise. Once pending, all subsequent `when()` calls produce pending Maybes.

### Error propagation

A rejected Maybe skips `onResolve` handlers and propagates until an `onReject` handler catches it, mirroring Promise rejection propagation. When no handler exists for the rejection path, `when()` returns the **same instance** — no new Maybe allocated for each skipped step.

### `catch(onReject)`

Shortcut to `when(undefined, onReject)`.

### `finally(onFinally)`

Calls `onFinally()` on resolution or rejection, preserving the original value or error (matching `Promise.finally()` semantics). Internally uses `when()` to wrap the handler result, then chains another `when()` to restore the original value or error. If `onFinally()` returns a Promise, the chain waits for it before restoring.

### Common Patterns

Transform a resolved value synchronously:

```typescript
const name = Maybe.from(user).when((u) => u.name);
// If user Maybe is resolved, name Maybe is also resolved — synchronous
```

Recover from rejection with a default:

```typescript
const safe = riskyMaybe.catch(() => defaultValue);
// Rejection is caught; safe is resolved with defaultValue
```

Chain synchronous and asynchronous steps:

```typescript
const result = Maybe.from(rawInput)
  .when((input) => validate(input))         // synchronous validation
  .when((valid) => fetchData(valid.id))      // returns Promise → becomes pending
  .when((data) => transform(data));          // runs after fetchData settles
```

Cleanup with finally:

```typescript
const result = Maybe.from(acquireResource())
  .when((resource) => process(resource))
  .finally(() => releaseResource());
// releaseResource() runs regardless of success or failure
// result holds the output of process(), not releaseResource()
```

Error recovery mid-chain:

```typescript
const result = Maybe.from(primarySource())
  .catch(() => fallbackSource())            // recover from primary failure
  .when((data) => format(data));            // runs on whichever source succeeded
```

## Static Methods

### `Maybe.isMaybe(thing)`

Returns `true` if `thing` is a `Maybe` instance (`instanceof` check). Returns a type predicate.

### `Maybe.all(array)`

Combines an array of Maybes like `Promise.all`:

1. **All resolved** → returns a resolved Maybe with an array of all values
2. **Any rejected** → returns the first rejected Maybe immediately
3. **Otherwise** → returns a pending Maybe wrapping `Promise.all`

```typescript
const combined = Maybe.all([maybeA, maybeB, maybeC]);
if (combined.isResolved()) {
  const [a, b, c] = combined.value();
}
```

## Internal Mechanics

### `_become(otherMaybe, fromPromise)`

Adopts another Maybe's state by copying internal fields. If the other Maybe is pending, registers a `when()` callback to adopt its eventual state. Creates a new wrapped promise through `when()` so that handlers execute in the context of this instance.

### `_handleResolve(value)`

Called when a wrapped promise resolves. If `value` is a Maybe, delegates to `_become()` (recursive unwrapping). Otherwise sets resolved state.

### `_handleReject(error)`

Called when a wrapped promise rejects. If `error` is a Maybe, delegates to `_become()`. Otherwise sets rejected state and returns `Promise.reject(error)` for chain semantics.

## Gotchas

- **Tick timing:** Resolution happens on a subsequent microtask tick. `isResolved()` returns `false` immediately after construction, even for `Promise.resolve()`.
- **No `then` method:** `when()` is deliberately not `then` to prevent thenable detection.
- **`instanceof` boundaries:** `Maybe.isMaybe()` uses `instanceof`, which fails across multiple bundled copies. Ensure a single resolved version.
- **Rejection suppression:** `.catch(() => {})` on wrapped promises prevents `unhandledRejection` warnings. The rejection is still tracked in `_error`.
- **Handlers that throw:** Caught and wrapped via `Maybe.fromError()`. The chain continues with a rejected Maybe.
- **Async handlers:** If `onResolve` returns a Promise, the result becomes a pending Maybe from that point.

## Related Documentation

- [MaybeTypes](maybe-types.md) — type-level constraint utilities
- [Type System Guide](../guides/type-system.md) — phantom types, overload resolution, and type brands
- [React Suspense Guide](../guides/react-suspense.md) — Suspense integration using `suspend()`
- [Architecture README](../README.md) — design decisions and rationale
