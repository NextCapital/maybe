# Testing Patterns

## Overview

`@nextcapital/maybe` enforces 100% code coverage and uses structured testing designed around the library's async nature. Tests verify both runtime behavior (Jest) and compile-time type correctness (`tsc`). This guide covers testing philosophy, required patterns, and instructions for writing tests.

**Scope:** Runtime unit tests, type-level tests, and the patterns that connect them. Does not cover integration or end-to-end testing (not applicable for this library).

## Coverage Requirements

Every source file under `js/` must have 100% coverage across statements, branches, functions, and lines. This is enforced by Jest's `coverageThreshold` configuration — the test suite will fail if any metric drops below 100%.

**Why 100%:** As a foundational library, `@nextcapital/maybe` cannot afford untested code paths. Async state transitions are particularly error-prone, and exhaustive coverage ensures every transition is verified.

**What's excluded from coverage:**
- [index.ts](../../../js/index.ts) — barrel re-export file with no logic
- All `*.test.ts` files — test files themselves

**Where it's configured:**

```javascript
// jest.config.js
coverageThreshold: {
  global: { statements: 100, branches: 100, functions: 100, lines: 100 }
},
collectCoverageFrom: [
  "js/**/*.ts",
  '!js/index.ts',
  '!js/**/*.test.ts'
]
```

## Test Structure

### File Location and Naming

Tests are colocated with their source files. Each source file `Foo.ts` has a corresponding `Foo.test.ts` in the same directory.

| Source File | Test File |
|-------------|-----------|-------|
| [Maybe.ts](../../../js/maybe/Maybe.ts) | [Maybe.test.ts](../../../js/maybe/Maybe.test.ts) |
| [PromiseUtils.ts](../../../js/promise-utils/PromiseUtils.ts) | [PromiseUtils.test.ts](../../../js/promise-utils/PromiseUtils.test.ts) |
| [AsyncQueue.ts](../../../js/async-queue/AsyncQueue.ts) | [AsyncQueue.test.ts](../../../js/async-queue/AsyncQueue.test.ts) |

Type-level tests live in a separate file at the project root: [type-tests.ts](../../../type-tests.ts).

**Why colocated:** Tests sit next to the code they verify, making coverage gaps immediately clear.

### Describe Block Organization

Use nested `describe` blocks to create a **state × action** matrix. The outermost `describe` names the method. Inner blocks enumerate states, and innermost blocks describe specific scenarios.

```typescript
describe('Maybe', () => {
  describe('when', () => {
    describe('when resolved', () => {
      describe('when onResolve returns a value', () => {
        test('creates a new resolved maybe from the return value', () => { ... });
      });
      describe('when onResolve returns a promise', () => { ... });
      describe('when onResolve returns a maybe', () => { ... });
    });

    describe('when rejected', () => { ... });

    describe('when pending', () => {
      describe('after the promise resolves', () => { ... });
      describe('after the promise rejects', () => { ... });
    });
  });
});
```

**Why this structure:** `Maybe` has three states and many methods. Every method must be tested in every applicable state. The nested structure makes coverage gaps immediately visible.

## Key Patterns

### Deferred Promises for Async Control

The most important testing pattern in this codebase. `PromiseUtils.defer()` creates a promise whose resolution is controlled by the test, enabling precise async timing control.

**Why:** `Maybe` wraps promises and transitions states as they settle. Tests must verify behavior at each stage. A deferred promise lets the test decide exactly when settlement occurs.

```typescript
import PromiseUtils, { Deferred } from '../promise-utils/PromiseUtils.js';

describe('Maybe', () => {
  let deferred: Deferred<number>;
  let promise: Promise<number>;

  beforeEach(() => {
    deferred = PromiseUtils.defer<number>();
    promise = deferred.promise;
  });

  test('is pending before the promise resolves', () => {
    const maybe = Maybe.from(promise);
    expect(maybe.isReady()).toBe(false);
  });

  test('becomes resolved after the promise resolves', async () => {
    const maybe = Maybe.from(promise);

    deferred.resolve(42);       // Test controls when resolution happens
    await promise;

    expect(maybe.isResolved()).toBe(true);
    expect(maybe.value()).toBe(42);
  });

  test('becomes rejected after the promise rejects', async () => {
    const maybe = Maybe.from(promise);
    const error = new Error('whoops');

    deferred.reject(error);     // Test controls rejection
    await promise.catch(() => {});

    expect(maybe.isRejected()).toBe(true);
    expect(maybe.valueOrError()).toBe(error);
  });
});
```

**Key details:**
- Import both `PromiseUtils` and the `Deferred` type from [PromiseUtils.ts](../../../js/promise-utils/PromiseUtils.ts)
- Create a fresh deferred in `beforeEach` so each test starts with an unsettled promise
- Call `deferred.resolve(value)` or `deferred.reject(error)` to trigger state transitions
- Always `await` the promise (or `promise.catch(() => {})` for rejections) before asserting post-settlement state

For details on the `Deferred` type and `PromiseUtils.defer()`, see [PromiseUtils](../components/promise-utils.md).

### State × Action Test Matrix

Every method on `Maybe` must be tested against all three states. For pending, test both eventual-resolve and eventual-reject paths.

**The matrix:**

| State | Sub-states | What to verify |
|-------|-----------|---------------|
| Resolved | — | Synchronous behavior: return values, state checks |
| Rejected | — | Synchronous behavior with error values |
| Pending | After resolve | Async behavior: `await` the promise, then check state |
| Pending | After reject | Async behavior: `await` the rejection, then check state |

```typescript
describe('when', () => {
  describe('when resolved', () => {
    beforeEach(() => {
      maybe = Maybe.from(value);
    });

    test('creates a new resolved maybe from the return value', () => {
      const newMaybe = maybe.when((v) => v * 2);
      expect(newMaybe.value()).toBe(value * 2);
    });
  });

  describe('when rejected', () => {
    beforeEach(() => {
      maybe = Maybe.fromError(error);
    });

    test('returns itself', () => {
      expect(maybe.when(onResolve)).toBe(maybe);
    });
  });

  describe('when pending', () => {
    beforeEach(() => {
      maybe = Maybe.from(promise);
    });

    describe('after the promise resolves', () => {
      test('returns a pending maybe for the value', async () => {
        const newMaybe = maybe.when(onResolve);
        deferred.resolve(value);
        await expect(newMaybe.promise()).resolves.toBe(onResolve(value));
      });
    });

    describe('after the promise rejects', () => {
      test('returns a pending maybe for the error', async () => {
        const newMaybe = maybe.when(onResolve);
        deferred.reject(error);
        await expect(newMaybe.promise()).rejects.toBe(error);
      });
    });
  });
});
```

**When a method creates new maybes** (e.g., `when`, `catch`, `finally`), verify that the returned maybe is a distinct instance (`expect(newMaybe).not.toBe(maybe)`).

### Fake Timers

Use Jest fake timers for any test involving time-dependent behavior (`setTimeout`, `setInterval`, polling, timeouts).

**Why:** Real timers make tests slow and non-deterministic. Fake timers advance time instantly and predictably.

```typescript
beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.runOnlyPendingTimers();  // Flush remaining timers to avoid leaks
  jest.useRealTimers();         // Restore real timers for other tests
});

test('resolves when the condition becomes true', async () => {
  let trigger = false;
  setTimeout(() => { trigger = true; }, 100);

  const promise = PromiseUtils.pollForCondition(() => trigger);
  jest.advanceTimersByTime(100);   // Instantly advance 100ms

  await expect(promise).resolves.toBeUndefined();
});
```

**Critical:** Always call `jest.runOnlyPendingTimers()` in `afterEach` before `jest.useRealTimers()` to flush pending timers that would otherwise leak.

### Unhandled Rejection Safety

[Maybe.test.ts](../../../js/maybe/Maybe.test.ts) installs a global `unhandledRejection` listener. This ensures unhandled promise rejections immediately fail the test rather than silently passing.

```typescript
process.on('unhandledRejection', (error) => {
  fail(error as Error);
});
```

**Why:** `Maybe` manages promises internally. If error handling has a bug, a rejection could go unhandled. Without this listener, Jest would not fail the test. This converts silent failures into explicit test failures.

**When to use:** Add this listener to any test file that creates Maybes from promises or tests async state transitions.

### Private Method Spying

Use `jest.spyOn` to mock internal methods when testing a method's orchestration logic independently of its implementation details.

```typescript
beforeEach(() => {
  jest.spyOn(asyncQueue, '_performTask').mockImplementation();
  task = jest.fn().mockReturnValue(Promise.resolve());
});

test('defers to _performTask and returns a promise', () => {
  const result = asyncQueue.perform(task);
  expect(asyncQueue._performTask).toHaveBeenCalledWith(expect.anything(), task);
  expect(PromiseUtils.isThenable(result)).toBe(true);
});
```

**Why:** `AsyncQueue.perform()` delegates to `_performTask`. Spying isolates the capacity-check and queuing logic without triggering actual task execution.

**Mock restoration:** The Jest config sets `restoreMocks: true`, so all spies and mocks are automatically restored after each test. No manual `mockRestore()` calls needed.

### Type-Level Testing

Type correctness is tested separately from runtime behavior using compile-time assertions in [type-tests.ts](../../../type-tests.ts). These verify TypeScript infers correct types for `Maybe` across construction, narrowing, and chaining.

**Why:** Runtime tests cannot verify type inference. A method might return the correct value but have an incorrect return type. Type tests catch these regressions.

**How it works:**

```typescript
// Type assertion helpers — fail compilation if types don't match
type Expect<T extends true> = T;
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false;

// Assert that Maybe.from(42) produces the correct branded type
const rawNumber = Maybe.from(42);
type test1a = Expect<Equal<
  typeof rawNumber,
  Maybe<number, unknown> & { __state: 'resolved' }
>>;
```

If any type assertion is wrong, `tsc --noEmit` fails with a compilation error. This is run as a separate step via `npm run test:types`.

**What type tests cover:**
- `Maybe.from` with raw values, promises, and existing maybes
- `Maybe.fromError` type inference
- Type narrowing via `isResolved()`, `isPending()`, `isRejected()`
- Chaining methods (`when`, `catch`, `finally`) preserving correct types
- `Maybe.all` tuple and array type inference

For full details on the type system, see the [Type System Guide](type-system.md).

## Running Tests

| Command | Purpose |
|---------|---------|
| `npm run test` | Run Jest: all runtime tests with 100% coverage enforcement |
| `npm run test:types` | Run `tsc --noEmit` on [type-tests.ts](../../../type-tests.ts) — compile-time type validation |
| `npm run tsc:test` | Compile test files with [tsconfig.test.json](../../../tsconfig.test.json) — verifies test files compile cleanly |
| `npm run ci:local` | Full local CI check: lint + test + tsc + tsc:test |

**For a complete validation pass,** run `npm run ci:local`. This mirrors CI and catches all error categories: lint violations, test failures, coverage drops, and type errors.

## Writing New Tests

Follow these steps when adding tests for new or modified code.

### Step 1: Create or locate the test file

Place tests next to the source file. If `js/foo/Bar.ts` is new, create `js/foo/Bar.test.ts`.

### Step 2: Add imports

```typescript
import PromiseUtils, { Deferred } from '../promise-utils/PromiseUtils.js';
import Bar from './Bar.js';
```

Use `.js` extensions in imports — the Jest `moduleNameMapper` in [jest.config.js](../../../jest.config.js) strips them to resolve TypeScript source files.

### Step 3: Add the unhandled rejection listener (if testing async behavior)

```typescript
process.on('unhandledRejection', (error) => {
  fail(error as Error);
});
```

### Step 4: Set up the describe structure

Create nested `describe` blocks following the state × action matrix:

```typescript
describe('Bar', () => {
  let deferred: Deferred<number>;
  let promise: Promise<number>;

  beforeEach(() => {
    deferred = PromiseUtils.defer<number>();
    promise = deferred.promise;
  });

  describe('someMethod', () => {
    describe('when resolved', () => { ... });
    describe('when rejected', () => { ... });
    describe('when pending', () => {
      describe('after the promise resolves', () => { ... });
      describe('after the promise rejects', () => { ... });
    });
  });
});
```

### Step 5: Write assertions

- Use `deferred.resolve(value)` / `deferred.reject(error)` to trigger state transitions
- Always `await` promises before asserting post-settlement state
- Verify both the return value and state (`isResolved()`, `isRejected()`, etc.)
- For methods returning new maybes, assert the new instance is distinct: `expect(newMaybe).not.toBe(maybe)`

### Step 6: Add type-level tests (if adding new public API)

Add type assertions to [type-tests.ts](../../../type-tests.ts):

```typescript
// Test: Bar.someMethod preserves type
const result = bar.someMethod(42);
type testBarMethod = Expect<Equal<typeof result, Maybe<number, unknown>>>;
```

### Step 7: Verify

```bash
npm run test          # Runtime tests + coverage
npm run test:types    # Type-level tests
```

Both must pass. Coverage must remain at 100%.

## Related Documentation

- [PromiseUtils](../components/promise-utils.md) — `defer()` and `Deferred` type used for async test control
- [Type System Guide](type-system.md) — full details on the type system and type-level testing
- [Maybe](../components/maybe.md) — the primary class under test
- [AsyncQueue](../components/async-queue.md) — queue component tested with spy patterns

## Documentation Coverage Summary

| Metric | Value |
| --- |
| **Areas Documented** | 9 sections with full coverage |
| **Areas Partially Covered** |
| **Areas Unknown** |
| **Total Evidence Citations** | 18 file paths cited across all Evidence blocks |
| **Total UNVERIFIED Markers** |
| **Confidence Distribution** | HIGH: 9, MEDIUM: 0, LOW: 0 |
| **Coverage Scan Status** | 9/9 categories Clear, 0 Partial, 0 Missing |
