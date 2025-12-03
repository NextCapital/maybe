export interface Deferred<T> {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (error: Error) => void;
}
/**
 * A helpful set of utilities for working with native promises.
 */
declare const PromiseUtils: {
    /**
     * Returns a promise that can be resolved or rejected on-demand by other code. This is
     * frequently useful in unit tests.
     *
     * @returns A deferred object with a promise and its resolve/reject functions.
     */
    defer<T>(): Deferred<T>;
    /**
     * Runs a series of tasks in-order, with the next not starting until the previous completes.
     * Unlike a normal AsyncQueue, if a task fails, the rest of the tasks will not run. In addition,
     * this method will resolve with the resolved values of each task.
     *
     * @param tasks An array of task functions to run in sequence.
     * @returns A promise that resolves to an array of task results.
     */
    serialize(tasks: Array<() => unknown>): Promise<unknown[]>;
    /**
     * Returns a Promise that will resolve when the passed `condition` evaluates to `true`.
     *
     * NOTE: If a `timeout` is provided, this will reject if the `timeout` is reached without the
     * passed `condition` evaluating to `true`.
     *
     * @param condition
     * @param timeout
     */
    pollForCondition(condition: () => boolean, timeout?: number | null): Promise<void>;
    /**
     * Not all promise-based code uses "native" promises. Thus, we need a method to find objects
     * that are "promise-alike". The industry standard is to consider any object with a `then` method
     * ("thenable") something that acts a promise.
     *
     * This method returns `true` if the `thing` passed in is "thenable".
     *
     * @param thing The value to check if it is thenable.
     * @returns True if the thing is thenable, false otherwise.
     */
    isThenable(thing: unknown): thing is PromiseLike<unknown>;
    /**
     * Returns a promise that resolves after the given time has passed.
     *
     * @param time
     */
    timeout(time: number): Promise<void>;
};
export default PromiseUtils;
//# sourceMappingURL=PromiseUtils.d.ts.map