# Chaining Flow

`when()` is the core chaining method on Maybe. It dispatches by state, preserves synchronous resolution when possible, and catches handler errors. For the full API and behavior rules, see [Maybe — Chaining](../components/maybe.md#chaining).

## Dispatch Diagram

```d2
direction: down

title: when() Chain Resolution {
  shape: text
  style.font-size: 20
}

input: Input Maybe
check_state: Check State {shape: diamond}

input -> check_state

resolved_path: Resolved Path {
  has_handler: onResolve? {shape: diamond}
  call_handler: Call onResolve(value)
  wrap_result: Maybe.from(result)
  catch_error: Maybe.fromError(error)
  return_self: Return same instance
}

rejected_path: Rejected Path {
  has_handler: onReject? {shape: diamond}
  call_handler: Call onReject(error)
  wrap_result: Maybe.from(result)
  catch_error: Maybe.fromError(error)
  return_self: Return same instance
}

pending_path: Pending Path {
  delegate: promise.then(onResolve, onReject)
  wrap: Maybe.from(promise)
}

check_state -> resolved_path.has_handler: "resolved"
check_state -> rejected_path.has_handler: "rejected"
check_state -> pending_path.delegate: "pending"

resolved_path.has_handler -> resolved_path.call_handler: "yes"
resolved_path.has_handler -> resolved_path.return_self: "no"
resolved_path.call_handler -> resolved_path.wrap_result: "success"
resolved_path.call_handler -> resolved_path.catch_error: "throws"

rejected_path.has_handler -> rejected_path.call_handler: "yes"
rejected_path.has_handler -> rejected_path.return_self: "no"
rejected_path.call_handler -> rejected_path.wrap_result: "success"
rejected_path.call_handler -> rejected_path.catch_error: "throws"

pending_path.delegate -> pending_path.wrap: "settles"

output: Output Maybe
resolved_path.wrap_result -> output
resolved_path.catch_error -> output
resolved_path.return_self -> output
rejected_path.wrap_result -> output
rejected_path.catch_error -> output
rejected_path.return_self -> output
pending_path.wrap -> output
```

## Common Patterns

### Transform a resolved value synchronously

```typescript
const name = Maybe.from(user).when((u) => u.name);
// If user Maybe is resolved, name Maybe is also resolved — synchronous
```

### Recover from rejection with a default

```typescript
const safe = riskyMaybe.catch(() => defaultValue);
// Rejection is caught; safe is resolved with defaultValue
```

### Chain synchronous and asynchronous steps

```typescript
const result = Maybe.from(rawInput)
  .when((input) => validate(input))         // synchronous validation
  .when((valid) => fetchData(valid.id))      // returns Promise → becomes pending
  .when((data) => transform(data));          // runs after fetchData settles
```

### Cleanup with finally

```typescript
const result = Maybe.from(acquireResource())
  .when((resource) => process(resource))
  .finally(() => releaseResource());
// releaseResource() runs regardless of success or failure
// result holds the output of process(), not releaseResource()
```

### Error recovery mid-chain

```typescript
const result = Maybe.from(primarySource())
  .catch(() => fallbackSource())            // recover from primary failure
  .when((data) => format(data));            // runs on whichever source succeeded
```

## Related Documentation

- [Maybe — Chaining](../components/maybe.md#chaining) — full API, dispatch rules, and error propagation
- [Maybe Lifecycle](maybe-lifecycle.md) — state definitions and construction paths
