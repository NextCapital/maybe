# AI Agent Guide

> **Audience:** AI coding agents working in the `@nextcapital/maybe` codebase.
> **Scope:** Everything you need to read, modify, test, and extend this library correctly.
> **Not covered:** React integration patterns, deployment, publishing. See the [architecture README](../README.md) for full context.

**This is a proprietary library not in AI training data.** Do not assume anything about its
API, conventions, or structure. Follow this guide exactly.

## Critical Rules

- **Source lives in `js/`, not `src/`.** All file references start with `js/`.
- **100% test coverage is mandatory.** Jest enforces 100% across statements, branches, functions, and lines. Coverage must never decrease.
- **Always use npm scripts.** Never invoke tools directly or via `npx`. Use `package.json` scripts.
- **ES Module imports require `.js` extensions** even when importing `.ts` files. Example: `import PromiseUtils from '../promise-utils/PromiseUtils.js';`
- **Every module uses `export default`.** No named runtime exports. The one exception is the `Deferred<T>` interface, which is a named type-only export.
- **Never remove `as any` casts** in `Maybe.from()`, `Maybe.all()`, or `when()`. They bridge overload signatures to implementation — correct and intentional.
- **Never remove `.catch(() => {})` on internal promises.** This suppresses unhandled rejection warnings intentionally.
- **No circular dependencies.** Dependency direction: `Maybe` → `PromiseUtils`, `AsyncQueue` → `PromiseUtils`. `PromiseUtils` depends on nothing.
- **TypeScript strict mode is enabled.** No implicit any, unused variables/parameters, implicit returns, or fallthrough cases.

## Codebase Map

| Path | Purpose |
| --- | --- |
| `js/index.ts` | Package entry point. Re-exports all public modules. |
| `js/maybe/Maybe.ts` | Core `Maybe<T, E>` class (~550 LOC). |
| `js/maybe/Maybe.test.ts` | Tests for Maybe. |
| `js/maybe/MaybeTypes.ts` | Type utility types (`UnwrapAll`, `AllResolved`, etc.). Import with `import type` only. |
| `js/maybe/PendingValueError.ts` | Error thrown when accessing `value()` on a pending Maybe. |
| `js/promise-utils/PromiseUtils.ts` | Promise utilities object literal (`defer`, `pollForCondition`, `timeout`, etc.). |
| `js/promise-utils/PromiseUtils.test.ts` | Tests for PromiseUtils. |
| `js/async-queue/AsyncQueue.ts` | Concurrency-limited async task queue. |
| `js/async-queue/AsyncQueue.test.ts` | Tests for AsyncQueue. |
| `type-tests.ts` | Compile-time type tests (not Jest — validated via `npm run test:types`). |
| `jest.config.js` | Jest configuration with coverage thresholds and `.js` extension stripping. |
| `tsconfig.json` | TypeScript config: `strict: true`, target ES2023, NodeNext modules. |
| `eslint.config.cjs` | ESLint flat config with JSDoc enforcement. |
| `dist/` | Build output (gitignored). Never modify. |

## Import Conventions

### ES Module `.js` Extensions

All relative imports use `.js` extensions, even for `.ts` source files. `moduleNameMapper` in `jest.config.js` strips these for test execution.

```typescript
// CORRECT
import PromiseUtils from '../promise-utils/PromiseUtils.js';
import PendingValueError from './PendingValueError.js';
import type { UnwrapAll } from './MaybeTypes.js';

// WRONG — will fail at build time
import PromiseUtils from '../promise-utils/PromiseUtils';
import PromiseUtils from '../promise-utils/PromiseUtils.ts';
```

### Default Exports

Every module uses `export default`. Import accordingly:

```typescript
// CORRECT
import Maybe from './maybe/Maybe.js';

// WRONG — no named runtime exports exist
import { Maybe } from './maybe/Maybe.js';
```

### Type-Only Imports

Types from `MaybeTypes.ts` and the `Deferred` interface from `PromiseUtils.ts` must use `import type`:

```typescript
import type { UnwrapAll, AllResolved } from './MaybeTypes.js';
import type { Deferred } from '../promise-utils/PromiseUtils.js';
```

### Entry Point Re-exports

`js/index.ts` re-exports everything consumers need:

```typescript
export { default as AsyncQueue } from './async-queue/AsyncQueue.js';
export { default as Maybe } from './maybe/Maybe.js';
export { default as PromiseUtils } from './promise-utils/PromiseUtils.js';
export type { Deferred } from './promise-utils/PromiseUtils.js';
export { default as PendingValueError } from './maybe/PendingValueError.js';
```

When adding a new public export, add it here.

## NPM Scripts Reference

| Command | What It Does |
| --- | --- |
| `npm run test` | Run all Jest tests with coverage enforcement. |
| `npm run test:types` | Compile `type-tests.ts` with `--noEmit` to validate type-level tests. |
| `npm run lint` | Run all linters: ESLint + markdownlint + cspell. |
| `npm run lint:js` | Run ESLint only on `js/**/*.ts`. |
| `npm run tsc` | Compile TypeScript to `dist/`. |
| `npm run tsc:test` | Compile test files using `tsconfig.test.json`. |
| `npm run ci:local` | Full CI check: lint → test → tsc → tsc:test. Run before considering work complete. |

## Adding New Code

### New Method on Maybe

1. **Add the method to `js/maybe/Maybe.ts`** with overload signatures for each state:
   - Resolved: `this: Maybe<T, E> & { __state: 'resolved' }`
   - Rejected: `this: Maybe<T, E> & { __state: 'rejected' }`
   - Pending: `this: Maybe<T, E> & { __state: 'pending' }`
   - Generic (no state narrowing): plain `this`
2. **Add type predicates** if the method narrows state (return `this is Maybe<T, E> & { __state: 'resolved' }`).
3. **Add JSDoc comment** on the method. JSDoc is enforced by ESLint (`jsdoc/require-jsdoc`), though `require-param` and `require-returns` are disabled.
4. **Add tests in `js/maybe/Maybe.test.ts`** with nested `describe` blocks covering each state (resolved, rejected, pending) × each behavior path.
5. **Add type tests in `type-tests.ts`** using the `Expect<Equal<...>>` pattern. This file is validated by `npm run test:types`, not Jest.
6. **Run `npm run ci:local`** and confirm everything passes.

### New Method on PromiseUtils

1. **Add the method to the `PromiseUtils` object literal** in `js/promise-utils/PromiseUtils.ts`. Do not create a class — `PromiseUtils` is a plain object.
2. **Add a JSDoc comment** on the method.
3. **Add tests in `js/promise-utils/PromiseUtils.test.ts`.**
4. **If the method introduces a new type**, export it as a named type from `PromiseUtils.ts` and re-export it from `js/index.ts` using `export type { ... }`.
5. **Run `npm run ci:local`.**

### New Module

1. **Create the source file:** `js/<module-name>/<ModuleName>.ts` with a `export default` class or object.
2. **Create the test file:** `js/<module-name>/<ModuleName>.test.ts`.
3. **Add the re-export** in `js/index.ts`:

   ```typescript
   export { default as ModuleName } from './<module-name>/ModuleName.js';
   ```

4. **Run `npm run ci:local`.**

## Type System Rules

### Phantom Types

`Maybe` uses three `declare readonly` phantom properties (`__state`, `__value`, `__error`) that exist only at compile time with zero runtime cost. They enable type narrowing via intersection types and type brand extraction. Do not attempt to read or write these properties at runtime.

See [Type System Guide — Phantom Type Properties](../guides/type-system.md#phantom-type-properties) for full details on how these work and why they exist.

### Method Overloads

Core methods like `when()`, `from()`, and `all()` use extensive overload signatures:

- `when()` has 16+ overloads covering all combinations of state-narrowed and generic `this` with different handler combinations.
- `from()` has 5 overloads: resolved Maybe, rejected Maybe, pending Maybe, `Promise<T>`, and raw value.
- `all()` has 4 overloads for different tuple/array inputs.

**When adding overloads:**

- Follow the pattern of existing overloads in the same method.
- The implementation signature (the final one) uses `as any` casts to bridge between the overload return types. This is intentional — do not remove these casts.
- Order overloads from most specific to least specific. TypeScript resolves to the first matching overload.

### Type Utility Types

All type utilities live in `js/maybe/MaybeTypes.ts`:

- `UnwrapMaybe<T>` — Recursively unwraps nested `Maybe` types.
- `UnwrapValue<T>` — Extracts inner value type from `Maybe`, `Promise`, or raw value.
- `UnwrapAll<U>` — Maps a tuple of `Maybe`/`Promise`/raw values to their inner types.
- `AllResolved<U>` — Constraint type: satisfied when all Maybes are resolved and no Promises present.
- `HasRejected<U>` — Constraint type: satisfied when at least one element is a rejected `Maybe`.
- `FirstRejected<U>` — Extracts the first rejected `Maybe` from a tuple or widened array.
- `HasPending<U>` — Identity type (always matches). Catch-all overload for `Maybe.all()`.

Import these with `import type` only — they contain no runtime code.

## Testing Checklist

1. **Use `PromiseUtils.defer<T>()`** to create controllable promises in tests:

   ```typescript
   const deferred = PromiseUtils.defer<number>();
   const maybe = Maybe.from(deferred.promise);
   // maybe is pending
   deferred.resolve(42);
   await deferred.promise;
   // maybe is resolved
   ```

2. **Structure tests with nested `describe` blocks** organized by state × action × handler:

   ```typescript
   describe('methodName', () => {
     describe('when resolved', () => {
       it('does X', () => { ... });
     });
     describe('when rejected', () => {
       it('does Y', () => { ... });
     });
     describe('when pending', () => {
       it('does Z', () => { ... });
     });
   });
   ```

3. **Use `jest.useFakeTimers()`** for time-dependent tests (e.g., `PromiseUtils.pollForCondition`, `PromiseUtils.timeout`). Call `jest.useRealTimers()` in cleanup if needed — though `restoreMocks: true` handles most mock cleanup automatically.

4. **Do not manually restore mocks.** `restoreMocks: true` in `jest.config.js` auto-restores after each test.

5. **Cover all branches.** 100% branch coverage is enforced. Test both success and error paths, both sync and async paths, and edge cases like `null`, `undefined`, and nested `Maybe` instances.

6. **Add type tests in `type-tests.ts`** for any type-level behavior changes:

   ```typescript
   const result = Maybe.from(42);
   type test = Expect<Equal<typeof result, Maybe<number, unknown> & { __state: 'resolved' }>>;
   ```

   Run `npm run test:types` to validate.

7. **JSDoc is not required in test files.** The `jsdoc/require-jsdoc` rule is disabled for `js/**/*.test.ts`.

## Common Mistakes

| Mistake | Why It's Wrong | Correct Approach |
| --- | --- | --- |
| Importing without `.js` extension | Build fails — NodeNext requires extensions. | Use `.js` extension: `import X from './X.js'` |
| Using named exports | All modules use `export default`. | Use `export default class/const` and `import X from` |
| Calling `jest` or `eslint` directly | Bypasses project configuration. | Use `npm run test`, `npm run lint`, etc. |
| Removing `as any` in overloaded methods | Breaks the type bridge between overloads and implementation. | Leave casts in `from()`, `all()`, `when()` — intentional. |
| Removing `.catch(() => {})` | Causes unhandled promise rejection warnings. | Keep the suppression — it is intentional. |
| Using `import { ... }` for types from `MaybeTypes.ts` | Works but violates convention. | Use `import type { ... }` — no runtime code in that file. |
| Putting source in `src/` | Source directory is `js/`. | All source and test files go in `js/`. |
| Lowering coverage thresholds | Coverage ratchets up, never down. | Write tests to maintain 100% coverage. |
| Adding circular dependencies | Architecture is intentionally acyclic. | Maybe → PromiseUtils ← AsyncQueue. PromiseUtils depends on nothing. |
| Calling the method `then()` on Maybe | `when()` is intentionally named to avoid thenable detection. | Use `when()`, never `then()`. |
| Modifying files in `dist/` | Build output is generated and gitignored. | Edit source in `js/`, then `npm run tsc` to rebuild. |
| Creating a separate types file for a new module | Only Maybe has one due to complexity. | Put types in the module file unless they are extensive utility types. |

## Verification

Run these commands before considering any work complete:

```bash
# Full CI check — must pass entirely
npm run ci:local
```

This runs, in order:

1. `npm run lint` — ESLint + markdownlint + cspell (all must pass)
2. `npm run test` — Jest with 100% coverage enforcement
3. `npm run tsc` — TypeScript compilation to `dist/`
4. `npm run tsc:test` — Test file compilation with `tsconfig.test.json`

If you modified `type-tests.ts`, also run:

```bash
npm run test:types
```

**Do not skip any step.** A passing `npm run ci:local` is the minimum bar for any change.

## Further Reading

- [Getting Started](getting-started.md) — Human-oriented onboarding guide
- [Maybe Component](../components/maybe.md) — Full Maybe API documentation
- [PromiseUtils Component](../components/promise-utils.md) — PromiseUtils API documentation
- [AsyncQueue Component](../components/async-queue.md) — AsyncQueue API documentation
- [MaybeTypes Component](../components/maybe-types.md) — Type utility documentation
- [Type System Guide](../guides/type-system.md) — Deep dive into the type system
- [Testing Guide](../guides/testing.md) — Testing patterns and practices
- [Maybe Lifecycle](../flows/maybe-lifecycle.md) — State transitions and promise wrapping
- [Architecture README](../README.md) — Full architecture overview
