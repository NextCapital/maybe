# Type System Guide

Maybe wraps values that may be synchronous or asynchronous, transitioning between pending, resolved, and rejected at runtime. TypeScript needs to track these states so methods like `value()` return `T` (not `never`) when the Maybe is known to be resolved.

Discriminated unions require immutable discriminants — `readonly state` would prevent state transitions. Plain generics provide no state-based narrowing. The library solves this with **phantom type properties**, **type predicates**, and **method overloads**. The trade-off is explicit overloads for every state-dependent method (16 for `when()` alone), but this is the only viable approach given mutable state.

## Phantom Type Properties

Three properties declared with `declare readonly` in Maybe.ts exist only in the type system (zero runtime cost):

- **`__state`** (`'resolved' | 'rejected' | 'pending'`) — Narrowed by type predicates via intersection types like `Maybe<T, E> & { __state: 'resolved' }`. Method overloads use this to select return types.
- **`__value`** (`T`) / **`__error`** (`E`) — Type brands for extracting generic parameters from intersection types where standard `infer` fails. `UnwrapValue<T>` in MaybeTypes.ts matches `{ __value: infer V; __state: any }` to extract `T` through the brand when the intersection obscures generic parameters.

## Type Predicates

State-check methods return type predicates that narrow by intersecting with a specific `__state`:

```typescript
isResolved(): this is Maybe<T, E> & { __state: 'resolved'; }
isRejected(): this is Maybe<T, E> & { __state: 'rejected'; }
isPending(): this is Maybe<T, E> & { __state: 'pending'; }
isReady(): this is Maybe<T, E> & { __state: 'resolved' | 'rejected'; }
```

Once narrowed, the intersection persists across method calls and assignments until the scope ends. Overloads on `value()`, `promise()`, and `when()` match the narrowed `__state` to return precise types.

## Method Overloads

### Value Access (`value`, `promise`, `suspend`)

Four overloads each: resolved returns `T`, rejected/pending return `never`, generic fallback returns `T`. The `this` parameter constraint connects overloads to the phantom type system.

### Chaining (`when`) — 16 Overloads

A 4×4 matrix of (3 known states + unknown) × (4 handler configurations: none, onResolve only, onReject only, both). Key rules:

- Pending input always produces pending output
- Resolved + onResolve can produce rejected (if handler throws)
- Rejected without onReject passes through unchanged

### Factory Methods

**`from()`** — 5 overloads. The first three match Maybe instances with `__state` intersections, extracting `U`/`V` through `__value`/`__error` brands (not `Maybe<infer U>`, which fails on intersections). Overloads 4–5 handle Promise (→ pending) and raw value (→ resolved).

**`all()`** — 4 overloads using constraint types from [MaybeTypes](../components/maybe-types.md). TypeScript tries top-to-bottom: `AllResolved` (uses `never` injection to fail non-resolved inputs), `HasRejected` (evaluates to `never` when none rejected), `HasPending` (identity catch-all), generic fallback.

## Utility Types

See [MaybeTypes](../components/maybe-types.md) for full documentation. Key types:

| Type | Purpose |
|------|---------|
| `UnwrapValue<T>` | Extracts inner value from Maybe/Promise/raw; uses `__value` brand for intersections |
| `UnwrapAll<U>` | Maps `UnwrapValue` over a tuple for `all()` return types |
| `AllResolved<U>` | Constraint: all resolved, no Promises. Injects `never` to fail matching |
| `HasRejected<U>` | Constraint: at least one rejected. `never` when none exist |
| `FirstRejected<U>` | Finds first rejected Maybe in a tuple |

## Type Tests

[type-tests.ts](../../../type-tests.ts) validates compile-time behavior using `Expect<Equal<...>>` helpers that cause compilation errors when types diverge. Run via `npm run test:types`. Covers 30 test groups: `from()` overloads, `fromError()`, state narrowing, `all()` tuple inference, `when()`/`catch()` chaining, `isMaybe()` guard, and edge cases (empty arrays, literal types, unions, readonly arrays, `as const`).

## Adding New Type-Narrowed Methods

1. **Define overload signatures** — one per state plus generic fallback, using `this: Maybe<T, E> & { __state: '...' }` constraints
2. **Write implementation** — compatible with all overloads
3. **Add type tests** — `Expect<Equal<...>>` assertions in [type-tests.ts](../../../type-tests.ts) for each state
4. **Verify** — `npm run test:types && npm run tsc && npm run test`

If the method produces intersection types feeding into `from()` or `all()`, verify `__value`/`__error` brands extract types correctly.

## Related Documentation

- [MaybeTypes](../components/maybe-types.md) — constraint and extraction type definitions
- [Maybe](../components/maybe.md) — phantom property declarations and overloaded methods
- [type-tests.ts](../../../type-tests.ts) — compile-time type assertions
