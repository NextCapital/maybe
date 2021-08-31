/**
 * A helpful set of utilities for working with native promises.
 *
 * @type {Object}
 */
const PromiseUtils = {
  /**
   * Returns a promise that can be resolved or rejected on-demand by other code. This is
   * frequently useful in unit tests. Will return an object with three properties:
   *
   * - promise (Promise): The promise that can be resolved/rejected
   * - resolve (Function): When called, will resolve the promise with the value
   * - reject (Function): When called, will reject the promise with the error
   *
   * @returns {object}
   */
  defer() {
    let resolve, reject;
    const promise = new Promise((_resolve, _reject) => {
      resolve = _resolve;
      reject = _reject;
    });

    return {
      promise,
      resolve,
      reject
    };
  },

  /**
   * Runs a series of tasks in-order, with the next not starting until the previous completes.
   * Unlike a normal AsyncQueue, if a task fails, the rest of the tasks will not run. In addition,
   * this method will resolve with the resolved values of each task.
   *
   * @param {Function[]} tasks Functions that, when called, return a promise or value
   * @returns {Promise<Array>}
   */
  serialize(tasks) {
    return tasks.reduce(
      (result, task) => result.then((value) => (
        Promise.resolve(task()).then(
          (taskResult) => value.concat([taskResult])
        )
      )),
      Promise.resolve([])
    );
  },

  /**
   * Returns a Promise that will resolve when the passed `condition` evaluates to `true`.
   *
   * NOTE: If a `timeout` is provided, this will reject if the `timeout` is reached without the
   * passed `condition` evaluating to `true`.
   *
   * @param {Function} condition A Function returning a `boolean`.
   * @param {number} [timeout=null] A timeout in milliseconds. When reached, this will reject.
   * @returns {Promise} A Promise to be resolved once `condition` is `true` or to reject if
   *   `timeout` is reached.
   */
  pollForCondition(condition, timeout = null) {
    return new Promise((resolve, reject) => {
      let cancelPollReference = null;
      const handleTimeout = () => {
        clearTimeout(cancelPollReference);
        reject(new Error('Timeout reached in PromiseUtils.pollForCondition'));
      };

      const cancelTimeout = timeout ? setTimeout(handleTimeout, timeout) : null;

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
   *
   * @param {*} thing The thing to check
   * @returns {Boolean}
   */
  isThenable(thing) {
    return Boolean(
      thing &&
      thing !== null &&
      typeof thing === 'object' &&
      typeof thing.then === 'function'
    );
  },

  /**
   * Returns a promise that resolves after the given time has passed.
   *
   * @param {number} time Time in milliseconds for the timeout
   * @returns {Promise}
   */
  timeout(time) {
    return new Promise((resolve) => setTimeout(resolve, time));
  }
};

module.exports = PromiseUtils;
