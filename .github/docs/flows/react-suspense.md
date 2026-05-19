# React Suspense Integration

## Overview

React Suspense expects components to signal loading by throwing promises during render. [Maybe](../components/maybe.md)'s `suspend()` method implements this contract: returns the value if resolved, throws the error if rejected, or throws the promise if pending. React suspends the component, shows a fallback, and re-renders on settlement.

Without Maybe, naive Suspense data fetching creates sequential waterfalls — each pending fetch suspends, and the next starts only on re-render. `Maybe.all()` + `suspend()` eliminates this by starting all fetches immediately and throwing a single composite promise.

This document covers the Suspense contract, how `suspend()` fulfills it, the waterfall problem, and the `Maybe.all()` + `suspend()` solution.

## The Suspense Contract

React Suspense relies on a specific throw-based protocol during render:

| Thrown value | React behavior |
|-------------|---------------|
| A `Promise` | Suspends the component, shows the nearest `<Suspense>` fallback, re-renders when the promise settles |
| An `Error` (or non-promise) | Propagates to the nearest error boundary |
| Nothing thrown | Renders the component normally |

A data source integrating with Suspense must: return the value if ready, throw a promise if loading, throw an error if failed. `suspend()` implements exactly this.

## How suspend() Works

`suspend()` checks the Maybe's state and takes one of three actions:

```
resolved  →  return this.value()    // Component renders with the data
rejected  →  throw this._error      // Error boundary catches this
pending   →  throw this.promise()   // React Suspense catches this
```

Implementation in [Maybe.ts](../../../js/maybe/Maybe.ts):

```typescript
suspend(): T {
  if (this.isResolved()) {
    return this.value();
  }

  if (this.isRejected()) {
    throw this._error;
  }

  throw this.promise();
}
```

### Overloads

`suspend()` uses four overloads to provide compile-time return type narrowing based on the Maybe's `__state` intersection type:

| Overload | `__state` constraint | Return type | Runtime behavior |
|----------|---------------------|-------------|-----------------|
| 1 | `'resolved'` | `T` | Returns the resolved value |
| 2 | `'rejected'` | `never` | Throws the rejection error |
| 3 | `'pending'` | `never` | Throws the promise (triggers Suspense) |
| 4 | (none — generic fallback) | `T` | Determined at runtime |

When TypeScript knows the Maybe is resolved (e.g., after an `isResolved()` check or from `Maybe.all()` with all-resolved inputs), the return type narrows to `T`. When the state is `'pending'` or `'rejected'`, the return type is `never` — the method will always throw.

## The Waterfall Problem

React Suspense creates a waterfall when a component needs multiple independent data sources:

1. Component renders and calls `fetchA()`, which throws a promise (pending).
2. React suspends the component and shows the fallback.
3. When `fetchA` resolves, React re-renders the component.
4. Component calls `fetchA()` again (cached, returns immediately), then calls `fetchB()`, which throws a promise (pending).
5. React suspends again.
6. When `fetchB` resolves, React re-renders. Now `fetchC()` starts...

Each fetch starts only after the previous completes. Three independent requests that could run in parallel (~200ms each) take ~600ms sequentially.

```
Without Maybe — sequential waterfall:

fetchA  |████████████|
fetchB                |████████████|
fetchC                              |████████████|
        ├────────────┼─────────────┼─────────────┤
        0ms        200ms         400ms         600ms
```

The root cause: standard Suspense data sources throw on the *first* pending fetch, preventing subsequent fetches from starting.

## Maybe.all() + suspend() Solution

`Maybe.all()` + `suspend()` solves the waterfall by separating fetch initiation from the Suspense throw.

**How it works:**

1. Each `reactMaybeFetch()` call starts its request immediately and returns a Maybe (pending, resolved, or rejected).
2. `Maybe.all()` receives the array of Maybes. If any are pending, it returns a single pending Maybe wrapping `Promise.all()` of all individual promises. If all are resolved, it returns a resolved Maybe with all values.
3. `suspend()` is called on the combined Maybe. If pending, it throws a single promise that resolves when *all* requests complete.

```
With Maybe.all() — parallel execution:

fetchA  |████████████|
fetchB  |████████████|
fetchC  |████████████|
        ├────────────┤
        0ms        200ms
```

All requests start in the same tick. React suspends once (if any pending) and re-renders once (when all ready). If all data is cached, `suspend()` returns immediately — no suspension.

## Usage Pattern

Use `Maybe.all()` + `suspend()` inside a component wrapped in a `<Suspense>` boundary:

```javascript
const MyComponent = (props) => {
  const [firstData, secondData, thirdData] = Maybe.all([
    reactMaybeFetch('https://example.org/data-one'),
    reactMaybeFetch('https://example.org/data-two'),
    reactMaybeFetch('https://example.org/data-three')
  ]).suspend();

  return (
    <ul>
      <li>My favorite color is: {firstData.color}</li>
      <li>Her favorite flavor is: {secondData.flavor}</li>
      <li>His favorite artist is: {thirdData.artist}</li>
    </ul>
  );
};
```

**What happens at render time:**

| Scenario | `Maybe.all()` returns | `suspend()` does | React behavior |
|----------|----------------------|------------------|---------------|
| All three cached | Resolved Maybe with `[data1, data2, data3]` | Returns the array | Renders immediately |
| One or more pending | Pending Maybe wrapping `Promise.all(...)` | Throws the combined promise | Suspends once, re-renders when all resolve |
| One rejected | Rejected Maybe with the first error | Throws the error | Error boundary catches it |

Wrap the component in a `<Suspense>` boundary to provide a fallback:

```jsx
<Suspense fallback={<LoadingSpinner />}>
  <MyComponent />
</Suspense>
```

## Limitations

`Maybe` provides the Suspense throw contract (`suspend()`) and parallel fetch coordination (`Maybe.all()`). It does **not** provide:
| Not provided | Why it matters |
|-------------|---------------|
| **React caching integration** | React Suspense requires a caching layer to return the same Maybe across re-renders. Without caching, each render creates a new pending Maybe and suspends infinitely. Maybe does not include this — integrate with React's caching or build your own. |
| **Data fetching** | `reactMaybeFetch` in the example is user-provided. Maybe wraps fetch results into a synchronously-inspectable container — it does not fetch data. |
| **Suspense boundary configuration** | Placement of `<Suspense>` boundaries, fallback components, and nesting strategies are React concerns outside Maybe's scope. |

## Diagram

Sequence diagram showing `suspend()` in a React render cycle with `Maybe.all()`:

```d2
shape: sequence_diagram

react: React
component: Component
maybe_all: "Maybe.all"
suspend_method: "suspend()"
network: Network

react -> component: render
component -> network: "start fetch A"
component -> network: "start fetch B"
component -> network: "start fetch C"
component -> maybe_all: "Maybe.all with inputs"
maybe_all -> component: "pending Maybe wraps Promise.all"
component -> suspend_method: "call suspend()"
suspend_method -> react: "throw promise"

react -> react: "show fallback"

network -> maybe_all: "all fetches resolve"
maybe_all -> maybe_all: "Maybe transitions to resolved"

react -> component: "re-render"
component -> maybe_all: "Maybe.all with inputs"
maybe_all -> component: "resolved Maybe with values"
component -> suspend_method: "call suspend()"
suspend_method -> component: "return values"
component -> react: "render output"
```

## Related Documentation

- [Maybe](../components/maybe.md) — Core Maybe class documentation
- [PendingValueError](../components/pending-value-error.md) — Error thrown by `value()` when pending (distinct from `suspend()`, which throws the promise instead)
- [Maybe Lifecycle](maybe-lifecycle.md) — State model and transitions
- [Chaining](chaining.md) — `when()`, `catch()`, `finally()` flow

## Documentation Coverage Summary

| Metric | Value |
| --- |
| **Areas Documented** | 7 sections with full coverage |
| **Areas Partially Covered** |
| **Areas Unknown** |
| **Total Evidence Citations** | 11 file paths cited across all Evidence blocks |
| **Total UNVERIFIED Markers** |
| **Confidence Distribution** | HIGH: 7 |
| **Coverage Scan Status** | 7/7 sections Clear |
