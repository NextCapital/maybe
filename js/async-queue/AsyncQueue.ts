import PromiseUtils, { Deferred } from '../promise-utils/PromiseUtils.js';

interface AsyncQueueOptions {
  maxConcurrency?: number
}

/**
 * A queue for performing async tasks with a set amount of tasks allowed to run at once.
 *
 * If there is room in the queue, a new task will start running immediately. Otherwise, it
 * will be added to the queue. When a running task completes or fails, the next task in the queue
 * will start running.
 */
export default class AsyncQueue {
  maxConcurrency: number;

  private queue: Array<() => unknown>;

  private numRunningTasks: number;

  /**
   * A queue for performing async tasks with a maximum concurrency.
   *
   * @param root0
   * @param root0.maxConcurrency
   */
  constructor({ maxConcurrency = 1 }: AsyncQueueOptions = {}) {
    this.maxConcurrency = maxConcurrency;
    this.queue = [];
    this.numRunningTasks = 0;
  }

  /**
   * The length of the queue instance.
   *
   * @returns The number of tasks waiting in the queue.
   */
  get length(): number {
    return this.queue.length;
  }

  /**
   * Performs the task immediately if possible, otherwise adds it to the queue to be performed
   * when a running task completes.
   *
   * @param task The async task function to perform.
   * @returns A promise that resolves when the task completes.
   */
  perform<TResult>(task: () => Promise<TResult>): Promise<TResult> {
    const result = PromiseUtils.defer<TResult>();

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
   * @param result The deferred object to resolve/reject.
   * @param task The async task function to perform.
   * @returns A promise that resolves when the task completes.
   */
  private _performTask<TResult>(
    result: Deferred<TResult>,
    task: () => Promise<TResult>
  ): Promise<void> {
    return Promise.resolve(task()).then((value) => {
      result.resolve(value);
    }).catch((ex) => {
      result.reject(ex);
    }).finally(() => {
      // now that we are complete, a task from the queue can run
      if (this.queue.length) {
        const newTask = this.queue.shift();
        newTask!();
      } else {
        this.numRunningTasks -= 1;
      }
    });
  }
}
