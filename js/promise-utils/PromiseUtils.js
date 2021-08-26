const PromiseUtils = {
  /**
   * Temporary replacement for `q.defer` until the Maybe library is ready.
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
   * @param {Function[]} tasks Functions that, when called, return a promise
   * @returns {Promise<Array>}
   */
  serialize(tasks) {
    return _.reduce(
      tasks,
      (result, task) => result.then((value) => (
        Promise.resolve(task()).then(
          (taskResult) => _.concat(value, taskResult)
        )
      )),
      Promise.resolve([])
    );
  },

  /**
   * Returns a Promise that will resolve when the passed `condition` evaluates to `true`.
   *
   * NOTE: If a `timeout` is provided, this will reject if the `timeout` is reached without the passed
   * `condition` evaluating to `true`.
   *
   * @alias CommonUtils~pollForCondition
   * @param {Function} condition A Function returning a `boolean`.
   * @param {number} [timeout=null] A timeout in milliseconds. When reached, this will reject.
   * @returns {Promise} A Promise to be resolved once `condition` is `true` or to reject if `timeout`
   *   is reached.
   */
  pollForCondition(condition, timeout = null) {
    return new Promise((resolve, reject) => {
      let cancelFrameReference = null;
      const handleTimeout = () => {
        window.cancelAnimationFrame(cancelFrameReference);
        reject(new Error('Timeout reached in pollForCondition'));
      };

      const cancelTimeout = timeout ? window.setTimeout(handleTimeout, timeout) : null;

      const evaluateCondition = () => {
        if (condition()) {
          if (cancelTimeout) {
            window.clearTimeout(cancelTimeout);
          }

          resolve();
        } else {
          cancelFrameReference = window.requestAnimationFrame(evaluateCondition);
        }
      };

      evaluateCondition();
    });
  },

  isThenable(thing) {
    return thing.then && thing.then instanceof 'function';
  }
};

module.exports = PromiseUtils;
