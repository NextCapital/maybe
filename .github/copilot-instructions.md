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
| `js/maybe/Maybe.ts` | Core `Maybe<T, E>` class. |
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

Every module uses `export default`. Import accordingly.

### Type-Only Imports

Types from `MaybeTypes.ts` and the `Deferred` interface from `PromiseUtils.ts` must use `import type`.

### Entry Point Re-exports

`js/index.ts` re-exports everything consumers need. When adding a new public export, add it here.

## Development Workflow

### Testing

- **100% coverage** is required across all metrics
- Tests are colocated with source files (e.g., `Maybe.test.ts` next to `Maybe.ts`)
- Use `PromiseUtils.defer()` for controlling async flow in tests
- Run tests: `npm run test`
- See [Testing Patterns](.github/docs/guides/testing.md) for conventions and patterns

### TypeScript

- Strict mode is enabled
- Type-level tests live in `type-tests.ts` and are validated with `npm run test:types`
- See [Type System Guide](.github/docs/guides/type-system.md) for phantom types, overloads, and narrowing

### Full CI check

Before pushing, run the full local CI pipeline to catch all issues:

```bash
npm run ci:local
```

This runs: lint → test → tsc → tsc:test.

## Adding New Code

### New Method on Maybe

1. Add the method to `js/maybe/Maybe.ts` with overload signatures for each state (resolved, rejected, pending, generic). See [Type System Guide](.github/docs/guides/type-system.md#adding-new-type-narrowed-methods) for the overload pattern.
2. Add type predicates if the method narrows state.
3. Add JSDoc comment (enforced by ESLint).
4. Add tests in `js/maybe/Maybe.test.ts` with nested `describe` blocks covering each state × behavior path. See [Testing Patterns](.github/docs/guides/testing.md).
5. Add type tests in `type-tests.ts` using the `Expect<Equal<...>>` pattern.
6. Run `npm run ci:local`.

### New Method on PromiseUtils

1. Add the method to the `PromiseUtils` object literal in `js/promise-utils/PromiseUtils.ts`. Do not create a class.
2. Add a JSDoc comment.
3. Add tests in `js/promise-utils/PromiseUtils.test.ts`.
4. If the method introduces a new type, export it as a named type and re-export from `js/index.ts`.
5. Run `npm run ci:local`.

### New Module

1. Create `js/<module-name>/<ModuleName>.ts` with `export default`.
2. Create `js/<module-name>/<ModuleName>.test.ts`.
3. Add re-export in `js/index.ts`.
4. Run `npm run ci:local`.

## Type System Rules

`Maybe` uses phantom type properties, type predicates, and method overloads for compile-time state narrowing. See [Type System Guide](.github/docs/guides/type-system.md) for full details and [MaybeTypes](.github/docs/components/maybe-types.md) for utility type documentation.

Key rules for working with the type system:

- Phantom properties (`__state`, `__value`, `__error`) are compile-time only — never read or write at runtime
- Overloads are ordered most-specific to least-specific; implementation signatures use intentional `as any` casts
- All types in `MaybeTypes.ts` must use `import type` — no runtime code in that file

## Documentation Routing

| Task | Start here |
| --- | --- |
| Understand Maybe API, state model, or chaining | [Maybe](.github/docs/components/maybe.md) |
| Understand PromiseUtils methods | [PromiseUtils](.github/docs/components/promise-utils.md) |
| Understand AsyncQueue | [AsyncQueue](.github/docs/components/async-queue.md) |
| Understand phantom types, overloads, or type narrowing | [Type System Guide](.github/docs/guides/type-system.md) |
| Understand `MaybeTypes.ts` utility types | [MaybeTypes](.github/docs/components/maybe-types.md) |
| Write or modify tests | [Testing Patterns](.github/docs/guides/testing.md) |
| Integrate Maybe with React Suspense | [React Suspense Guide](.github/docs/guides/react-suspense.md) |
| Onboard to the codebase | [Getting Started](.github/docs/onboarding/getting-started.md) |
| Look up a proprietary term | [Glossary](.github/docs/onboarding/glossary.md) |
| Understand state transition timing | [Maybe Lifecycle](.github/docs/flows/maybe-lifecycle.md) |
| Understand `when()`/`catch()`/`finally()` dispatch | [Chaining Flow](.github/docs/flows/chaining.md) |
| Architecture overview and design decisions | [Architecture README](.github/docs/README.md) |

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
