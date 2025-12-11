import PromiseUtils from '../promise-utils/PromiseUtils.js';
import PendingValueError from './PendingValueError.js';
import type {
  UnwrapAll, AllResolved, HasRejected, FirstRejected, HasPending
} from './MaybeTypes.js';

/**
 * The `Maybe` class acts like a `Maybe` type in functional programming: but instead of being
 * a maybe between a value and nothing, this acts as a maybe between a promise and a value. In
 * other words, this class is for things that are "maybe" a promise!
 *
 * Ordinarily, it is not possible to know that state of a native Promise or access its value or
 * error synchronously. The `Maybe` class allows you to do to both. This allows us to act
 * synchronously on data if possible, and wait for it easily if not.
 */
export default class Maybe<T, E = unknown> {
  private _isReady: boolean;

  private _isError: boolean;

  private _value: T | undefined;

  private _error: E | undefined;

  private _wrappedPromise: Promise<T> | null;

  /**
   * Phantom type property that exists only in TypeScript's type system, not in runtime JavaScript.
   *
   * This property enables type narrowing through intersection types, allowing TypeScript to track
   * whether a Maybe is 'resolved', 'rejected', or 'pending' at the type level. When you call
   * isResolved(), isRejected(), or isPending(), the return type includes an intersection like
   * `Maybe<T, E> & { __state: 'resolved' }`, which narrows the type and enables type-safe access
   * to methods like value().
   *
   * Despite being declared, this property is not emitted in the compiled JavaScript and has zero
   * runtime cost. It's purely a compile-time type system feature.
   */
  declare readonly __state: 'resolved' | 'rejected' | 'pending';

  /**
   * Phantom type brand property that exists only in TypeScript's type system, not in runtime
   * JavaScript.
   *
   * This type brand enables extraction of the value type T from Maybe instances that have the
   * __state intersection property. TypeScript's conditional types cannot extract generic type
   * parameters from intersection types like `Maybe<T> & { __state: 'resolved' }` using the
   * standard `infer` keyword. By adding this brand property, we can match against
   * `{ __value: infer V }` to extract T even from intersections.
   *
   * Used by: UnwrapValue<T>, UnwrapAll<U>, and Maybe.from() overloads.
   *
   * Despite being declared, this property is not emitted in the compiled JavaScript and has zero
   * runtime cost. It's purely a compile-time type system feature.
   */
  declare readonly __value: T;

  /**
   * Phantom type brand property that exists only in TypeScript's type system, not in runtime
   * JavaScript.
   *
   * This type brand enables extraction of the error type E from Maybe instances that have the
   * __state intersection property. Similar to __value, this brand allows TypeScript's conditional
   * types to extract the error type parameter from intersection types using pattern matching like
   * `{ __error: infer Err }`.
   *
   * Used by: Maybe.from() overloads to preserve error types through state intersections.
   *
   * Despite being declared, this property is not emitted in the compiled JavaScript and has zero
   * runtime cost. It's purely a compile-time type system feature.
   */
  declare readonly __error: E;

  /**
   * Shortcut to the `Maybe` constructor, with the caveat that if `thing` is already a `Maybe`
   * instance, we'll just return `thing` as-is.
   *
   * The return type uses overload resolution to preserve the __state from input Maybe instances:
   * 1. Resolved Maybe overload: Matches Maybe with __state: 'resolved' using __value/__error brands
   *    Returns: Maybe<U, V> & { __state: 'resolved' }.
   * 2. Rejected Maybe overload: Matches Maybe with __state: 'rejected' using __value/__error brands
   *    Returns: Maybe<U, V> & { __state: 'rejected' }
   * 3. Pending Maybe overload: Matches Maybe with __state: 'pending' using __value/__error brands
   *    Returns: Maybe<U, V> & { __state: 'pending' }
   * 4. Promise overload: Matches Promise<U> (always pending)
   *    Returns: Maybe<U, V> & { __state: 'pending' }
   * 5. Raw value overload: Matches any other value (always resolved)
   *    Returns: Maybe<U, V> & { __state: 'resolved' }.
   *
   * The __value and __error type brands in overloads 1-3 enable TypeScript to extract generic
   * type parameters from Maybe instances with __state intersections, which standard inference
   * cannot handle.
   */
  static from<U, V = unknown>(thing: { __value: U; __error: V; __state: 'resolved'; }): Maybe<U, V> & { __state: 'resolved'; };
  static from<U, V = unknown>(thing: { __value: U; __error: V; __state: 'rejected'; }): Maybe<U, V> & { __state: 'rejected'; };
  static from<U, V = unknown>(thing: { __value: U; __error: V; __state: 'pending'; }): Maybe<U, V> & { __state: 'pending'; };
  static from<U, V = unknown>(thing: Promise<U>): Maybe<U, V> & { __state: 'pending'; };
  static from<U, V = unknown>(thing: U): Maybe<U, V> & { __state: 'resolved'; };
  static from<U, V = unknown>(
    thing: U | Promise<U> | Maybe<U, V> | (Maybe<any, any> & { __state: any; }) // eslint-disable-line @typescript-eslint/no-explicit-any, @stylistic/max-len
  ): Maybe<U, V> | (Maybe<any, any> & { __state: any; }) { // eslint-disable-line @typescript-eslint/no-explicit-any, @stylistic/max-len
    if (this.isMaybe(thing)) {
      return thing as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    }

    return new Maybe(thing);
  }

  /**
   * Helpful builder for a Maybe. If `isReady` is true, the `valueGetter` will be called and a
   * `Maybe` will be created from the resulting value. Otherwise, `promiseGetter` will be called
   * and a `Maybe` will be created from the resulting Promise.
   */
  static build<U, V = unknown>(
    isReady: boolean,
    valueGetter: () => U,
    promiseGetter: () => Promise<U>
  ): Maybe<U, V> {
    if (isReady) {
      return new Maybe(valueGetter());
    }

    return new Maybe(promiseGetter());
  }

  /**
   * Returns `true` if `thing` is a `Maybe` instance.
   */
  static isMaybe<U, V = unknown>(thing: any): thing is Maybe<U, V> { // eslint-disable-line @typescript-eslint/no-explicit-any, @stylistic/max-len
    return thing instanceof Maybe;
  }

  /**
   * Creates a rejected Maybe instance for the error.
   */
  static fromError<V = unknown>(error: V): Maybe<undefined, V> & { __state: 'rejected'; } {
    return new Maybe(undefined, true, error) as Maybe<undefined, V> & { __state: 'rejected'; };
  }

  /**
   * Works like `Promise.all`, but for `Maybe` instances! This means:
   *
   * - If all entries are resolved Maybe instances, we will return a `Maybe` resolved to
   * an array of all resolved values.
   * - If any entry has rejected, will return a Maybe rejected to the first rejected value.
   * - Otherwise, will return a pending Maybe that will resolve the same as `Promise.all` would
   * for the `promise()` for each input Maybe.
   *
   * The return type uses overload resolution to narrow the __state based on input:
   * 1. AllResolved<U> overload: Matches only when all Maybes have __state: 'resolved'
   *    - Constraint: Raw values pass through, Maybes must be resolved, Promises become never
   *    - Returns: Maybe<UnwrapAll<U>, unknown> & { __state: 'resolved' }
   *    - Use case: All inputs are synchronously ready, result is immediately available
   * 2. HasRejected<U> overload: Matches when at least one Maybe is rejected
   *    - Constraint: At least one Maybe has __state: 'rejected'
   *    - Returns: FirstRejected<U> (the first rejected Maybe)
   *    - Use case: Returns rejected Maybe immediately without processing remaining inputs
   * 3. HasPending<U> overload: Catch-all that matches when any Maybe is pending (but none rejected)
   *    - Constraint: Always matches (identity type), but only chosen if AllResolved and HasRejected
   *                  fail
   *    - Returns: Maybe<UnwrapAll<U>, unknown> & { __state: 'pending' }
   *    - Use case: At least one input requires async resolution, result must be awaited
   * 4. Generic overload: Fallback for edge cases
   *    - Returns: Maybe<UnwrapAll<U>, unknown> & { __state: 'resolved' | 'pending' }.
   *
   * The `const` type parameter preserves literal types and tuple structure, and UnwrapAll<U>
   * extracts the inner value types from all Maybes, Promises, and raw values in the input array.
   */
  static all<const U extends readonly unknown[]>(array: AllResolved<U>): Maybe<UnwrapAll<U>, unknown> & { __state: 'resolved'; };
  static all<const U extends readonly unknown[]>(array: HasRejected<U>): FirstRejected<U>;
  static all<const U extends readonly unknown[]>(array: HasPending<U>): Maybe<UnwrapAll<U>, unknown> & { __state: 'pending'; };
  static all<const U extends readonly unknown[]>(array: U): Maybe<UnwrapAll<U>, unknown> & { __state: 'resolved' | 'pending'; };
  static all<const U extends readonly unknown[]>(array: U): Maybe<UnwrapAll<U>, unknown> & { __state: 'resolved' | 'pending'; } | FirstRejected<U> {
    // Convert array to maybes
    const maybeArray = array.map((thing) => Maybe.from(thing));
    const allResolved = maybeArray.every((maybe) => maybe.isResolved());

    if (allResolved) {
      const values = maybeArray.map((maybe) => maybe.value());
      return Maybe.from(values) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    }

    const rejectedEntry = maybeArray.find((maybe) => maybe.isRejected());
    if (rejectedEntry) {
      return rejectedEntry as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    }

    const promises = maybeArray.map((maybe) => maybe.promise());
    return Maybe.from(Promise.all(promises)) as any; // eslint-disable-line @typescript-eslint/no-explicit-any, @stylistic/max-len
  }

  /**
   * Builds a new `Maybe` instance.
   */
  constructor(thing: T | Promise<T> | Maybe<T, E>, isError = false, error?: E) {
    const isMaybe = Maybe.isMaybe(thing);
    const isPromise = PromiseUtils.isThenable(thing);

    this._isReady = !isPromise;

    this._value = (isPromise || isMaybe) ? undefined : thing;
    this._error = isError ? error : undefined;

    this._wrappedPromise = null;

    if (this._isReady && isError) {
      this._isError = true;
    } else {
      this._isError = false;
    }

    if (isPromise) {
      this._wrappedPromise = (thing).then(
        (value) => this._handleResolve(value),
        (e) => this._handleReject(e)
      ) as Promise<T>;

      // prevent unhandled rejection errors caused by the re-reject in _handleReject
      this._wrappedPromise!.catch(() => {});
    }

    if (isMaybe) {
      this._become(thing, false);
    }
  }

  /**
   * Returns `true` if the instance is resolved or rejected. If the promise is still pending,
   * this will return `false`.
   */
  isReady(): this is Maybe<T, E> & { __state: 'resolved' | 'rejected'; } {
    return this._isReady;
  }

  /**
   * Returns `true` if the instance is not yet resolved or rejected. The opposite of `isReady`.
   */
  isPending(): this is Maybe<T, E> & { __state: 'pending'; } {
    return !this._isReady;
  }

  /**
   * Returns `true` if the instance is resolved. A call to `value()` will return the resolved
   * value synchronously.
   */
  isResolved(): this is Maybe<T, E> & { __state: 'resolved'; } {
    return this._isReady && !this._isError;
  }

  /**
   * Returns `true` if the instance is rejected. A call to `value()` will throw the rejected
   * error value.
   */
  isRejected(): this is Maybe<T, E> & { __state: 'rejected'; } {
    return this._isReady && this._isError;
  }

  /**
   * If resolved, this will return the resolved value. If rejected, this will throw the rejected
   * error.
   *
   * Otherwise, this will throw a `PendingValueError`. Always be sure to gate code by `isReady`,
   * `isResolved`, or `isRejected` before calling `value`.
   *
   * The return type uses overload resolution based on the __state intersection:
   * 1. Resolved overload: When __state is 'resolved', returns T
   * 2. Rejected overload: When __state is 'rejected', returns never (will throw)
   * 3. Pending overload: When __state is 'pending', returns never (will throw PendingValueError)
   * 4. Generic overload: Fallback that returns T when state is unknown at compile time.
   *
   * These overloads ensure type safety: you can only access the value type T when TypeScript
   * knows the Maybe is resolved through type narrowing (e.g., after an if (maybe.isResolved())
   * check).
   */
  value(this: Maybe<T, E> & { __state: 'resolved'; }): T;
  value(this: Maybe<T, E> & { __state: 'rejected'; }): never;
  value(this: Maybe<T, E> & { __state: 'pending'; }): never;
  value(): T;
  value(): T {
    if (this.isResolved()) {
      return this._value!;
    }

    if (this.isRejected()) {
      throw this._error;
    }

    throw new PendingValueError('cannot get value for a Maybe that is not ready');
  }

  /**
   * Works like `value`, but will return the error if rejected instead of throwing it.
   */
  valueOrError(): T | E {
    if (this.isResolved()) {
      return this._value!;
    }

    if (this.isRejected()) {
      return this._error!;
    }

    throw new PendingValueError('cannot get value or error for a Maybe that is not ready');
  }

  /**
   * Returns the pending promise if there still is one. Otherwise, returns a promise that resolves
   * or rejects to the resolved or rejected value.
   *
   * You can always convert a Maybe back to a promise!
   *
   * The return type uses overload resolution based on the __state intersection:
   * 1. Resolved overload: When __state is 'resolved', returns Promise<T> (will resolve immediately)
   * 2. Rejected overload: When __state is 'rejected', returns Promise<E> (will reject immediately)
   * 3. Pending overload: When __state is 'pending', returns Promise<T> (will resolve when ready)
   * 4. Generic overload: Fallback that returns Promise<T | E> when state is unknown at compile
   *    time.
   *
   * These overloads enable better type inference when the state is known, particularly useful
   * when catching rejected promises or awaiting pending values.
   */
  promise(this: Maybe<T, E> & { __state: 'resolved'; }): Promise<T>;
  promise(this: Maybe<T, E> & { __state: 'rejected'; }): Promise<E>;
  promise(this: Maybe<T, E> & { __state: 'pending'; }): Promise<T>;
  promise(): Promise<T | E>;
  promise(): Promise<T | E> {
    if (this.isResolved()) {
      return Promise.resolve(this._value!);
    }

    if (this.isRejected()) {
      return Promise.reject(this._error);
    }

    return this._wrappedPromise!;
  }

  /* eslint-disable @typescript-eslint/no-unused-vars */
  /**
   * Works like `then` does for promises, but for Maybe instances. Each call returns a
   * Maybe instance that:
   *
   * - When this maybe resolves (or immediately if it already is), resolves with the result
   * of calling `onResolve` with the resolved value.
   * - When this maybe rejects (or immediately if it already is), resolves with the result
   * of calling `onReject` with the rejected value.
   * - The `onResolve`/`onReject` can return another `Maybe` instance, with similar behavior
   * for when this happens for promises.
   *
   * In this way, we can "chain" together multiple maybes. The final returned Maybe will be
   * resolved immediately if all intermediate ones are. Otherwise, it will be pending and resolve
   * with the value when it is ready.
   *
   * NOTE: We can't call this method `then`, as otherwise a Maybe instance would be considered
   * promise-alike, which we don't want.
   *
   * The return type uses extensive overload resolution to preserve type information based on:
   * - The input Maybe's __state (resolved/rejected/pending/unknown)
   * - Whether onResolve and/or onReject handlers are provided
   * - The return type of each handler (TResult1 for onResolve, TResult2 for onReject).
   *
   * Key overload patterns:
   * - No handlers: Returns the Maybe unchanged (with its current state preserved)
   * - Pending input: Always returns pending Maybe (must wait for resolution)
   * - Resolved input + onResolve: Returns resolved or rejected based on handler execution
   * - Rejected input + onReject: Returns resolved or rejected based on handler execution
   * - Both handlers: Return type is union of both possible outcomes.
   */
  when<TResult1 = T, TResult2 = never, EResult = unknown>(this: Maybe<T, E> & { __state: 'pending'; }): Maybe<TResult1, EResult> & { __state: 'pending'; };
  when<TResult1 = T, TResult2 = never, EResult = unknown>(this: Maybe<T, E> & { __state: 'resolved'; }): Maybe<T, E> & { __state: 'resolved'; };
  when<TResult1 = T, TResult2 = never, EResult = unknown>(this: Maybe<T, E> & { __state: 'rejected'; }): Maybe<T, E> & { __state: 'rejected'; };
  when<TResult1 = T, TResult2 = never, EResult = unknown>(): Maybe<T, E> & { __state: 'resolved' | 'rejected'; } | Maybe<TResult1, EResult> & { __state: 'pending'; };
  when<TResult1 = T, TResult2 = never, EResult = unknown>(this: Maybe<T, E> & { __state: 'pending'; }, onResolve: (value: T) => TResult1 | Maybe<TResult1, EResult> | Promise<TResult1>): Maybe<TResult1, EResult> & { __state: 'pending'; };
  when<TResult1 = T, TResult2 = never, EResult = unknown>(this: Maybe<T, E> & { __state: 'resolved'; }, onResolve: (value: T) => TResult1 | Maybe<TResult1, EResult> | Promise<TResult1>): Maybe<TResult1, EResult> & { __state: 'resolved'; } | Maybe<undefined, unknown> & { __state: 'rejected'; };
  when<TResult1 = T, TResult2 = never, EResult = unknown>(this: Maybe<T, E> & { __state: 'rejected'; }, onResolve: (value: T) => TResult1 | Maybe<TResult1, EResult> | Promise<TResult1>): Maybe<T, E> & { __state: 'rejected'; };
  when<TResult1 = T, TResult2 = never, EResult = unknown>(onResolve: (value: T) => TResult1 | Maybe<TResult1, EResult> | Promise<TResult1>): Maybe<T, E> & { __state: 'rejected'; } | Maybe<TResult1, EResult> & { __state: 'pending' | 'resolved'; } | Maybe<undefined, unknown> & { __state: 'rejected'; };
  when<TResult1 = T, TResult2 = never, EResult = unknown>(this: Maybe<T, E> & { __state: 'pending'; }, onResolve: undefined, onReject: (error: E | undefined) => TResult2 | Maybe<TResult2, EResult> | Promise<TResult2>): Maybe<TResult2, EResult> & { __state: 'pending'; };
  when<TResult1 = T, TResult2 = never, EResult = unknown>(this: Maybe<T, E> & { __state: 'resolved'; }, onResolve: undefined, onReject: (error: E | undefined) => TResult2 | Maybe<TResult2, EResult> | Promise<TResult2>): Maybe<T, E> & { __state: 'resolved'; };
  when<TResult1 = T, TResult2 = never, EResult = unknown>(this: Maybe<T, E> & { __state: 'rejected'; }, onResolve: undefined, onReject: (error: E | undefined) => TResult2 | Maybe<TResult2, EResult> | Promise<TResult2>): Maybe<TResult2, EResult> & { __state: 'resolved'; } | Maybe<undefined, unknown> & { __state: 'rejected'; };
  when<TResult1 = T, TResult2 = never, EResult = unknown>(onResolve: undefined, onReject: (error: E | undefined) => TResult2 | Maybe<TResult2, EResult> | Promise<TResult2>): Maybe<T, E> & { __state: 'resolved'; } | Maybe<TResult2, EResult> & { __state: 'pending' | 'resolved'; } | Maybe<undefined, unknown> & { __state: 'rejected'; };
  when<TResult1 = T, TResult2 = never, EResult = unknown>(this: Maybe<T, E> & { __state: 'pending'; }, onResolve: (value: T) => TResult1 | Maybe<TResult1, EResult> | Promise<TResult1>, onReject: (error: E | undefined) => TResult2 | Maybe<TResult2, EResult> | Promise<TResult2>): Maybe<TResult1 | TResult2, EResult> & { __state: 'pending'; };
  when<TResult1 = T, TResult2 = never, EResult = unknown>(this: Maybe<T, E> & { __state: 'resolved'; }, onResolve: (value: T) => TResult1 | Maybe<TResult1, EResult> | Promise<TResult1>, onReject: (error: E | undefined) => TResult2 | Maybe<TResult2, EResult> | Promise<TResult2>): Maybe<TResult1, EResult> & { __state: 'resolved'; } | Maybe<undefined, unknown> & { __state: 'rejected'; };
  when<TResult1 = T, TResult2 = never, EResult = unknown>(this: Maybe<T, E> & { __state: 'rejected'; }, onResolve: (value: T) => TResult1 | Maybe<TResult1, EResult> | Promise<TResult1>, onReject: (error: E | undefined) => TResult2 | Maybe<TResult2, EResult> | Promise<TResult2>): Maybe<TResult2, EResult> & { __state: 'resolved'; } | Maybe<undefined, unknown> & { __state: 'rejected'; };
  when<TResult1 = T, TResult2 = never, EResult = unknown>(onResolve: (value: T) => TResult1 | Maybe<TResult1, EResult> | Promise<TResult1>, onReject: (error: E | undefined) => TResult2 | Maybe<TResult2, EResult> | Promise<TResult2>): Maybe<TResult1, EResult> & { __state: 'pending' | 'resolved'; } | Maybe<TResult2, EResult> & { __state: 'pending' | 'resolved'; } | Maybe<undefined, unknown> & { __state: 'rejected'; };
  when<TResult1 = T, TResult2 = never, EResult = unknown>(
    onResolve?: (value: T) => TResult1 | Maybe<TResult1, EResult> | Promise<TResult1>,
    onReject?: (error: E | undefined) => TResult2 | Maybe<TResult2, EResult> | Promise<TResult2>
  ): Maybe<T, E> & { __state: 'resolved' | 'rejected'; } | Maybe<TResult1 | TResult2, EResult> & { __state: 'pending' | 'resolved'; } | Maybe<undefined, unknown> & { __state: 'rejected'; } {
    /* eslint-enable @typescript-eslint/no-unused-vars */
    if (this.isResolved()) {
      if (onResolve) {
        try {
          return Maybe.from(onResolve(this._value!)) as Maybe<TResult1, EResult> & { __state: 'resolved'; };
        } catch (error) {
          return Maybe.fromError(error);
        }
      }

      return this;
    }

    if (this.isRejected()) {
      if (onReject) {
        try {
          return Maybe.from(onReject(this._error)) as Maybe<TResult2, EResult> & { __state: 'resolved'; };
        } catch (error) {
          return Maybe.fromError(error);
        }
      }

      return this;
    }

    return Maybe.from(
      this._wrappedPromise!.then(onResolve, onReject)
    ) as unknown as Maybe<TResult1 | TResult2, EResult> & { __state: 'pending'; };
  }

  /**
   * Shortcut to `when` that attaches a handler for when the Maybe rejects. Works similarly to
   * `catch` on promises.
   */
  catch<TResult = T, EResult = unknown>(
    onReject: (error: E | undefined) => TResult | Maybe<TResult, EResult> | Promise<TResult>
  ): Maybe<T, E> | Maybe<TResult, EResult> | Maybe<undefined, unknown> {
    return this.when(undefined, onReject);
  }

  /**
   * Shortcut to when that attaches that same handler to both `onResolve` and `onReject`. Since
   * we don't care if the value resolved or rejected, the method will not be called with any
   * arguments. This works similarly to `finally` on promises.
   *
   * NOTE: Resolves/rejects with the original resolve/reject value, ignoring the result of
   * onFinally.
   */
  finally<TResult1 = T, TResult2 = never, EResult = unknown>(
    onFinally: () => any // eslint-disable-line @typescript-eslint/no-explicit-any
  ): Maybe<T, E> & { __state: 'resolved' | 'rejected'; } | Maybe<TResult1 | TResult2, EResult> & { __state: 'resolved' | 'rejected'; } | Maybe<undefined, unknown> & { __state: 'rejected'; } {
    return this.when(
      (value) => Maybe.from(onFinally()).when(() => value),
      (error) => Maybe.from(onFinally()).when(() => Maybe.fromError(error))
    ) as Maybe<T, E> & { __state: 'resolved' | 'rejected'; } | Maybe<TResult1 | TResult2, EResult> & { __state: 'resolved' | 'rejected'; } | Maybe<undefined, unknown> & { __state: 'rejected'; };
  }

  /**
   * If the value is ready, this will defer to `value`. Otherwise, this will throw the result
   * of `promise`. This means that:
   *
   * - We'll return a value if there is one
   * - We'll throw a non-promise error if there is one
   * - We'll throw the promise if we are still pending.
   *
   * This is intended for use with React suspense with data fetch.
   *
   * The return type uses overload resolution based on the __state intersection:
   * 1. Resolved overload: When __state is 'resolved', returns T
   * 2. Rejected overload: When __state is 'rejected', returns never (will throw error)
   * 3. Pending overload: When __state is 'pending', returns never (will throw promise for Suspense)
   * 4. Generic overload: Fallback that returns T when state is unknown at compile time.
   *
   * React Suspense will catch the thrown promise, suspend rendering, and retry once the
   * promise resolves.
   */
  suspend(this: Maybe<T, E> & { __state: 'resolved'; }): T;
  suspend(this: Maybe<T, E> & { __state: 'rejected'; }): never;
  suspend(this: Maybe<T, E> & { __state: 'pending'; }): never;
  suspend(): T;
  suspend(): T {
    if (this.isResolved()) {
      return this.value();
    }

    if (this.isRejected()) {
      throw this._error;
    }

    throw this.promise();
  }

  /**
   * Makes this Maybe adopt the state of another Maybe instance. If the other maybe is
   * not yet ready, we'll register a `when` in order to adopt its eventual state.
   */
  private _become(otherMaybe: Maybe<T, E>, fromPromise: true): Promise<T | E>;
  private _become(otherMaybe: Maybe<T, E>, fromPromise: false): Promise<T> | void;
  private _become(otherMaybe: Maybe<T, E>, fromPromise: boolean): Promise<T | E> | void {
    this._isReady = otherMaybe._isReady;
    this._isError = otherMaybe._isError;
    this._value = otherMaybe._value;
    this._error = otherMaybe._error;
    this._wrappedPromise = null;

    if (otherMaybe.isPending()) {
      // The wrapped promise must take into account time to handle `_handleResolve`/`_handleReject`
      // in this instance, so we cannot just copy `otherMaybe._wrappedPromise`.
      const wrappedMaybe = otherMaybe.when(
        (value) => this._handleResolve(value),
        (error) => this._handleReject(error)
      );
      this._wrappedPromise = wrappedMaybe.promise() as Promise<T>;

      // prevent unhandled rejection errors caused by the re-reject in _handleReject
      this._wrappedPromise.catch(() => {});

      return this._wrappedPromise;
    }

    if (fromPromise) {
      return this.promise();
    }
  }

  /**
   * Adopts the state of a resolved promise or Maybe. If the `value` is another Maybe,
   * we'll defer to `_become`.
   *
   * This will re-resolve the value to preserve promise chaining.
   */
  private _handleResolve(value: T | Maybe<T, E>): T | Promise<T> {
    if (Maybe.isMaybe(value)) {
      return this._become(value, true) as Promise<T>;
    }

    this._isReady = true;
    this._value = value;
    this._wrappedPromise = null;

    return value;
  }

  /**
   * Adopts the state of a rejected promise or Maybe. If the `error` is another Maybe,
   * we'll defer to `_become`.
   *
   * This will re-reject the value to preserve promise chaining.
   */
  private _handleReject(error: E | Maybe<T, E> | undefined): Promise<E | undefined> {
    if (Maybe.isMaybe(error)) {
      return this._become(error, true) as Promise<E>;
    }

    this._isReady = true;
    this._value = undefined;
    this._error = error;
    this._isError = true;
    this._wrappedPromise = null;

    return Promise.reject(error);
  }
}
