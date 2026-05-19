# Chaining Flow

## Overview

Promises force every downstream computation to be asynchronous — even when data is available. A `Maybe.from(42).then(...)` would make Maybe itself thenable, collapsing the synchronous advantage. The [Maybe](../components/maybe.md) class solves this with `when()`: a chaining method that preserves synchronous resolution, catches handler errors, and mirrors `.then()` / `.catch()` / `.finally()` without making Maybe thenable.

This document covers how `when()` dispatches by state, how chains compose, and how errors propagate.

**Scope:** Chaining behavior of `when()`, `catch()`, and `finally()`. For state definitions and construction paths, see [Maybe Lifecycle](maybe-lifecycle.md). For the full API surface, see [Maybe](../components/maybe.md).

**Source:** [Maybe.ts](../../../js/maybe/Maybe.ts)

## The when() Method

`when(onResolve?, onReject?)` is the core chaining method. Named `when` instead of `then` to prevent JavaScript from treating Maybe as a thenable — `await maybe` would unwrap the value and destroy synchronous access.

`when()` dispatches based on the current state of the Maybe:

### Resolved + onResolve provided

```typescript
if (this.isResolved()) {
  if (onResolve) {
    try {
      return Maybe.from(onResolve(this._value!));
    } catch (error) {
      return Maybe.fromError(error);
    }
  }
  return this; // no handler → return same instance
}
```

- Calls `onResolve` **synchronously** with the stored value
- Wraps the return value in `Maybe.from()` — raw values produce resolved Maybes, Promises produce pending Maybes, existing Maybes pass through
- If `onResolve` throws, returns `Maybe.fromError(error)` — errors are caught, never propagated
- If no `onResolve` is provided, returns the **same Maybe instance** (identity passthrough)

### Rejected + onReject provided

```typescript
if (this.isRejected()) {
  if (onReject) {
    try {
      return Maybe.from(onReject(this._error));
    } catch (error) {
      return Maybe.fromError(error);
    }
  }
  return this; // no handler → return same rejected instance
}
```

- Same dispatch pattern as resolved, but calls `onReject` with the stored error
- If no `onReject` is provided, returns the **same rejected instance** — rejection propagates untouched

### Pending

```typescript
return Maybe.from(
  this._wrappedPromise!.then(onResolve, onReject)
);
```

- Delegates to the underlying promise's `.then()` method
- Result is always a **new pending Maybe** — the chain waits for the source to settle
- Handler selection happens when the promise settles, not at chain construction

## Synchronous Chain Resolution

When a Maybe is resolved and all handlers return raw values, the entire chain resolves synchronously — no promises, no microtask delays.

```typescript
const result = Maybe.from(10)
  .when((v) => v * 2)   // Maybe.from(20) → resolved
  .when((v) => v + 5);  // Maybe.from(25) → resolved

result.isResolved(); // true — no async involved
result.value();      // 25 — available immediately
```

Each `when()` returns a new resolved Maybe. This is the key advantage over Promise chaining: **synchronous data stays synchronous**.

The chain becomes asynchronous the moment a handler returns a Promise:

```typescript
const result = Maybe.from(10)
  .when((v) => v * 2)                    // resolved: 20 (synchronous)
  .when((v) => fetchMultiplier(v))       // pending: handler returned a Promise
  .when((v) => v + 1);                   // pending: input was pending

result.isPending(); // true — must await from here
```

Once pending, all subsequent `when()` calls produce pending Maybes, since the pending path delegates to `this._wrappedPromise.then()`.

## Error Propagation

A rejected Maybe skips `onResolve` handlers and propagates until an `onReject` handler catches it, mirroring Promise rejection propagation.

```typescript
const maybe = Maybe.from(10)
  .when((v) => v * 2)                                        // 20
  .when((v) => promise.then((otherValue) => otherValue + v)) // pending
  .when(notCalledFn);                                        // skipped — rejection propagates

const caughtMaybe = maybe.catch(() => fallbackValue);

deferred.reject(error);
// maybe is rejected — notCalledFn was never called
// caughtMaybe is resolved with fallbackValue
```

**Propagation rules:**

| Chain step | Resolved input | Rejected input |
|------------|---------------|----------------|
| `.when(onResolve)` | Calls `onResolve` | Returns same rejected instance (skips) |
| `.when(onResolve, onReject)` | Calls `onResolve` | Calls `onReject` |
| `.when(undefined, onReject)` | Returns same resolved instance | Calls `onReject` |
| `.catch(onReject)` | Returns same resolved instance | Calls `onReject` |

When a rejected Maybe has no handler for the rejection path, `when()` returns the **same instance**. The rejection propagates by reference — no new Maybe allocated for each skipped step.

### Handler Errors Are Caught

If `onResolve` or `onReject` throws, the chain becomes rejected via `Maybe.fromError(error)`. Errors never escape the chain:
```typescript
const result = Maybe.from(10)
  .when(() => { throw new Error('handler failed'); });

result.isRejected();    // true
result.valueOrError();  // Error('handler failed')
```

## Handler Return Types

The return type of a `when()` handler determines the resulting Maybe's state. `Maybe.from()` handles all cases:

| Handler returns | `Maybe.from()` produces | Resulting state |
|----------------|------------------------|-----------------|
| Raw value (e.g., `42`, `'hello'`) | `new Maybe(value)` | **Resolved** |
| Promise | `new Maybe(promise)` | **Pending** |
| Existing Maybe | Same Maybe instance (identity shortcut) | Whatever state the Maybe is in |

### Raw value

```typescript
Maybe.from(10).when((v) => v * 2);
// Handler returns 20 → Maybe.from(20) → resolved Maybe
```

### Promise

```typescript
Maybe.from(10).when((v) => fetch(`/api/${v}`));
// Handler returns Promise → Maybe.from(promise) → pending Maybe
```

### Maybe

```typescript
Maybe.from(10).when((v) => Maybe.from(v * 2));
// Handler returns Maybe → Maybe.from(maybe) → returns that Maybe unchanged
```

This composability means handlers can return whichever type is natural. A handler with a cached Maybe can return it directly without re-wrapping.

## catch() and finally()

### catch(onReject)

Shortcut to `when(undefined, onReject)`. Attaches a rejection handler without an `onResolve` handler.

```typescript
catch<TResult = T, EResult = unknown>(
  onReject: (error: E | undefined) => TResult | Maybe<TResult, EResult> | Promise<TResult>
): Maybe<T, E> | Maybe<TResult, EResult> | Maybe<undefined, unknown> {
  return this.when(undefined, onReject);
}
```

- Resolved Maybes pass through unchanged (returns same instance)
- Rejected Maybes call `onReject` and wrap the result
- Pending Maybes delegate to the underlying promise

### finally(onFinally)

Runs the handler on both resolution and rejection, then restores the original value or error. The handler receives **no arguments** — matching `Promise.prototype.finally` semantics.

```typescript
finally(onFinally) {
  return this.when(
    (value) => Maybe.from(onFinally()).when(() => value),
    (error) => Maybe.from(onFinally()).when(() => Maybe.fromError(error))
  );
}
```

**How it works:**

1. On resolve: calls `onFinally()`, wraps the result in `Maybe.from()`, then chains `.when(() => value)` to restore the original value
2. On reject: calls `onFinally()`, wraps the result in `Maybe.from()`, then chains `.when(() => Maybe.fromError(error))` to restore the original error
3. If `onFinally()` returns a Promise, the chain waits for it to settle before restoring the original value/error
4. If `onFinally()` throws, the chain becomes rejected with the thrown error (standard `when()` try/catch behavior)

```typescript
const maybe = Maybe.from(42)
  .finally(() => cleanup());

maybe.value(); // 42 — original value preserved
```

## D2 Diagram

Chain resolution flow showing how `when()` dispatches by state:

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

## Common Patterns

### Transform a resolved value synchronously

```typescript
const name = Maybe.from(user).when((u) => u.name);
// If user Maybe is resolved, name Maybe is also resolved — synchronous
```

### Recover from rejection with a default

```typescript
const safe = riskyMaybe.catch(() => defaultValue);
// Rejection is caught; safe is resolved with defaultValue
```

### Chain synchronous and asynchronous steps

```typescript
const result = Maybe.from(rawInput)
  .when((input) => validate(input))         // synchronous validation
  .when((valid) => fetchData(valid.id))      // returns Promise → becomes pending
  .when((data) => transform(data));          // runs after fetchData settles

await result.promise(); // wait for the async portion
result.value();         // final transformed value
```

### Cleanup with finally

```typescript
const result = Maybe.from(acquireResource())
  .when((resource) => process(resource))
  .finally(() => releaseResource());
// releaseResource() runs regardless of success or failure
// result holds the output of process(), not releaseResource()
```

### Error recovery mid-chain

```typescript
const result = Maybe.from(primarySource())
  .catch(() => fallbackSource())            // recover from primary failure
  .when((data) => format(data));            // runs on whichever source succeeded
```

