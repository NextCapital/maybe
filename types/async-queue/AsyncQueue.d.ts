export = AsyncQueue;
/**
 * A queue for performing async tasks with a set amount of tasks allowed to run at once.
 *
 * If there is room in the queue, a new task will start running immediately. Otherwise, it
 * will be added to the queue. When a running task completes or fails, the next task in the queue
 * will start running.
 *
 * @class
 */
declare class AsyncQueue {
    /**
     * A queue for performing async tasks with a maximum concurrency.
     *
     * @param {object} [options={}] Constructor options
     * @param {number} [options.maxConcurrency=1] Max number of async tasks that can run at once
     */
    constructor({ maxConcurrency }?: {
        maxConcurrency?: number;
    });
    maxConcurrency: number;
    queue: (() => any)[];
    numRunningTasks: number;
    /**
     * The length of the queue.
     *
     * @type {number}
     */
    get length(): number;
    /**
     * Performs the task immediately if possible, otherwise adds it to the queue to be performed
     * when a running task completes.
     *
     * @param {Function} task Function returning a promise. Should not do anything until invoked.
     * @returns {Promise} Promise that resolves or rejects with the task result
     */
    perform(task: () => any): Promise<any>;
    /**
     * Actually runs a given task.
     *
     * @param {Deferred} result Output from `PromiseUtils.defer`
     * @param {Function} task The task to perform
     * @returns {Promise}
     * @private
     */
    private _performTask;
}
