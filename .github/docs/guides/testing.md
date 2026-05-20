# Testing Patterns

Tests verify both runtime behavior (Jest) and compile-time type correctness (`tsc`). 100% coverage is enforced — see [Critical Rules](../../copilot-instructions.md).

## Test Structure

Tests are colocated with source files (`Foo.ts` → `Foo.test.ts`). Type-level tests live in [type-tests.ts](../../../type-tests.ts) at the project root.

Use nested `describe` blocks to create a **state × action** matrix: outermost block names the method, inner blocks enumerate states (resolved, rejected, pending), innermost blocks describe scenarios. This makes coverage gaps immediately visible.

## Key Patterns

### Deferred Promises for Async Control

`PromiseUtils.defer()` creates a promise whose resolution is controlled by the test, enabling precise async timing control. `Maybe` wraps promises and transitions states as they settle — a deferred lets the test decide exactly when.

```typescript
let deferred: Deferred<number>;

beforeEach(() => {
  deferred = PromiseUtils.defer<number>();
});

test('becomes resolved after the promise resolves', async () => {
  const maybe = Maybe.from(deferred.promise);
  deferred.resolve(42);
  await deferred.promise;
  expect(maybe.isResolved()).toBe(true);
  expect(maybe.value()).toBe(42);
});
```

Always `await` the promise (or `promise.catch(() => {})` for rejections) before asserting post-settlement state.

### State × Action Matrix

Every method must be tested against all three states. For pending, test both eventual-resolve and eventual-reject paths.

| State | What to verify |
|-------|---------------|
| Resolved | Synchronous behavior: return values, state checks |
| Rejected | Synchronous behavior with error values |
| Pending → resolves | Async: `await` the promise, then check state |
| Pending → rejects | Async: `await` the rejection, then check state |

When a method creates new Maybes (e.g., `when`, `catch`, `finally`), verify the returned Maybe is a distinct instance.

### Fake Timers

Use Jest fake timers for time-dependent behavior (`setTimeout`, polling, timeouts). Always call `jest.runOnlyPendingTimers()` in `afterEach` before `jest.useRealTimers()` to flush pending timers.

### Unhandled Rejection Safety

Test files that create Maybes from promises should install a global `unhandledRejection` listener to convert silent failures into explicit test failures:

```typescript
process.on('unhandledRejection', (error) => {
  fail(error as Error);
});
```

### Private Method Spying

Use `jest.spyOn` to isolate orchestration logic (e.g., `AsyncQueue.perform()` delegates to `_performTask`). The Jest config sets `restoreMocks: true`, so all spies are automatically restored.

### Type-Level Testing

Compile-time assertions in [type-tests.ts](../../../type-tests.ts) verify TypeScript infers correct types. Uses `Expect<Equal<...>>` helpers that fail compilation if types don't match. Run via `npm run test:types`.

Covers: `Maybe.from` overloads, `Maybe.fromError`, type narrowing via state checks, chaining return types, and `Maybe.all` tuple inference.

## Running Tests

See the [NPM Scripts table](../../../README.md#npm-scripts) in README.md for all available commands.

## Writing New Tests

1. **Create test file** next to source: `js/foo/Bar.test.ts`
2. **Import with `.js` extensions** — Jest `moduleNameMapper` strips them
3. **Add `unhandledRejection` listener** if testing async behavior
4. **Structure describes** as state × action matrix with `beforeEach` creating fresh deferreds
5. **Write assertions** — use `deferred.resolve()`/`reject()` for state transitions, always `await` before asserting
6. **Add type tests** in [type-tests.ts](../../../type-tests.ts) for new public API using `Expect<Equal<...>>`
7. **Verify** — `npm run test` and `npm run test:types` must both pass

## Related Documentation

- [PromiseUtils](../components/promise-utils.md) — `defer()` and `Deferred` type
- [Type System Guide](type-system.md) — phantom brands and type narrowing
- [Maybe](../components/maybe.md) — primary class under test
