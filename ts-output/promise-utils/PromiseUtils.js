/**
 * A helpful set of utilities for working with native promises.
 */
const PromiseUtils = {
    /**
     * Returns a promise that can be resolved or rejected on-demand by other code. This is
     * frequently useful in unit tests.
     *
     * @returns A deferred object with a promise and its resolve/reject functions.
     */
    defer() {
        let resolve;
        let reject;
        const promise = new Promise((_resolve, _reject) => {
            resolve = _resolve;
            reject = _reject;
        });
        return {
            promise,
            resolve: resolve,
            reject: reject
        };
    },
    /**
     * Runs a series of tasks in-order, with the next not starting until the previous completes.
     * Unlike a normal AsyncQueue, if a task fails, the rest of the tasks will not run. In addition,
     * this method will resolve with the resolved values of each task.
     *
     * @param tasks An array of task functions to run in sequence.
     * @returns A promise that resolves to an array of task results.
     */
    serialize(tasks) {
        return tasks.reduce((result, task) => result.then((value) => (Promise.resolve(task()).then((taskResult) => value.concat([taskResult])))), Promise.resolve([]));
    },
    /**
     * Returns a Promise that will resolve when the passed `condition` evaluates to `true`.
     *
     * NOTE: If a `timeout` is provided, this will reject if the `timeout` is reached without the
     * passed `condition` evaluating to `true`.
     *
     * @param condition
     * @param timeout
     */
    pollForCondition(condition, timeout = null) {
        return new Promise((resolve, reject) => {
            let cancelPollReference = null;
            const handleTimeout = () => {
                if (cancelPollReference) {
                    clearTimeout(cancelPollReference);
                }
                reject(new Error('Timeout reached in PromiseUtils.pollForCondition'));
            };
            const cancelTimeout = timeout ? setTimeout(handleTimeout, timeout) : null;
            const evaluateCondition = () => {
                if (condition()) {
                    if (cancelTimeout) {
                        clearTimeout(cancelTimeout);
                    }
                    resolve();
                }
                else {
                    cancelPollReference = setTimeout(evaluateCondition, 20);
                }
            };
            evaluateCondition();
        });
    },
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
    isThenable(thing) {
        return Boolean(thing &&
            thing !== null &&
            typeof thing === 'object' &&
            typeof thing.then === 'function');
    },
    /**
     * Returns a promise that resolves after the given time has passed.
     *
     * @param time
     */
    timeout(time) {
        return new Promise((resolve) => {
            setTimeout(resolve, time);
        });
    }
};
export default PromiseUtils;
//# sourceMappingURL=PromiseUtils.js.map