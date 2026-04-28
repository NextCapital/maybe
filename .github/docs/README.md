# @nextcapital/maybe — Architecture Documentation

## Overview

`@nextcapital/maybe` is a TypeScript library that bridges the gap between synchronous and asynchronous programming. It provides three utilities:

- **Maybe** — Wraps values or promises for synchronous access to promise state and resolved values. Inspired by the functional `Maybe` type, applied to the sync/async boundary rather than presence/absence.
- **PromiseUtils** — Helper functions for native promises (deferreds, serial execution, polling, thenable detection, timeouts).
- **AsyncQueue** — Concurrency-limited task queue for async operations with configurable parallelism.

**Why this library exists:** Native JavaScript promises are opaque — you cannot inspect their state or access resolved values synchronously. In applications mixing synchronous rendering (e.g., React) with async data fetching, this forces unnecessary async boundaries. `Maybe` solves this by tracking promise state internally, enabling patterns like React Suspense where synchronous access to cached data avoids render waterfalls.

| Attribute | Value |
|-----------|-------|
| Package | `@nextcapital/maybe` |
| Version | 2.1.0 |
| License | Apache-2.0 |
| Language | TypeScript (ES2023 target, NodeNext modules) |
| Entry Point | `js/index.ts` → compiled to `dist/index.js` |
| Source Lines | ~742 (source), ~1186 (tests), ~260 (type utilities) |
| Node Requirement | >= 18 |

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

### Component Inventory

| Component | Responsibility | Location | Depends On |
|-----------|---------------|----------|------------|
| Maybe | Wraps values/promises for synchronous state access and chaining | [`js/maybe/Maybe.ts`](../../js/maybe/Maybe.ts) | PromiseUtils, PendingValueError, MaybeTypes |
| MaybeTypes | TypeScript utility types for `Maybe.all()` and `Maybe.from()` overload resolution | [`js/maybe/MaybeTypes.ts`](../../js/maybe/MaybeTypes.ts) | Maybe (type-only import) |
| PendingValueError | Custom error thrown when accessing a pending Maybe's value | [`js/maybe/PendingValueError.ts`](../../js/maybe/PendingValueError.ts) | None |
| PromiseUtils | Static utility methods for promise manipulation | [`js/promise-utils/PromiseUtils.ts`](../../js/promise-utils/PromiseUtils.ts) | None |
| AsyncQueue | Concurrency-limited async task queue | [`js/async-queue/AsyncQueue.ts`](../../js/async-queue/AsyncQueue.ts) | PromiseUtils |

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

## Glossary of Proprietary Terms

| Term | Definition | Where Used |
|------|-----------|------------|
| Maybe | A wrapper that tracks promise state (resolved/rejected/pending) and enables synchronous value access | [`js/maybe/Maybe.ts`](../../js/maybe/Maybe.ts) |
| Phantom type | A TypeScript type property declared with `declare` that exists only at compile time, used for type narrowing without runtime cost | [`js/maybe/Maybe.ts#L30-L78`](../../js/maybe/Maybe.ts) |
| Type brand | The `__value` and `__error` phantom properties that enable extracting generic type parameters from intersection types | [`js/maybe/Maybe.ts#L48-L78`](../../js/maybe/Maybe.ts) |
| Become | Internal pattern where a Maybe adopts the state of another Maybe instance (`_become` method) | [`js/maybe/Maybe.ts`](../../js/maybe/Maybe.ts) — `_become()` |
| Deferred | An object containing a promise and its externalized `resolve`/`reject` functions | [`js/promise-utils/PromiseUtils.ts#L1-L6`](../../js/promise-utils/PromiseUtils.ts) |
| Thenable | Any object with a `then` method — the industry-standard way to detect promise-like objects | [`js/promise-utils/PromiseUtils.ts`](../../js/promise-utils/PromiseUtils.ts) — `isThenable()` |

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
| [AI Agent Guide](onboarding/ai-agent-guide.md) | Instructions for AI agents working in this codebase |

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

## Key Files

| File | Role |
|------|------|
| [`js/index.ts`](../../js/index.ts) | Package entry point — re-exports all public API |
| [`js/maybe/Maybe.ts`](../../js/maybe/Maybe.ts) | Core Maybe class with all runtime logic |
| [`js/maybe/MaybeTypes.ts`](../../js/maybe/MaybeTypes.ts) | TypeScript utility types for overload constraints |
| [`js/maybe/PendingValueError.ts`](../../js/maybe/PendingValueError.ts) | Custom error class |
| [`js/promise-utils/PromiseUtils.ts`](../../js/promise-utils/PromiseUtils.ts) | Promise utility functions |
| [`js/async-queue/AsyncQueue.ts`](../../js/async-queue/AsyncQueue.ts) | Concurrency-limited task queue |
| [`type-tests.ts`](../../type-tests.ts) | Compile-time type validation tests |
| [`tsconfig.json`](../../tsconfig.json) | TypeScript configuration (strict, ES2023, NodeNext) |
| [`jest.config.js`](../../jest.config.js) | Jest configuration with 100% coverage thresholds |

## Testing & Quality

- **100% coverage required** across statements, branches, functions, and lines (enforced in [`jest.config.js`](../../jest.config.js)).
- **Type tests** in [`type-tests.ts`](../../type-tests.ts) verify compile-time type behavior separately.
- **Test runner:** Jest with `ts-jest` preset.
- Tests colocated with source files (`*.test.ts` alongside `*.ts`).
- See [Testing Patterns](guides/testing.md) for conventions and examples.

## Build, Deploy & CI/CD

| Script | Command | Purpose |
|--------|---------|---------|
| `npm run build` | `npm run clean && npm run tsc` | Clean and compile TypeScript to `dist/` |
| `npm run tsc` | `tsc` | Compile TypeScript |
| `npm run test` | `jest` | Run tests with coverage |
| `npm run test:types` | `tsc --noEmit type-tests.ts` | Validate type-level tests |
| `npm run lint` | eslint + markdownlint + cspell | Full lint suite |
| `npm run ci:local` | lint + test + tsc + tsc:test | Full CI pipeline locally |

Build output goes to `dist/` (gitignored). The package publishes `dist/` only (configured via `files` in `package.json`).

## Extension Points

| Extension Type | Directory | Convention | Canonical Example | Also Update |
|----------------|-----------|------------|-------------------|-------------|
| New static method on Maybe | `js/maybe/` | Add to `Maybe` class | `Maybe.from()` in [`Maybe.ts`](../../js/maybe/Maybe.ts) | Tests in `Maybe.test.ts`, type tests in `type-tests.ts` |
| New instance method on Maybe | `js/maybe/` | Add to `Maybe` class | `when()` in [`Maybe.ts`](../../js/maybe/Maybe.ts) | Tests in `Maybe.test.ts`, type tests in `type-tests.ts` |
| New utility type for Maybe | `js/maybe/` | Add to `MaybeTypes.ts` | `AllResolved` in [`MaybeTypes.ts`](../../js/maybe/MaybeTypes.ts) | Import in `Maybe.ts` if used by overloads |
| New PromiseUtils method | `js/promise-utils/` | Add to `PromiseUtils` object | `defer()` in [`PromiseUtils.ts`](../../js/promise-utils/PromiseUtils.ts) | Tests in `PromiseUtils.test.ts`, export from `index.ts` if type |
| New exported class/module | `js/<module-name>/` | Create directory with `<Name>.ts` and `<Name>.test.ts` | [`js/async-queue/`](../../js/async-queue/) | Export from `js/index.ts` |

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
