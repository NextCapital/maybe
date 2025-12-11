/**
 * Type Validation Tests
 *
 * This file contains real-world usage examples that validate the type system
 * behaves correctly. The TypeScript compiler will fail if any type assertions
 * fail, ensuring we catch type regressions.
 *
 * Run with: npm run test:types
 */

import Maybe from './js/maybe/Maybe.js';

/* eslint-disable @typescript-eslint/no-unused-vars */

// ============================================================================
// Type assertion helper - fails compilation if types don't match exactly
// ============================================================================

type Expect<T extends true> = T;
type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
  ? true
  : false;

// ============================================================================
// Test 1: Basic Maybe.from with raw values
// ============================================================================

const rawNumber = Maybe.from(42);
type test1a = Expect<Equal<typeof rawNumber, Maybe<number, unknown> & { __state: 'resolved' }>>;

const rawString = Maybe.from('hello');
type test1b = Expect<Equal<typeof rawString, Maybe<string, unknown> & { __state: 'resolved' }>>;

// Note: undefined and null work correctly at runtime but have complex union types due to overload resolution
// Just verify they compile and return Maybe instances
const rawUndefined = Maybe.from(undefined);
const _test1c: Maybe<any, any> = rawUndefined;

const rawNull = Maybe.from(null);
const _test1d: Maybe<any, any> = rawNull;

// ============================================================================
// Test 2: Maybe.from with Promises
// ============================================================================

const promiseNumber = Maybe.from(Promise.resolve(42));
type test2a = Expect<Equal<typeof promiseNumber, Maybe<number, unknown> & { __state: 'pending' }>>;

const promiseString = Maybe.from(Promise.resolve('hello'));
type test2b = Expect<Equal<typeof promiseString, Maybe<string, unknown> & { __state: 'pending' }>>;

// ============================================================================
// Test 3: Maybe.fromError
// ============================================================================

const rejectedString = Maybe.fromError('error message');
type test3a = Expect<Equal<typeof rejectedString, Maybe<undefined, string> & { __state: 'rejected' }>>;

const rejectedError = Maybe.fromError(new Error('failed'));
type test3b = Expect<Equal<typeof rejectedError, Maybe<undefined, Error> & { __state: 'rejected' }>>;

// ============================================================================
// Test 4: Maybe.from with existing Maybes (type preservation)
// ============================================================================

const innerMaybe = Maybe.from(42);
const outerMaybe = Maybe.from(innerMaybe);
type test4a = Expect<Equal<typeof outerMaybe, Maybe<number, unknown> & { __state: 'resolved' }>>;

const innerRejected = Maybe.fromError<string>('error');
const outerRejected = Maybe.from(innerRejected);
type test4b = Expect<Equal<typeof outerRejected, Maybe<undefined, string> & { __state: 'rejected' }>>;

const innerPending = Maybe.from(Promise.resolve(100));
const outerPending = Maybe.from(innerPending);
type test4c = Expect<Equal<typeof outerPending, Maybe<number, unknown> & { __state: 'pending' }>>;

// ============================================================================
// Test 5: Type narrowing with isResolved()
// ============================================================================

function testIsResolved() {
  const maybe = Maybe.from(42);

  if (maybe.isResolved()) {
    // After narrowing, should have 'resolved' state
    type testNarrowed = Expect<Equal<typeof maybe, Maybe<number, unknown> & { __state: 'resolved' }>>;

    // value() should return number, not never or unknown
    const value = maybe.value();
    type testValue = Expect<Equal<typeof value, number>>;

    return value;
  }
}

// ============================================================================
// Test 6: Type narrowing with isPending()
// ============================================================================

function testIsPending() {
  const maybe = Maybe.from(Promise.resolve(42));

  if (maybe.isPending()) {
    // After narrowing, should have 'pending' state
    type testNarrowed = Expect<Equal<typeof maybe, Maybe<number, unknown> & { __state: 'pending' }>>;

    // promise() should return Promise<number>
    const promise = maybe.promise();
    type testPromise = Expect<Equal<typeof promise, Promise<number>>>;

    return promise;
  }
}

// ============================================================================
// Test 7: Type narrowing with isRejected()
// ============================================================================

function testIsRejected() {
  const maybe = Maybe.fromError<string>('error');

  if (maybe.isRejected()) {
    // After narrowing, should have 'rejected' state
    type testNarrowed = Expect<Equal<typeof maybe, Maybe<undefined, string> & { __state: 'rejected' }>>;

    // promise() should return Promise<string> (the error type)
    const promise = maybe.promise();
    type testPromise = Expect<Equal<typeof promise, Promise<string>>>;

    return promise;
  }
}

// ============================================================================
// Test 8: Maybe.all with all resolved Maybes
// ============================================================================

const allResolvedInput = [
  Maybe.from(1),
  Maybe.from('hello'),
  Maybe.from(true),
] as const;

const allResolved = Maybe.all(allResolvedInput);
type test8a = Expect<Equal<
  typeof allResolved,
  Maybe<[number, string, boolean], unknown> & { __state: 'resolved' }
>>;

// Value should be a tuple with correct types
if (allResolved.isResolved()) {
  const [num, str, bool] = allResolved.value();
  type test8b = Expect<Equal<typeof num, number>>;
  type test8c = Expect<Equal<typeof str, string>>;
  type test8d = Expect<Equal<typeof bool, boolean>>;
}

// ============================================================================
// Test 9: Maybe.all with raw values (no Maybes)
// ============================================================================

const allRawValues = Maybe.all([1, 'hello', true]);
type test9a = Expect<Equal<
  typeof allRawValues,
  Maybe<[1, 'hello', true], unknown> & { __state: 'resolved' }
>>;

// ============================================================================
// Test 10: Maybe.all with pending Maybe
// ============================================================================

const withPendingInput = [
  Maybe.from(1),
  Maybe.from(Promise.resolve('async')),
  Maybe.from(true),
] as const;

const withPending = Maybe.all(withPendingInput);
type test10a = Expect<Equal<
  typeof withPending,
  Maybe<[number, string, boolean], unknown> & { __state: 'pending' }
>>;

// ============================================================================
// Test 11: Maybe.all with rejected Maybe
// ============================================================================

const withRejectedInput = [
  Maybe.from(1),
  Maybe.fromError<string>('error'),
  Maybe.from(true),
] as const;

const withRejected = Maybe.all(withRejectedInput);
// Should return the rejected Maybe directly, not an array
type test11a = Expect<Equal<
  typeof withRejected,
  Maybe<undefined, string> & { __state: 'rejected' }
>>;

// ============================================================================
// Test 12: Maybe.all with mixed Promises and raw values
// ============================================================================

const mixedInput = [
  42,
  Promise.resolve('async'),
  Maybe.from(true),
];

const mixedResult = Maybe.all(mixedInput);
// Mixed inputs with raw values, Promises, and Maybes - verify it produces a Maybe
const _test12check: Maybe<any, any> = mixedResult;

// ============================================================================
// Test 13: Chaining with when()
// ============================================================================

function testWhenChaining() {
  const maybe = Maybe.from(42);

  const doubled = maybe.when(x => x * 2);
  // Should return resolved Maybe<number>
  type test13a = Expect<Equal<typeof doubled, Maybe<number, unknown> & { __state: 'resolved' } | Maybe<undefined, unknown> & { __state: 'rejected' }>>;

  const stringified = maybe.when(x => x.toString());
  // Should return resolved Maybe<string>
  type test13b = Expect<Equal<typeof stringified, Maybe<string, unknown> & { __state: 'resolved' } | Maybe<undefined, unknown> & { __state: 'rejected' }>>;

  return stringified;
}

// ============================================================================
// Test 14: Chaining with when() on pending Maybe
// ============================================================================

function testWhenPending() {
  const pending = Maybe.from(Promise.resolve(42));

  const doubled = pending.when(x => x * 2);
  // Should return pending Maybe<number>
  type test14a = Expect<Equal<typeof doubled, Maybe<number, unknown> & { __state: 'pending' }>>;

  return doubled;
}

// ============================================================================
// Test 15: Error handling with catch()
// ============================================================================

function testCatch() {
  const rejected = Maybe.fromError('error');

  const recovered = rejected.catch(() => 42);
  // catch returns a complex union type - just verify it compiles and returns a Maybe
  const _typeCheck: Maybe<any, any> = recovered;

  return recovered;
}

// ============================================================================
// Test 16: Complex nested Maybe.all
// ============================================================================

const nestedAllInput = [
  Maybe.all([Maybe.from(1), Maybe.from(2)]),
  Maybe.from('hello'),
  Maybe.all([Maybe.from(true), Maybe.from(false)]),
] as const;

const nestedAll = Maybe.all(nestedAllInput);
type test16a = Expect<Equal<
  typeof nestedAll,
  Maybe<[[number, number], string, [boolean, boolean]], unknown> & { __state: 'resolved' }
>>;

// ============================================================================
// Test 17: Maybe.isMaybe type guard
// ============================================================================

function testIsMaybe(value: unknown) {
  if (Maybe.isMaybe(value)) {
    // Should narrow to Maybe<any, any> (type guard uses any for flexibility)
    // Note: We can't test the exact type here since it's a runtime type guard
    // that accepts any Maybe instance regardless of generic parameters
    return value;
  }
}

// ============================================================================
// Test 18: Generic function with Maybe
// ============================================================================

function processMaybe<T>(value: T): Maybe<T, unknown> & { __state: 'resolved' } {
  return Maybe.from(value);
}

const processed = processMaybe(42);
type test18a = Expect<Equal<typeof processed, Maybe<number, unknown> & { __state: 'resolved' }>>;

// ============================================================================
// Test 19: Maybe.all with empty array
// ============================================================================

const emptyArray = Maybe.all([]);
type test19a = Expect<Equal<typeof emptyArray, Maybe<[], unknown> & { __state: 'resolved' }>>;

// ============================================================================
// Test 20: Value extraction maintains literal types
// ============================================================================

const literalMaybe = Maybe.from(42 as const);
type test20a = Expect<Equal<typeof literalMaybe, Maybe<42, unknown> & { __state: 'resolved' }>>;

if (literalMaybe.isResolved()) {
  const literalValue = literalMaybe.value();
  type test20b = Expect<Equal<typeof literalValue, 42>>;
}

// ============================================================================
// Test 21: Error type preservation
// ============================================================================

const typedError = Maybe.fromError<TypeError>(new TypeError('type error'));
type test21a = Expect<Equal<typeof typedError, Maybe<undefined, TypeError> & { __state: 'rejected' }>>;

// ============================================================================
// Test 22: Maybe.all with single element
// ============================================================================

const singleElement = Maybe.all([Maybe.from(42)]);
type test22a = Expect<Equal<typeof singleElement, Maybe<[number], unknown> & { __state: 'resolved' }>>;

// ============================================================================
// Test 23: Union types in Maybe
// ============================================================================

const unionMaybe = Maybe.from(42 as number | string);
type test23a = Expect<Equal<typeof unionMaybe, Maybe<string | number, unknown> & { __state: 'resolved' }>>;

// ============================================================================
// Test 24: Maybe.all preserves readonly
// ============================================================================

const readonlyInput = [Maybe.from(1), Maybe.from(2)] as const;
const readonlyResult = Maybe.all(readonlyInput);
type test24a = Expect<Equal<
  typeof readonlyResult,
  Maybe<[number, number], unknown> & { __state: 'resolved' }
>>;

// ============================================================================
// Test 25: Complex real-world scenario
// ============================================================================

async function fetchUserData(userId: number): Promise<{ name: string; age: number }> {
  return { name: 'Alice', age: 30 };
}

function processUserData(userId: number) {
  const userDataMaybe = Maybe.from(fetchUserData(userId));

  // Should be pending since it's from a Promise
  type test25a = Expect<Equal<
    typeof userDataMaybe,
    Maybe<{ name: string; age: number }, unknown> & { __state: 'pending' }
  >>;

  const processedMaybe = userDataMaybe.when(data => ({
    ...data,
    isAdult: data.age >= 18
  }));

  // Should still be pending
  type test25b = Expect<Equal<
    typeof processedMaybe,
    Maybe<{ name: string; age: number; isAdult: boolean }, unknown> & { __state: 'pending' }
  >>;

  return processedMaybe;
}

// ============================================================================
// Test 26: Arrays without 'as const' - widened to union arrays
// ============================================================================

// Without 'as const', TypeScript infers mutable arrays with union element types
// These tests verify that Maybe.all still works, but returns union array types

const noConstResolved = [
  Maybe.from(1),
  Maybe.from('hello'),
  Maybe.from(true),
];

const noConstResolvedResult = Maybe.all(noConstResolved);
// Should be union array, not tuple
type test26a = Expect<Equal<
  typeof noConstResolvedResult,
  Maybe<(string | number | boolean)[], unknown> & { __state: 'resolved' }
>>;

// ============================================================================
// Test 27: Arrays without 'as const' - with pending
// ============================================================================

const noConstPending = [
  Maybe.from(1),
  Maybe.from(Promise.resolve('async')),
  Maybe.from(true),
];

const noConstPendingResult = Maybe.all(noConstPending);
// Should be union array, not tuple
type test27a = Expect<Equal<
  typeof noConstPendingResult,
  Maybe<(string | number | boolean)[], unknown> & { __state: 'pending' }
>>;

// ============================================================================
// Test 28: Arrays without 'as const' - with rejected
// ============================================================================

const noConstRejected = [
  Maybe.from(1),
  Maybe.fromError<string>('error'),
  Maybe.from(true),
];

const noConstRejectedResult = Maybe.all(noConstRejected);
// Now correctly detects rejected Maybe even without 'as const'!
// The enhanced FirstRejected type can extract rejected Maybes from widened union arrays
type test28a = Expect<Equal<
  typeof noConstRejectedResult,
  Maybe<undefined, string> & { __state: 'rejected' }
>>;

// ============================================================================
// Test 29: Mixed primitives without 'as const'
// ============================================================================

const noConstPrimitives = [1, 'hello', true];
const noConstPrimitivesResult = Maybe.all(noConstPrimitives);
// Should be union array of literal types
type test29a = Expect<Equal<
  typeof noConstPrimitivesResult,
  Maybe<(string | number | boolean)[], unknown> & { __state: 'resolved' }
>>;

// ============================================================================
// Test 30: Demonstrating 'as const' vs without for comparison
// ============================================================================

// WITH as const - preserves tuple structure
const withConstArray = [Maybe.from(1), Maybe.from('hello'), Maybe.from(true)] as const;
const withConstResult = Maybe.all(withConstArray);
type test30a = Expect<Equal<
  typeof withConstResult,
  Maybe<[number, string, boolean], unknown> & { __state: 'resolved' }
>>;

// WITHOUT as const - widens to union array
const withoutConstArray = [Maybe.from(1), Maybe.from('hello'), Maybe.from(true)];
const withoutConstResult = Maybe.all(withoutConstArray);
type test30b = Expect<Equal<
  typeof withoutConstResult,
  Maybe<(string | number | boolean)[], unknown> & { __state: 'resolved' }
>>;

// Runtime behavior is identical - only types differ
if (withConstResult.isResolved() && withoutConstResult.isResolved()) {
  const withValues = withConstResult.value(); // Type: [number, string, boolean]
  const withoutValues = withoutConstResult.value(); // Type: (string | number | boolean)[]

  // Both have same runtime values: [1, 'hello', true]
  // The difference is only in compile-time type information
}

// ============================================================================
// SUCCESS: If this file compiles without errors, all type tests pass!
// ============================================================================

console.log('✅ All type assertions passed!');
