import PromiseUtils from '../promise-utils/PromiseUtils.js';
import PendingValueError from './PendingValueError.js';

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

  declare readonly __state: 'resolved' | 'rejected' | 'pending';

  /**
   * Shortcut to the `Maybe` constructor, with the caveat that if `thing` is already a `Maybe`
   * instance, we'll just return `thing` as-is.
   */
  static from<U, V = unknown>(thing: U | Promise<U> | Maybe<U, V>): Maybe<U, V> {
    if (this.isMaybe(thing)) {
      return thing;
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
  static isMaybe<U, V = unknown>(thing: any): thing is Maybe<U, V> {
    return thing instanceof Maybe;
  }

  /**
   * Creates a rejected Maybe instance for the error.
   */
  static fromError<V = unknown>(error: V): Maybe<undefined, V> {
    return new Maybe(undefined, true, error);
  }

  /**
   * Works like `Promise.all`, but for `Maybe` instances! This means:
   *
   * - If all entries are resolved Maybe instances, we will return a `Maybe` resolved to
   * an array of all resolved values.
   * - If any entry has rejected, will throw a Maybe rejected to the first rejected value.
   * - Otherwise, will return a pending Maybe that will resolve the same as `Promise.all` would
   * for the `promise()` for each input Maybe.
   */
  static all<U extends readonly unknown[] | []>(array: U): Maybe<{ -readonly [P in keyof U]: Awaited<U[P]> }> {
    const maybeArray = array.map((thing) => Maybe.from(thing));
    const allResolved = maybeArray.every((maybe) => maybe.isResolved());

    if (allResolved) {
      // The type cast is necessary here and below because TS cannot track the type transformations
      // through the .map call.
      return Maybe.from(maybeArray.map((maybe) => maybe.value())) as Maybe<{ -readonly [P in keyof U]: Awaited<U[P]> }>;
    }

    const rejectedEntry = maybeArray.find((maybe) => maybe.isRejected());
    if (rejectedEntry) {
      throw rejectedEntry;
    }

    return Maybe.from(Promise.all(maybeArray.map((maybe) => maybe.promise()))) as Maybe<{ -readonly [P in keyof U]: Awaited<U[P]> }>;
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
        (error) => this._handleReject(error)
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
   */
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
  valueOrError(this: Maybe<T, E> & { __state: 'resolved'; }): T;
  valueOrError(this: Maybe<T, E> & { __state: 'rejected'; }): E;
  valueOrError(this: Maybe<T, E> & { __state: 'pending'; }): never;
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
   */
  promise(this: Maybe<T, E> & { __state: 'resolved'; }): Promise<T>;
  promise(this: Maybe<T, E> & { __state: 'rejected'; }): Promise<E>;
  promise(this: Maybe<T, E> & { __state: 'pending'; }): Promise<T | E>;
  promise(): Promise<T | E> {
    if (this.isResolved()) {
      return Promise.resolve(this._value!);
    }

    if (this.isRejected()) {
      return Promise.reject(this._error);
    }

    return this._wrappedPromise!;
  }

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
   */

  when<TResult1 = T, TResult2 = never, EResult = unknown>(this: Maybe<T, E> & { __state: 'pending'; }): Maybe<TResult1, EResult>;
  when<TResult1 = T, TResult2 = never, EResult = unknown>(this: Maybe<T, E> & { __state: 'resolved'; }): Maybe<T, E>;
  when<TResult1 = T, TResult2 = never, EResult = unknown>(this: Maybe<T, E> & { __state: 'rejected'; }): Maybe<T, E>;
  // when<TResult1 = T, TResult2 = never, EResult = unknown>(): Maybe<T, E> | Maybe<TResult1, EResult>;
  when<TResult1 = T, TResult2 = never, EResult = unknown>(this: Maybe<T, E> & { __state: 'pending'; }, onResolve: (value: T) => TResult1 | Maybe<TResult1, EResult> | Promise<TResult1>): Maybe<TResult1, EResult>;
  when<TResult1 = T, TResult2 = never, EResult = unknown>(this: Maybe<T, E> & { __state: 'resolved'; }, onResolve: (value: T) => TResult1 | Maybe<TResult1, EResult> | Promise<TResult1>): Maybe<TResult1, EResult> | Maybe<undefined, unknown>;
  when<TResult1 = T, TResult2 = never, EResult = unknown>(this: Maybe<T, E> & { __state: 'rejected'; }, onResolve: (value: T) => TResult1 | Maybe<TResult1, EResult> | Promise<TResult1>): Maybe<T, E>;
  // when<TResult1 = T, TResult2 = never, EResult = unknown>(onResolve: (value: T) => TResult1 | Maybe<TResult1, EResult> | Promise<TResult1>): Maybe<T, E> | Maybe<TResult1, EResult> | Maybe<undefined, unknown>;
  when<TResult1 = T, TResult2 = never, EResult = unknown>(this: Maybe<T, E> & { __state: 'pending'; }, onResolve: undefined, onReject: (error: E | undefined) => TResult2 | Maybe<TResult2, EResult> | Promise<TResult2>): Maybe<TResult2, EResult>;
  when<TResult1 = T, TResult2 = never, EResult = unknown>(this: Maybe<T, E> & { __state: 'resolved'; }, onResolve: undefined, onReject: (error: E | undefined) => TResult2 | Maybe<TResult2, EResult> | Promise<TResult2>): Maybe<T, E>;
  when<TResult1 = T, TResult2 = never, EResult = unknown>(this: Maybe<T, E> & { __state: 'rejected'; }, onResolve: undefined, onReject: (error: E | undefined) => TResult2 | Maybe<TResult2, EResult> | Promise<TResult2>): Maybe<TResult2, EResult> | Maybe<undefined, unknown>;
  // when<TResult1 = T, TResult2 = never, EResult = unknown>(onResolve: undefined, onReject: (error: E | undefined) => TResult2 | Maybe<TResult2, EResult> | Promise<TResult2>): Maybe<T, E> | Maybe<TResult2, EResult> | Maybe<undefined, unknown>;
  when<TResult1 = T, TResult2 = never, EResult = unknown>(this: Maybe<T, E> & { __state: 'pending'; }, onResolve: (value: T) => TResult1 | Maybe<TResult1, EResult> | Promise<TResult1>, onReject: (error: E | undefined) => TResult2 | Maybe<TResult2, EResult> | Promise<TResult2>): Maybe<TResult1 | TResult2, EResult>;
  when<TResult1 = T, TResult2 = never, EResult = unknown>(this: Maybe<T, E> & { __state: 'resolved'; }, onResolve: (value: T) => TResult1 | Maybe<TResult1, EResult> | Promise<TResult1>, onReject: (error: E | undefined) => TResult2 | Maybe<TResult2, EResult> | Promise<TResult2>): Maybe<TResult1, EResult> | Maybe<undefined, unknown>;
  when<TResult1 = T, TResult2 = never, EResult = unknown>(this: Maybe<T, E> & { __state: 'rejected'; }, onResolve: (value: T) => TResult1 | Maybe<TResult1, EResult> | Promise<TResult1>, onReject: (error: E | undefined) => TResult2 | Maybe<TResult2, EResult> | Promise<TResult2>): Maybe<TResult2, EResult> | Maybe<undefined, unknown>;
  // when<TResult1 = T, TResult2 = never, EResult = unknown>(onResolve: (value: T) => TResult1 | Maybe<TResult1, EResult> | Promise<TResult1>, onReject: (error: E | undefined) => TResult2 | Maybe<TResult2, EResult> | Promise<TResult2>): Maybe<TResult1 | TResult2, EResult> | Maybe<undefined, unknown>;
  when<TResult1 = T, TResult2 = never, EResult = unknown>(
    onResolve?: (value: T) => TResult1 | Maybe<TResult1, EResult> | Promise<TResult1>,
    onReject?: (error: E | undefined) => TResult2 | Maybe<TResult2, EResult> | Promise<TResult2>
  ): Maybe<T, E> | Maybe<TResult1 | TResult2, EResult> | Maybe<undefined, unknown> {
    if (this.isResolved()) {
      if (onResolve) {
        try {
          return Maybe.from(onResolve(this._value!));
        } catch (error) {
          return Maybe.fromError(error);
        }
      }

      return this;
    }

    if (this.isRejected()) {
      if (onReject) {
        try {
          return Maybe.from(onReject(this._error));
        } catch (error) {
          return Maybe.fromError(error);
        }
      }

      return this;
    }

    return Maybe.from(
      this._wrappedPromise!.then(onResolve, onReject)
    ) as Maybe<TResult1 | TResult2, EResult>;
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
    onFinally: () => any
  ): Maybe<T, E> | Maybe<TResult1 | TResult2, EResult> | Maybe<undefined, unknown> {
    return this.when(
      (value) => Maybe.from(onFinally()).when(() => value),
      (error) => Maybe.from(onFinally()).when(() => Maybe.fromError(error))
    );
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
   */
  suspend(this: Maybe<T, E> & { __state: 'resolved'; }): T;
  suspend(this: Maybe<T, E> & { __state: 'rejected'; }): never;
  suspend(this: Maybe<T, E> & { __state: 'pending'; }): never;
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
