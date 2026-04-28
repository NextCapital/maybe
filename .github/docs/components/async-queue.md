# AsyncQueue

## Overview

Uncontrolled concurrency overloads services, exhausts connection pools, and triggers rate limits. `AsyncQueue` limits how many async tasks run simultaneously, queueing the rest in FIFO order. Unlike `PromiseUtils.serialize()`, which stops on first failure, `AsyncQueue` continues processing when individual tasks fail — suitable for independent, parallel-safe workloads.

**Source:** [AsyncQueue.ts](../../../js/async-queue/AsyncQueue.ts)
**Depends on:** [PromiseUtils](promise-utils.md) (`defer()`) and [Deferred](promise-utils.md#deferredt-interface)

---

## Construction

### `new AsyncQueue(options?)`

**Why:** Different workloads need different concurrency limits — a serial queue (default) for ordered processing, or higher concurrency for throughput.

**Signature:**

```typescript
constructor({ maxConcurrency = 1 }: AsyncQueueOptions = {})
```

**Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `maxConcurrency` | `number` | `1` | Maximum number of tasks that can run simultaneously. |

The `AsyncQueueOptions` interface is **not exported** — it is private to the module. Consumers pass a plain object literal.

**State after construction:**

| Property | Initial Value | Visibility |
|----------|---------------|------------|
| `maxConcurrency` | Value from options or `1` | Public |
| `queue` | `[]` | Private |
| `numRunningTasks` | `0` | Private |

**Usage:**

```typescript
import { AsyncQueue } from '@nextcapital/maybe';

// Serial queue (default)
const serial = new AsyncQueue();

// Allow up to 5 concurrent tasks
const parallel = new AsyncQueue({ maxConcurrency: 5 });
```

### Evidence

- [AsyncQueue.ts, lines 3–5](../../../js/async-queue/AsyncQueue.ts) — `AsyncQueueOptions` interface definition (not exported)
- [AsyncQueue.ts, lines 12–17](../../../js/async-queue/AsyncQueue.ts) — constructor implementation
- [AsyncQueue.test.ts, lines 8–20](../../../js/async-queue/AsyncQueue.test.ts) — constructor tests verifying initialization and default values

---

## API

### `perform(task)`

**Why:** Consumers submit async work and get back a result promise without worrying about concurrency. `perform()` decouples task submission from execution using the [Deferred](promise-utils.md#deferredt-interface) pattern.

**Signature:**

```typescript
perform<TResult>(task: () => Promise<TResult>): Promise<TResult>
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `task` | `() => Promise<TResult>` | A zero-argument function that returns a promise. Called when the task is ready to run. |

**Returns:** `Promise<TResult>` — resolves or rejects with the same value/error as the task's promise.

**Behavior:**

1. Creates a `Deferred<TResult>` via `PromiseUtils.defer()`.
2. If `numRunningTasks < maxConcurrency`: increments `numRunningTasks` and runs the task immediately via `_performTask()`.
3. If at capacity: pushes a closure `() => this._performTask(result, task)` onto the `queue` — the task function is **not** called yet.
4. Returns `result.promise` to the caller in both cases.

The returned promise is **not** the task's own promise — it is the deferred's promise, which `_performTask` settles on completion. This decoupling lets `perform()` return a promise immediately even when the task is queued.

**Usage:**

```typescript
const queue = new AsyncQueue({ maxConcurrency: 2 });

const result = await queue.perform(async () => {
  const response = await fetch('/api/data');
  return response.json();
});
```

### Evidence

- [AsyncQueue.ts, lines 23–33](../../../js/async-queue/AsyncQueue.ts) — `perform()` implementation
- [AsyncQueue.ts, line 25](../../../js/async-queue/AsyncQueue.ts) — `PromiseUtils.defer<TResult>()` call
- [AsyncQueue.test.ts, lines 35–85](../../../js/async-queue/AsyncQueue.test.ts) — `perform` tests for both below-limit and at-limit paths

---

### `length`

**Why:** Enables callers to check how many tasks are waiting before submitting more.

**Signature:**

```typescript
get length(): number
```

Returns the number of **waiting** (queued) tasks — not running tasks. Currently executing tasks are counted in `numRunningTasks` (private), not `queue`.

**Usage:**

```typescript
const queue = new AsyncQueue({ maxConcurrency: 1 });

queue.perform(() => longRunningTask());
queue.perform(() => anotherTask());

console.log(queue.length); // 1 (one waiting, one running)
```

### Evidence

- [AsyncQueue.ts, lines 19–21](../../../js/async-queue/AsyncQueue.ts) — `length` getter
- [AsyncQueue.test.ts, lines 28–33](../../../js/async-queue/AsyncQueue.test.ts) — length test

---

## Internal Mechanics

### The Deferred Pattern

`AsyncQueue` uses [PromiseUtils.defer()](promise-utils.md#defert) to decouple the promise returned to the caller from the actual task execution. This is the key design insight:

1. `perform()` creates a `Deferred<TResult>` — an object with a `promise`, `resolve`, and `reject`.
2. The `promise` is returned to the caller immediately.
3. The `resolve`/`reject` handles are passed into `_performTask()`, which calls them when the task settles.

This means the caller holds a promise that will settle at the right time, regardless of whether the task ran immediately or was queued.

### `_performTask(result, task)`

**Why:** Centralizes task execution, deferred settlement, and queue advancement in a single private method.

**Signature:**

```typescript
private _performTask<TResult>(
  result: Deferred<TResult>,
  task: () => Promise<TResult>
): Promise<void>
```

**Behavior:**

1. Calls `task()` and wraps the return in `Promise.resolve()` for safety.
2. On resolve: calls `result.resolve(value)` — settling the deferred promise the caller holds.
3. On reject: calls `result.reject(ex)` — forwarding the error to the caller.
4. In `.finally()`: advances the queue:
   - **Queue has waiting tasks:** shifts the next closure and calls it. Does **not** decrement `numRunningTasks` because the new task immediately replaces the completed one in the running slot.
   - **Queue is empty:** decrements `numRunningTasks` to free the capacity slot.

### Evidence

- [AsyncQueue.ts, lines 35–51](../../../js/async-queue/AsyncQueue.ts) — `_performTask()` implementation
- [AsyncQueue.test.ts, lines 87–174](../../../js/async-queue/AsyncQueue.test.ts) — `_performTask` tests covering resolve, reject, and queue advancement

---

## Concurrency Model

Tasks flow through the queue in a request→capacity-check→execute→advance cycle:

```d2
direction: right

submit: "perform(task)" {
  shape: rectangle
}

check: "capacity\navailable?" {
  shape: diamond
}

run_now: "Increment\nnumRunningTasks" {
  shape: rectangle
}

enqueue: "Push closure\nonto queue" {
  shape: rectangle
}

execute: "_performTask()" {
  shape: rectangle
}

settle: "Resolve or\nreject Deferred" {
  shape: rectangle
}

advance: "Queue\nnon-empty?" {
  shape: diamond
}

dequeue: "Shift and\nrun next" {
  shape: rectangle
}

free: "Decrement\nnumRunningTasks" {
  shape: rectangle
}

submit -> check: "defer()"
check -> run_now: "yes"
check -> enqueue: "no (at capacity)"
run_now -> execute
enqueue -> execute: "when slot frees"
execute -> settle: "task completes"
settle -> advance: ".finally()"
advance -> dequeue: "yes"
advance -> free: "no"
```

**Key invariant:** `numRunningTasks` increments in `perform()` when a task starts immediately and decrements in `_performTask()`'s `.finally()` only when the queue is empty. When a queued task replaces a completed one, `numRunningTasks` stays constant — the slot is reused, not freed and re-acquired.

### Evidence

- [AsyncQueue.ts, lines 27–28](../../../js/async-queue/AsyncQueue.ts) — `numRunningTasks` increment on immediate execution
- [AsyncQueue.ts, lines 44–49](../../../js/async-queue/AsyncQueue.ts) — `.finally()` queue advancement logic
- [AsyncQueue.test.ts, lines 115–140](../../../js/async-queue/AsyncQueue.test.ts) — tests verifying `numRunningTasks` is decremented only when the queue is empty
- [AsyncQueue.test.ts, lines 142–168](../../../js/async-queue/AsyncQueue.test.ts) — tests verifying `numRunningTasks` is not modified when dequeuing a replacement task

---

## Error Handling

A failing task does **not** break the queue. `_performTask()` catches rejections, forwards them to the deferred's `reject`, then `.finally()` advances the queue normally.

**What happens when a task fails:**

1. The task's promise rejects.
2. `.catch((ex) => result.reject(ex))` forwards the error to the caller via the deferred.
3. `.finally()` runs unconditionally — the queue advances as if the task succeeded.
4. The caller's `perform()` promise rejects with the original error.

**What this means:**

- Each task's success or failure is isolated.
- Callers must handle rejections on the promise returned by `perform()`. The queue has no global error handler.
- This differs from [PromiseUtils.serialize()](promise-utils.md#serializettasks), which stops the entire sequence on first failure.

### Evidence

- [AsyncQueue.ts, lines 40–41](../../../js/async-queue/AsyncQueue.ts) — `.catch((ex) => result.reject(ex))` forwarding
- [AsyncQueue.ts, lines 42–49](../../../js/async-queue/AsyncQueue.ts) — `.finally()` runs regardless of resolve/reject
- [AsyncQueue.test.ts, lines 160–168](../../../js/async-queue/AsyncQueue.test.ts) — rejection test verifying error forwarding
- [AsyncQueue.test.ts, lines 170–174](../../../js/async-queue/AsyncQueue.test.ts) — queue advancement tests apply to both resolve and reject paths via `testHandlesQueue` helper

---

## Usage Examples

### Serial API calls (default concurrency)

```typescript
import { AsyncQueue } from '@nextcapital/maybe';

const queue = new AsyncQueue(); // maxConcurrency: 1

// These run one at a time, in submission order
const userPromise = queue.perform(() => fetch('/api/users/1'));
const orderPromise = queue.perform(() => fetch('/api/orders/1'));

const [user, order] = await Promise.all([userPromise, orderPromise]);
```

### Limiting parallel requests

```typescript
const queue = new AsyncQueue({ maxConcurrency: 3 });

const urls = ['/api/a', '/api/b', '/api/c', '/api/d', '/api/e'];

const results = await Promise.all(
  urls.map((url) => queue.perform(() => fetch(url).then((r) => r.json())))
);
// At most 3 fetches run concurrently; the other 2 wait in the queue
```

### Handling task failures

```typescript
const queue = new AsyncQueue({ maxConcurrency: 2 });

try {
  await queue.perform(async () => {
    throw new Error('Task failed');
  });
} catch (error) {
  // error.message === 'Task failed'
  // The queue continues processing other tasks normally
}
```

---

## Testing

**Test file:** [AsyncQueue.test.ts](../../../js/async-queue/AsyncQueue.test.ts)

### Test structure

| Area | Tests | What is verified |
|------|-------|------------------|
| Constructor | 2 | Initializes properties with provided `maxConcurrency`; defaults `maxConcurrency` to `1` |
| `length` | 1 | Returns the length of the internal queue array |
| `perform` (below limit) | 3 | Defers to `_performTask`; increments `numRunningTasks`; does not modify queue |
| `perform` (at limit) | 3 | Pushes closure onto queue; does not modify `numRunningTasks`; does not call `_performTask` |
| `_performTask` (resolve) | 2 | Resolves deferred with task value; handles queue advancement |
| `_performTask` (reject) | 2 | Rejects deferred with error; handles queue advancement |
| Queue advancement | 3 | Decrements `numRunningTasks` when queue empty; shifts and runs next task when queue non-empty; does not modify `numRunningTasks` when dequeuing |

### Key testing patterns

- **`jest.spyOn(asyncQueue, '_performTask').mockImplementation()`** — `perform()` tests mock `_performTask` to isolate the capacity-check and queuing logic.
- **`PromiseUtils.defer()` for controllable tasks** — Tests create deferred promises as mock task return values, then call `resolve()`/`reject()` to drive task completion at precise moments.
- **`testHandlesQueue` shared helper** — A helper function that runs the same queue-advancement tests for both the resolve and reject paths, ensuring queue behavior is identical regardless of task outcome.
- **Direct property access** — Tests access `asyncQueue.queue` and `asyncQueue.numRunningTasks` directly to verify internal state.

For general testing patterns, see [Testing Guide](../guides/testing.md).

### Evidence

- [AsyncQueue.test.ts](../../../js/async-queue/AsyncQueue.test.ts) — complete test file (16 test cases)
- [AsyncQueue.test.ts, lines 95–104](../../../js/async-queue/AsyncQueue.test.ts) — deferred-based task setup pattern
- [AsyncQueue.test.ts, lines 106–168](../../../js/async-queue/AsyncQueue.test.ts) — `testHandlesQueue` shared helper for resolve/reject queue behavior

---

## Related Documentation

- [PromiseUtils](promise-utils.md) — provides `defer()` and the `Deferred<T>` interface used by AsyncQueue
- [Deferred\<T\> Interface](promise-utils.md#deferredt-interface) — the externalized promise pattern central to AsyncQueue's design
- [Testing Guide](../guides/testing.md) — testing conventions and patterns for this codebase
- [Architecture README](../README.md) — library-wide architecture and component inventory
