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

- **Maybe State Machine** — Three states (resolved, rejected, pending) with one-directional transitions. See [Maybe](components/maybe.md).
- **Phantom Type Narrowing** — Compile-time state tracking via `__state`, `__value`, `__error` phantom properties. See [Type System Guide](guides/type-system.md).
- **Maybe Chaining** — `when()` chains that preserve synchronous resolution. See [Chaining Flow](flows/chaining.md).
- **Deferred Promises** — Externally-controllable promises via `PromiseUtils.defer()`. See [PromiseUtils](components/promise-utils.md).

## Design Decisions

### Why Not Just Use Promises?

Native promises are intentionally opaque — you cannot synchronously check resolution or access values. In UI frameworks like React, synchronous access to available data avoids unnecessary re-renders. `Maybe` solves this while maintaining promise compatibility via `promise()` and `when()`.

### Why `when()` Instead of `then()`?

Any object with a `then` method is considered "thenable" by JavaScript. If Maybe had `then`, `Promise.resolve()` and `await` would unwrap it, defeating synchronous state access.

### Why `as any` Casts in Overloaded Methods?

TypeScript cannot fully verify overloaded signatures against their implementations. The `as any` casts in `all()` and `from()` are implementation artifacts — overload signatures provide full type safety to callers. Type correctness is validated by [`type-tests.ts`](../../type-tests.ts).

### Why Separate `MaybeTypes.ts`?

Complex recursive conditional types are isolated from `Maybe.ts` to keep it focused on runtime behavior. This enables `import type` usage, ensuring type utilities are tree-shaken from compiled output.

For additional design rationale (phantom types vs discriminated unions), see [Type System Guide](guides/type-system.md).

## Testing & Quality

100% coverage required across all metrics. Type tests in [`type-tests.ts`](../../type-tests.ts) verify compile-time behavior separately. See [Testing Patterns](guides/testing.md).

## Gotchas

- **Do not return a Maybe from an `async` function.** The return value would be `Promise<Maybe<T>>`, defeating its purpose.

For implementation-level gotchas (tick timing, `instanceof` boundaries, rejection suppression, recursive `_become()`), see [Maybe — Gotchas](components/maybe.md#gotchas).

## Related Documentation

- [README.md](../../README.md) — Setup, installation, API overview, and usage examples
- [CONTRIBUTING.md](../../CONTRIBUTING.md) — Contribution guidelines, DCO sign-off, code style
- [MIGRATION_GUIDE_v2.md](../../MIGRATION_GUIDE_v2.md) — Migration guide from v1.x to v2.0
- [type-tests.ts](../../type-tests.ts) — Compile-time type validation examples
