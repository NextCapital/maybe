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
export default class Maybe<T> {
  private _isReady: boolean;
  private _isError: boolean;
  private _value: T | undefined;
  private _wrappedPromise: Promise<T> | null;

  /**
   * Shortcut to the `Maybe` constructor, with the caveat that if `thing` is already a `Maybe`
   * instance, we'll just return `thing` as-is.
   */
  static from<T>(thing: T | Promise<T> | Maybe<T>): Maybe<T> {
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
  static build<T>(isReady: boolean, valueGetter: () => T, promiseGetter: () => Promise<T>): Maybe<T> {
    if (isReady) {
      return new Maybe(valueGetter());
    }

    return new Maybe(promiseGetter());
  }

  /**
   * Returns `true` if `thing` is a `Maybe` instance.
   */
  static isMaybe(thing: unknown): thing is Maybe<unknown> {
    return thing instanceof Maybe;
  }

  /**
   * Creates a rejected Maybe instance for the error.
   */
  static fromError(error: Error): Maybe<never> {
    return new Maybe(error, true);
  }

  /**
   * Works like `Promise.all`, but for `Maybe` instances! This means:
   *
   * - If all entries are resolved Maybe instances, we will return a `Maybe` resolved to
   *   an array of all resolved values.
   * - If any entry has rejected, will return a Maybe rejected to the first rejected value.
   * - Otherwise, will return a pending Maybe that will resolve the same as `Promise.all` would
   *   for the `promise()` for each input Maybe.
   */
  static all<T>(array: Array<T | Promise<T> | Maybe<T>>): Maybe<T[]> {
    const maybeArray = array.map((thing) => Maybe.from(thing));
    const allResolved = maybeArray.every((maybe) => maybe.isResolved());

    if (allResolved) {
      return Maybe.from(maybeArray.map((maybe) => maybe.value()));
    }

    const rejectedEntry = maybeArray.find((maybe) => maybe.isRejected());
    if (rejectedEntry) {
      return rejectedEntry as Maybe<T[]>;
    }

    return Maybe.from(Promise.all(maybeArray.map((maybe) => maybe.promise())));
  }

  /**
   * Builds a new `Maybe` instance.
   */
  constructor(thing: T | Promise<T> | Maybe<T>, isError = false) {
    const isMaybe = Maybe.isMaybe(thing);
    const isPromise = PromiseUtils.isThenable(thing);

    this._isReady = !isPromise;
    this._isError = false;
    this._value = (isPromise || isMaybe) ? undefined : thing;
    this._wrappedPromise = null;

    if (this._isReady && isError) {
      this._isError = true;
    }

    if (isPromise) {
      this._wrappedPromise = (thing as Promise<T>).then(
        (value) => this._handleResolve(value),
        (error) => this._handleReject(error)
      );

      // prevent unhandled rejection errors caused by the re-reject in _handleReject
      this._wrappedPromise.catch(() => {});
    }

    if (isMaybe) {
      this._become(thing as Maybe<T>, false);
    }
  }

  /**
   * Returns `true` if the instance is resolved or rejected. If the promise is still pending,
   * this will return `false`.
   */
  isReady(): boolean {
    return this._isReady;
  }

  /**
   * Returns `true` if the instance is not yet resolved or rejected. The opposite of `isReady`.
   */
  isPending(): boolean {
    return !this._isReady;
  }

  /**
   * Returns `true` if the instance is resolved. A call to `value()` will return the resolved
   * value synchronously.
   */
  isResolved(): boolean {
    return this._isReady && !this._isError;
  }

  /**
   * Returns `true` if the instance is rejected. A call to `value()` will throw the rejected
   * error value.
   */
  isRejected(): boolean {
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
      throw this._value;
    }

    throw new PendingValueError('cannot get value for a Maybe that is not ready');
  }

  /**
   * Works like `value`, but will return the error if rejected instead of throwing it.
   */
  valueOrError(): T | Error {
    if (this.isReady()) {
      return this._value as T | Error;
    }

    throw new PendingValueError('cannot get value or error for a Maybe that is not ready');
  }

  /**
   * Returns the pending promise if there still is one. Otherwise, returns a promise that resolves
   * or rejects to the resolved or rejected value.
   *
   * You can always convert a Maybe back to a promise!
   */
  promise(): Promise<T> {
    if (this.isResolved()) {
      return Promise.resolve(this._value!);
    }

    if (this.isRejected()) {
      return Promise.reject(this._value);
    }

    return this._wrappedPromise!;
  }

  /**
   * Works like `then` does for promises, but for Maybe instances. Each call returns a
   * Maybe instance that:
   *
   * - When this maybe resolves (or immediately if it already is), resolves with the result
   *   of calling `onResolve` with the resolved value.
   * - When this maybe rejects (or immediately if it already is), resolves with the result
   *   of calling `onReject` with the rejected value.
   * - The `onResolve`/`onReject` can return another `Maybe` instance, with similar behavior
   *   for when this happens for promises.
   *
   * In this way, we can "chain" together multiple maybes. The final returned Maybe will be
   * resolved immediately if all intermediate ones are. Otherwise, it will be pending and resolve
   * with the value when it is ready.
   *
   * NOTE: We can't call this method `then`, as otherwise a Maybe instance would be considered
   * promise-alike, which we don't want.
   */
  when<TResult>(
    onResolve?: (value: T) => TResult | Maybe<TResult> | Promise<TResult>,
    onReject?: (error: Error) => TResult | Maybe<TResult> | Promise<TResult>
  ): Maybe<TResult> {
    if (this.isResolved()) {
      if (onResolve) {
        try {
          return Maybe.from(onResolve(this._value!));
        } catch (error) {
          return Maybe.fromError(error as Error);
        }
      }

      return this as unknown as Maybe<TResult>;
    }

    if (this.isRejected()) {
      if (onReject) {
        try {
          return Maybe.from(onReject(this._value as Error));
        } catch (error) {
          return Maybe.fromError(error as Error);
        }
      }

      return this as unknown as Maybe<TResult>;
    }

    return Maybe.from(
      this._wrappedPromise!.then(onResolve, onReject)
    );
  }

  /**
   * Shortcut to `when` that attaches a handler for when the Maybe rejects. Works similarly to
   * `catch` on promises.
   */
  catch<TResult>(onReject: (error: Error) => TResult | Maybe<TResult> | Promise<TResult>): Maybe<T | TResult> {
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
  finally(onFinally: () => void | Maybe<void> | Promise<void>): Maybe<T> {
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
  suspend(): T {
    if (this.isReady()) {
      return this.value();
    }

    throw this.promise();
  }

  /**
   * Makes this Maybe adopt the state of another Maybe instance. If the other maybe is
   * not yet ready, we'll register a `when` in order to adopt its eventual state.
   */
  private _become(otherMaybe: Maybe<T>, fromPromise: boolean): Promise<T> | void {
    this._isReady = otherMaybe._isReady;
    this._isError = otherMaybe._isError;
    this._value = otherMaybe._value;
    this._wrappedPromise = null;

    if (otherMaybe.isPending()) {
      // The wrapped promise must take into account time to handle `_handleResolve`/`_handleReject`
      // in this instance, so we cannot just copy `otherMaybe._wrappedPromise`.
      this._wrappedPromise = otherMaybe.when(
        (value) => this._handleResolve(value),
        (error) => this._handleReject(error)
      ).promise();

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
  private _handleResolve(value: T | Maybe<T>): T | Promise<T> {
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
  private _handleReject(error: Error | Maybe<T>): Promise<never> {
    if (Maybe.isMaybe(error)) {
      return this._become(error, true) as Promise<never>;
    }

    this._isReady = true;
    this._value = error as unknown as T;
    this._isError = true;
    this._wrappedPromise = null;

    return Promise.reject(error);
  }
}
