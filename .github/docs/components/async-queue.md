# AsyncQueue

Concurrency-limited async task queue. Limits how many async tasks run simultaneously, queueing the rest in FIFO order. Unlike `PromiseUtils.serialize()`, which stops on first failure, `AsyncQueue` continues processing when individual tasks fail.

## Construction

`maxConcurrency` controls how many tasks can run simultaneously (default: `1` for serial execution). The `AsyncQueueOptions` interface is not exported — consumers pass a plain object literal.

## API

### `perform(task)`

Submits an async task for execution. If capacity is available, the task runs immediately. Otherwise, it is queued until a slot opens. Returns a promise that resolves/rejects with the same value/error as the task's promise. The returned promise is backed by a [Deferred](promise-utils.md#deferredt-interface), not the task's own promise — this allows `perform()` to return a promise immediately even when the task is queued.

```typescript
const queue = new AsyncQueue({ maxConcurrency: 2 });

const result = await queue.perform(async () => {
  const response = await fetch('/api/data');
  return response.json();
});
```

### `length`

Returns the number of **waiting** (queued) tasks, not running tasks.

```typescript
queue.perform(() => longRunningTask());
queue.perform(() => anotherTask());
console.log(queue.length); // 1 (one waiting, one running)
```

## Concurrency Model

```d2
direction: down

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

**Key invariant:** `numRunningTasks` increments when a task starts immediately and decrements only when the queue is empty after a task completes. When a queued task replaces a completed one, `numRunningTasks` stays constant — the slot is reused.

## Error Handling

A failing task does **not** break the queue. The rejection is forwarded to the caller's deferred, then `.finally()` advances the queue normally. Each task's success or failure is isolated — callers must handle rejections on the promise returned by `perform()`.

This differs from [PromiseUtils.serialize()](promise-utils.md#serializettasks), which stops the entire sequence on first failure.

## Usage Examples

### Serial API calls

```typescript
const queue = new AsyncQueue(); // maxConcurrency: 1

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
```

### Handling task failures

```typescript
const queue = new AsyncQueue({ maxConcurrency: 2 });

try {
  await queue.perform(async () => { throw new Error('Task failed'); });
} catch (error) {
  // The queue continues processing other tasks normally
}
```

## Related Documentation

- [PromiseUtils](promise-utils.md) — provides `defer()` and the `Deferred<T>` interface used by AsyncQueue
- [Testing Guide](../guides/testing.md) — testing conventions and patterns
