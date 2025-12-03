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
    private _isReady;
    private _isError;
    private _value;
    private _wrappedPromise;
    /**
     * Shortcut to the `Maybe` constructor, with the caveat that if `thing` is already a `Maybe`
     * instance, we'll just return `thing` as-is.
     *
     * @param thing The value, promise, or Maybe to create a Maybe from.
     * @returns A Maybe instance.
     */
    static from<U>(thing: U | Promise<U> | Maybe<U>): Maybe<U>;
    /**
     * Helpful builder for a Maybe. If `isReady` is true, the `valueGetter` will be called and a
     * `Maybe` will be created from the resulting value. Otherwise, `promiseGetter` will be called
     * and a `Maybe` will be created from the resulting Promise.
     *
     * @param isReady Whether the value is ready.
     * @param valueGetter Function to get the value if ready.
     * @param promiseGetter Function to get the promise if not ready.
     * @returns A Maybe instance.
     */
    static build<U>(isReady: boolean, valueGetter: () => U, promiseGetter: () => Promise<U>): Maybe<U>;
    /**
     * Returns `true` if `thing` is a `Maybe` instance.
     *
     * @param thing The value to check.
     * @returns True if thing is a Maybe instance.
     */
    static isMaybe(thing: unknown): thing is Maybe<unknown>;
    /**
     * Creates a rejected Maybe instance for the error.
     *
     * @param error The error to create a rejected Maybe from.
     * @returns A rejected Maybe instance.
     */
    static fromError(error: Error): Maybe<never>;
    /**
     * Works like `Promise.all`, but for `Maybe` instances! This means:
     *
     * - If all entries are resolved Maybe instances, we will return a `Maybe` resolved to
     * an array of all resolved values.
     * - If any entry has rejected, will return a Maybe rejected to the first rejected value.
     * - Otherwise, will return a pending Maybe that will resolve the same as `Promise.all` would
     * for the `promise()` for each input Maybe.
     *
     * @param array Array of values, promises, or Maybe instances.
     * @returns A Maybe of an array of all resolved values.
     */
    static all<U>(array: Array<U | Promise<U> | Maybe<U>>): Maybe<U[]>;
    /**
     * Builds a new `Maybe` instance.
     *
     * @param thing
     * @param isError
     */
    constructor(thing: T | Promise<T> | Maybe<T>, isError?: boolean);
    /**
     * Returns `true` if the instance is resolved or rejected. If the promise is still pending,
     * this will return `false`.
     *
     * @returns True if ready, false otherwise.
     */
    isReady(): boolean;
    /**
     * Returns `true` if the instance is not yet resolved or rejected. The opposite of `isReady`.
     *
     * @returns True if pending, false otherwise.
     */
    isPending(): boolean;
    /**
     * Returns `true` if the instance is resolved. A call to `value()` will return the resolved
     * value synchronously.
     *
     * @returns True if resolved, false otherwise.
     */
    isResolved(): boolean;
    /**
     * Returns `true` if the instance is rejected. A call to `value()` will throw the rejected
     * error value.
     *
     * @returns True if rejected, false otherwise.
     */
    isRejected(): boolean;
    /**
     * If resolved, this will return the resolved value. If rejected, this will throw the rejected
     * error.
     *
     * Otherwise, this will throw a `PendingValueError`. Always be sure to gate code by `isReady`,
     * `isResolved`, or `isRejected` before calling `value`.
     *
     * @returns The resolved value.
     */
    value(): T;
    /**
     * Works like `value`, but will return the error if rejected instead of throwing it.
     *
     * @returns The value or error if ready.
     */
    valueOrError(): T | Error;
    /**
     * Returns the pending promise if there still is one. Otherwise, returns a promise that resolves
     * or rejects to the resolved or rejected value.
     *
     * You can always convert a Maybe back to a promise!
     *
     * @returns A promise representing the Maybe state.
     */
    promise(): Promise<T>;
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
     * @param onResolve Handler called with resolved value.
     * @param onReject Handler called with rejected error.
     * @returns A new Maybe with the chained result.
     */
    when<TResult>(onResolve?: (value: T) => TResult | Maybe<TResult> | Promise<TResult>, onReject?: (error: Error) => TResult | Maybe<TResult> | Promise<TResult>): Maybe<TResult>;
    /**
     * Shortcut to `when` that attaches a handler for when the Maybe rejects. Works similarly to
     * `catch` on promises.
     *
     * @param onReject Handler called with rejected error.
     * @returns A new Maybe with the chained result.
     */
    catch<TResult>(onReject: (error: Error) => TResult | Maybe<TResult> | Promise<TResult>): Maybe<T | TResult>;
    /**
     * Shortcut to when that attaches that same handler to both `onResolve` and `onReject`. Since
     * we don't care if the value resolved or rejected, the method will not be called with any
     * arguments. This works similarly to `finally` on promises.
     *
     * NOTE: Resolves/rejects with the original resolve/reject value, ignoring the result of
     * onFinally.
     *
     * @param onFinally Handler called when Maybe resolves or rejects.
     * @returns A new Maybe with the original value.
     */
    finally(onFinally: () => void | Maybe<void> | Promise<void>): Maybe<T>;
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
     * @returns The value if ready.
     */
    suspend(): T;
    /**
     * Makes this Maybe adopt the state of another Maybe instance. If the other maybe is
     * not yet ready, we'll register a `when` in order to adopt its eventual state.
     *
     * @param otherMaybe The Maybe to adopt the state from.
     * @param fromPromise Whether being called from promise handling.
     * @returns A promise if fromPromise is true and other is pending.
     */
    private _become;
    /**
     * Adopts the state of a resolved promise or Maybe. If the `value` is another Maybe,
     * we'll defer to `_become`.
     *
     * This will re-resolve the value to preserve promise chaining.
     *
     * @param value The resolved value or Maybe.
     * @returns The value or a promise if value is a Maybe.
     */
    private _handleResolve;
    /**
     * Adopts the state of a rejected promise or Maybe. If the `error` is another Maybe,
     * we'll defer to `_become`.
     *
     * This will re-reject the value to preserve promise chaining.
     *
     * @param error The error or Maybe to reject with.
     * @returns A rejected promise.
     */
    private _handleReject;
}
//# sourceMappingURL=Maybe.d.ts.map