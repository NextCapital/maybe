# MaybeTypes — Type Utilities

## Overview

TypeScript cannot extract generic type parameters from intersection types using standard `infer`. When `Maybe.from()` returns `Maybe<number, unknown> & { __state: 'resolved' }`, a conditional type like `T extends Maybe<infer V, any> ? V : T` fails — TypeScript sees the intersection as a single opaque type.

`MaybeTypes.ts` provides utility types that solve this. Every type is compile-time only (`import type`) and powers the overloaded signatures on `Maybe.from()` and `Maybe.all()`. Zero runtime cost.

**Source:** [MaybeTypes.ts](../../../js/maybe/MaybeTypes.ts)
**Consumed by:** [Maybe.ts](../../../js/maybe/Maybe.ts) (imports `UnwrapAll`, `AllResolved`, `HasRejected`, `FirstRejected`, `HasPending`)
**Validated by:** [type-tests.ts](../../../type-tests.ts) (Tests 1–4 cover `Maybe.from`; Tests 8–12 cover `Maybe.all`)

---

## Type Reference

### UnwrapMaybe\<T\>

**Purpose:** Prevents nested `Maybe<Maybe<T>>` from accumulating when `Maybe.from()` receives an existing Maybe.

**How it works:** Recursively checks if `T` is a `Maybe<U, V>`. If `U` is itself a Maybe, recurses. Otherwise returns `Maybe<U, V>`. Non-Maybe types pass through unchanged.

```typescript
type A = UnwrapMaybe<Maybe<number, unknown>>;                 // Maybe<number, unknown>
type B = UnwrapMaybe<Maybe<Maybe<string, unknown>, unknown>>; // Maybe<string, unknown>
type C = UnwrapMaybe<number>;                                 // number
type D = UnwrapMaybe<Promise<number>>;                        // Promise<number>
```

**Used by:** `Maybe.from()` — ensures that wrapping an already-wrapped Maybe does not produce double nesting.

**Source:** [MaybeTypes.ts, lines 20–24](../../../js/maybe/MaybeTypes.ts)

---

### UnwrapValue\<T\>

**Purpose:** Extracts the inner value type `T` from a `Maybe<T>`, `Promise<T>`, or raw value — even with a `__state` intersection.

**How it works:** Three-branch conditional, evaluated top-to-bottom:

1. `T extends Promise<infer V>` — extracts `V` from a Promise.
2. `T extends { __value: infer V; __state: any }` — matches Maybe-with-intersection using the `__value` phantom brand declared on `Maybe`. This branch exists because standard `infer` cannot extract generic parameters from intersection types.
3. `T extends Maybe<infer V, any>` — matches plain Maybe without intersection.
4. Fallthrough — returns `T` unchanged (raw values).

```typescript
type A = UnwrapValue<number>;                                           // number
type B = UnwrapValue<Promise<number>>;                                  // number
type C = UnwrapValue<Maybe<number, unknown>>;                           // number
type D = UnwrapValue<Maybe<number, unknown> & { __state: 'resolved' }>; // number
type E = UnwrapValue<Maybe<number, unknown> & { __state: 'rejected' }>; // number
```

**Why the `__value` brand matters:** Without it, `UnwrapValue<Maybe<number> & { __state: 'resolved' }>` falls through to the default case instead of extracting `number`. The brand provides a stable extraction point that survives intersection.

**Used by:** `UnwrapAll<U>`, which maps this over every element in a `Maybe.all()` input array.

**Source:** [MaybeTypes.ts, lines 44–48](../../../js/maybe/MaybeTypes.ts)

---

### UnwrapAll\<U\>

**Purpose:** Maps `UnwrapValue` over every element in a tuple type, producing the tuple of resolved value types for `Maybe.all()`.

**How it works:** Mapped type with `-readonly` modifier that iterates over the array's keys and applies `UnwrapValue` to each element.

```typescript
type A = UnwrapAll<[number, string, undefined, null]>;
// [number, string, undefined, null]

type B = UnwrapAll<[number, string, Promise<undefined>, Maybe<boolean, unknown>]>;
// [number, string, undefined, boolean]

type C = UnwrapAll<[
  Maybe<number, unknown> & { __state: 'resolved' },
  Maybe<string, unknown> & { __state: 'resolved' },
  Maybe<boolean, unknown> & { __state: 'resolved' },
]>;
// [number, string, boolean]
```

**Used by:** `Maybe.all()` return types — the resolved value is typed as `Maybe<UnwrapAll<U>, unknown>`.

**Source:** [MaybeTypes.ts, line 87](../../../js/maybe/MaybeTypes.ts)

---

### AllResolved\<U\>

**Purpose:** Overload constraint for `Maybe.all()` that matches only when all input Maybes are resolved and no Promises are present.

**How it works:** Maps over each element in the tuple:

| Element type | Mapped to | Effect on constraint |
|---|---|---|
| `Maybe<any, any>` | `U[K] & { __state: 'resolved' }` | Requires the Maybe to already have `__state: 'resolved'`; pending/rejected Maybes fail the intersection |
| `Promise<any>` | `never` | Breaks the tuple constraint — the caller's input cannot satisfy a tuple containing `never` |
| Raw value | `U[K]` (passthrough) | Always satisfies |

```typescript
// ✅ Satisfied — all Maybes resolved, no Promises
type A = AllResolved<[
  Maybe<number, unknown> & { __state: 'resolved' },
  Maybe<string, unknown> & { __state: 'resolved' },
]>;

// ❌ Violated — Promise maps to never
type B = AllResolved<[number, string, Promise<undefined>]>;
// Contains never → caller's input type cannot match

// ❌ Violated — pending Maybe does not have __state: 'resolved'
type C = AllResolved<[
  Maybe<number, unknown> & { __state: 'resolved' },
  Maybe<number, unknown> & { __state: 'pending' },
]>;
```

**Used by:** First overload of `Maybe.all()`. When satisfied, the return type is `Maybe<UnwrapAll<U>, unknown> & { __state: 'resolved' }`.

**Source:** [MaybeTypes.ts, lines 131–136](../../../js/maybe/MaybeTypes.ts)

---

### HasPending\<U\>

**Purpose:** Catch-all overload constraint for `Maybe.all()` that always matches.

**How it works:** This is the identity type — it returns `U` unchanged with no structural constraint. TypeScript's overload resolution is top-to-bottom: `AllResolved` is tried first, then `HasRejected`, then `HasPending`. Because `HasPending` always matches, it captures all remaining cases.

```typescript
// Literally defined as:
export type HasPending<U extends readonly unknown[]> = U;
```

The name communicates semantic intent: when this overload is chosen, at least one input is pending (otherwise `AllResolved` or `HasRejected` would have matched).

**Used by:** Third overload of `Maybe.all()`. When chosen, the return type is `Maybe<UnwrapAll<U>, unknown> & { __state: 'pending' }`.

**Source:** [MaybeTypes.ts, line 179](../../../js/maybe/MaybeTypes.ts)

---

### FirstRejected\<U\>

**Purpose:** Finds the first rejected Maybe in a tuple, or extracts any rejected Maybe from a widened array type.

**How it works:** Two-branch conditional handling different array representations:

1. **Widened array** (`U extends (infer Element)[]`): When TypeScript widens a tuple to `(A | B | C)[]`, individual element positions are lost. Uses `ExtractRejectedFromUnion<Element>` to pull any rejected Maybe from the union. Returns `never` if none found.
2. **Tuple** (`U extends readonly [infer First, ...infer Rest]`): Recursively checks each element left-to-right. Returns the first element where `IsRejectedMaybe<First>` is `true`. If no match, returns `never`.

Helper types (not exported):
- `IsRejectedMaybe<T>` — returns `true` if `T extends { __state: 'rejected' }`, else `false`.
- `ExtractRejectedFromUnion<T>` — `Extract<T, { __state: 'rejected' }>`.

```typescript
// Tuple: returns the first rejected Maybe
type A = FirstRejected<[
  Maybe<number, unknown> & { __state: 'resolved' },
  Maybe<string, Error> & { __state: 'rejected' },
  Maybe<boolean, Error> & { __state: 'rejected' },
]>;
// Maybe<string, Error> & { __state: 'rejected' }  (first one)

// No rejected elements
type B = FirstRejected<[
  Maybe<number, unknown> & { __state: 'resolved' },
  Maybe<string, unknown> & { __state: 'pending' },
]>;
// never
```

**Used by:** `HasRejected<U>` (to detect presence of rejected elements) and directly as the return type of `Maybe.all()`'s second overload.

**Source:** [MaybeTypes.ts, lines 196–205](../../../js/maybe/MaybeTypes.ts)

---

### HasRejected\<U\>

**Purpose:** Overload constraint for `Maybe.all()` that matches when at least one input Maybe is rejected.

**How it works:** Wraps `FirstRejected<U>`. If `FirstRejected<U>` is `never` (no rejected elements), the entire type evaluates to `never`, which causes the overload to be skipped. If `FirstRejected<U>` is not `never`, returns `U` (the original tuple), allowing the overload to match.

```typescript
// Literally defined as:
export type HasRejected<U extends readonly unknown[]> =
  FirstRejected<U> extends never ? never : U;
```

```typescript
// ✅ Satisfied — contains rejected Maybe
type A = HasRejected<[
  Maybe<number, string> & { __state: 'resolved' },
  Maybe<number, string> & { __state: 'rejected' },
]>;
// Evaluates to the input tuple type (not never)

// ❌ Violated — no rejected Maybes
type B = HasRejected<[
  Maybe<number, unknown> & { __state: 'resolved' },
  Maybe<string, unknown> & { __state: 'pending' },
]>;
// Evaluates to never → overload skipped
```

**Used by:** Second overload of `Maybe.all()`. When matched, the return type is `FirstRejected<U>` — the rejected Maybe itself, not a wrapped array.

**Source:** [MaybeTypes.ts, line 248](../../../js/maybe/MaybeTypes.ts)

---

## How Maybe.all() Uses These Types

`Maybe.all()` uses three overloads resolved top-to-bottom. The constraint types determine which overload TypeScript selects:

```typescript
// Overload 1: All resolved → resolved result
static all<const U extends readonly unknown[]>(
  array: AllResolved<U>
): Maybe<UnwrapAll<U>, unknown> & { __state: 'resolved' };

// Overload 2: Any rejected → return the rejected Maybe
static all<const U extends readonly unknown[]>(
  array: HasRejected<U>
): FirstRejected<U>;

// Overload 3: Catch-all (pending) → pending result
static all<const U extends readonly unknown[]>(
  array: HasPending<U>
): Maybe<UnwrapAll<U>, unknown> & { __state: 'pending' };
```

**Resolution order matters.** TypeScript tries each overload in declaration order and selects the first whose constraint is satisfiable:

| Input state | `AllResolved` | `HasRejected` | `HasPending` | Selected overload | Return type |
|---|---|---|---|---|---|
| All Maybes resolved, no Promises | ✅ matches | — | — | Overload 1 | `Maybe<UnwrapAll<U>> & { __state: 'resolved' }` |
| At least one rejected | ❌ | ✅ matches | — | Overload 2 | `FirstRejected<U>` |
| At least one pending, none rejected | ❌ | ❌ | ✅ matches | Overload 3 | `Maybe<UnwrapAll<U>> & { __state: 'pending' }` |
| Raw values only (no Maybes) | ✅ matches | — | — | Overload 1 | `Maybe<UnwrapAll<U>> & { __state: 'resolved' }` |

**Validated by:** [type-tests.ts](../../../type-tests.ts), Tests 8–11:
- Test 8: All resolved Maybes → `Maybe<[number, string, boolean]> & { __state: 'resolved' }` ([type-tests.ts, lines 139–150](../../../type-tests.ts))
- Test 9: Raw values only → `Maybe<[1, 'hello', true]> & { __state: 'resolved' }` ([type-tests.ts, lines 156–159](../../../type-tests.ts))
- Test 10: One pending Maybe → `Maybe<[number, string, boolean]> & { __state: 'pending' }` ([type-tests.ts, lines 165–180](../../../type-tests.ts))
- Test 11: One rejected Maybe → `Maybe<undefined, string> & { __state: 'rejected' }` ([type-tests.ts, lines 186–200](../../../type-tests.ts))

### Evidence
- [Maybe.ts, lines 156–162](../../../js/maybe/Maybe.ts) — `Maybe.all()` overload declarations importing `AllResolved`, `HasRejected`, `HasPending`, `FirstRejected`, `UnwrapAll`
- [Maybe.ts, lines 4–5](../../../js/maybe/Maybe.ts) — `import type` statement for MaybeTypes
- [type-tests.ts, lines 139–200](../../../type-tests.ts) — compile-time assertions for all four `Maybe.all()` scenarios

---

## How Maybe.from() Uses These Types

`Maybe.from()` uses five overloads that match on the `__value`, `__error`, and `__state` phantom brands declared on the `Maybe` class:

```typescript
// Overloads 1–3: Existing Maybe with known state
static from<U, V>(thing: { __value: U; __error: V; __state: 'resolved'; }): Maybe<U, V> & { __state: 'resolved' };
static from<U, V>(thing: { __value: U; __error: V; __state: 'rejected'; }): Maybe<U, V> & { __state: 'rejected' };
static from<U, V>(thing: { __value: U; __error: V; __state: 'pending'; }):   Maybe<U, V> & { __state: 'pending' };

// Overload 4: Promise (always pending)
static from<U, V>(thing: Promise<U>): Maybe<U, V> & { __state: 'pending' };

// Overload 5: Raw value (always resolved)
static from<U, V>(thing: U): Maybe<U, V> & { __state: 'resolved' };
```

Overloads 1–3 use `{ __value: infer V; __error: infer Err; __state: 'resolved' }` instead of `Maybe<infer V, infer Err> & { __state: 'resolved' }` because TypeScript cannot extract generic parameters from intersection types via `infer`. The phantom brands provide structural properties that conditional types can match.

`UnwrapMaybe<T>` prevents type nesting: when `Maybe.from()` receives `Maybe<Maybe<number>>`, the return type is flattened to `Maybe<number>`.

**Validated by:** [type-tests.ts](../../../type-tests.ts), Tests 1–4:
- Test 1: Raw values → `Maybe<number> & { __state: 'resolved' }` ([type-tests.ts, lines 30–31](../../../type-tests.ts))
- Test 2: Promises → `Maybe<number> & { __state: 'pending' }` ([type-tests.ts, lines 49–50](../../../type-tests.ts))
- Test 4: Existing Maybes preserve state ([type-tests.ts, lines 66–76](../../../type-tests.ts))

### Evidence
- [Maybe.ts, lines 88–96](../../../js/maybe/Maybe.ts) — `Maybe.from()` overload declarations using `__value`/`__error` brands
- [Maybe.ts, lines 38–40](../../../js/maybe/Maybe.ts) — `declare readonly __state` phantom property
- [Maybe.ts, lines 52–54](../../../js/maybe/Maybe.ts) — `declare readonly __value` phantom brand
- [Maybe.ts, lines 66–68](../../../js/maybe/Maybe.ts) — `declare readonly __error` phantom brand

---

## The Intersection Type Problem

This section explains why standard TypeScript inference fails and how phantom brands solve it.

### The problem

`Maybe.from()` returns intersection types like `Maybe<number, unknown> & { __state: 'resolved' }`. When another type tries to extract `T` from this:

```typescript
// This FAILS for intersection types:
type ExtractValue<T> = T extends Maybe<infer V, any> ? V : T;

type Result = ExtractValue<Maybe<number, unknown> & { __state: 'resolved' }>;
// Expected: number
// Actual: Maybe<number, unknown> & { __state: 'resolved' }  (fallthrough — infer didn't match)
```

TypeScript's conditional type matching treats the intersection as a single structural type. It does not decompose `A & B` to check if `A` alone matches.

### The solution: phantom brands

The `Maybe` class declares three phantom brand properties (`__state`, `__value`, `__error`) that provide flat structural properties surviving intersection, bypassing generic parameter inference limitations. The `__value` brand enables extracting the value type from intersection types like `Maybe<number, unknown> & { __state: 'resolved' }` where standard `infer` fails.

This pattern is used by `UnwrapValue<T>`, `Maybe.from()` overloads, `IsRejectedMaybe<T>`, and `AllResolved<U>`. See [Type System Guide — Phantom Type Properties](../guides/type-system.md#phantom-type-properties) for the full explanation of how phantom brands work and why they are necessary.

---

## Adding New Utility Types

When adding a new type to [MaybeTypes.ts](../../../js/maybe/MaybeTypes.ts):

1. **Use `import type`** — all imports in this file must be type-only to ensure zero runtime impact.
2. **Handle intersection types** — if the type needs to extract generic parameters from a Maybe, use the `__value`/`__error` brands, not `infer` on `Maybe<infer V>`.
3. **Add JSDoc with `@example`** — every exported type must include TypeScript examples showing what it evaluates to (follow the pattern of existing types).
4. **Add compile-time tests** — add type assertions to [type-tests.ts](../../../type-tests.ts) using the `Expect<Equal<...>>` pattern. The TypeScript compiler itself is the test runner (`npm run test:types`).
5. **Export only what `Maybe.ts` needs** — helper types like `IsRejectedMaybe` and `ExtractRejectedFromUnion` are intentionally not exported.

---

## Related Documentation

- [Maybe](maybe.md) — the class that consumes these types
- [Type System Guide](../guides/type-system.md) — cross-cutting guide to the phantom brand pattern and type narrowing
- [type-tests.ts](../../../type-tests.ts) — compile-time type assertions that validate these types

---

## Evidence

All claims in this document are sourced from:

| File | Lines | What it establishes |
|---|---|---|
| [MaybeTypes.ts](../../../js/maybe/MaybeTypes.ts) | 1 | `import type` — compile-time only |
| [MaybeTypes.ts](../../../js/maybe/MaybeTypes.ts) | 20–24 | `UnwrapMaybe` definition |
| [MaybeTypes.ts](../../../js/maybe/MaybeTypes.ts) | 44–48 | `UnwrapValue` definition with `__value` brand branch |
| [MaybeTypes.ts](../../../js/maybe/MaybeTypes.ts) | 87 | `UnwrapAll` mapped type |
| [MaybeTypes.ts](../../../js/maybe/MaybeTypes.ts) | 131–136 | `AllResolved` constraint with `never` for Promises |
| [MaybeTypes.ts](../../../js/maybe/MaybeTypes.ts) | 179 | `HasPending` identity type |
| [MaybeTypes.ts](../../../js/maybe/MaybeTypes.ts) | 181–183 | `IsRejectedMaybe` and `ExtractRejectedFromUnion` helpers |
| [MaybeTypes.ts](../../../js/maybe/MaybeTypes.ts) | 196–205 | `FirstRejected` two-branch conditional |
| [MaybeTypes.ts](../../../js/maybe/MaybeTypes.ts) | 248 | `HasRejected` wrapping `FirstRejected` |
| [Maybe.ts](../../../js/maybe/Maybe.ts) | 4–5 | Import of `UnwrapAll`, `AllResolved`, `HasRejected`, `FirstRejected`, `HasPending` |
| [Maybe.ts](../../../js/maybe/Maybe.ts) | 38–68 | Phantom brand declarations (`__state`, `__value`, `__error`) |
| [Maybe.ts](../../../js/maybe/Maybe.ts) | 88–96 | `Maybe.from()` overloads using brand-based matching |
| [Maybe.ts](../../../js/maybe/Maybe.ts) | 156–162 | `Maybe.all()` overloads using constraint types |
| [type-tests.ts](../../../type-tests.ts) | 30–31 | Test 1: `Maybe.from()` with raw values |
| [type-tests.ts](../../../type-tests.ts) | 49–50 | Test 2: `Maybe.from()` with Promises |
| [type-tests.ts](../../../type-tests.ts) | 66–76 | Test 4: `Maybe.from()` preserves state of existing Maybes |
| [type-tests.ts](../../../type-tests.ts) | 139–200 | Tests 8–11: `Maybe.all()` overload resolution scenarios |
