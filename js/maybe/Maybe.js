const PromiseUtils = require('../promise-utils/PromiseUtils');
const PendingValueError = require('./PendingValueError');

/**
 * The `Maybe` class acts like a `Maybe` type in functional programming: but instead of being
 * a maybe between a value and nothing, this acts as a maybe between a promise and a value. In
 * other words, this class is for things that are "maybe" a promise!
 *
 * Ordinarily, it is not possible to know that state of a native Promise or access its value or
 * error synchronously. The `Maybe` class allows you to do to both. This allows us to act
 * synchronously on data if possible, and wait for it easily if not.
 */
class Maybe {
  /**
   * Shortcut to the `Maybe` constructor, with the caveat that if `thing` is already a `Maybe`
   * instance, we'll just return `thing` as-is.
   *
   * @param {*} thing A promise, maybe, or some other value to convert into a Maybe
   * @returns {Maybe}
   */
  static from(thing) {
    if (this.isMaybe(thing)) {
      return thing;
    }

    return new Maybe(thing);
  }

  /**
   * Helpful builder for a Maybe. If `isReady` is true, the `valueGetter` will be called and a
   * `Maybe` will be created from the resulting value. Otherwise, `promiseGetter` will be called
   * and a `Maybe` will be created from the resulting Promise.
   *
   * @param {Boolean} isReady Boolean indicating if the value is ready or not
   * @param {Function} valueGetter Function returning the value if `isReady` is true
   * @param {Function} promiseGetter Function returning a promise for the value otherwise
   * @returns {Maybe}
   */
  static build(isReady, valueGetter, promiseGetter) {
    if (isReady) {
      return new Maybe(valueGetter());
    }

    return new Maybe(promiseGetter());
  }

  /**
   * Returns `true` if `thing` is a `Maybe` instance.
   *
   * @param {*} thing
   * @returns {Boolean}
   */
  static isMaybe(thing) {
    return thing instanceof Maybe;
  }

  /**
   * Creates a rejected Maybe instance for the error.
   *
   * @param {*} error The error for the rejected Maybe
   * @returns {Maybe}
   */
  static fromError(error) {
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
   *
   * @param {Array} array Values to check. All of these will be passed through `Maybe.from`.
   * @returns {Maybe}
   */
  static all(array) {
    const maybeArray = array.map((thing) => Maybe.from(thing));
    const allResolved = maybeArray.every((maybe) => maybe.isResolved());

    if (allResolved) {
      return Maybe.from(maybeArray.map((maybe) => maybe.value()));
    }

    const rejectedEntry = maybeArray.find((maybe) => maybe.isRejected());
    if (rejectedEntry) {
      return rejectedEntry;
    }

    return Maybe.from(Promise.all(maybeArray.map((maybe) => maybe.promise())));
  }

  /**
   * Builds a new `Maybe` instance.
   *
   * @param {*} thing A promise, another maybe, or some value.
   * @param {Boolean} [isError=false] When `true`, and if the the `thing` is not a promise or
   *   Maybe, the instance will reject to `thing` instead of resolving.
   */
  constructor(thing, isError = false) {
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
      this._wrappedPromise = thing;

      thing.then(
        (value) => this._handleResolve(value),
        (error) => this._handleReject(error)
      );
    }

    if (isMaybe) {
      this._become(thing);
    }
  }

  /**
   * Returns `true` if the instance is resolved or rejected. If the promise is still pending,
   * this will return `false`.
   *
   * @returns {Boolean}
   */
  isReady() {
    return this._isReady;
  }

  /**
   * Returns `true` if the instance is resolved. A call to `value()` will return the resolved
   * value synchronously.
   *
   * @returns {Boolean}
   */
  isResolved() {
    return this._isReady && !this._isError;
  }

  /**
   * Returns `true` if the instance is rejected. A call to `value()` will throw the rejected
   * error value.
   *
   * @returns {Boolean}
   */
  isRejected() {
    return this._isReady && this._isError;
  }

  /**
   * If resolved, this will return the resolved value. If rejected, this will return the rejected
   * error.
   *
   * Otherwise, this will throw a `PendingValueError`. Always be sure to gate code by `isReady`,
   * `isResolved`, or `isRejected` before calling `value`.
   *
   * @returns {*}
   * @throws {*|PendingValueError}
   */
  value() {
    if (this.isResolved()) {
      return this._value;
    }

    if (this.isRejected()) {
      throw this._value;
    }

    throw new PendingValueError('cannot get value for a Maybe that is not ready');
  }

  /**
   * Works like `value`, but will return the error if rejected instead of throwing it.
   *
   * @returns {*}
   * @throws {PendingValueError}
   */
  valueOrError() {
    if (this.isReady()) {
      return this._value;
    }

    throw new PendingValueError('cannot get value or error for a Maybe that is not ready');
  }

  /**
   * Returns the pending promise if there still is one. Otherwise, returns a promise that resolves
   * or rejects to the resolved or rejected value.
   *
   * You can always convert a Maybe back to a promise!
   *
   * @returns {Promise}
   */
  promise() {
    if (this.isResolved()) {
      return Promise.resolve(this._value);
    }

    if (this.isRejected()) {
      return Promise.reject(this._value);
    }

    return this._wrappedPromise;
  }

  /**
   * Works like `then` does for promises, but for Maybe instances. Each call returns a
   * Maybe instance that:
   *
   * - When this maybe resolves (or immediately if it already is), resolves with the result
   *   of calling `onResolve` with the resolved value.
   * - When this maybe rejects (or immediately if it already is), resolves with the result
   *   of calling `onReject` with the rejected value.
   * - If still pending, we'll pass `onProgress` through to the promise.
   * - The `onResolve`/`onReject` can return another `Maybe` instance, with similar behavior
   *   for when this happens for promises.
   *
   * In this way, we can "chain" together multiple maybes. The final returned Maybe will be
   * resolved immediately if all intermediate ones are. Otherwise, it will be pending and resolve
   * with the value when it is ready.
   *
   * NOTE: We can't call this method `then`, as otherwise a Maybe instance would be considered
   * promise-alike, which we don't want.
   *
   * @param {Function|undefined} [onResolve] Function called when the Maybe resolves with the
   *   resolved value.
   * @param {Function|undefined} [onReject] Function called when the Maybe rejects with the
   *   rejected error.
   * @param {Function} [onProgress] Passed through to the pending promise if still pending.
   * @returns {Maybe}
   */
  when(onResolve, onReject, onProgress) {
    if (this.isResolved()) {
      if (onResolve) {
        return Maybe.from(onResolve(this._value));
      }

      return this;
    }

    if (this.isRejected()) {
      if (onReject) {
        return Maybe.from(onReject(this._value));
      }

      return this;
    }

    return Maybe.from(this._wrappedPromise.then(onResolve, onReject, onProgress));
  }

  /**
   * Shortcut to `when` that attaches a handler for when the Maybe rejects. Works similarly to
   * `catch` on promises.
   *
   * @param {Function} onReject Function called when the Maybe rejects with the rejected error.
   * @returns {Maybe}
   */
  catch(onReject) {
    return this.when(undefined, onReject);
  }

  /**
   * Shortcut to when that attaches that same handler to both `onResolve` and `onReject`. Since
   * we don't care if the value resolved or rejected, the method will not be called with any
   * arguments. This works similarly to `finally` on promises.
   *
   * @param {Function} onFinally Function called, without any arguments, when the maybe either
   *   resolves or rejects.
   * @returns {Maybe}
   */
  finally(onFinally) {
    return this.when(() => onFinally(), () => onFinally());
  }

  /**
   * If the value is ready, this will defer to `value`. Otherwise, this will throw the result
   * of `promise`. This means that:
   *
   * - We'll return a value if there is one
   * - We'll throw a non-promise error if there is one
   * - We'll throw the promise if we are still pending
   *
   * This is intended for use with React suspense with data fetch.
   *
   * @returns {*}
   * @throws {Promise|*}
   */
  suspend() {
    if (this.isReady()) {
      return this.value();
    }

    throw this.promise();
  }

  /**
   * Makes this Maybe adopt the state of another Maybe instance. If the other maybe is
   * not yet ready, we'll register a `when` in order to adopt its eventual state.
   *
   * @param {Maybe} otherMaybe
   * @private
   */
  _become(otherMaybe) {
    this._isReady = otherMaybe._isReady;
    this._isError = otherMaybe._isError;
    this._value = otherMaybe._value;
    this._wrappedPromise = otherMaybe._wrappedPromise;

    if (!otherMaybe.isReady()) {
      otherMaybe.when(
        (value) => this._handleResolve(value),
        (error) => this._handleReject(error)
      );
    }
  }

  /**
   * Adopts the state of of a resolved promise or Maybe. If the `value` is another Maybe,
   * we'll defer to `_become`.
   *
   * @param {*} value
   * @private
   */
  _handleResolve(value) {
    if (Maybe.isMaybe(value)) {
      return this._become(value);
    }

    this._isReady = true;
    this._value = value;
    this._wrappedPromise = null;
  }

  /**
   * Adopts the state of of a rejected promise or Maybe. If the `value` is another Maybe,
   * we'll defer to `_become`.
   *
   * @param {*} error
   * @private
   */
  _handleReject(error) {
    if (Maybe.isMaybe(error)) {
      return this._become(error);
    }

    this._isReady = true;
    this._value = error;
    this._isError = true;
    this._wrappedPromise = null;
  }
}

module.exports = Maybe;
