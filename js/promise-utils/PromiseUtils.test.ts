import PromiseUtils from './PromiseUtils.js';

describe('PromiseUtils', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('defer', () => {
    test('returns an object with the correct schema', () => {
      expect(PromiseUtils.defer()).toEqual({
        promise: expect.any(Promise),
        resolve: expect.any(Function),
        reject: expect.any(Function)
      });
    });

    describe('resolve', () => {
      test('resolves the promise with the value', async () => {
        const { promise, resolve } = PromiseUtils.defer();
        const value = 1234;

        resolve(value);
        await expect(promise).resolves.toBe(value);
      });
    });

    describe('reject', () => {
      test('rejects the promise with the error', async () => {
        const { promise, reject } = PromiseUtils.defer();
        const error = new Error('oops');

        reject(error);
        await expect(promise).rejects.toBe(error);
      });
    });
  });

  describe('serialize', () => {
    test('runs tasks in-order, resolving with their results', async () => {
      const ran = [];
      const expectedValue = [0, 1, 2, 3, 4];
      const tasks = expectedValue.map((number) => () => {
        ran.push(number);
        return Promise.resolve(number);
      });
      expect(await PromiseUtils.serialize(tasks)).toEqual(expectedValue);
      expect(ran).toEqual(expectedValue);
    });

    test('handles tasks that do not return a promise', async () => {
      const nonPromiseTask = jest.fn().mockReturnValue(true);
      const beforeTask = jest.fn().mockResolvedValue();
      const afterTask = jest.fn().mockResolvedValue();

      const tasks = [
        nonPromiseTask,
        beforeTask,
        afterTask
      ];

      await PromiseUtils.serialize(tasks);
      expect(nonPromiseTask).toHaveBeenCalled();
      expect(beforeTask).toHaveBeenCalled();
      expect(afterTask).toHaveBeenCalled();
    });

    test('does not run later tasks if an earlier one rejects', async () => {
      const error = 'some error';

      const beforeTask = jest.fn().mockResolvedValue();
      const errorTask = jest.fn().mockReturnValue(Promise.reject(error));
      const afterTask = jest.fn().mockResolvedValue();

      const tasks = [
        beforeTask,
        errorTask,
        afterTask
      ];

      await expect(PromiseUtils.serialize(tasks)).rejects.toEqual(error);
      expect(beforeTask).toHaveBeenCalled();
      expect(errorTask).toHaveBeenCalled();
      expect(afterTask).not.toHaveBeenCalled();
    });
  });

  describe('pollForCondition', () => {
    test('resolves when the condition becomes true', async () => {
      let trigger: boolean = false;
      setTimeout(() => { trigger = true; }, 100);

      const promise = PromiseUtils.pollForCondition(() => trigger);
      jest.advanceTimersByTime(100);

      await expect(promise).resolves.toBeUndefined();
    });

    describe('when a timeout is passed in', () => {
      describe('when the condition is true before it is reached', () => {
        test('cancels the timeout and resolves', async () => {
          let trigger = false;
          setTimeout(() => { trigger = true; }, 100);

          const promise = PromiseUtils.pollForCondition(() => trigger, 3000);
          jest.advanceTimersByTime(100);

          await expect(promise).resolves.toBeUndefined();
        });
      });

      describe('when the timeout is reached before the condition is true', () => {
        test('cancels the timeout and resolves', async () => {
          let trigger = false;
          setTimeout(() => { trigger = true; }, 500);

          const promise = PromiseUtils.pollForCondition(() => trigger, 100);
          jest.advanceTimersByTime(100);

          await expect(promise).rejects.toThrow(
            'Timeout reached in PromiseUtils.pollForCondition'
          );
        });
      });
    });
  });

  describe('isThenable', () => {
    test('returns false for undefined', () => {
      expect(PromiseUtils.isThenable(undefined)).toBe(false);
    });

    test('returns false for null', () => {
      expect(PromiseUtils.isThenable(null)).toBe(false);
    });

    test('returns false for a non-thenable object', () => {
      expect(PromiseUtils.isThenable({ then: true })).toBe(false);
    });

    test('returns true for a thenable object', () => {
      expect(PromiseUtils.isThenable({ then: jest.fn() })).toBe(true);
    });

    test('returns true for a native promise', () => {
      expect(PromiseUtils.isThenable(Promise.resolve())).toBe(true);
    });
  });

  describe('timeout', () => {
    test('returns a promise that resolves after a timeout', async () => {
      const timeout = 1000;
      const promise = PromiseUtils.timeout(timeout);

      jest.advanceTimersByTime(timeout);
      await expect(promise).resolves.toBeUndefined();
    });
  });
});
