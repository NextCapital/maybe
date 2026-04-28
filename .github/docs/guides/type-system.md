# Type System Guide

## Overview

The [Maybe](../components/maybe.md) class wraps values that may be synchronous or asynchronous. At runtime, a Maybe transitions between states: pending, resolved, and rejected. TypeScript needs to track these at the type level so methods like `value()` return `T` (not `never`) when the Maybe is known to be resolved.

Standard TypeScript patterns fail here:

- **Discriminated unions** require immutable discriminants. Maybe mutates state at runtime (pending → resolved), so a `readonly state` field would prevent core functionality.
- **Plain generics** provide no mechanism for narrowing `Maybe<T, E>` to "a resolved `Maybe<T, E>`" — there is no way to constrain which methods are valid based on state.

The library solves this with three TypeScript patterns that work together: **phantom type properties** for state tracking, **type predicates** for narrowing, and **method overloads** for state-dependent return types.

## Phantom Type Properties

Three properties are declared with `declare readonly` in [Maybe.ts](../../../js/maybe/Maybe.ts) (lines 30–78). `declare` tells TypeScript the property exists for type-checking but produces no JavaScript output. Zero runtime cost.

### `__state` — State Narrowing

```typescript
declare readonly __state: 'resolved' | 'rejected' | 'pending';
```

**Why:** Type predicates (see next section) return intersection types like `Maybe<T, E> & { __state: 'resolved' }`. This narrows `__state` from the full union to just `'resolved'`, which method overloads use to select the correct return type.

Without `__state`, there is no type-level property for the intersection to narrow.

### `__value` / `__error` — Type Brands

```typescript
declare readonly __value: T;
declare readonly __error: E;
```

**Why:** When TypeScript intersects `Maybe<T, E>` with `{ __state: 'resolved' }`, the result is a flat intersection — not a generic instantiation. Conditional type inference (`infer`) cannot extract `T` from this intersection using `T extends Maybe<infer V, any> ? V : never`, because the intersection obscures the generic parameters.

The brands provide an alternative extraction path. The utility type `UnwrapValue<T>` in [MaybeTypes.ts](../../../js/maybe/MaybeTypes.ts) demonstrates this:

```typescript
export type UnwrapValue<T> =
  T extends Promise<infer V> ? V :
    T extends { __value: infer V; __state: any; } ? V : // Has __state intersection — use __value
      T extends Maybe<infer V, any> ? V :                // Plain Maybe — use generic
        T;                                                // Raw value
```

The second branch (`{ __value: infer V; __state: any; }`) matches intersection types and extracts `T` via the `__value` brand. The third branch handles plain `Maybe<T, E>` without intersections. Both paths produce the same result — the inner value type — but through different extraction mechanisms.

### Evidence

- [Maybe.ts](../../../js/maybe/Maybe.ts)#L30-L42 — `__state` phantom property declaration and documentation
- [Maybe.ts](../../../js/maybe/Maybe.ts)#L44-L64 — `__value` phantom brand declaration and documentation
- [Maybe.ts](../../../js/maybe/Maybe.ts)#L66-L78 — `__error` phantom brand declaration and documentation
- [MaybeTypes.ts](../../../js/maybe/MaybeTypes.ts) — `UnwrapValue<T>` uses `__value` brand for intersection type extraction

## Type Predicates

All state-check methods return type predicates that narrow the Maybe type by intersecting it with a specific `__state` value:

```typescript
isReady(): this is Maybe<T, E> & { __state: 'resolved' | 'rejected'; }
isPending(): this is Maybe<T, E> & { __state: 'pending'; }
isResolved(): this is Maybe<T, E> & { __state: 'resolved'; }
isRejected(): this is Maybe<T, E> & { __state: 'rejected'; }
```

**How narrowing works in practice:**

```typescript
const maybe = Maybe.from(fetchData()); // Maybe<Data, unknown> — state unknown

if (maybe.isResolved()) {
  // TypeScript narrows to: Maybe<Data, unknown> & { __state: 'resolved' }
  // The value() overload for 'resolved' state is selected → returns Data
  const data: Data = maybe.value();
}

if (maybe.isPending()) {
  // TypeScript narrows to: Maybe<Data, unknown> & { __state: 'pending' }
  // The value() overload for 'pending' state is selected → returns never (will throw)
  // TypeScript prevents calling value() here without a type error downstream
  const promise: Promise<Data> = maybe.promise();
}

if (maybe.isRejected()) {
  // TypeScript narrows to: Maybe<Data, unknown> & { __state: 'rejected' }
  // The promise() overload for 'rejected' returns Promise<E>
  const errorPromise: Promise<unknown> = maybe.promise();
}
```

The narrowing flows through the entire call chain. Once narrowed, the intersection type persists across method calls, assignments, and return statements until the scope ends.

### Evidence

- [Maybe.ts](../../../js/maybe/Maybe.ts)#L232-L260 — `isReady()`, `isPending()`, `isResolved()`, `isRejected()` method signatures with type predicate return types
- [type-tests.ts](../../../type-tests.ts) — Tests 5–7 verify narrowing with `isResolved()`, `isPending()`, `isRejected()`

## Method Overloads

Method overloads connect the phantom type system to concrete return types. Each overloaded method provides state-specific signatures that TypeScript selects based on the `__state` intersection.

### Value Access Overloads (`value`, `promise`, `suspend`)

These three methods follow the same four-overload pattern:

| Overload | `this` constraint | `value()` returns | `promise()` returns | `suspend()` returns |
|----------|-------------------|-------------------|---------------------|---------------------|
| Resolved | `{ __state: 'resolved' }` | `T` | `Promise<T>` | `T` |
| Rejected | `{ __state: 'rejected' }` | `never` | `Promise<E>` | `never` |
| Pending | `{ __state: 'pending' }` | `never` | `Promise<T>` | `never` |
| Generic (fallback) | *(none)* | `T` | `Promise<T \| E>` | `T` |

The `this` parameter constraint connects overloads to the phantom type system. When `isResolved()` narrows the type to include `{ __state: 'resolved' }`, TypeScript matches the first overload and returns `T`.

**Example — `value()` overloads from source:**

```typescript
value(this: Maybe<T, E> & { __state: 'resolved'; }): T;
value(this: Maybe<T, E> & { __state: 'rejected'; }): never;
value(this: Maybe<T, E> & { __state: 'pending'; }): never;
value(): T;
```

The generic fallback (no `this` constraint) returns `T` rather than `T | never`. When state is unknown at compile time, the developer accepts responsibility for runtime checks, and `T` is the useful return type.

### Chaining Overloads (`when`)

`when()` has 16 overloads organized as a 4×4 matrix:

| | No handlers | `onResolve` only | `onReject` only | Both handlers |
|---|---|---|---|---|
| **Pending** | Pending passthrough | Pending `TResult1` | Pending `TResult2` | Pending `TResult1 \| TResult2` |
| **Resolved** | Resolved passthrough | Resolved `TResult1` ∪ Rejected | Resolved passthrough | Resolved `TResult1` ∪ Rejected |
| **Rejected** | Rejected passthrough | Rejected passthrough | Resolved `TResult2` ∪ Rejected | Resolved `TResult2` ∪ Rejected |
| **Unknown** | Union of above | Union of above | Union of above | Union of above |

**Why 16 overloads:** The matrix covers every combination of (3 known states + 1 unknown) × (4 handler configurations). Each cell produces a different return type. Without explicit overloads, TypeScript would return a broad union for all cases.

**Key design patterns in `when()` overloads:**

- **Pending input always produces pending output.** If the Maybe is pending, the handler cannot run synchronously, so the result must be pending regardless of which handlers are provided.
- **Resolved + onResolve can produce rejected.** If `onResolve` throws, the result is a rejected Maybe. The return type includes `Maybe<undefined, unknown> & { __state: 'rejected' }` to reflect this.
- **Rejected without onReject passes through.** If no reject handler is provided, the rejected Maybe is returned unchanged, preserving its error type.

### Factory Overloads (`from`, `all`)

**`from()` — 5 overloads** using `__value`/`__error` brands for type preservation:

```typescript
static from<U, V>(thing: { __value: U; __error: V; __state: 'resolved'; }): Maybe<U, V> & { __state: 'resolved'; };
static from<U, V>(thing: { __value: U; __error: V; __state: 'rejected'; }): Maybe<U, V> & { __state: 'rejected'; };
static from<U, V>(thing: { __value: U; __error: V; __state: 'pending'; }): Maybe<U, V> & { __state: 'pending'; };
static from<U, V>(thing: Promise<U>): Maybe<U, V> & { __state: 'pending'; };
static from<U, V>(thing: U): Maybe<U, V> & { __state: 'resolved'; };
```

The first three overloads match Maybe instances with a `__state` intersection. They extract `U` and `V` through `__value` and `__error` brands (not `Maybe<infer U, infer V>`), because intersection types prevent standard generic inference. This is the primary reason the brand properties exist.

**`all()` — 4 overloads** using constraint types from [MaybeTypes.ts](../../../js/maybe/MaybeTypes.ts):

| Overload | Constraint | Returns | Matches when |
|----------|-----------|---------|--------------|
| 1 | `AllResolved<U>` | `Maybe<UnwrapAll<U>> & { __state: 'resolved' }` | All Maybes resolved, no Promises |
| 2 | `HasRejected<U>` | `FirstRejected<U>` | At least one Maybe rejected |
| 3 | `HasPending<U>` | `Maybe<UnwrapAll<U>> & { __state: 'pending' }` | Catch-all (always matches) |
| 4 | `U` (generic) | `Maybe<UnwrapAll<U>> & { __state: 'resolved' \| 'pending' }` | Fallback |

TypeScript tries overloads top-to-bottom. `AllResolved<U>` uses `never` injection (Promises and non-resolved Maybes become `never`) to fail the constraint when any input is not resolved. `HasRejected<U>` evaluates to `never` when no rejected Maybes exist, failing the constraint. `HasPending<U>` is an identity type that always matches as the catch-all.

### Evidence

- [Maybe.ts](../../../js/maybe/Maybe.ts)#L269-L290 — `value()` overloads
- [Maybe.ts](../../../js/maybe/Maybe.ts)#L305-L326 — `promise()` overloads
- [Maybe.ts](../../../js/maybe/Maybe.ts)#L370-L388 — `when()` 16 overloads
- [Maybe.ts](../../../js/maybe/Maybe.ts)#L460-L476 — `suspend()` overloads
- [Maybe.ts](../../../js/maybe/Maybe.ts)#L90-L107 — `from()` overloads with brand-based extraction
- [Maybe.ts](../../../js/maybe/Maybe.ts)#L160-L175 — `all()` overloads with constraint types

## Utility Types

The [MaybeTypes](../components/maybe-types.md) module in [MaybeTypes.ts](../../../js/maybe/MaybeTypes.ts) provides the constraint and extraction types used by method overloads.

| Type | Purpose | Used by |
|------|---------|---------|
| `UnwrapMaybe<T>` | Recursively unwraps nested `Maybe<Maybe<T>>` to the innermost `Maybe<T>` | Internal type normalization |
| `UnwrapValue<T>` | Extracts inner value from `Maybe`, `Promise`, or raw value; uses `__value` brand for intersection types | `UnwrapAll`, `all()` return types |
| `UnwrapAll<U>` | Maps `UnwrapValue` over a tuple, extracting value types from each element | `all()` return types |
| `AllResolved<U>` | Constraint: all Maybes must be resolved, no Promises allowed. Injects `never` for non-resolved elements to fail overload matching | `all()` overload 1 |
| `HasRejected<U>` | Constraint: at least one Maybe must be rejected. Evaluates to `never` when no rejected Maybes exist | `all()` overload 2 |
| `HasPending<U>` | Identity type (always matches). Catch-all overload constraint with semantic name | `all()` overload 3 |
| `FirstRejected<U>` | Finds the first rejected Maybe in a tuple; handles both tuples and widened arrays | `all()` overload 2 return type, `HasRejected` |

For detailed documentation of each type including examples, see [MaybeTypes](../components/maybe-types.md).

### Evidence

- [MaybeTypes.ts](../../../js/maybe/MaybeTypes.ts) — All utility type definitions
- [Maybe.ts](../../../js/maybe/Maybe.ts)#L3-L5 — Import of `UnwrapAll`, `AllResolved`, `HasRejected`, `FirstRejected`, `HasPending`

## Type Tests

The file [type-tests.ts](../../../type-tests.ts) validates compile-time type behavior using a pattern where type assertion failures cause compilation errors:

```typescript
type Expect<T extends true> = T;
type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
  ? true
  : false;
```

`Equal<X, Y>` evaluates to `true` only when `X` and `Y` are structurally identical. `Expect<T extends true>` constrains its parameter to `true`, so `Expect<Equal<ActualType, ExpectedType>>` fails compilation when types diverge.

**What the tests cover (30 test groups):**

| Test | Validates |
|------|-----------|
| 1–2 | `Maybe.from()` with raw values and Promises preserves value types and assigns correct `__state` |
| 3 | `Maybe.fromError()` preserves error type and assigns `__state: 'rejected'` |
| 4 | `Maybe.from()` with existing Maybes preserves `__state` intersection through re-wrapping |
| 5–7 | Type narrowing with `isResolved()`, `isPending()`, `isRejected()` produces correct state and value/promise types |
| 8–9 | `Maybe.all()` with all-resolved Maybes and raw values returns resolved tuple type |
| 10 | `Maybe.all()` with pending input returns pending state |
| 11 | `Maybe.all()` with rejected input returns the rejected Maybe directly |
| 12 | `Maybe.all()` with mixed Promises and raw values compiles correctly |
| 13–14 | `when()` chaining on resolved and pending Maybes produces correct state and value types |
| 15 | `catch()` error recovery compiles correctly |
| 16 | Nested `Maybe.all()` produces nested tuple types |
| 17 | `isMaybe()` type guard narrows `unknown` to `Maybe` |
| 18 | Generic function compatibility — `Maybe.from<T>(value)` infers concrete type at call site |
| 19–30 | Edge cases: empty arrays, literal types, error type preservation, single elements, union types, readonly arrays, widened arrays, mixed primitives, `as const` comparison |

**Running type tests:**

```bash
npm run test:types
```

This runs the TypeScript compiler against [type-tests.ts](../../../type-tests.ts). No JavaScript is executed — the tests pass when compilation succeeds and fail when any `Expect<Equal<...>>` assertion produces a type error.

### Evidence

- [type-tests.ts](../../../type-tests.ts) — All 30 test groups with `Expect<Equal<...>>` assertions
- [package.json](../../../package.json) — `test:types` script definition

## Design Decision: Phantom Types vs Discriminated Unions

**Decision:** Use phantom type properties with type predicates instead of discriminated unions.

**Rationale:** Maybe instances change state at runtime. A Maybe from a Promise starts pending and transitions to resolved or rejected on settlement. This mutation happens internally via `_handleResolve()` and `_handleReject()`:

```typescript
private _handleResolve(value: T | Maybe<T, E>): T | Promise<T> {
  // ...
  this._isReady = true;
  this._value = value;
  // ...
}
```

Discriminated unions require the discriminant to be a concrete, immutable value. If Maybe used `readonly state: 'resolved' | 'rejected' | 'pending'` as a discriminant, state transitions would be impossible — TypeScript prevents reassigning `readonly` properties.

**What phantom types provide:**

- **State narrowing** — type predicates achieve the same compile-time narrowing as discriminated unions (`if (maybe.isResolved())` narrows the type just like `if (maybe.state === 'resolved')` would)
- **No runtime constraint** — phantom properties exist only in the type system, so the class can freely mutate its internal state
- **Overload selection** — the `this` parameter in overloads can constrain on `{ __state: 'resolved' }` to select state-specific return types

**Trade-off:** Phantom types require explicit overloads for every state-dependent method, whereas discriminated unions provide narrowing automatically. This increases type declaration surface area (16 overloads for `when()` alone) but is the only viable approach given mutable state.

### Evidence

- [Maybe.ts](../../../js/maybe/Maybe.ts)#L30-L42 — `declare readonly __state` (phantom, not a real property)
- [Maybe.ts](../../../js/maybe/Maybe.ts)#L18-L26 — `_isReady` and `_isError` are the actual mutable runtime state fields
- [Maybe.ts](../../../js/maybe/Maybe.ts)#L488-L505 — `_handleResolve()` mutates state from pending to resolved

## Adding New Type-Narrowed Methods

When adding a new method that returns different types based on Maybe state, follow this pattern:

### Step 1: Define the overload signatures

Add one overload per state plus a generic fallback. Use `this` parameter constraints to bind each overload to a `__state` value:

```typescript
// In Maybe.ts — new method example: `mapValue()`
mapValue<U>(this: Maybe<T, E> & { __state: 'resolved'; }, fn: (value: T) => U): U;
mapValue<U>(this: Maybe<T, E> & { __state: 'rejected'; }): never;
mapValue<U>(this: Maybe<T, E> & { __state: 'pending'; }): never;
mapValue<U>(fn?: (value: T) => U): U;
```

### Step 2: Write the implementation signature

The implementation signature must be compatible with all overloads. It appears after the overload declarations:

```typescript
mapValue<U>(fn?: (value: T) => U): U {
  if (this.isResolved()) {
    return fn ? fn(this._value!) : this._value as unknown as U;
  }

  if (this.isRejected()) {
    throw this._error;
  }

  throw new PendingValueError('cannot map value for a Maybe that is not ready');
}
```

### Step 3: Add type tests

Add compile-time type assertions in [type-tests.ts](../../../type-tests.ts) covering each overload:

```typescript
// Test: mapValue on resolved Maybe
const resolved = Maybe.from(42);
if (resolved.isResolved()) {
  const mapped = resolved.mapValue(x => x.toString());
  type testMapped = Expect<Equal<typeof mapped, string>>;
}

// Test: mapValue on pending Maybe
const pending = Maybe.from(Promise.resolve(42));
if (pending.isPending()) {
  // This should not compile or should return never
  type testPending = Expect<Equal<ReturnType<typeof pending.mapValue>, never>>;
}
```

### Step 4: Verify

```bash
npm run test:types   # Compile-time type assertions pass
npm run tsc          # Full compilation succeeds
npm run test         # Runtime tests pass
```

### Checklist for new overloaded methods

1. One overload per known state (`resolved`, `rejected`, `pending`) plus one generic fallback
2. Each state overload uses `this: Maybe<T, E> & { __state: '...' }` as the first parameter
3. Return types match the method's behavior for each state (e.g., `never` for states that throw)
4. The implementation signature is compatible with all overloads
5. Type tests in [type-tests.ts](../../../type-tests.ts) cover each state's return type
6. If the method produces intersection types that feed into `from()` or `all()`, verify the `__value`/`__error` brands extract types correctly

### Evidence

- [Maybe.ts](../../../js/maybe/Maybe.ts)#L269-L290 — `value()` as canonical four-overload example
- [type-tests.ts](../../../type-tests.ts) — Test 5 as canonical type narrowing test example

## Documentation Coverage Summary

| Metric | Value |
|--------|-------|
| **Areas Documented** | 7 sections with full coverage |
| **Areas Partially Covered** | 0 |
| **Areas Unknown** | 0 |
| **Total Evidence Citations** | 22 file paths cited across all Evidence blocks |
| **Total UNVERIFIED Markers** | 0 |
| **Confidence Distribution** | HIGH: 7 |
| **Coverage Scan Status** | 7/7 sections Clear |
