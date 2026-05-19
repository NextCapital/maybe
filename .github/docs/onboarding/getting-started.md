# Getting Started

## Overview

`@nextcapital/maybe` solves a fundamental problem with JavaScript promises: **you cannot
inspect their state or access resolved values synchronously**. In applications mixing
synchronous rendering (e.g., React) with async data fetching, this forces unnecessary
async boundaries and render waterfalls.

This library provides three utilities:

| Component | Purpose | Location |
| --------- | ------- |
| **Maybe** | Wraps values or promises for synchronous state inspection and value access. Three states: resolved, rejected, pending. | [`js/maybe/Maybe.ts`](../../../js/maybe/Maybe.ts) |
| **PromiseUtils** | Static promise helpers: `defer()`, `serialize()`, `pollForCondition()`, `isThenable()`, `timeout()`. | [`js/promise-utils/PromiseUtils.ts`](../../../js/promise-utils/PromiseUtils.ts) |
| **AsyncQueue** | Concurrency-limited async task queue. | [`js/async-queue/AsyncQueue.ts`](../../../js/async-queue/AsyncQueue.ts) |

**When to use this library:**

- You need to synchronously check whether async data is available before rendering
- You want React Suspense integration for async data
- You need to chain transformations that may be sync or async
- You need concurrency-limited task execution or promise utilities like deferreds and polling

## Setup

### Install

```bash
npm install --save @nextcapital/maybe
```

### Import

All public API is available from the package root:

```typescript
import { Maybe, PromiseUtils, AsyncQueue, PendingValueError } from '@nextcapital/maybe';
```

The `Deferred` type (returned by `PromiseUtils.defer()`) is a type-only export:

```typescript
import type { Deferred } from '@nextcapital/maybe';
```

These exports are defined in [`js/index.ts`](../../../js/index.ts).

## Quick Start

### Create a Maybe from a synchronous value

When data is already available, `Maybe.from()` creates a resolved instance accessible
immediately:

```typescript
const maybe = Maybe.from(42);

maybe.isResolved(); // true
maybe.isPending();  // false
maybe.value();      // 42
```

### Create a Maybe from a promise

When data is asynchronous, `Maybe.from()` tracks the promise state internally:

```typescript
const maybe = Maybe.from(fetch('/api/data'));

maybe.isPending(); // true — cannot access value yet

const data = await maybe.promise(); // wait for resolution
maybe.isResolved(); // true
maybe.value();      // data
```

> **Important:** Always `await maybe.promise()` — not the original promise — before accessing
> the value synchronously. The Maybe needs an extra tick after the promise resolves
> to adopt its state.

### Build conditionally

Use `Maybe.build()` when sync vs. async depends on runtime conditions (e.g.,
cached vs. fetched data):

```typescript
const maybe = Maybe.build(
  hasCachedData(),       // boolean condition
  () => getCachedData(), // sync path — called when true
  () => fetchData()      // async path — called when false
);
```

### Chain transformations

`when()` is the Maybe equivalent of `.then()`. Chains work synchronously when
the source is resolved:

```typescript
const result = Maybe.from(42)
  .when(x => x * 2)
  .when(x => x.toString());

result.value(); // "84"
```

### Handle errors

Create rejected Maybes and recover with `catch()`:

```typescript
const maybe = Maybe.fromError(new Error('failed'));

maybe.isRejected(); // true

const recovered = maybe.catch(() => 'default');
recovered.value(); // "default"
```

### Combine multiple Maybes

`Maybe.all()` works like `Promise.all()` — resolves when all inputs resolve:
```typescript
const combined = Maybe.all([Maybe.from(1), Maybe.from(2), Maybe.from(3)]);
combined.value(); // [1, 2, 3]
```

### React Suspense integration

`suspend()` satisfies the React Suspense contract — returns the value if ready, throws
the promise if pending:
```typescript
const [a, b] = Maybe.all([fetchA(), fetchB()]).suspend();
```

For full details on each pattern, see:

- [Maybe Component Docs](../components/maybe.md) — full API and behavior
- [Chaining Flow](../flows/chaining.md) — detailed chaining patterns
- [React Suspense Guide](../flows/react-suspense.md) — Suspense integration
