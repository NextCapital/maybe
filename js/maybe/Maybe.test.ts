const PromiseUtils = require('../promise-utils/PromiseUtils');
const PendingValueError = require('./PendingValueError');
const Maybe = require('./Maybe');

process.on('unhandledRejection', (error) => {
  fail(error); // eslint-disable-line no-undef,jest/no-jasmine-globals
});

describe('Maybe', () => {
  let value, error, deferred, promise;

  beforeEach(() => {
    value = 123;
    error = new Error('whoops');
    deferred = PromiseUtils.defer();
    promise = deferred.promise;
  });

  describe('static from', () => {
    describe('for a maybe', () => {
      test('returns the same instance', () => {
        const maybe = new Maybe(value);
        expect(Maybe.from(maybe)).toBe(maybe);
      });
    });

    describe('for a promise', () => {
      test('returns a maybe for that promise', async () => {
        const maybe = Maybe.from(promise);
        deferred.resolve(value);
        expect(await maybe.promise()).toBe(await promise);
      });
    });

    describe('for a value', () => {
      test('returns a maybe for the value', () => {
        const maybe = Maybe.from(value);
        expect(maybe.value()).toBe(value);
      });
    });
  });

  describe('static build', () => {
    let isReady, valueGetter, promiseGetter;

    beforeEach(() => {
      valueGetter = jest.fn().mockReturnValue(value);
      promiseGetter = jest.fn().mockReturnValue(promise);
    });

    describe('when isReady is true', () => {
      beforeEach(() => {
        isReady = true;
      });

      test('creates a maybe for the valueGetter', () => {
        const maybe = Maybe.build(isReady, valueGetter, promiseGetter);
        expect(maybe.value()).toBe(value);
        expect(valueGetter).toHaveBeenCalled();
        expect(promiseGetter).not.toHaveBeenCalled();
      });
    });

    describe('when isReady is false', () => {
      beforeEach(() => {
        isReady = false;
      });

      test('creates a maybe for the promiseGetter', () => {
        const maybe = Maybe.build(isReady, valueGetter, promiseGetter);
        expect(maybe.isReady()).toBe(false);
        expect(promiseGetter).toHaveBeenCalled();
        expect(valueGetter).not.toHaveBeenCalled();
      });
    });
  });

  describe('static isMaybe', () => {
    test('returns false for null', () => {
      expect(Maybe.isMaybe(null)).toBe(false);
    });

    test('returns false for a promise', () => {
      expect(Maybe.isMaybe(promise)).toBe(false);
    });

    test('returns false for a value', () => {
      expect(Maybe.isMaybe(value)).toBe(false);
    });

    test('returns true for a maybe', () => {
      expect(Maybe.isMaybe(Maybe.from(value))).toBe(true);
    });
  });

  describe('static fromError', () => {
    test('returns a rejected maybe for the error', () => {
      const maybe = Maybe.fromError(error);
      expect(maybe.isRejected()).toBe(true);
      expect(maybe.valueOrError()).toBe(error);
    });
  });

  describe('static all', () => {
    let array;

    describe('when all entries are resolved', () => {
      beforeEach(() => {
        array = [
          Maybe.from(1),
          Maybe.from(2),
          Maybe.from(3)
        ];
      });

      test('returns a maybe whose value is an array of resolved values', () => {
        const maybe = Maybe.all(array);
        expect(maybe.value()).toEqual([1, 2, 3]);
      });
    });

    describe('when any entry is rejected', () => {
      beforeEach(() => {
        array = [
          Maybe.from(1),
          Maybe.from(2),
          Maybe.fromError(error),
          Maybe.from(3)
        ];
      });

      test('returns a maybe for the first rejected value', () => {
        const maybe = Maybe.all(array);
        expect(maybe.isRejected()).toBe(true);
        expect(maybe.valueOrError()).toBe(error);
      });
    });

    describe('when any entry is pending', () => {
      describe('when all entries eventually resolve', () => {
        beforeEach(() => {
          array = [
            Maybe.from(Promise.resolve(1)),
            Maybe.from(Promise.resolve(2)),
            Maybe.from(promise)
          ];
        });

        test('returns a maybe for all resolved values', async () => {
          const maybe = Maybe.all(array);
          expect(maybe.isReady()).toBe(false);

          deferred.resolve(3);
          await expect(maybe.promise()).resolves.toEqual([1, 2, 3]);
        });
      });

      describe('when an entry eventually rejects', () => {
        beforeEach(() => {
          array = [
            Maybe.from(Promise.resolve(1)),
            Maybe.from(Promise.resolve(2)),
            Maybe.from(promise)
          ];
        });

        test('returns a maybe for the rejected value', async () => {
          const maybe = Maybe.all(array);
          expect(maybe.isReady()).toBe(false);

          deferred.reject(error);
          await expect(maybe.promise()).rejects.toBe(error);
        });
      });
    });

    describe('handles a mix of types in the array', () => {
      beforeEach(() => {
        array = [
          1,
          Maybe.from(2),
          Maybe.from(Promise.resolve(3)),
          Promise.resolve(4)
        ];
      });

      test('coerces all types to be a maybe', async () => {
        await expect(Maybe.all(array).promise()).resolves.toEqual([1, 2, 3, 4]);
      });
    });
  });

  describe('constructor', () => {
    describe('when a value', () => {
      describe('when an error', () => {
        test('creates a rejected maybe', () => {
          const maybe = new Maybe(error, true);
          expect(maybe.isRejected()).toBe(true);
          expect(maybe.valueOrError()).toBe(error);
        });
      });

      describe('when not an error', () => {
        test('creates a resolves maybe', () => {
          const maybe = new Maybe(value);
          expect(maybe.isResolved()).toBe(true);
          expect(maybe.value()).toBe(value);
        });
      });
    });

    describe('when a promise', () => {
      test('creates a pending maybe', () => {
        const maybe = new Maybe(promise);
        expect(maybe.isReady()).toBe(false);
        expect(maybe.promise()).toBeInstanceOf(Promise);
      });

      test('ignores the error param', () => {
        const maybe = new Maybe(promise, true);
        expect(maybe.isRejected()).toBe(false);
      });

      describe('after the promise resolves', () => {
        test('becomes a resolved maybe', async () => {
          const maybe = new Maybe(promise);
          deferred.resolve(value);

          await promise;
          expect(maybe.isResolved()).toBe(true);
          expect(maybe.value()).toBe(value);
        });
      });

      describe('after the promise rejects', () => {
        test('becomes a rejected maybe', async () => {
          const maybe = new Maybe(promise);
          deferred.reject(error);

          await promise.catch(() => {});
          expect(maybe.isRejected()).toBe(true);
          expect(maybe.valueOrError()).toBe(error);
        });
      });
    });

    describe('when a maybe', () => {
      describe('when resolved', () => {
        test('becomes a resolved maybe for the same value', () => {
          const otherMaybe = Maybe.from(value);
          const maybe = new Maybe(otherMaybe);

          expect(maybe.isResolved()).toBe(true);
          expect(maybe.value()).toBe(value);
        });

        test('ignores the error param', () => {
          const otherMaybe = Maybe.from(value);
          const maybe = new Maybe(otherMaybe, true);
          expect(maybe.isResolved()).toBe(true);
        });
      });

      describe('when rejected', () => {
        test('becomes a rejected maybe for the same error', () => {
          const otherMaybe = Maybe.fromError(error);
          const maybe = new Maybe(otherMaybe);

          expect(maybe.isRejected()).toBe(true);
          expect(maybe.valueOrError()).toBe(error);
        });
      });

      describe('when pending', () => {
        describe('after the promise resolves', () => {
          test('becomes a resolved maybe', async () => {
            const otherMaybe = Maybe.from(promise);
            const maybe = new Maybe(otherMaybe);
            deferred.resolve(value);

            await maybe.promise();
            expect(maybe.isResolved()).toBe(true);
            expect(maybe.value()).toBe(value);
          });

          describe('when resolved to a maybe', () => {
            test('further becomes that maybe', async () => {
              const otherMaybe = Maybe.from(promise);
              const maybe = new Maybe(otherMaybe);
              deferred.resolve(Maybe.from(value));

              await maybe.promise();
              expect(maybe.isResolved()).toBe(true);
              expect(maybe.value()).toBe(value);
            });
          });
        });

        describe('after the promise rejects', () => {
          test('becomes a rejected maybe', async () => {
            const otherMaybe = Maybe.from(promise);
            const maybe = new Maybe(otherMaybe);
            deferred.reject(error);

            await maybe.promise().catch(() => {});
            expect(maybe.isRejected()).toBe(true);
            expect(maybe.valueOrError()).toBe(error);
          });

          describe('when rejected to a maybe', () => {
            test('further becomes that maybe', async () => {
              const otherMaybe = Maybe.from(promise);
              const maybe = new Maybe(otherMaybe);
              deferred.reject(Maybe.fromError(error));

              await maybe.promise().catch(() => {});
              expect(maybe.isRejected()).toBe(true);
              expect(maybe.valueOrError()).toBe(error);
            });
          });
        });
      });
    });
  });

  describe('isReady', () => {
    describe('for a resolved maybe', () => {
      test('returns true', () => {
        const maybe = Maybe.from(value);
        expect(maybe.isReady()).toBe(true);
      });
    });

    describe('for a rejected maybe', () => {
      test('returns true', () => {
        const maybe = Maybe.fromError(error);
        expect(maybe.isReady()).toBe(true);
      });
    });

    describe('for an in-progress maybe', () => {
      test('returns false', () => {
        const maybe = Maybe.from(promise);
        expect(maybe.isReady()).toBe(false);
      });
    });
  });

  describe('isPending', () => {
    describe('for a resolved maybe', () => {
      test('returns false', () => {
        const maybe = Maybe.from(value);
        expect(maybe.isPending()).toBe(false);
      });
    });

    describe('for a rejected maybe', () => {
      test('returns false', () => {
        const maybe = Maybe.fromError(error);
        expect(maybe.isPending()).toBe(false);
      });
    });

    describe('for an in-progress maybe', () => {
      test('returns true', () => {
        const maybe = Maybe.from(promise);
        expect(maybe.isPending()).toBe(true);
      });
    });
  });

  describe('isResolved', () => {
    describe('for a resolved maybe', () => {
      test('returns true', () => {
        const maybe = Maybe.from(value);
        expect(maybe.isResolved()).toBe(true);
      });
    });

    describe('for a rejected maybe', () => {
      test('returns false', () => {
        const maybe = Maybe.fromError(error);
        expect(maybe.isResolved()).toBe(false);
      });
    });

    describe('for an in-progress maybe', () => {
      test('returns false', () => {
        const maybe = Maybe.from(promise);
        expect(maybe.isResolved()).toBe(false);
      });
    });
  });

  describe('isRejected', () => {
    describe('for a resolved maybe', () => {
      test('returns false', () => {
        const maybe = Maybe.from(value);
        expect(maybe.isRejected()).toBe(false);
      });
    });

    describe('for a rejected maybe', () => {
      test('returns true', () => {
        const maybe = Maybe.fromError(error);
        expect(maybe.isRejected()).toBe(true);
      });
    });

    describe('for an in-progress maybe', () => {
      test('returns false', () => {
        const maybe = Maybe.from(promise);
        expect(maybe.isRejected()).toBe(false);
      });
    });
  });

  describe('value', () => {
    describe('when resolved', () => {
      test('returns the value', () => {
        const maybe = Maybe.from(value);
        expect(maybe.value()).toBe(value);
      });
    });

    describe('when rejected', () => {
      test('throws the rejected error', () => {
        const maybe = Maybe.fromError(error);
        expect(() => maybe.value()).toThrow(error);
      });
    });

    describe('when pending', () => {
      test('throws a PendingValueError', () => {
        const maybe = Maybe.from(promise);
        expect(() => maybe.value()).toThrow(PendingValueError);
      });
    });
  });

  describe('valueOfError', () => {
    describe('when resolved', () => {
      test('returns the value', () => {
        const maybe = Maybe.from(value);
        expect(maybe.valueOrError()).toBe(value);
      });
    });

    describe('when rejected', () => {
      test('returns the error', () => {
        const maybe = Maybe.fromError(error);
        expect(maybe.valueOrError()).toBe(error);
      });
    });

    describe('when pending', () => {
      test('throws a PendingValueError', () => {
        const maybe = Maybe.from(promise);
        expect(() => maybe.valueOrError()).toThrow(PendingValueError);
      });
    });
  });

  describe('promise', () => {
    describe('when resolved', () => {
      test('returns a resolved promise for the value', async () => {
        const maybe = Maybe.from(value);
        await expect(maybe.promise()).resolves.toBe(value);
      });
    });

    describe('when rejected', () => {
      test('returns a rejected promise for the error', async () => {
        const maybe = Maybe.fromError(error);
        await expect(maybe.promise()).rejects.toBe(error);
      });
    });

    describe('when pending', () => {
      test('returns the pending promise', () => {
        const maybe = Maybe.from(promise);
        expect(maybe.promise()).toBeInstanceOf(Promise);
      });
    });
  });

  describe('when', () => {
    let onResolve, onReject, onProgress, resolvedValue, rejectedValue, maybe;

    beforeEach(() => {
      resolvedValue = 'resolved';
      rejectedValue = 'rejected';

      onResolve = jest.fn().mockReturnValue(resolvedValue);
      onReject = jest.fn().mockReturnValue(rejectedValue);
      onProgress = jest.fn();
    });

    describe('when resolved', () => {
      beforeEach(() => {
        maybe = Maybe.from(value);
      });

      describe('when onResolve is passed', () => {
        test('creates a new resolved maybe from the return value', () => {
          const newMaybe = maybe.when(onResolve, onReject);
          expect(newMaybe).not.toBe(maybe);
          expect(newMaybe.value()).toBe(resolvedValue);
          expect(onResolve).toHaveBeenCalledWith(value);
        });

        describe('when onResolve throws an error', () => {
          beforeEach(() => {
            onResolve = jest.fn().mockImplementation(() => { throw error; });
          });

          test('creates a rejected maybe for the error', () => {
            const newMaybe = maybe.when(onResolve, onReject);
            expect(newMaybe).not.toBe(maybe);
            expect(newMaybe.isRejected()).toBe(true);
            expect(newMaybe.valueOrError()).toBe(error);
            expect(onResolve).toHaveBeenCalledWith(value);
          });
        });
      });

      describe('when no onResolve is passed', () => {
        test('returns the same maybe', () => {
          expect(maybe.when(undefined, onReject)).toBe(maybe);
        });
      });
    });

    describe('when rejected', () => {
      beforeEach(() => {
        maybe = Maybe.fromError(error);
      });

      describe('when onReject is passed', () => {
        test('creates a new maybe from the return value', () => {
          const newMaybe = maybe.when(onResolve, onReject);
          expect(newMaybe).not.toBe(maybe);
          expect(newMaybe.value()).toBe(rejectedValue);
          expect(onReject).toHaveBeenCalledWith(error);
        });

        describe('when onReject throws an error', () => {
          beforeEach(() => {
            onReject = jest.fn().mockImplementation(() => { throw error; });
          });

          test('creates a rejected maybe for the error', () => {
            const newMaybe = maybe.when(onResolve, onReject);
            expect(newMaybe).not.toBe(maybe);
            expect(newMaybe.isRejected()).toBe(true);
            expect(newMaybe.valueOrError()).toBe(error);
            expect(onReject).toHaveBeenCalledWith(error);
          });
        });
      });

      describe('when no onReject is passed', () => {
        test('returns the same maybe', () => {
          expect(maybe.when(onResolve)).toBe(maybe);
        });
      });
    });

    describe('when pending', () => {
      beforeEach(() => {
        maybe = Maybe.from(promise);
      });

      describe('after the promise resolves', () => {
        test('returns a pending maybe for the value', async () => {
          const newMaybe = maybe.when(onResolve, onReject, onProgress);
          expect(newMaybe).not.toBe(maybe);
          expect(newMaybe.isReady()).toBe(false);

          deferred.resolve(value);
          await expect(newMaybe.promise()).resolves.toBe(resolvedValue);
          expect(onResolve).toHaveBeenCalledWith(value);
        });
      });

      describe('after the promise rejects', () => {
        test('returns a pending maybe for the value', async () => {
          const newMaybe = maybe.when(onResolve, onReject, onProgress);
          expect(newMaybe).not.toBe(maybe);
          expect(newMaybe.isReady()).toBe(false);

          deferred.reject(error);
          await expect(newMaybe.promise()).resolves.toBe(rejectedValue);
          expect(onReject).toHaveBeenCalledWith(error);
        });
      });
    });
  });

  describe('catch', () => {
    let onReject, rejectedValue, maybe;

    beforeEach(() => {
      rejectedValue = 'rejected';
      onReject = jest.fn().mockReturnValue(rejectedValue);
    });

    describe('when resolved', () => {
      beforeEach(() => {
        maybe = Maybe.from(value);
      });

      test('returns the same maybe', () => {
        expect(maybe.catch(onReject)).toBe(maybe);
      });
    });

    describe('when rejected', () => {
      beforeEach(() => {
        maybe = Maybe.fromError(error);
      });

      test('creates a new maybe from the return value', () => {
        const newMaybe = maybe.catch(onReject);
        expect(newMaybe).not.toBe(maybe);
        expect(newMaybe.value()).toBe(rejectedValue);
        expect(onReject).toHaveBeenCalledWith(error);
      });
    });

    describe('when pending', () => {
      beforeEach(() => {
        maybe = Maybe.from(promise);
      });

      describe('after the promise resolves', () => {
        test('does not call onReject', async () => {
          const newMaybe = maybe.catch(onReject);
          expect(newMaybe).not.toBe(maybe);
          expect(newMaybe.isReady()).toBe(false);

          deferred.resolve(value);
          await expect(newMaybe.promise()).resolves.toBe(value);
          expect(onReject).not.toHaveBeenCalled();
        });
      });

      describe('after the promise rejects', () => {
        test('returns a pending maybe for the value', async () => {
          const newMaybe = maybe.catch(onReject);
          expect(newMaybe).not.toBe(maybe);
          expect(newMaybe.isReady()).toBe(false);

          deferred.reject(error);
          await expect(newMaybe.promise()).resolves.toBe(rejectedValue);
          expect(onReject).toHaveBeenCalledWith(error);
        });
      });
    });
  });

  describe('finally', () => {
    let onFinally, finallyValue, maybe;

    beforeEach(() => {
      finallyValue = 'finally';
      onFinally = jest.fn().mockReturnValue(finallyValue);
    });

    describe('when resolved', () => {
      beforeEach(() => {
        maybe = Maybe.from(value);
      });

      test('creates a new resolved maybe from the return value', () => {
        const newMaybe = maybe.finally(onFinally);
        expect(newMaybe).not.toBe(maybe);
        expect(newMaybe.value()).toBe(value);
        expect(onFinally).toHaveBeenCalledWith();
      });
    });

    describe('when rejected', () => {
      beforeEach(() => {
        maybe = Maybe.fromError(error);
      });

      test('creates a new maybe from the return value', () => {
        const newMaybe = maybe.finally(onFinally);
        expect(newMaybe).not.toBe(maybe);
        expect(newMaybe.valueOrError()).toBe(error);
        expect(onFinally).toHaveBeenCalledWith();
      });
    });

    describe('when pending', () => {
      beforeEach(() => {
        maybe = Maybe.from(promise);
      });

      describe('after the promise resolves', () => {
        test('returns a pending maybe for the value', async () => {
          const newMaybe = maybe.finally(onFinally);
          expect(newMaybe).not.toBe(maybe);
          expect(newMaybe.isReady()).toBe(false);

          deferred.resolve(value);
          await expect(newMaybe.promise()).resolves.toBe(value);
          expect(onFinally).toHaveBeenCalledWith();
        });
      });

      describe('after the promise rejects', () => {
        test('returns a pending maybe for the value', async () => {
          const newMaybe = maybe.finally(onFinally);
          expect(newMaybe).not.toBe(maybe);
          expect(newMaybe.isReady()).toBe(false);

          deferred.reject(error);
          await expect(newMaybe.promise()).rejects.toBe(error);
          expect(onFinally).toHaveBeenCalledWith();
        });
      });
    });
  });

  describe('suspend', () => {
    describe('when resolved', () => {
      test('returns the value', () => {
        const maybe = Maybe.from(value);
        expect(maybe.suspend()).toBe(value);
      });
    });

    describe('when rejected', () => {
      test('throws the rejected error', () => {
        const maybe = Maybe.fromError(error);
        expect(() => maybe.suspend()).toThrow(error);
      });
    });

    describe('when pending', () => {
      test('throws the promise', () => {
        const maybe = Maybe.from(promise);
        expect.assertions(1); // toThrow will not work here

        try {
          maybe.suspend();
        } catch (ex) {
          // eslint-disable-next-line jest/no-conditional-expect
          expect(ex).toBe(maybe.promise());
        }
      });
    });
  });

  describe('chaining', () => {
    test('chains correctly when resolving', async () => {
      const maybe = Maybe.from(10)
        .when((v) => v * 2) // 20
        .when((v) => promise.then((otherValue) => otherValue + v)) // 30
        .when((v) => Maybe.from(Promise.resolve(v * 2))); // 60

      expect(maybe.isReady()).toBe(false);

      deferred.resolve(10);
      await maybe.promise();

      expect(maybe.isResolved()).toBe(true);
      expect(maybe.value()).toBe(60);
    });

    test('chain correctly when there is a rejection', async () => {
      const notCalledFn = jest.fn();
      const maybe = Maybe.from(10)
        .when((v) => v * 2) // 20
        .when((v) => promise.then((otherValue) => otherValue + v)) // 30
        .when(notCalledFn);

      expect(maybe.isReady()).toBe(false);
      const caughtMaybe = maybe.catch(() => value);

      deferred.reject(error);
      await expect(maybe.promise()).rejects.toBe(error);

      expect(maybe.isRejected()).toBe(true);
      expect(maybe.valueOrError()).toBe(error);
      expect(notCalledFn).not.toHaveBeenCalled();

      await expect(caughtMaybe.promise()).resolves.toBe(value);
      expect(caughtMaybe.value()).toBe(value);
    });

    test('promise that resolves to a maybe', async () => {
      const maybe = Maybe.from(42)
        .when((time) => (
          PromiseUtils.timeout(time)
            .then(() => Maybe.from(PromiseUtils.timeout(2).then(() => 100)))
        )).when((v) => {
          expect(v).toBe(100);
          return v * 2;
        });

      expect(await maybe.promise()).toBe(200);
      expect(maybe.value()).toBe(200);
    });

    test('promise that rejects to a maybe', async () => {
      const maybe = Maybe.from(42)
        .when((time) => (
          PromiseUtils.timeout(time)
            .then(() => Promise.reject(Maybe.from(PromiseUtils.timeout(2).then(() => 100))))
        )).when((v) => {
          expect(v).toBe(100);
          return v * 2;
        });

      expect(await maybe.promise()).toBe(200);
      expect(maybe.value()).toBe(200);
    });
  });
});
