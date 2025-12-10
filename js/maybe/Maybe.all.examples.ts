/**
 * Comprehensive test file for Maybe.all type signatures
 * This file tests various real-world scenarios to ensure type narrowing works correctly
 */

import Maybe from './Maybe.js';

// ============================================================================
// SCENARIO 1: All resolved Maybes (should return resolved Maybe)
// ============================================================================

const resolved1 = Maybe.from(1);
const resolved2 = Maybe.from('hello');
const resolved3 = Maybe.from(true);

// Expected: Maybe<[number, string, boolean], unknown> & { __state: 'resolved' }
const allResolved = Maybe.all([resolved1, resolved2, resolved3]);
type AllResolvedType = typeof allResolved;
// Verify we can call .value() without error (only works on resolved)
const allResolvedValue = allResolved.value();
type AllResolvedValueType = typeof allResolvedValue; // Should be: [number, string, boolean]

// ============================================================================
// SCENARIO 2: Mix of raw values (should return resolved Maybe)
// ============================================================================

// Expected: Maybe<[number, string, boolean, null, undefined], unknown> & { __state: 'resolved' }
const allRawValues = Maybe.all([1, 'hello', true, null, undefined]);
type AllRawValuesType = typeof allRawValues;
const allRawValuesValue = allRawValues.value();
type AllRawValuesValueType = typeof allRawValuesValue;

// ============================================================================
// SCENARIO 3: Mix of resolved Maybes and raw values (should return resolved)
// ============================================================================

const mixedResolved1 = Maybe.from(42);
const mixedResolved2 = Maybe.from('world');

// Expected: Maybe<[number, string, number, string], unknown> & { __state: 'resolved' }
const mixedResolvedAndRaw = Maybe.all([mixedResolved1, 'test', 99, mixedResolved2]);
type MixedResolvedAndRawType = typeof mixedResolvedAndRaw;
const mixedResolvedAndRawValue = mixedResolvedAndRaw.value();
type MixedResolvedAndRawValueType = typeof mixedResolvedAndRawValue;

// ============================================================================
// SCENARIO 4: Pending Promise (should return pending Maybe)
// ============================================================================

const pendingPromise = new Promise<number>((resolve) => setTimeout(() => resolve(100), 1000));

// Expected: Maybe<[number], unknown> & { __state: 'pending' }
const withPendingPromise = Maybe.all([pendingPromise]);
type WithPendingPromiseType = typeof withPendingPromise;
// Note: Cannot call .value() on pending - should be type error
// const pendingValue = withPendingPromise.value(); // This should error

// ============================================================================
// SCENARIO 5: Pending Maybe (should return pending Maybe)
// ============================================================================

const pendingMaybe = Maybe.from(new Promise<string>((resolve) => setTimeout(() => resolve('async'), 500)));

// Expected: Maybe<[number, string], unknown> & { __state: 'pending' }
const withPendingMaybe = Maybe.all([pendingMaybe]);
type WithPendingMaybeType = typeof withPendingMaybe;

// ============================================================================
// SCENARIO 6: Mix of resolved and pending (should return pending)
// ============================================================================

const resolvedA = Maybe.from(1);
const pendingB = Maybe.from(Promise.resolve(2));
const resolvedC = Maybe.from(3);

// Expected: Maybe<[number, number, number], unknown> & { __state: 'pending' }
const mixedResolvedPending = Maybe.all([resolvedA, pendingB, resolvedC]);
type MixedResolvedPendingType = typeof mixedResolvedPending;

// ============================================================================
// SCENARIO 7: Rejected Maybe (should throw, not in return type)
// ============================================================================

const rejectedMaybe = Maybe.fromError(new Error('Failed!'));
const resolvedForReject = Maybe.from(123);

try {
  // This should throw at runtime
  const withRejected = Maybe.all([resolvedForReject, rejectedMaybe]);
  // Type would be: Maybe<[number, undefined], unknown> but won't reach here at runtime
  console.log(withRejected);
} catch (error) {
  // Expected: error is the rejected Maybe
  if (Maybe.isMaybe(error)) {
    console.log('Caught rejected maybe:', error.valueOrError());
  }
}

// ============================================================================
// SCENARIO 8: Complex nested types
// ============================================================================

interface User {
  id: number;
  name: string;
}

interface Post {
  title: string;
  authorId: number;
}

const user = Maybe.from<User>({ id: 1, name: 'Alice' });
const post = Maybe.from<Post>({ title: 'Hello', authorId: 1 });
const count = Maybe.from(42);

// Expected: Maybe<[User, Post, number], unknown> & { __state: 'resolved' }
const complexResolved = Maybe.all([user, post, count]);
type ComplexResolvedType = typeof complexResolved;
const complexResolvedValue = complexResolved.value();
type ComplexResolvedValueType = typeof complexResolvedValue;

// ============================================================================
// SCENARIO 9: Arrays and objects
// ============================================================================

const arrayValue = Maybe.from([1, 2, 3]);
const objectValue = Maybe.from({ key: 'value' });

// Expected: Maybe<[number[], { key: string }], unknown> & { __state: 'resolved' }
const withArraysAndObjects = Maybe.all([arrayValue, objectValue]);
type WithArraysAndObjectsType = typeof withArraysAndObjects;
const withArraysAndObjectsValue = withArraysAndObjects.value();
type WithArraysAndObjectsValueType = typeof withArraysAndObjectsValue;

// ============================================================================
// SCENARIO 10: Empty array
// ============================================================================

// Expected: Maybe<[], unknown> & { __state: 'resolved' }
const emptyArray = Maybe.all([]);
type EmptyArrayType = typeof emptyArray;
const emptyArrayValue = emptyArray.value();
type EmptyArrayValueType = typeof emptyArrayValue; // Should be: []

// ============================================================================
// SCENARIO 11: Single element arrays
// ============================================================================

// Expected: Maybe<[number], unknown> & { __state: 'resolved' }
const singleResolved = Maybe.all([Maybe.from(42)]);
type SingleResolvedType = typeof singleResolved;
const singleResolvedValue = singleResolved.value();
type SingleResolvedValueType = typeof singleResolvedValue;

// Expected: Maybe<[number], unknown> & { __state: 'pending' }
const singlePending = Maybe.all([Promise.resolve(42)]);
type SinglePendingType = typeof singlePending;

// ============================================================================
// SCENARIO 12: Chaining Maybe.all with .when()
// ============================================================================

const maybe1 = Maybe.from(1);
const maybe2 = Maybe.from(2);
const maybe3 = Maybe.from(3);

// Expected: Chain should preserve types through .when()
const chainedAll = Maybe.all([maybe1, maybe2, maybe3]).when((values) => {
  // values should be: [number, number, number]
  const sum = values.reduce((a, b) => a + b, 0);
  return sum;
});
type ChainedAllType = typeof chainedAll; // Should be Maybe<number, unknown> & { __state: 'resolved' }
// Note: .when() can return rejected, so we need to check state before calling .value()
if (chainedAll.isResolved()) {
  const chainedAllValue = chainedAll.value();
  console.log('Chained value:', chainedAllValue); // chainedAllValue should be: number
}

// ============================================================================
// SCENARIO 13: Nested Maybe.all calls
// ============================================================================

const inner1 = Maybe.all([Maybe.from(1), Maybe.from(2)]);
const inner2 = Maybe.all([Maybe.from(3), Maybe.from(4)]);

// Expected: Maybe<[[number, number], [number, number]], unknown> & { __state: 'resolved' }
const nestedAll = Maybe.all([inner1, inner2]);
type NestedAllType = typeof nestedAll;
const nestedAllValue = nestedAll.value();
type NestedAllValueType = typeof nestedAllValue; // Should be: [[number, number], [number, number]]

// ============================================================================
// SCENARIO 14: Generic functions returning Maybe
// ============================================================================

function fetchUser(id: number): Maybe<User> {
  return Maybe.from<User>({ id, name: `User${id}` });
}

function fetchPost(id: number): Maybe<Post> {
  return Maybe.from<Post>({ title: `Post${id}`, authorId: id });
}

// Expected: Maybe<[User, Post], unknown> & { __state: 'resolved' }
const fromFunctions = Maybe.all([fetchUser(1), fetchPost(1)]);
type FromFunctionsType = typeof fromFunctions;
const fromFunctionsValue = fromFunctions.value();
type FromFunctionsValueType = typeof fromFunctionsValue;

// ============================================================================
// SCENARIO 15: Async functions with Promise
// ============================================================================

async function asyncFetch(): Promise<string> {
  return 'async result';
}

// Expected: Maybe<[string], unknown> & { __state: 'pending' }
const withAsyncFunction = Maybe.all([asyncFetch()]);
type WithAsyncFunctionType = typeof withAsyncFunction;

// ============================================================================
// SCENARIO 16: Union types
// ============================================================================

type StringOrNumber = string | number;
const union1 = Maybe.from<StringOrNumber>(42);
const union2 = Maybe.from<StringOrNumber>('hello');

// Expected: Maybe<[StringOrNumber, StringOrNumber], unknown> & { __state: 'resolved' }
const withUnions = Maybe.all([union1, union2]);
type WithUnionsType = typeof withUnions;
const withUnionsValue = withUnions.value();
type WithUnionsValueType = typeof withUnionsValue; // Should be: [string | number, string | number]

// ============================================================================
// SCENARIO 17: Optional/undefined values
// ============================================================================

const optional1 = Maybe.from<number | undefined>(42);
const optional2 = Maybe.from<number | undefined>(undefined);

// Expected: Maybe<[number | undefined, number | undefined], unknown> & { __state: 'resolved' }
const withOptionals = Maybe.all([optional1, optional2]);
type WithOptionalsType = typeof withOptionals;
const withOptionalsValue = withOptionals.value();
type WithOptionalsValueType = typeof withOptionalsValue;

// ============================================================================
// SCENARIO 18: Real-world example: Parallel data fetching
// ============================================================================

interface Product {
  id: number;
  name: string;
  price: number;
}

interface Review {
  productId: number;
  rating: number;
  comment: string;
}

interface Inventory {
  productId: number;
  stock: number;
}

function fetchProduct(id: number): Maybe<Product, Error> {
  // Simulating sync cache hit
  return Maybe.from({ id, name: `Product ${id}`, price: 99.99 });
}

function fetchReviews(productId: number): Maybe<Review[], Error> {
  // Simulating async API call
  return Maybe.from(
    Promise.resolve([
      { productId, rating: 5, comment: 'Great!' }
    ])
  );
}

function fetchInventory(productId: number): Maybe<Inventory, Error> {
  return Maybe.from({ productId, stock: 100 });
}

const productId = 123;
const productData = Maybe.all([
  fetchProduct(productId),
  fetchReviews(productId),
  fetchInventory(productId)
]);

// Expected: Maybe<[Product, Review[], Inventory], unknown> & { __state: 'pending' }
type ProductDataType = typeof productData;

// In real code, we'd handle this with .when()
const productPage = productData.when(([product, reviews, inventory]) => {
  // All data is available here with proper types
  // product is Product, reviews is Review[], inventory is Inventory
  return {
    product,
    reviews,
    inStock: inventory.stock > 0
  };
});

type ProductPageType = typeof productPage;

// ============================================================================
// SCENARIO 19: Error handling with .catch()
// ============================================================================

const mayFail1 = Maybe.from(Promise.resolve(1));
const mayFail2 = Maybe.from(Promise.resolve(2));

const withErrorHandling = Maybe.all([mayFail1, mayFail2])
  .catch((error) => {
    console.error('Failed:', error);
    return [0, 0] as [number, number];
  });

type WithErrorHandlingType = typeof withErrorHandling;

// ============================================================================
// SCENARIO 20: Using .finally() with Maybe.all
// ============================================================================

const withFinally = Maybe.all([Maybe.from(1), Maybe.from(2)])
  .finally(() => {
    console.log('Cleanup');
  });

type WithFinallyType = typeof withFinally;
// Note: .finally() can return rejected, so check state before calling .value()
if (withFinally.isResolved()) {
  const withFinallyValue = withFinally.value();
  console.log('Finally value:', withFinallyValue); // withFinallyValue should preserve: [number, number]
}

// ============================================================================
// SCENARIO 21: Readonly arrays
// ============================================================================

const readonlyArray = [Maybe.from(1), Maybe.from(2), Maybe.from(3)] as const;

// Expected: Should handle readonly arrays
const fromReadonly = Maybe.all(readonlyArray);
type FromReadonlyType = typeof fromReadonly;
const fromReadonlyValue = fromReadonly.value();
type FromReadonlyValueType = typeof fromReadonlyValue;

// ============================================================================
// SCENARIO 22: Large tuple (testing tuple preservation)
// ============================================================================

const largeTuple = Maybe.all([
  Maybe.from(1),
  Maybe.from('two'),
  Maybe.from(true),
  Maybe.from(null),
  Maybe.from(undefined),
  Maybe.from({ key: 'value' }),
  Maybe.from([1, 2, 3]),
  Maybe.from(42),
  Maybe.from('end')
]);

type LargeTupleType = typeof largeTuple;
const largeTupleValue = largeTuple.value();
type LargeTupleValueType = typeof largeTupleValue;
// Should be: [number, string, boolean, null, undefined, { key: string }, number[], number, string]

// ============================================================================
// SCENARIO 23: Type inference with const assertions
// ============================================================================

const constValues = [1, 'hello', true] as const;
const fromConst = Maybe.all(constValues);
type FromConstType = typeof fromConst;
const fromConstValue = fromConst.value();
type FromConstValueType = typeof fromConstValue; // Should be: [1, "hello", true] (literal types)

// ============================================================================
// SCENARIO 24: Maybe wrapping Maybe (should unwrap)
// ============================================================================

const innerMaybe = Maybe.from(42);
const outerMaybe = Maybe.from(innerMaybe);

// When passed to Maybe.all, should unwrap properly
const wrappedMaybes = Maybe.all([outerMaybe, Maybe.from(100)]);
type WrappedMaybesType = typeof wrappedMaybes;
const wrappedMaybesValue = wrappedMaybes.value();
type WrappedMaybesValueType = typeof wrappedMaybesValue; // Should be: [number, number]

// ============================================================================
// SCENARIO 25: Error types in Maybe
// ============================================================================

class CustomError extends Error {
  code: number;
  constructor(message: string, code: number) {
    super(message);
    this.code = code;
  }
}

const typedError1 = Maybe.from<number, CustomError>(42);
const typedError2 = Maybe.from<string, CustomError>('success');

// Expected: Maybe<[number, string], unknown> & { __state: 'resolved' }
// Note: Error type becomes 'unknown' in Maybe.all
const withTypedErrors = Maybe.all([typedError1, typedError2]);
type WithTypedErrorsType = typeof withTypedErrors;
const withTypedErrorsValue = withTypedErrors.value();
type WithTypedErrorsValueType = typeof withTypedErrorsValue;

// ============================================================================
// Export for type checking
// ============================================================================

export {
  // Scenario 1
  allResolved,
  type AllResolvedType,
  type AllResolvedValueType,

  // Scenario 2
  allRawValues,
  type AllRawValuesType,
  type AllRawValuesValueType,

  // Scenario 3
  mixedResolvedAndRaw,
  type MixedResolvedAndRawType,
  type MixedResolvedAndRawValueType,

  // Scenario 4
  withPendingPromise,
  type WithPendingPromiseType,

  // Scenario 5
  withPendingMaybe,
  type WithPendingMaybeType,

  // Scenario 6
  mixedResolvedPending,
  type MixedResolvedPendingType,

  // Scenario 8
  complexResolved,
  type ComplexResolvedType,
  type ComplexResolvedValueType,

  // Scenario 9
  withArraysAndObjects,
  type WithArraysAndObjectsType,
  type WithArraysAndObjectsValueType,

  // Scenario 10
  emptyArray,
  type EmptyArrayType,
  type EmptyArrayValueType,

  // Scenario 11
  singleResolved,
  type SingleResolvedType,
  type SingleResolvedValueType,
  singlePending,
  type SinglePendingType,

  // Scenario 12
  chainedAll,
  type ChainedAllType,

  // Scenario 13
  nestedAll,
  type NestedAllType,
  type NestedAllValueType,

  // Scenario 14
  fromFunctions,
  type FromFunctionsType,
  type FromFunctionsValueType,

  // Scenario 15
  withAsyncFunction,
  type WithAsyncFunctionType,

  // Scenario 16
  withUnions,
  type WithUnionsType,
  type WithUnionsValueType,

  // Scenario 17
  withOptionals,
  type WithOptionalsType,
  type WithOptionalsValueType,

  // Scenario 18
  productData,
  type ProductDataType,
  productPage,
  type ProductPageType,

  // Scenario 19
  withErrorHandling,
  type WithErrorHandlingType,

  // Scenario 20
  withFinally,
  type WithFinallyType,

  // Scenario 21
  fromReadonly,
  type FromReadonlyType,
  type FromReadonlyValueType,

  // Scenario 22
  largeTuple,
  type LargeTupleType,
  type LargeTupleValueType,

  // Scenario 23
  fromConst,
  type FromConstType,
  type FromConstValueType,

  // Scenario 24
  wrappedMaybes,
  type WrappedMaybesType,
  type WrappedMaybesValueType,

  // Scenario 25
  withTypedErrors,
  type WithTypedErrorsType,
  type WithTypedErrorsValueType,
};
