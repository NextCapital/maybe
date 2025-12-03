interface AsyncQueueOptions {
    maxConcurrency?: number;
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
    private queue;
    private numRunningTasks;
    /**
     * A queue for performing async tasks with a maximum concurrency.
     */
    constructor({ maxConcurrency }?: AsyncQueueOptions);
    /**
     * The length of the queue instance.
     */
    get length(): number;
    /**
     * Performs the task immediately if possible, otherwise adds it to the queue to be performed
     * when a running task completes.
     */
    perform<TResult>(task: () => Promise<TResult>): Promise<TResult>;
    /**
     * Actually runs a given task.
     */
    private _performTask;
}
export {};
//# sourceMappingURL=AsyncQueue.d.ts.map