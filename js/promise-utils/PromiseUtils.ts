export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

/**
 * A helpful set of utilities for working with native promises.
 */
const PromiseUtils = {
  /**
   * Returns a promise that can be resolved or rejected on-demand by other code. This is
   * frequently useful in unit tests.
   */
  defer<T>(): Deferred<T> {
    let resolve: (value: T) => void;
    let reject: (error: unknown) => void;
    const promise = new Promise<T>((_resolve, _reject) => {
      resolve = _resolve;
      reject = _reject;
    });

    return {
      promise,
      resolve: resolve!,
      reject: reject!
    };
  },

  /**
   * Runs a series of tasks in-order, with the next not starting until the previous completes.
   * Unlike a normal AsyncQueue, if a task fails, the rest of the tasks will not run. In addition,
   * this method will resolve with the resolved values of each task.
   */
  serialize<T>(tasks: Array<() => T>): Promise<T[]> {
    return tasks.reduce(
      (result, task) => result.then((value) => (
        Promise.resolve(task()).then(
          (taskResult) => value.concat([taskResult])
        )
      )),
      Promise.resolve([] as T[])
    );
  },

  /**
   * Returns a Promise that will resolve when the passed `condition` evaluates to `true`.
   *
   * NOTE: If a `timeout` is provided, this will reject if the `timeout` is reached without the
   * passed `condition` evaluating to `true`.
   */
  pollForCondition(condition: () => boolean, timeout: number | null = null): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let cancelPollReference: ReturnType<typeof setTimeout> | undefined;
      const handleTimeout = () => {
        clearTimeout(cancelPollReference);
        reject(new Error('Timeout reached in PromiseUtils.pollForCondition'));
      };

      const cancelTimeout = timeout ? setTimeout(handleTimeout, timeout) : undefined;

      const evaluateCondition = () => {
        if (condition()) {
          if (cancelTimeout) {
            clearTimeout(cancelTimeout);
          }

          resolve();
        } else {
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
   */
  isThenable(thing: unknown): thing is PromiseLike<unknown> {
    return Boolean(
      thing &&
      thing !== null &&
      typeof thing === 'object' &&
      typeof (thing as Record<string, unknown>).then === 'function'
    );
  },

  /**
   * Returns a promise that resolves after the given time has passed.
   */
  timeout(time: number): Promise<void> {
    return new Promise<void>((resolve) => {
      setTimeout(resolve, time);
    });
  }
};

export default PromiseUtils;
