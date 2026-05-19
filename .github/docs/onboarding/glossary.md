# Glossary of Proprietary Terms

## Become

Internal pattern where a Maybe adopts the state of another Maybe instance. This is implemented in the `_become()` method.

## Deferred

An object containing a promise and its externalized `resolve`/`reject` functions.

## Maybe

A wrapper that tracks promise state (resolved/rejected/pending) and enables synchronous value access.

## Phantom Type

A TypeScript type property declared with `declare` that exists only at compile time, used for type narrowing without runtime cost.

## Thenable

Any object with a `then` method — the industry-standard way to detect promise-like objects. See `isThenable()`.

## Type Brand

The `__value` and `__error` phantom properties that enable extracting generic type parameters from intersection types.
