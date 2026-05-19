# PromiseUtils

Utility object with five static methods for common async coordination: externalizing resolve/reject, sequential execution, polling, thenable detection, and timeouts. No internal dependencies — consumed by [Maybe](maybe.md) (thenable detection) and [AsyncQueue](async-queue.md) (deferred promises).

## API Reference

### `defer<T>()`

Creates a promise with externalized `resolve` and `reject` handles, returning a [`Deferred<T>`](#deferredt-interface). Essential for decoupling promise creation from resolution.

```typescript
const { promise, resolve, reject } = PromiseUtils.defer<number>();
resolve(42);
await promise; // 42
```

Used internally by `AsyncQueue.perform()` to return a promise to callers while settling it later when the task completes.

### `serialize<T>(tasks)`

Runs tasks sequentially via `.reduce()`, collecting results in order. Both sync and async tasks are supported (return values are wrapped in `Promise.resolve()`). Rejects on first failure — remaining tasks are **not** executed.

```typescript
const results = await PromiseUtils.serialize([
  () => fetchUser(1),
  () => fetchUser(2),
  () => fetchUser(3)
]);
```

Unlike `AsyncQueue`, `serialize()` does **not** continue after a failure.

### `pollForCondition(condition, timeout?)`

Repeatedly evaluates `condition()` every 20ms until it returns `true`. Optional `timeout` (in ms) rejects with an error if the condition is not met in time. `null` (default) polls indefinitely.

```typescript
await PromiseUtils.pollForCondition(
  () => document.getElementById('my-element') !== null,
  5000
);
```

**Gotchas:**
- Polling interval is hardcoded at 20ms.
- `timeout = 0` is falsy, so it behaves like `null` (no timeout).

### `isThenable(thing)`

Duck-type check for thenables (any object with a callable `then` property), per the Promises/A+ spec. Returns a type predicate narrowing to `PromiseLike<unknown>`.

```typescript
PromiseUtils.isThenable(Promise.resolve(42));  // true
PromiseUtils.isThenable({ then: () => {} });   // true
PromiseUtils.isThenable(null);                 // false
```

Used by the `Maybe` constructor to determine whether input should be treated as a promise (pending) or plain value (resolved).

### `timeout(time)`

Promise-wrapped `setTimeout`. Resolves with `void` after `time` milliseconds. No cancellation mechanism.

```typescript
await PromiseUtils.timeout(1000);
```

## `Deferred<T>` Interface

Bundles a promise with its externalized `resolve`/`reject` handles. Exported as a named type from the package entry point.

```typescript
export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}
```

Primary use cases: `AsyncQueue` task management and unit testing with controllable promises.

## Related Documentation

- [AsyncQueue](async-queue.md) — uses `defer()` for task management
- [Maybe](maybe.md) — uses `isThenable()` in the constructor
- [Testing Guide](../guides/testing.md) — deferred pattern in tests
