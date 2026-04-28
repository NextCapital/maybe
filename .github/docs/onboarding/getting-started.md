# Getting Started

## Overview

`@nextcapital/maybe` solves a fundamental problem with JavaScript promises: **you cannot
inspect their state or access resolved values synchronously**. In applications mixing
synchronous rendering (e.g., React) with async data fetching, this forces unnecessary
async boundaries and render waterfalls.

This library provides three utilities:

| Component | Purpose | Location |
| --------- | ------- | -------- |
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

**Requirements:** Node >= 18, npm >= 9.

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

## Development Workflow

### NPM scripts

Always use the npm scripts defined in [`package.json`](../../../package.json) — never call
tools directly.

| Command | Purpose |
| ------- | ------- |
| `npm run test` | Run Jest with coverage |
| `npm run test:types` | Validate type-level tests in `type-tests.ts` (compile-time only) |
| `npm run lint` | Run eslint + markdownlint + cspell |
| `npm run lint:js` | Run eslint only on `js/**/*.ts` |
| `npm run build` | Clean and compile TypeScript to `dist/` |
| `npm run tsc` | Compile TypeScript |
| `npm run tsc:test` | Compile tests with `tsconfig.test.json` |
| `npm run ci:local` | Full CI pipeline: lint + test + tsc + tsc:test |

### Testing

- **100% coverage** is required across all metrics
- Tests are colocated with source files (e.g., `Maybe.test.ts` next to `Maybe.ts`)
- Use `PromiseUtils.defer()` for controlling async flow in tests — creates a promise you
  can resolve/reject manually
- Run tests: `npm run test`

### TypeScript

- Strict mode is enabled
- Target: ES2023, module system: NodeNext
- Type-level tests live in [`type-tests.ts`](../../../type-tests.ts) and are validated with
  `npm run test:types`
### Full CI check

Before pushing, run the full local CI pipeline to catch all issues:

```bash
npm run ci:local
```

This runs: lint → test → tsc → tsc:test.

## Project Structure

Source code lives in `js/` with tests colocated. Key config files (`tsconfig.json`, `jest.config.js`, `eslint.config.cjs`) and type tests (`type-tests.ts`) are at the project root.

See [Architecture README — Directory Structure](../README.md#directory-structure) for the full file tree and [Key Files](../README.md#key-files) for a table of all important files.

## Next Steps

- **[Architecture Docs](../README.md)** — full architecture overview, component inventory,
  and design decisions
- **Component deep-dives:**
  - [Maybe](../components/maybe.md)
  - [PromiseUtils](../components/promise-utils.md)
  - [AsyncQueue](../components/async-queue.md)
  - [MaybeTypes](../components/maybe-types.md)
  - [PendingValueError](../components/pending-value-error.md)
- **Flow documentation:**
  - [Maybe Lifecycle](../flows/maybe-lifecycle.md)
  - [Chaining](../flows/chaining.md)
  - [React Suspense](../flows/react-suspense.md)
- **Guides:**
  - [Testing Guide](../guides/testing.md)
  - [Type System Guide](../guides/type-system.md)
