# @nextcapital/maybe — Architecture Documentation

## Overview

`@nextcapital/maybe` is a TypeScript library that bridges the gap between synchronous and asynchronous programming. It provides three utilities:

- **Maybe** — Wraps values or promises for synchronous access to promise state and resolved values. Inspired by the functional `Maybe` type, applied to the sync/async boundary rather than presence/absence.
- **PromiseUtils** — Helper functions for native promises (deferreds, serial execution, polling, thenable detection, timeouts).
- **AsyncQueue** — Concurrency-limited task queue for async operations with configurable parallelism.

**Why this library exists:** Native JavaScript promises are opaque — you cannot inspect their state or access resolved values synchronously. In applications mixing synchronous rendering (e.g., React) with async data fetching, this forces unnecessary async boundaries. `Maybe` solves this by tracking promise state internally, enabling patterns like React Suspense where synchronous access to cached data avoids render waterfalls.

## Architecture

Flat three-module architecture with a single dependency direction: `Maybe` depends on `PromiseUtils`, `AsyncQueue` depends on `PromiseUtils`. No circular dependencies.

```d2
direction: down

exports: "Package Exports (js/index.ts)" {
  style.stroke: "#0066cc"
}

maybe_module: "Maybe Module" {
  Maybe: "Maybe<T, E>"
  MaybeTypes: "MaybeTypes (utility types)"
  PendingValueError: "PendingValueError"

  Maybe -> PendingValueError: "throws on pending access"
  Maybe -> MaybeTypes: "uses type constraints"
}

promise_utils: "PromiseUtils Module" {
  PromiseUtils: "PromiseUtils"
  Deferred: "Deferred<T> interface"

  PromiseUtils -> Deferred: "returns from defer()"
}

async_queue: "AsyncQueue Module" {
  AsyncQueue: "AsyncQueue"
}

exports -> maybe_module: "exports Maybe, PendingValueError"
exports -> promise_utils: "exports PromiseUtils, Deferred"
exports -> async_queue: "exports AsyncQueue"

maybe_module.Maybe -> promise_utils.PromiseUtils: "uses isThenable()"
async_queue.AsyncQueue -> promise_utils.PromiseUtils: "uses defer()"
```

## Key Concepts

### The Maybe State Machine

A `Maybe` is always in one of three states: **resolved**, **rejected**, or **pending** — mirroring native promise states but adding synchronous observability.

- **Resolved** — Contains a value of type `T`, accessible via `value()`.
- **Rejected** — Contains an error of type `E`, thrown by `value()` or returned by `valueOrError()`.
- **Pending** — Wraps an unresolved promise. Accessing `value()` throws `PendingValueError`.

Transitions are one-directional: pending → resolved or pending → rejected. Once set, state never changes.

### Phantom Type Narrowing

Maybe uses phantom type properties (`__state`, `__value`, `__error`) — compile-time only, zero runtime cost — for type-safe state narrowing. After `isResolved()`, TypeScript narrows the type to `Maybe<T, E> & { __state: 'resolved' }`, so `value()` returns `T` instead of `never`. See the [Type System Guide](guides/type-system.md).

### Maybe Chaining

`when()` is the Maybe equivalent of `Promise.then()`, enabling chaining where each step can return a raw value, `Maybe`, or `Promise`. If all steps resolve synchronously, the entire chain resolves synchronously. See [Chaining Flow](flows/chaining.md).

### Deferred Promises

`PromiseUtils.defer()` creates a promise with externally exposed `resolve` and `reject` functions — essential for `AsyncQueue` and unit testing async code.

## Directory Structure

```text
js/
├── index.ts                        # Package entry point — re-exports all public API
├── async-queue/
│   ├── AsyncQueue.ts               # AsyncQueue class
│   └── AsyncQueue.test.ts          # AsyncQueue tests
├── maybe/
│   ├── Maybe.ts                    # Maybe class (core)
│   ├── Maybe.test.ts               # Maybe tests
│   ├── MaybeTypes.ts               # TypeScript utility types for Maybe.all()/from()
│   └── PendingValueError.ts        # Custom error for pending value access
└── promise-utils/
    ├── PromiseUtils.ts             # Promise utility functions
    └── PromiseUtils.test.ts        # PromiseUtils tests
```

## Document Index

### Components

| Document | Description |
|----------|-------------|
| [Maybe](components/maybe.md) | Core Maybe class — state management, construction, chaining, suspense |
| [MaybeTypes](components/maybe-types.md) | TypeScript utility types powering Maybe.all() and Maybe.from() overloads |
| [PromiseUtils](components/promise-utils.md) | Promise helper functions — defer, serialize, poll, isThenable, timeout |
| [AsyncQueue](components/async-queue.md) | Concurrency-limited async task queue |
| [PendingValueError](components/pending-value-error.md) | Custom error class for pending Maybe access |

### Guides

| Document | Description |
|----------|-------------|
| [Type System](guides/type-system.md) | Phantom types, type narrowing, overload resolution patterns |
| [Testing Patterns](guides/testing.md) | Testing conventions, patterns, and coverage requirements |

### Flows

| Document | Description |
|----------|-------------|
| [Maybe Lifecycle](flows/maybe-lifecycle.md) | State transitions from construction through resolution/rejection |
| [Chaining](flows/chaining.md) | How when/catch/finally chain Maybes together |
| [React Suspense](flows/react-suspense.md) | Integrating Maybe with React 18 Suspense |

### Onboarding

| Document | Description |
|----------|-------------|
| [Getting Started](onboarding/getting-started.md) | Developer onboarding — setup, usage patterns, common tasks |
| [Glossary](onboarding/glossary.md) | Proprietary terms and definitions used in this codebase |

## Design Decisions

### Why Not Just Use Promises?

Native promises are intentionally opaque — you cannot synchronously check resolution or access values. This prevents race conditions in general-purpose async code, but in UI frameworks like React, synchronous access to available data avoids unnecessary re-renders. `Maybe` solves this while maintaining promise compatibility via `promise()` and `when()`.

### Why `when()` Instead of `then()`?

Any object with a `then` method is considered "thenable" by JavaScript. If Maybe had `then`, `Promise.resolve()` and `await` would unwrap it, defeating synchronous state access. `when` preserves Maybe's non-thenable identity while communicating the same semantic intent.

### Why Phantom Types Instead of Discriminated Unions?

The alternative — a discriminated union (`ResolvedMaybe | RejectedMaybe | PendingMaybe`) — was rejected because Maybe instances change state at runtime (pending → resolved), requiring mutable discriminants. Phantom types with type predicates achieve the same narrowing without separate classes or immutability constraints.

### Why `as any` Casts in `Maybe.all()` and `Maybe.from()`?

TypeScript cannot fully verify overloaded signatures against their implementations. The `as any` casts in `all()` and `from()` are implementation artifacts — overload signatures provide full type safety to callers, while the implementation uses casts to satisfy the compiler. Type correctness is validated by [`type-tests.ts`](../../type-tests.ts).

### Why Separate `MaybeTypes.ts`?

The utility types (`UnwrapAll`, `AllResolved`, `HasRejected`, etc.) are complex recursive conditional types. Separating them keeps `Maybe.ts` focused on runtime behavior while isolating type-level logic. This enables `import type` usage, ensuring type utilities are tree-shaken from compiled output.

## Testing & Quality

- **100% coverage required** across statements, branches, functions, and lines (enforced in [`jest.config.js`](../../jest.config.js)).
- **Type tests** in [`type-tests.ts`](../../type-tests.ts) verify compile-time type behavior separately.
- Tests colocated with source files (`*.test.ts` alongside `*.ts`).
- See [Testing Patterns](guides/testing.md) for conventions and examples.

## Gotchas and Edge Cases

1. **Maybe does not resolve in the same tick as its source promise.** The internal `.then()` chain means several microtask ticks elapse between the source promise resolving and the Maybe adopting its state. Always `await maybe.promise()`, not the original promise, before synchronously accessing `value()`.

2. **Do not return a Maybe from an `async` function.** All `async` functions return a `Promise`, so the return value would be `Promise<Maybe<T>>` — wrapping the Maybe in a promise defeats its purpose.

3. **`Maybe.isMaybe()` uses `instanceof`.** This means it fails across different package installations (e.g., npm link with duplicate copies). The README recommends using `peerDependencies` to ensure a single instance.

4. **`when()` is not `then()` — intentionally.** If Maybe had a `then()` method, it would be treated as a thenable by the JavaScript runtime, causing `await` and `Promise.resolve()` to unwrap it.

5. **Unhandled rejection suppression.** The constructor and `_become()` both call `.catch(() => {})` on internal wrapped promises to prevent Node.js unhandled rejection warnings. This is intentional — the rejection is still tracked and re-thrown when accessed.

6. **`_become()` is recursive.** When a pending Maybe resolves to another Maybe, `_become()` chains into that Maybe's resolution. This enables patterns like `promise.then(() => Maybe.from(anotherPromise))`.

## Related Documentation

- [README.md](../../README.md) — Setup, installation, API overview, and usage examples
- [CONTRIBUTING.md](../../CONTRIBUTING.md) — Contribution guidelines, DCO sign-off, code style
- [MIGRATION_GUIDE_v2.md](../../MIGRATION_GUIDE_v2.md) — Migration guide from v1.x to v2.0
- [type-tests.ts](../../type-tests.ts) — Compile-time type validation examples
