const PromiseUtils = require('../promise-utils/PromiseUtils');

/**
 * A queue for performing async tasks with a set amount of tasks allowed to run at once.
 *
 * If there is room in the queue, a new task will start running immediately. Otherwise, it
 * will be added to the queue. When a running task completes or fails, the next task in the queue
 * will start running.
 *
 * @class
 */
class AsyncQueue {
  /**
   * A queue for performing async tasks with a maximum concurrency.
   *
   * @param {object} [options={}] Constructor options.
   * @param {number} [options.maxConcurrency=1] Max number of async tasks that can run at once.
   */
  constructor({ maxConcurrency = 1 } = {}) {
    this.maxConcurrency = maxConcurrency;
    this.queue = [];

    this.numRunningTasks = 0;
  }

  /**
   * The length of the queue.
   *
   * @type {number}
   */
  get length() {
    return this.queue.length;
  }

  /**
   * Performs the task immediately if possible, otherwise adds it to the queue to be performed
   * when a running task completes.
   *
   * @param {Function} task Function returning a promise. Should not do anything until invoked.
   * @returns {Promise} Promise that resolves or rejects with the task result.
   */
  perform(task) {
    const result = PromiseUtils.defer();

    if (this.numRunningTasks < this.maxConcurrency) {
      // task can be performed immediately
      this.numRunningTasks += 1;

      this._performTask(result, task);
    } else {
      // parallel tasks are full, wait in the queue
      this.queue.push(() => this._performTask(result, task));
    }

    return result.promise;
  }

  /**
   * Actually runs a given task.
   *
   * @param {Deferred} result Output from `PromiseUtils.defer`.
   * @param {Function} task The task to perform.
   * @returns {Promise}
   * @private
   */
  _performTask(result, task) {
    return Promise.resolve(task()).then((value) => {
      result.resolve(value);
    }).catch((ex) => {
      result.reject(ex);
    }).finally(() => {
      // now that we are complete, a task from the queue can run
      if (this.queue.length) {
        const newTask = this.queue.shift();
        newTask();
      } else {
        this.numRunningTasks -= 1;
      }
    });
  }
}

module.exports = AsyncQueue;
