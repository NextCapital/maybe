# PromiseUtils

## Overview

Native promises lack utilities for common async coordination: externalizing resolve/reject, sequential execution, polling, and thenable detection. `PromiseUtils` fills these gaps as a plain utility object with five static methods.

`PromiseUtils` has no internal dependencies. It is consumed by [Maybe](maybe.md) (for thenable detection) and [AsyncQueue](async-queue.md) (for deferred promise creation).

**Source:** [PromiseUtils.ts](../../../js/promise-utils/PromiseUtils.ts)

---

## API Reference

### `defer<T>()`

**Why:** The native `Promise` constructor forces resolve/reject inside the executor callback. `defer()` externalizes them so outside code can settle the promise — essential for decoupling creation from resolution.

**Signature:**

```typescript
defer<T>(): Deferred<T>
```

**Returns:** A [`Deferred<T>`](#deferredt-interface) object containing the `promise`, `resolve`, and `reject` handles.

**Behavior:**

1. Creates a new `Promise<T>`.
2. Captures the `resolve` and `reject` callbacks from the executor.
3. Returns all three as a plain object.

**Usage example:**

```typescript
import { PromiseUtils } from '@nextcapital/maybe';

const { promise, resolve, reject } = PromiseUtils.defer<number>();

// Later, from any code path:
resolve(42);
await promise; // 42
```

**How it is used internally:** `AsyncQueue.perform()` creates a `Deferred` for each queued task. The deferred's `promise` is returned to the caller immediately; `resolve`/`reject` are invoked when the task completes or fails ([AsyncQueue.ts, line 42](../../../js/async-queue/AsyncQueue.ts)).

**Gotchas:**

- The `resolve!` and `reject!` non-null assertions in the implementation are safe because the `Promise` executor runs synchronously — the callbacks are always assigned before `defer()` returns.

### Evidence

- [PromiseUtils.ts, lines 16–28](../../../js/promise-utils/PromiseUtils.ts) — `defer()` implementation
- [AsyncQueue.ts, line 42](../../../js/async-queue/AsyncQueue.ts) — `PromiseUtils.defer<TResult>()` usage
- [PromiseUtils.test.ts, lines 14–44](../../../js/promise-utils/PromiseUtils.test.ts) — `defer` tests

---

### `serialize<T>(tasks)`

**Why:** `Promise.all()` runs tasks in parallel. When tasks must run sequentially and you need all results collected, `serialize()` chains them via `.reduce()` and stops on the first failure.

**Signature:**

```typescript
serialize<T>(tasks: Array<() => T>): Promise<T[]>
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `tasks` | `Array<() => T>` | Functions that return a value or a promise. Called one at a time, in order. |

**Returns:** `Promise<T[]>` — resolves with an array of each task's resolved value, in order.

**Behavior:**

1. Uses `.reduce()` to chain tasks sequentially via promise resolution.
2. Each task's return value is wrapped in `Promise.resolve()`, so both synchronous and asynchronous tasks are supported.
3. If any task rejects, the rejection propagates naturally through the promise chain — remaining tasks are **not** executed.

**Usage example:**

```typescript
import { PromiseUtils } from '@nextcapital/maybe';

const results = await PromiseUtils.serialize([
  () => fetchUser(1),
  () => fetchUser(2),
  () => fetchUser(3)
]);
// results === [user1, user2, user3], fetched in order
```

**Gotchas:**

- Unlike `AsyncQueue`, `serialize()` does **not** continue after a failure. The first rejection short-circuits remaining tasks.
- The JSDoc contrasts this with `AsyncQueue`: _"Unlike a normal AsyncQueue, if a task fails, the rest of the tasks will not run."_
- Tasks that return synchronous values work because each task result is wrapped in `Promise.resolve(task())`.

### Evidence

- [PromiseUtils.ts, lines 36–44](../../../js/promise-utils/PromiseUtils.ts) — `serialize()` implementation
- [PromiseUtils.test.ts, lines 46–97](../../../js/promise-utils/PromiseUtils.test.ts) — serialize tests covering in-order execution, sync tasks, and rejection short-circuit

---

### `pollForCondition(condition, timeout?)`

**Why:** Some async operations provide no promise or callback to await. `pollForCondition()` bridges this by repeatedly checking a boolean condition at a fixed interval until `true`.

**Signature:**

```typescript
pollForCondition(condition: () => boolean, timeout: number | null = null): Promise<void>
```

**Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `condition` | `() => boolean` | — | Evaluated every polling cycle. Resolves when `true`. |
| `timeout` | `number \| null` | `null` | Milliseconds before rejecting. `null` means poll indefinitely. |

**Returns:** `Promise<void>` — resolves when `condition()` returns `true`.

**Behavior:**

1. Evaluates `condition()` immediately on invocation.
2. If `true`, resolves the promise. If a timeout timer was set, it is cleared.
3. If `false`, schedules re-evaluation in **20ms** via `setTimeout`.
4. If `timeout` is provided and is reached before the condition becomes `true`, the poll timer is cleared and the promise rejects with:
   ```
   Error: Timeout reached in PromiseUtils.pollForCondition
   ```

**Timer cleanup:** Both the success and timeout paths clear the other's timer to prevent memory leaks or late callbacks.

**Usage example:**

```typescript
import { PromiseUtils } from '@nextcapital/maybe';

// Wait for a DOM element to appear, with a 5-second timeout
await PromiseUtils.pollForCondition(
  () => document.getElementById('my-element') !== null,
  5000
);
```

**Gotchas:**

- The polling interval is hardcoded at 20ms. There is no way to configure it without modifying the source.
- Passing `timeout = 0` is falsy, so it behaves the same as `null` (no timeout). Use a small positive number like `1` if you need an immediate timeout.
- Without a timeout, a condition that never becomes `true` will poll forever.

### Evidence

- [PromiseUtils.ts, lines 52–76](../../../js/promise-utils/PromiseUtils.ts) — `pollForCondition()` implementation
- [PromiseUtils.test.ts, lines 99–138](../../../js/promise-utils/PromiseUtils.test.ts) — tests covering resolution, timeout cancellation, and timeout rejection

---

### `isThenable(thing)`

**Why:** Not all promise-based code uses native `Promise`. Libraries like jQuery and Bluebird return objects with a `.then()` method that behave like promises but aren't `Promise` instances. The Promises/A+ spec defines "thenable" as any object with a callable `then` property. `isThenable()` implements this duck-type check for uniform handling.

**Signature:**

```typescript
isThenable(thing: unknown): thing is PromiseLike<unknown>
```

**Returns:** `true` if `thing` is a thenable; `false` otherwise. Acts as a TypeScript type predicate narrowing to `PromiseLike<unknown>`.

**Detection logic (all must be true):**

| Check | Purpose |
|-------|---------|
| `thing` is truthy | Eliminates `undefined`, `null`, `0`, `""`, etc. |
| `thing !== null` | Redundant with truthy check, but explicit for clarity |
| `typeof thing === 'object'` | Eliminates primitives and functions |
| `typeof thing.then === 'function'` | The core thenable check |

**Usage example:**

```typescript
import { PromiseUtils } from '@nextcapital/maybe';

PromiseUtils.isThenable(Promise.resolve(42));    // true
PromiseUtils.isThenable({ then: () => {} });     // true (duck-typed thenable)
PromiseUtils.isThenable({ then: true });         // false (then is not a function)
PromiseUtils.isThenable(null);                   // false
```

**How it is used internally:** The `Maybe` constructor calls `PromiseUtils.isThenable(thing)` to determine whether the input should be treated as a promise (pending state) or a plain value (resolved state) ([Maybe.ts, line 197](../../../js/maybe/Maybe.ts)).

**Gotchas:**

- Any object with a `then` function will be detected as thenable, even if not intended as a promise. This follows Promises/A+ specification behavior.

### Evidence

- [PromiseUtils.ts, lines 84–92](../../../js/promise-utils/PromiseUtils.ts) — `isThenable()` implementation
- [Maybe.ts, line 197](../../../js/maybe/Maybe.ts) — `PromiseUtils.isThenable(thing)` call in Maybe constructor
- [PromiseUtils.test.ts, lines 140–160](../../../js/promise-utils/PromiseUtils.test.ts) — tests for `undefined`, `null`, non-thenable object, thenable object, and native promise

---

### `timeout(time)`

**Why:** `setTimeout` uses callbacks. `timeout()` wraps it in a promise so you can `await` a delay in async code.

**Signature:**

```typescript
timeout(time: number): Promise<void>
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `time` | `number` | Milliseconds to wait before resolving. |

**Returns:** `Promise<void>` — resolves with `undefined` after `time` milliseconds.

**Usage example:**

```typescript
import { PromiseUtils } from '@nextcapital/maybe';

await PromiseUtils.timeout(1000); // pause for 1 second
```

**Gotchas:**

- There is no cancellation mechanism. Once called, the timer runs to completion.
- Resolves with `void` — no value is returned.

### Evidence

- [PromiseUtils.ts, lines 97–101](../../../js/promise-utils/PromiseUtils.ts) — `timeout()` implementation
- [PromiseUtils.test.ts, lines 162–170](../../../js/promise-utils/PromiseUtils.test.ts) — timeout test with fake timers

---

## `Deferred<T>` Interface

**Why:** Passing around a raw `Promise` only lets you await it. When other code needs to _settle_ that promise (e.g., a queue manager resolving a task, or a test driving async behavior), you need the resolve/reject handles alongside the promise. `Deferred<T>` bundles all three.

**Definition** ([PromiseUtils.ts, lines 1–5](../../../js/promise-utils/PromiseUtils.ts)):

```typescript
export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}
```

**Exported as:** Named type export from the package entry point ([index.ts, line 4](../../../js/index.ts)):

```typescript
export type { Deferred } from './promise-utils/PromiseUtils.js';
```

| Property | Type | Purpose |
|----------|------|---------|
| `promise` | `Promise<T>` | The promise to return to callers or await |
| `resolve` | `(value: T) => void` | Settles the promise with a value |
| `reject` | `(error: unknown) => void` | Rejects the promise with an error |

**Primary use cases:**

1. **AsyncQueue task management** — `perform()` creates a `Deferred<TResult>`, returns `result.promise` to the caller, and calls `result.resolve()`/`result.reject()` when the task finishes ([AsyncQueue.ts, line 42](../../../js/async-queue/AsyncQueue.ts)).
2. **Unit testing** — Tests use `defer()` to create controllable promises that can be resolved or rejected at precise moments ([PromiseUtils.test.ts, lines 15–43](../../../js/promise-utils/PromiseUtils.test.ts)).

### Evidence

- [PromiseUtils.ts, lines 1–5](../../../js/promise-utils/PromiseUtils.ts) — `Deferred<T>` interface definition
- [index.ts, line 4](../../../js/index.ts) — `Deferred` type re-export
- [AsyncQueue.ts, lines 1, 42](../../../js/async-queue/AsyncQueue.ts) — import and usage of `Deferred`

---

## Usage by Other Components

PromiseUtils is a foundation module with no internal dependencies. Two components depend on it:

| Consumer | Method Used | Purpose | Location |
|----------|-------------|---------|----------|
| [Maybe](maybe.md) | `isThenable()` | Detect whether the constructor input is a promise or plain value | [Maybe.ts, line 197](../../../js/maybe/Maybe.ts) |
| [AsyncQueue](async-queue.md) | `defer()` | Create externally-resolvable promises for queued tasks | [AsyncQueue.ts, line 42](../../../js/async-queue/AsyncQueue.ts) |

The remaining three methods (`serialize`, `pollForCondition`, `timeout`) are not used internally. They are public utilities for consumers.

### Dependency direction

```
AsyncQueue ──uses──▶ PromiseUtils.defer()
Maybe ──uses──▶ PromiseUtils.isThenable()
```

PromiseUtils depends on nothing — it uses only native JavaScript APIs (`Promise`, `setTimeout`, `clearTimeout`, `Boolean`, `typeof`).

### Evidence

- [AsyncQueue.ts, line 1](../../../js/async-queue/AsyncQueue.ts) — `import PromiseUtils, { Deferred } from '../promise-utils/PromiseUtils.js'`
- [Maybe.ts, line 197](../../../js/maybe/Maybe.ts) — `PromiseUtils.isThenable(thing)`
- [index.ts](../../../js/index.ts) — all public exports

---

## Testing

**Test file:** [PromiseUtils.test.ts](../../../js/promise-utils/PromiseUtils.test.ts)

### Test structure

All tests use **Jest fake timers** (`jest.useFakeTimers()` in `beforeEach`, `jest.useRealTimers()` in `afterEach`). This enables deterministic testing of timer-based methods (`pollForCondition`, `timeout`) without real delays.

| Method | Tests | What is verified |
|--------|-------|------------------|
| `defer` | 3 | Returns correct schema (promise + resolve + reject functions); resolve settles promise; reject settles promise |
| `serialize` | 3 | Tasks run in order with collected results; sync (non-promise) tasks work; rejection stops remaining tasks |
| `pollForCondition` | 3 | Resolves when condition becomes true; timeout is cancelled on success; rejects with error message on timeout |
| `isThenable` | 5 | `undefined` → false; `null` → false; `{ then: true }` → false; `{ then: fn }` → true; native `Promise` → true |
| `timeout` | 1 | Resolves after specified time with fake timer advancement |

### Key testing patterns

- **Fake timers + `jest.advanceTimersByTime()`** — Used for `pollForCondition` and `timeout` to control time progression without real delays.
- **`jest.runOnlyPendingTimers()`** in `afterEach` — Ensures no orphaned timers leak between tests.
- **`expect(promise).resolves` / `expect(promise).rejects`** — Async promise assertion pattern used throughout.
- **Mock functions with `jest.fn().mockResolvedValue()` / `jest.fn().mockReturnValue()`** — Used in `serialize` tests to track call order and simulate sync/async tasks.

For general testing patterns, see [Testing Guide](../guides/testing.md).

### Evidence

- [PromiseUtils.test.ts](../../../js/promise-utils/PromiseUtils.test.ts) — complete test file (15 test cases)
- [PromiseUtils.test.ts, lines 5–12](../../../js/promise-utils/PromiseUtils.test.ts) — fake timer setup/teardown pattern
