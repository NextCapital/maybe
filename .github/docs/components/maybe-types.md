# MaybeTypes — Type Utilities

Compile-time utility types powering the overloaded signatures on `Maybe.from()` and `Maybe.all()`. All types use `import type` — zero runtime cost.

## The Intersection Type Problem

`Maybe.from()` returns intersection types like `Maybe<number, unknown> & { __state: 'resolved' }`. Standard `infer` fails on these — TypeScript sees the intersection as an opaque type:

```typescript
// This FAILS for intersection types:
type ExtractValue<T> = T extends Maybe<infer V, any> ? V : T;
type Result = ExtractValue<Maybe<number, unknown> & { __state: 'resolved' }>;
// Expected: number — Actual: fallthrough
```

The solution: `Maybe` declares phantom brand properties (`__value`, `__error`, `__state`) that survive intersection. Utility types match against these brands instead of using `infer` on `Maybe<infer V>`. See [Type System Guide](../guides/type-system.md#phantom-type-properties) for the full explanation.

## Type Reference

### UnwrapMaybe\<T\>

Prevents nested `Maybe<Maybe<T>>` from accumulating when `Maybe.from()` receives an existing Maybe. Recursively checks if `T` is a `Maybe<U, V>` and flattens. Non-Maybe types pass through unchanged.

```typescript
type A = UnwrapMaybe<Maybe<number, unknown>>;                 // Maybe<number, unknown>
type B = UnwrapMaybe<Maybe<Maybe<string, unknown>, unknown>>; // Maybe<string, unknown>
type C = UnwrapMaybe<number>;                                 // number
```

### UnwrapValue\<T\>

Extracts the inner value type `T` from a `Maybe<T>`, `Promise<T>`, or raw value. Four-branch conditional:

1. `T extends Promise<infer V>` — extracts `V`
2. `T extends { __value: infer V; __state: any }` — matches Maybe-with-intersection via phantom brands
3. `T extends Maybe<infer V, any>` — matches plain Maybe
4. Fallthrough — returns `T` unchanged

```typescript
type A = UnwrapValue<number>;                                           // number
type B = UnwrapValue<Promise<number>>;                                  // number
type C = UnwrapValue<Maybe<number, unknown> & { __state: 'resolved' }>; // number
```

### UnwrapAll\<U\>

Maps `UnwrapValue` over every element in a tuple type, producing the resolved value types for `Maybe.all()`.

```typescript
type A = UnwrapAll<[number, string, Promise<undefined>, Maybe<boolean, unknown>]>;
// [number, string, undefined, boolean]
```

### AllResolved\<U\>

Overload constraint for `Maybe.all()` — matches only when all input Maybes are resolved and no Promises are present. Maps each element: Maybes require `__state: 'resolved'`, Promises become `never` (breaking the constraint), raw values pass through.

### HasPending\<U\>

Catch-all overload constraint for `Maybe.all()` — identity type that always matches. When this overload is chosen, at least one input is pending (otherwise `AllResolved` or `HasRejected` would have matched first).

### FirstRejected\<U\>

Finds the first rejected Maybe in a tuple, or extracts any rejected Maybe from a widened array type. Returns `never` if none found. Uses unexported helpers `IsRejectedMaybe<T>` and `ExtractRejectedFromUnion<T>`.

### HasRejected\<U\>

Overload constraint for `Maybe.all()` — matches when at least one input Maybe is rejected. Wraps `FirstRejected<U>`: evaluates to `never` (overload skipped) when no rejected elements exist.

## How Maybe.all() Uses These Types

`Maybe.all()` uses three overloads resolved top-to-bottom:

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

| Input state | Return type |
|---|---|
| All Maybes resolved, no Promises | `Maybe<UnwrapAll<U>> & { __state: 'resolved' }` |
| At least one rejected | `FirstRejected<U>` |
| At least one pending, none rejected | `Maybe<UnwrapAll<U>> & { __state: 'pending' }` |
| Raw values only (no Maybes) | `Maybe<UnwrapAll<U>> & { __state: 'resolved' }` |

## How Maybe.from() Uses These Types

`Maybe.from()` uses five overloads matching on `__value`, `__error`, and `__state` phantom brands (not `Maybe<infer V>`, which fails on intersections — see above):

1. Existing Maybe with known state (3 overloads: resolved, rejected, pending)
2. Promise → pending
3. Raw value → resolved

`UnwrapMaybe<T>` prevents type nesting: `Maybe.from(Maybe<Maybe<number>>)` flattens to `Maybe<number>`.

## Adding New Utility Types

1. **Use `import type`** — all imports must be type-only
2. **Handle intersection types** — use `__value`/`__error` brands, not `infer` on `Maybe<infer V>`
3. **Add JSDoc with `@example`** — include TypeScript examples showing evaluation
4. **Add compile-time tests** — use `Expect<Equal<...>>` in [type-tests.ts](../../../type-tests.ts), validated by `npm run test:types`
5. **Export only what `Maybe.ts` needs** — helpers like `IsRejectedMaybe` are intentionally unexported

## Related Documentation

- [Maybe](maybe.md) — the class that consumes these types
- [Type System Guide](../guides/type-system.md) — phantom brand pattern and type narrowing
- [type-tests.ts](../../../type-tests.ts) — compile-time type assertions
