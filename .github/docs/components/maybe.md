# Maybe

Synchronous-first wrapper around values that _might_ be promises. If data is ready, act on it immediately. If not, wait — using the same API either way.

Three states:

| State | `_isReady` | `_isError` | Stored in |
|---|---|---|---|
| **resolved** | `true` | `false` | `_value` |
| **rejected** | `true` | `true` | `_error` |
| **pending** | `false` | — | `_wrappedPromise` |

A Maybe starts in one state and transitions at most once (pending → resolved or pending → rejected). Resolved and rejected are terminal.

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

All four methods return type predicates that narrow the phantom `__state`.

| Method | Returns `true` when | Type narrowing |
|---|---|---|
| `isReady()` | resolved OR rejected | `{ __state: 'resolved' \| 'rejected' }` |
| `isPending()` | still waiting | `{ __state: 'pending' }` |
| `isResolved()` | resolved with a value | `{ __state: 'resolved' }` |
| `isRejected()` | rejected with an error | `{ __state: 'rejected' }` |

```typescript
if (maybe.isResolved()) {
  console.log(maybe.value()); // T — safe after narrowing
}
```

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

### `when(onResolve?, onReject?)`

The Maybe equivalent of `Promise.then()`. Named `when` (not `then`) to prevent JavaScript from treating Maybe as a thenable.

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

See [Type System Guide](../guides/type-system.md) for overload details.

### `catch(onReject)`

Shortcut to `when(undefined, onReject)`.

### `finally(onFinally)`

Calls `onFinally()` on resolution or rejection, preserving the original value or error (matching `Promise.finally()` semantics).

See [Chaining Flow](../flows/chaining.md) for detailed flow diagrams.

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

Four overloads narrow the return type based on input states using [MaybeTypes](maybe-types.md) constraints.

## Internal Mechanics

### `_become(otherMaybe, fromPromise)`

Adopts another Maybe's state by copying internal fields. If the other Maybe is pending, registers a `when()` callback to adopt its eventual state. Creates a new wrapped promise through `when()` so that handlers execute in the context of _this_ instance.

### `_handleResolve(value)`

Called when a wrapped promise resolves. If `value` is a Maybe, delegates to `_become()` (recursive unwrapping). Otherwise sets resolved state.

### `_handleReject(error)`

Called when a wrapped promise rejects. If `error` is a Maybe, delegates to `_become()`. Otherwise sets rejected state and returns `Promise.reject(error)` for chain semantics.

## Type System Integration

Maybe uses three phantom type properties (`__state`, `__value`, `__error`) declared with `declare readonly` — zero runtime cost, existing only in TypeScript's type system.

- **`__state`** — enables type narrowing. `isResolved()` returns a type predicate adding `{ __state: 'resolved' }`, which overloads on `value()` and `when()` use for precise return types.
- **`__value` / `__error`** — type brands for extracting generic parameters from intersection types where standard `infer` fails.

See [Type System Guide](../guides/type-system.md) for full details.

## Gotchas

- **Tick timing:** Resolution happens on a subsequent microtask tick. `isResolved()` returns `false` immediately after construction, even for `Promise.resolve()`.
- **No `then` method:** `when()` is deliberately not `then` to prevent thenable detection.
- **`instanceof` boundaries:** `Maybe.isMaybe()` uses `instanceof`, which fails across multiple bundled copies. Ensure a single resolved version.
- **Rejection suppression:** `.catch(() => {})` on wrapped promises prevents `unhandledRejection` warnings. The rejection is still tracked in `_error`.
- **Handlers that throw:** Caught and wrapped via `Maybe.fromError()`. The chain continues with a rejected Maybe.
- **Async handlers:** If `onResolve` returns a Promise, the result becomes a pending Maybe from that point.

## Related Documentation

- [MaybeTypes](maybe-types.md) — type-level constraint utilities
- [PendingValueError](pending-value-error.md) — error class for pending value access
- [Maybe Lifecycle](../flows/maybe-lifecycle.md) — state transition flows
- [Chaining Flow](../flows/chaining.md) — `when()`/`catch()`/`finally()` flow diagrams
- [Type System Guide](../guides/type-system.md) — phantom types, overload resolution, and type brands
