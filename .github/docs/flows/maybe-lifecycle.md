# Maybe Lifecycle

A Maybe exists in exactly one of three states: **resolved**, **rejected**, or **pending**. Construction from a raw value or error produces an immediately settled Maybe. Construction from a promise produces a pending Maybe that transitions when the promise settles. Resolved and rejected are terminal — there is no way to reset a Maybe.

For the full state model, construction paths, and internal mechanics, see [Maybe](../components/maybe.md).

## Lifecycle Diagram

```d2
direction: down

construction: Construction {
  raw: "Maybe.from(value)" {shape: rectangle}
  promise: "Maybe.from(promise)" {shape: rectangle}
  error: "Maybe.fromError(error)" {shape: rectangle}
  adopt: "new Maybe(otherMaybe)" {shape: rectangle}
}

pending: Pending {
  style.fill: "#fff3cd"
}

resolved: Resolved {
  style.fill: "#d4edda"
}

rejected: Rejected {
  style.fill: "#f8d7da"
}

construction.raw -> resolved: "immediate"
construction.promise -> pending: "attaches .then()"
construction.error -> rejected: "immediate"
construction.adopt -> pending: "if otherMaybe pending"
construction.adopt -> resolved: "if otherMaybe resolved"
construction.adopt -> rejected: "if otherMaybe rejected"

pending -> resolved: "_handleResolve(value)"
pending -> rejected: "_handleReject(error)"
```

## Tick Timing

A Maybe created from a raw value or error resolves in the **same tick**. A Maybe created from a promise resolves in a **later microtask** — even if the source promise is already settled (`Promise.resolve(42)` is still pending immediately after construction). Use `isReady()` or `isResolved()` to guard synchronous access, or use `when()` / `promise()` to handle the value asynchronously.

## Related Documentation

- [Maybe](../components/maybe.md) — state model, construction, internal mechanics, and full API
- [Chaining Flow](chaining.md) — `when()`/`catch()`/`finally()` dispatch diagram
