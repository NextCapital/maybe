import PromiseUtils from '../promise-utils/PromiseUtils.js';
import AsyncQueue from './AsyncQueue.js';

describe('AsyncQueue', () => {
  let asyncQueue: AsyncQueue;

  beforeEach(() => {
    asyncQueue = new AsyncQueue({ maxConcurrency: 3 });
  });

  describe('constructor', () => {
    test('initializes properties correctly', () => {
      expect(asyncQueue.maxConcurrency).toBe(3);
      expect(asyncQueue.queue).toEqual([]);
      expect(asyncQueue.numRunningTasks).toBe(0);
    });

    test('defaults maxConcurrency to 1', () => {
      const queue = new AsyncQueue();
      expect(queue.maxConcurrency).toBe(1);
    });
  });

  describe('get length', () => {
    test('returns the length of the inner queue', () => {
      asyncQueue.queue = [1, 2, 3];
      expect(asyncQueue).toHaveLength(3);
    });
  });

  describe('perform', () => {
    let task: jest.Mock<Promise<void>, []>;

    beforeEach(() => {
      jest.spyOn(asyncQueue, '_performTask').mockImplementation();
      task = jest.fn().mockReturnValue(Promise.resolve());
    });

    describe('when the number of running tasks is below the limit', () => {
      beforeEach(() => {
        asyncQueue.numRunningTasks = asyncQueue.maxConcurrency - 1;
      });

      test('defers to _performTask and returns a promise', () => {
        const result = asyncQueue.perform(task);
        expect(asyncQueue._performTask).toHaveBeenCalledWith(expect.anything(), task);
        expect(PromiseUtils.isThenable(result)).toBe(true);
        expect(task).not.toHaveBeenCalled();
      });

      test('increases numRunningTasks by one', () => {
        asyncQueue.perform(task);
        expect(asyncQueue.numRunningTasks).toBe(asyncQueue.maxConcurrency);
      });

      test('does not modify the queue', () => {
        asyncQueue.perform(task);
        expect(asyncQueue.queue).toEqual([]);
      });
    });

    describe('when the number of running tasks is above the limit', () => {
      beforeEach(() => {
        asyncQueue.numRunningTasks = asyncQueue.maxConcurrency;
      });

      test('pushes a call to _performTask onto the queue', () => {
        asyncQueue.perform(task);
        const queueTask = asyncQueue.queue[0];
        queueTask();
        expect(asyncQueue._performTask).toHaveBeenCalledWith(expect.anything(), task);
      });

      test('does not modify numRunningTasks', () => {
        asyncQueue.perform(task);
        expect(asyncQueue.numRunningTasks).toBe(asyncQueue.maxConcurrency);
      });

      test('does not call _performTask, but returns a promise', () => {
        const result = asyncQueue.perform(task);
        expect(asyncQueue._performTask).not.toHaveBeenCalled();
        expect(PromiseUtils.isThenable(result)).toBe(true);
        expect(task).not.toHaveBeenCalled();
      });
    });
  });

  describe('_performTask', () => {
    let result, task, taskRequest;

    beforeEach(() => {
      result = PromiseUtils.defer();
      taskRequest = PromiseUtils.defer();
      task = jest.fn().mockReturnValue(taskRequest.promise);

      jest.spyOn(result, 'resolve');
      jest.spyOn(result, 'reject');

      // stop node unhandled rejection warnings
      result.promise.catch(() => {});
    });

    test('runs the task', () => {
      asyncQueue._performTask(result, task);
      expect(task).toHaveBeenCalled();
    });

    function testHandlesQueue(perform) {
      describe('when the queue is empty', () => {
        beforeEach(() => {
          asyncQueue.queue = [];
        });

        test('decrements numRunningTasks', async () => {
          const originalRunningTasks = 3;
          asyncQueue.numRunningTasks = originalRunningTasks;

          perform();
          await asyncQueue._performTask(result, task);

          expect(asyncQueue.numRunningTasks).toBe(originalRunningTasks - 1);
        });
      });

      describe('when the queue is not empty', () => {
        let firstTask, originalQueue;

        beforeEach(() => {
          firstTask = jest.fn();

          originalQueue = [
            firstTask,
            jest.fn(),
            jest.fn()
          ];

          asyncQueue.queue = [].concat(originalQueue);
          asyncQueue.numRunningTasks = asyncQueue.maxConcurrency;
        });

        test('removes the first entry from the queue', async () => {
          perform();
          await asyncQueue._performTask(result, task);

          expect(asyncQueue.queue).toEqual(originalQueue.slice(1));
        });

        test('runs the first entry from the queue', async () => {
          perform();
          await asyncQueue._performTask(result, task);

          expect(firstTask).toHaveBeenCalled();
          asyncQueue.queue.forEach((otherTask) => expect(otherTask).not.toHaveBeenCalled());
        });

        test('does not modify numRunningTasks', async () => {
          perform();
          await asyncQueue._performTask(result, task);

          expect(asyncQueue.numRunningTasks).toBe(asyncQueue.maxConcurrency);
        });
      });
    }

    describe('when the promise resolves', () => {
      test('resolves the result with the value', async () => {
        const resolveValue = 'some value';
        taskRequest.resolve(resolveValue);

        await asyncQueue._performTask(result, task);
        expect(result.resolve).toHaveBeenCalledWith(resolveValue);
      });

      testHandlesQueue(() => taskRequest.resolve('value'));
    });

    describe('when the promise rejects', () => {
      test('rejects the result with the error', async () => {
        const error = 'some error';
        taskRequest.reject(error);

        await asyncQueue._performTask(result, task);
        await expect(result.promise).rejects.toBe(error);
      });

      testHandlesQueue(() => taskRequest.reject('error'));
    });
  });
});
