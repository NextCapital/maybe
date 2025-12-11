# Migration Guide: v1.x to v2.0

This guide outlines the breaking changes introduced in v2.0 and provides guidance for migrating your code.

## Overview

Version 2.0 represents a major overhaul of the `@nextcapital/maybe` package, migrating from JavaScript to TypeScript and introducing significant improvements to type safety and developer experience. While the runtime behavior remains largely the same, there are important breaking changes related to the module system and build artifacts.

---

## Breaking Changes

### 1. **TypeScript Migration & ES Modules**

#### What Changed
- The package is now written in TypeScript and distributed as compiled JavaScript with TypeScript declaration files
- Changed from CommonJS (`require`/`module.exports`) to ES Modules (`import`/`export`)
- Main entry point changed from `js/index.js` to `dist/index.js`
- Package now ships `dist/` folder instead of `js/` and separate `types/` folders
- Type definitions are now co-located with compiled JavaScript in `dist/`

#### Migration Required

**Before (v1.x) - CommonJS:**
```javascript
const { Maybe, AsyncQueue, PromiseUtils } = require('@nextcapital/maybe');
```

**After (v2.0) - ES Modules:**
```javascript
import { Maybe, AsyncQueue, PromiseUtils } from '@nextcapital/maybe';
```

**TypeScript users:**
```typescript
// Named imports
import { Maybe, AsyncQueue, PromiseUtils, PendingValueError } from '@nextcapital/maybe';
import type { Deferred } from '@nextcapital/maybe';

// Default imports also work
import Maybe from '@nextcapital/maybe/dist/maybe/Maybe.js';
```

**Impact:**

- **Node.js projects using CommonJS** will need to either:
  - Migrate to ES Modules (add `"type": "module"` to package.json)
  - Use dynamic imports: `const { Maybe } = await import('@nextcapital/maybe')`
  - Use a bundler that handles ES Module dependencies (Webpack, Rollup, etc.)

- **TypeScript projects** get full type safety without needing separate `@types` packages

- **Bundlers** (Webpack, Rollup, Vite, etc.) will automatically handle ES Modules

---

### 2. **Constructor Signature Change**

#### What Changed
The `Maybe` constructor now accepts an optional third parameter `error` for creating rejected instances.

**Before (v1.x):**
```javascript
constructor(thing, isError = false)
```

**After (v2.0):**
```typescript
constructor(thing: T | Promise<T> | Maybe<T, E>, isError = false, error?: E)
```

#### Migration Required

If you're directly calling `new Maybe()` to create rejected instances:

**Before (v1.x):**
```javascript
// Creating rejected Maybe - error is the first parameter
const rejected = new Maybe(errorValue, true);
```

**After (v2.0):**
```typescript
// Creating rejected Maybe - error is the third parameter
const rejected = new Maybe(undefined, true, errorValue);

// OR (recommended) - use the static helper:
const rejected = Maybe.fromError(errorValue);
```

**Recommendation:** Use `Maybe.fromError()` for creating rejected Maybes instead of calling the constructor directly.

**Impact:** Direct constructor usage for rejected Maybes must be updated or migrated to `Maybe.fromError()`.

---

### 3. **Enhanced Type Safety with Phantom Types (TypeScript Only)**

#### What Changed
The `Maybe` class now includes three phantom type properties (`__state`, `__value`, `__error`) that exist only in TypeScript's type system to enable precise type narrowing based on the Maybe's state.

These properties:
- Do NOT exist at runtime (zero runtime cost)
- Are NOT present in compiled JavaScript
- Only affect TypeScript's type checking and inference

#### Migration Required

**No migration required** - this is purely additive for TypeScript users and invisible to JavaScript users.

**TypeScript Benefits:**
```typescript
const maybe = Maybe.from(42);

// Before v2.0: Type is Maybe<number, unknown>
// After v2.0: Type is Maybe<number, unknown> & { __state: 'resolved' }

if (maybe.isResolved()) {
  // TypeScript now knows this is safe without needing type assertions
  const value = maybe.value(); // Type: number (not `number | never`)
}

// Type narrowing works with all state checks:
const pending = Maybe.from(Promise.resolve(42));
if (pending.isPending()) {
  // TypeScript knows: Maybe<number, unknown> & { __state: 'pending' }
}
```

**Impact:**
- TypeScript users get significantly better autocomplete and type checking
- Code that previously needed type assertions may no longer need them
- No changes required for JavaScript users

---

### 4. **Improved `Maybe.all()` Type Inference**

#### What Changed
`Maybe.all()` now uses sophisticated type inference to narrow the return type based on the input array's state:

1. **All resolved** → Returns `Maybe<[...types], unknown> & { __state: 'resolved' }`
2. **Any rejected** → Returns the first rejected Maybe directly
3. **Any pending (none rejected)** → Returns `Maybe<[...types], unknown> & { __state: 'pending' }`

**Runtime behavior is unchanged from v1.x** - rejected Maybes are still returned, not thrown.

#### Migration Required

**No migration required** - runtime behavior is identical to v1.x.

**TypeScript Benefits:**
```typescript
// Example 1: All resolved - type system knows it's resolved
const m1 = Maybe.from(1);
const m2 = Maybe.from('hello');
const result = Maybe.all([m1, m2]);
// Type: Maybe<[number, string], unknown> & { __state: 'resolved' }
if (result.isResolved()) {
  const [num, str] = result.value(); // Type-safe destructuring
}

// Example 2: With rejected - returns the rejected Maybe
const rejected = Maybe.fromError<string>('error');
const result2 = Maybe.all([m1, rejected, m2]);
// Type: Maybe<undefined, string> & { __state: 'rejected' }
// Returns the rejected Maybe (not an array)

// Example 3: With pending - must await
const pending = Maybe.from(Promise.resolve(42));
const result3 = Maybe.all([m1, pending]);
// Type: Maybe<[number, number], unknown> & { __state: 'pending' }
result3.promise().then(values => console.log(values));
```

**Impact:** TypeScript users get more precise types; JavaScript users see no change.

---

### 5. **Improved `Maybe.from()` Type Preservation**

#### What Changed
`Maybe.from()` now correctly preserves type information when wrapping existing `Maybe` instances, including their state.

**Before (v2.0 early development):**
```typescript
const innerMaybe = Maybe.from(42);
const outerMaybe = Maybe.from(innerMaybe);
// Type was: Maybe<unknown, unknown> ❌
```

**After (v2.0 final):**
```typescript
const innerMaybe = Maybe.from(42);
const outerMaybe = Maybe.from(innerMaybe);
// Type is: Maybe<number, unknown> & { __state: 'resolved' } ✅
```

#### Migration Required

**No migration required** - this is a type system improvement only.

**Impact:** TypeScript users will see more accurate types when composing Maybes.

---

### 6. **Error Type Parameter Default**

#### What Changed
The error type parameter `E` in `Maybe<T, E>` now explicitly defaults to `unknown` instead of being implicit.

#### Migration Required

Minimal migration needed. If you have explicit type annotations:

**Before (v1.x):**
```typescript
function process(maybe: Maybe<number>): void {
  // Error type was implicit/any
}
```

**After (v2.0):**
```typescript
function process(maybe: Maybe<number>): void {
  // Error type is now explicitly unknown
  // This is the same as: Maybe<number, unknown>
}
```

**Impact:** Minimal - TypeScript will infer correctly in most cases. Only affects explicit type annotations where the error type matters.

---

### 7. **Build Artifacts & Distribution**

#### What Changed
- Package now ships compiled JavaScript in `dist/` folder
- TypeScript source files are NOT included in the published package
- Declaration files (`.d.ts`) are generated and included in `dist/`
- `.gitignore` now includes `dist/` (built files not committed to git)

#### Migration Required

**No code changes required**, but be aware:

- If you were importing directly from `js/` subpaths, those no longer exist in the package
- All imports should go through the main package entry point or documented public API
- Build step now required before publishing: `npm run tsc`

**Impact:** Only affects package consumers if they were doing non-standard imports.

---

### 8. **Node.js Version Requirements**

#### What Changed
- Package now requires Node.js version that supports ES Modules
- Compiled to ES2020 target (check `tsconfig.json` for specifics)

#### Migration Required

Ensure your Node.js version meets the minimum requirements. Check `engines` field in `package.json` if specified.

**Impact:** Older Node.js versions may not be supported.

---

## Non-Breaking Changes (Improvements)

### Comprehensive Type Definitions
All classes and methods now have complete TypeScript type definitions with:
- Generic type parameters properly constrained
- Overload signatures for precise type narrowing
- JSDoc comments with examples

### Better Error Types
Error types are now properly tracked through the type system using the `E` type parameter.

### Exported Types
Additional types are now exported for advanced use cases:
```typescript
import type { Deferred } from '@nextcapital/maybe';
```

---

## Migration Checklist

- [ ] Update Node.js to a version that supports ES Modules
- [ ] **For CommonJS projects:** Decide on migration strategy (ES Modules, dynamic imports, or bundler)
- [ ] Update all `require()` calls to `import` statements
- [ ] Replace `module.exports` usage with ES Module imports from this package
- [ ] Update direct constructor calls for rejected Maybes to use `Maybe.fromError()`
- [ ] **For TypeScript projects:** Review and potentially remove now-unnecessary type assertions
- [ ] Update any non-standard imports (e.g., direct `js/` path imports)
- [ ] Run your full test suite
- [ ] Update bundler configuration if needed for ES Modules

---

## Testing Your Migration

After migrating:

1. **Run your full test suite** to catch any import or usage issues
2. **For TypeScript projects:** Check for new type errors - many will be improvements catching real issues
3. **Test bundler configuration** if using Webpack, Rollup, or similar
4. **Verify runtime behavior** hasn't changed (should be identical to v1.x)
5. **Check for deprecation warnings** in your console

---

## Getting Help

If you encounter issues during migration:

1. Check the [GitHub Issues](https://github.com/nextcapital/maybe/issues) for similar problems
2. Review the [TypeScript examples in README](https://github.com/nextcapital/maybe/blob/main/README.md)
3. Open a new issue with:
   - Your current package version
   - Your target package version (v2.0)
   - Error messages or unexpected behavior
   - Minimal reproduction case

---

## Summary of Benefits

Despite the breaking changes, v2.0 provides significant benefits:

✅ **Full TypeScript support** with excellent type inference
✅ **Better type safety** preventing runtime errors at compile time
✅ **Improved developer experience** with better IDE autocomplete
✅ **State-based type narrowing** eliminates unnecessary type assertions
✅ **Modern ES Module support** for better tree-shaking and bundling
✅ **Comprehensive inline documentation** for all methods and types
✅ **Maintained runtime compatibility** - behavior unchanged from v1.x

The migration effort is justified by the substantial improvements to type safety and developer experience, especially for TypeScript users.
