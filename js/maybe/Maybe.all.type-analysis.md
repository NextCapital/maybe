# Maybe.all() Type Analysis

This document summarizes the TypeScript type inference for various `Maybe.all()` scenarios.

## ✅ Type Inference Results

All scenarios compile successfully with TypeScript. Below are the actual inferred types:

### Scenario 1: All Resolved Maybes
**Input:** `[Maybe.from(1), Maybe.from('hello'), Maybe.from(true)]`
**Expected:** `Maybe<[number, string, boolean], unknown> & { __state: 'resolved' }`
**Actual:** ✅ **MATCHES** - Correctly infers resolved state

### Scenario 2: All Raw Values
**Input:** `[1, 'hello', true, null, undefined]`
**Expected:** `Maybe<[number, string, boolean, null, undefined], unknown> & { __state: 'resolved' }`
**Actual:** ✅ **MATCHES** - Raw values treated as resolved

### Scenario 3: Mixed Resolved Maybes and Raw Values
**Input:** `[Maybe.from(42), 'test', 99, Maybe.from('world')]`
**Expected:** `Maybe<[number, string, number, string], unknown> & { __state: 'resolved' }`
**Actual:** ✅ **MATCHES** - Preserves tuple order and types

### Scenario 4: Pending Promise
**Input:** `[new Promise<number>(...)]`
**Expected:** `Maybe<[number], unknown> & { __state: 'pending' }`
**Actual:** ✅ **MATCHES** - Raw promises result in pending state

### Scenario 5: Pending Maybe
**Input:** `[42, Maybe.from(Promise.resolve('async'))]`
**Expected:** `Maybe<[number, string], unknown> & { __state: 'pending' }`
**Actual:** ✅ **MATCHES** - One pending makes whole result pending

### Scenario 6: Mix of Resolved and Pending
**Input:** `[Maybe.from(1), Maybe.from(Promise.resolve(2)), Maybe.from(3)]`
**Expected:** `Maybe<[number, number, number], unknown> & { __state: 'pending' }`
**Actual:** ✅ **MATCHES** - Correctly identifies pending state

### Scenario 7: Rejected Maybe
**Input:** `[Maybe.from(123), Maybe.fromError(error)]`
**Behavior:** Throws at runtime (not represented in return type)
**Actual:** ✅ **CORRECT** - TypeScript doesn't track rejection in static types (as expected)

### Scenario 8: Complex Object Types
**Input:** `[Maybe.from<User>({...}), Maybe.from<Post>({...}), Maybe.from(42)]`
**Expected:** `Maybe<[User, Post, number], unknown> & { __state: 'resolved' }`
**Actual:** ✅ **MATCHES** - Complex types preserved correctly

### Scenario 9: Arrays and Objects
**Input:** `[Maybe.from([1,2,3]), Maybe.from({key: 'value'})]`
**Expected:** `Maybe<[number[], { key: string }], unknown> & { __state: 'resolved' }`
**Actual:** ✅ **MATCHES** - Structural types preserved

### Scenario 10: Empty Array
**Input:** `[]`
**Expected:** `Maybe<[], unknown> & { __state: 'resolved' }`
**Actual:** ✅ **MATCHES** - Empty tuple handled correctly

### Scenario 11: Single Element Arrays
**Input (resolved):** `[Maybe.from(42)]`
**Expected:** `Maybe<[number], unknown> & { __state: 'resolved' }`
**Actual:** ✅ **MATCHES**

**Input (pending):** `[Promise.resolve(42)]`
**Expected:** `Maybe<[number], unknown> & { __state: 'pending' }`
**Actual:** ✅ **MATCHES**

### Scenario 12: Chaining with .when()
**Input:** `Maybe.all([...]).when(values => values.reduce(...))`
**Expected:** `Maybe<number, unknown> & { __state: 'resolved' | 'rejected' }`
**Actual:** ✅ **MATCHES** - `.when()` can introduce rejection, so state union is correct

### Scenario 13: Nested Maybe.all()
**Input:** `Maybe.all([Maybe.all([1,2]), Maybe.all([3,4])])`
**Expected:** `Maybe<[[number, number], [number, number]], unknown> & { __state: 'resolved' }`
**Actual:** ✅ **MATCHES** - Nested tuples preserved

### Scenario 14: Functions Returning Maybe
**Input:** `[fetchUser(1), fetchPost(1)]` where both return `Maybe<T>`
**Expected:** `Maybe<[User, Post], unknown> & { __state: 'resolved' }`
**Actual:** ✅ **MATCHES** - Function return types properly tracked

### Scenario 15: Async Functions
**Input:** `[asyncFetch()]` where function returns `Promise<string>`
**Expected:** `Maybe<[string], unknown> & { __state: 'pending' }`
**Actual:** ✅ **MATCHES** - Async functions result in pending

### Scenario 16: Union Types
**Input:** `[Maybe.from<string | number>(42), Maybe.from<string | number>('hello')]`
**Expected:** `Maybe<[string | number, string | number], unknown> & { __state: 'resolved' }`
**Actual:** ✅ **MATCHES** - Union types preserved

### Scenario 17: Optional/Undefined Values
**Input:** `[Maybe.from<number | undefined>(42), Maybe.from<number | undefined>(undefined)]`
**Expected:** `Maybe<[number | undefined, number | undefined], unknown> & { __state: 'resolved' }`
**Actual:** ✅ **MATCHES** - Undefined handled correctly

### Scenario 18: Real-World Parallel Data Fetching
**Input:** `[fetchProduct(123), fetchReviews(123), fetchInventory(123)]`
- One returns resolved Maybe
- One returns pending Maybe (async)
- One returns resolved Maybe

**Expected:** `Maybe<[Product, Review[], Inventory], unknown> & { __state: 'pending' }`
**Actual:** ✅ **MATCHES** - Complex real-world scenario works correctly

### Scenario 19: Error Handling with .catch()
**Input:** `Maybe.all([...]).catch(...)`
**Expected:** Return type includes both success and caught error paths
**Actual:** ✅ **MATCHES** - Union type correctly represents both paths

### Scenario 20: Using .finally()
**Input:** `Maybe.all([Maybe.from(1), Maybe.from(2)]).finally(...)`
**Expected:** Original value type preserved, but state can be resolved or rejected
**Actual:** ✅ **MATCHES** - `.finally()` preserves value type

### Scenario 21: Readonly Arrays
**Input:** `[Maybe.from(1), Maybe.from(2), Maybe.from(3)] as const`
**Expected:** Should handle readonly arrays
**Actual:** ✅ **MATCHES** - Readonly constraint handled

### Scenario 22: Large Tuple (9 elements)
**Input:** Mix of number, string, boolean, null, undefined, object, array
**Expected:** All 9 types preserved in order
**Actual:** ✅ **MATCHES** - Large tuples work correctly

### Scenario 23: Const Assertions
**Input:** `[1, 'hello', true] as const`
**Expected:** `Maybe<[1, "hello", true], unknown> & { __state: 'resolved' }` (literal types)
**Actual:** ✅ **MATCHES** - Literal types from const assertions preserved

### Scenario 24: Maybe Wrapping Maybe
**Input:** `[Maybe.from(Maybe.from(42)), Maybe.from(100)]`
**Expected:** `Maybe<[number, number], unknown> & { __state: 'resolved' }` (unwrapped)
**Actual:** ✅ **MATCHES** - Nested Maybes properly unwrapped

### Scenario 25: Typed Error Types
**Input:** `[Maybe.from<number, CustomError>(42), Maybe.from<string, CustomError>('success')]`
**Expected:** Error type becomes `unknown` in `Maybe.all` (as designed)
**Actual:** ✅ **MATCHES** - Error type correctly generalized to `unknown`

## 🎯 Key Findings

### ✅ What Works Perfectly

1. **State Narrowing:** The `__state` phantom property correctly narrows to:
   - `'resolved'` when all inputs are resolved or raw values
   - `'pending'` when any input is a pending Maybe or raw Promise
   - Union types when chaining with `.when()`, `.catch()`, `.finally()`

2. **Tuple Type Preservation:** All tuple types are preserved through the transformation:
   - Order maintained
   - Individual types at each index preserved
   - No type widening to `unknown[]`

3. **Type Unwrapping:** The `UnwrapValue<T>` helper correctly:
   - Extracts `V` from `Maybe<V, E>`
   - Extracts `V` from `Promise<V>`
   - Preserves raw values as-is

4. **Edge Cases:**
   - Empty arrays work correctly
   - Nested Maybes are properly unwrapped
   - Const assertions and literal types preserved
   - Union types and optional types handled correctly
   - Complex object types (interfaces, arrays, objects) preserved

### 🔍 Important Behaviors

1. **Rejected Maybes:** When a rejected Maybe is passed to `Maybe.all()`, it throws immediately. This is not represented in the static type system (intentional design).

2. **Error Type Generalization:** All error types become `unknown` in the result. This is because `Maybe.all()` could reject with any of the input error types.

3. **Method Chaining:** Methods like `.when()`, `.catch()`, and `.finally()` correctly update the state type:
   - `.when()` can introduce rejection, so state becomes `'resolved' | 'rejected'` or `'pending'`
   - `.catch()` can recover from rejection
   - `.finally()` preserves the original state possibilities

4. **Raw Promises vs Pending Maybes:** Both result in `__state: 'pending'`, as expected.

## 📝 Recommendations

The current implementation is working excellently! All test scenarios compile and infer the correct types. The type system correctly:

- Distinguishes between resolved, pending, and mixed states
- Preserves tuple structure and individual element types
- Handles edge cases (empty arrays, nested Maybes, complex types)
- Provides good ergonomics with method chaining

No changes needed to the type signatures.
