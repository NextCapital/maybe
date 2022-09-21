export = Maybe;
/**
 * The `Maybe` class acts like a `Maybe` type in functional programming: but instead of being
 * a maybe between a value and nothing, this acts as a maybe between a promise and a value. In
 * other words, this class is for things that are "maybe" a promise!
 *
 * Ordinarily, it is not possible to know that state of a native Promise or access its value or
 * error synchronously. The `Maybe` class allows you to do to both. This allows us to act
 * synchronously on data if possible, and wait for it easily if not.
 */
declare class Maybe<T> {
    /**
     * Shortcut to the `Maybe` constructor, with the caveat that if `thing` is already a `Maybe`
     * instance, we'll just return `thing` as-is.
     *
     * @param {*} thing A promise, maybe, or some other value to convert into a Maybe
     * @returns {Maybe}
     */
    static from<TT>(thing: Maybe<TT> | TT): Maybe<TT>;
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
    static build<TT>(isReady: boolean, valueGetter: () => TT, promiseGetter: () => Promise<TT>): Maybe<TT>;
    /**
     * Returns `true` if `thing` is a `Maybe` instance.
     *
     * @param {*} thing
     * @returns {Boolean}
     */
    static isMaybe(thing: any): boolean;
    /**
     * Creates a rejected Maybe instance for the error.
     *
     * @param {*} error The error for the rejected Maybe
     * @returns {Maybe}
     */
    static fromError(error: Error): Maybe<Error>;
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
    static all(array: any[]): Maybe<any>;
    /**
     * Builds a new `Maybe` instance.
     *
     * @param {*} thing A promise, another maybe, or some value.
     * @param {Boolean} [isError=false] When `true`, and if the the `thing` is not a promise or
     *   Maybe, the instance will reject to `thing` instead of resolving.
     */
    constructor(thing: T, isError?: boolean);
    _isReady: boolean;
    _isError: boolean;
    _value: T;
    _wrappedPromise: Promise<T> | null;
    /**
     * Returns `true` if the instance is resolved or rejected. If the promise is still pending,
     * this will return `false`.
     *
     * @returns {Boolean}
     */
    isReady(): boolean;
    /**
     * Returns `true` if the instance is not yet resolved or rejected. The opposite of `isReady`.
     *
     * @returns {Boolean}
     */
    isPending(): boolean;
    /**
     * Returns `true` if the instance is resolved. A call to `value()` will return the resolved
     * value synchronously.
     *
     * @returns {Boolean}
     */
    isResolved(): boolean;
    /**
     * Returns `true` if the instance is rejected. A call to `value()` will throw the rejected
     * error value.
     *
     * @returns {Boolean}
     */
    isRejected(): boolean;
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
    value(): T;
    /**
     * Works like `value`, but will return the error if rejected instead of throwing it.
     *
     * @returns {*}
     * @throws {PendingValueError}
     */
    valueOrError(): T;
    /**
     * Returns the pending promise if there still is one. Otherwise, returns a promise that resolves
     * or rejects to the resolved or rejected value.
     *
     * You can always convert a Maybe back to a promise!
     *
     * @returns {Promise}
     */
    promise(): Promise<T>;
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
    when<TResult1 = T, TResult2 = never>(onResolve?: (value: T) => TResult1, onReject?: (value: T) => TResult2, onProgress?: () => void): Maybe<TResult1 | TResult2>;
    /**
     * Shortcut to `when` that attaches a handler for when the Maybe rejects. Works similarly to
     * `catch` on promises.
     *
     * @param {Function} onReject Function called when the Maybe rejects with the rejected error.
     * @returns {Maybe}
     */
    catch<TResult = never>(onReject: (value: T) => TResult): Maybe<TResult>;
    /**
     * Shortcut to when that attaches that same handler to both `onResolve` and `onReject`. Since
     * we don't care if the value resolved or rejected, the method will not be called with any
     * arguments. This works similarly to `finally` on promises.
     *
     * NOTE: Resolves/rejects with the original resolve/reject value, ignorining the result of
     * onFinally.
     *
     * @param {Function} onFinally Function called, without any arguments, when the maybe either
     *   resolves or rejects.
     * @returns {Maybe}
     */
    finally(onFinally: () => any): Maybe<T>;
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
    suspend(): T | never;
    /**
     * Makes this Maybe adopt the state of another Maybe instance. If the other maybe is
     * not yet ready, we'll register a `when` in order to adopt its eventual state.
     *
     * @param {Maybe} otherMaybe
     * @param {boolean} fromPromise When `true`, this will return a promise. This is useful
     *   when `_become` is called as part of a `then` chain. If called from the constructor,
     *   we don't want to call `promise` to avoid an unhandled rejection error.
     * @private
     */
    private _become;
    /**
     * Adopts the state of of a resolved promise or Maybe. If the `value` is another Maybe,
     * we'll defer to `_become`.
     *
     * This will re-resolve the value to preserve promise chaining.
     *
     * @param {*} value
     * @returns {*} the value or a promise for the value
     * @private
     */
    private _handleResolve;
    /**
     * Adopts the state of of a rejected promise or Maybe. If the `value` is another Maybe,
     * we'll defer to `_become`.
     *
     * This will re-reject the value to preserve promise chaining.
     *
     * @param {*} error
     * @returns {Promise} a promise rejected to the error
     * @private
     */
    private _handleReject;
}
