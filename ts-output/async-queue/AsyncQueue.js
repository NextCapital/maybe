import PromiseUtils from '../promise-utils/PromiseUtils.js';
/**
 * A queue for performing async tasks with a set amount of tasks allowed to run at once.
 *
 * If there is room in the queue, a new task will start running immediately. Otherwise, it
 * will be added to the queue. When a running task completes or fails, the next task in the queue
 * will start running.
 */
export default class AsyncQueue {
    /**
     * A queue for performing async tasks with a maximum concurrency.
     */
    constructor({ maxConcurrency = 1 } = {}) {
        this.maxConcurrency = maxConcurrency;
        this.queue = [];
        this.numRunningTasks = 0;
    }
    /**
     * The length of the queue instance.
     */
    get length() {
        return this.queue.length;
    }
    /**
     * Performs the task immediately if possible, otherwise adds it to the queue to be performed
     * when a running task completes.
     */
    perform(task) {
        const result = PromiseUtils.defer();
        if (this.numRunningTasks < this.maxConcurrency) {
            // task can be performed immediately
            this.numRunningTasks += 1;
            this._performTask(result, task);
        }
        else {
            // parallel tasks are full, wait in the queue
            this.queue.push(() => this._performTask(result, task));
        }
        return result.promise;
    }
    /**
     * Actually runs a given task.
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
            }
            else {
                this.numRunningTasks -= 1;
            }
        });
    }
}
//# sourceMappingURL=AsyncQueue.js.map