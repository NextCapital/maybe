# Maybe

[![NextCapital Open Source](https://img.shields.io/badge/NextCapital-Open%20Source-%2300a5f6?style=for-the-badge&logo=data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAA/FBMVEUApfYAAAAApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYApfYk6uC4AAAAU3RSTlMAAJHwVI7ULQcDHcG4FyyxdAE13JQInQLv+G4Kl9AoePvqRynk6UYLnNNrZxrCsxLDsBPPK3Np5UAu51X0YpnSKjbd/oQFGboepg+0cZPEIATmP31l8v0AAAC1SURBVBgZBcGHIsMAFEDReykVWgRtanYYCVp71ay95/v/f3EOMDRcAlVVgZEYLYPCWILA+ERUqgiTU9MpCDOzMVeDaiXqGSiUGvMLLC7F8gqgkjVb7c7q2voGiCp5EZvlre0URRW6vdjZTVBRhe5e7B8kqKiSF3F4dHySoqgkzdbpWf+83QFRuGhcXpFfx80AEG7v7h8e4ek5igzgpRevbwj99w+A7DO+vkGh9oOQ1X//QFXVf8KAFHYrlyAPAAAAAElFTkSuQmCC)](https://www.nextcapital.com)

This project contains three main exports:

- `Maybe` - A class for things that are "maybe" a promise, that allows synchronously accessing the state and value of a resolved promise.
- `PromiseUtils` - A collection of helper methods for working with native promises
- `AsyncQueue` - A queue that allows for a maximum concurrency of running tasks.

This code should run equally well on both client and server.

## Maybe

### Installation

```
npm install --save @nextcapital/maybe
```

### Background

The `Maybe` class acts like a `Maybe` type in functional programming: but instead of being
a maybe between a value and nothing, this acts as a maybe between a promise and a value. In
other words, this class is for things that are "maybe" a promise!

Ordinarily, it is not possible to know that state of a native Promise or access its value or
error synchronously. The `Maybe` class allows you to do to both. This allows us to act
synchronously on data if possible, and wait for it easily if not.

### API
Probably best to refer to the [in-code documentation](./js/maybe/Maybe.js). The main methods are:

- `Maybe.from(value)` - Converts `value` to a `Maybe` instance if it is not already
- `Maybe.build(isReady, valueGetter, promiseGetter)` - Builds a `Maybe` from the `valueGetter` or `promiseGetter` depending on the value of `isReady`
- `Maybe.isMaybe(thing)` - Returns `true` if `thing` is a `Maybe`
- `Maybe.fromError(error)` - Creates a rejected `Maybe` for the error
- `Maybe.all(array)` - The `Promise.all` equivalent for `Maybe`
- `isReady` - Returns `true` if resolved or rejected, and `false` if still pending
- `isPending` - Returns the opposite value of `isReady`
- `isResolved` - Returns `true` if resolved
- `isRejected` - Returns `true` if rejected
- `value` - Returns the value if resolved, throws the error if rejected, and throws a `PendingValueError` if still pending
- `valueOrError` - Like `value`, but returns an error instead of throwing if rejected.
- `promise` - Converts the instance to a promise
- `when` - The equivalent of `then` for `Maybe` instances. See full docs for more.
- `catch` - The equivalent of `catch` on promises for `Maybe` instances
- `finally` - The equivalent of `finally` on promises for `Maybe` instances
- `suspend` - If ready, defers to `value`. Otherwise, throws the result of `promise`. This
  satisfies the React 18 suspense contract.

### Maybe May Not Resolve/Reject in the Same Tick
You should always `await` the result of `maybe.promise()`, rather than the promise that the
maybe was created from, before attempting to synchronously access the maybe's value.

We have to use more than one `.then` internally on the promise, which means that it can take
several ticks after the original promise resolves for the maybe instance to adopt its state.

This behavior is intrinsic to promises and cannot be fixed. However, this shouldn't be a major issue: simply await the maybe instead of the promise when a reference to both the promise and the maybe exists.

### Async/Await Caveats
You should not attempt to return a `Maybe` instance from an `async` function. All `async`
functions return a `Promise`, so in practice you will return a promise resolved to a maybe instance.

There is no equivalent to `async`/`await` syntax for maybe instancess: you'll need to use `when`. Perhaps one day `Maybe` will be integrated natively into browsers, alongside corresponding syntactic sugar. One can dream...

### Examples / Uses

For synchronous resolved values:

```javascript
const maybe = Maybe.from(42);
expect(maybe.isReady()).toBe(true);
expect(maybe.isResolved()).toBe(true);
expect(maybe.value()).toBe(42);
```

For synchronous rejected values:

```javascript
const error = new Error('my bad');
const maybe = Maybe.fromError(error);
expect(maybe.isReady()).toBe(true);
expect(maybe.isRejected()).toBe(true);
expect(() => maybe.value()).toThrow(error);
expect(maybe.valueOrError()).toBe(error);
```

For a promise that resolves:

```javascript
const promise = thingThatReturnsPromiseThatResolves();
const maybe = Maybe.from(promise);

expect(maybe.isReady()).toBe(false);
const value = await maybe.promise();

expect(maybe.isReady()).toBe(true);
expect(maybe.isResolved()).toBe(true);
expect(maybe.value()).toBe(value);
```

For a promise that rejects:

```javascript
const promise = thingThatReturnsPromiseThatRejects();
const maybe = Maybe.from(promise);

expect(maybe.isReady()).toBe(false);
await maybe.promise().catch((error) => error);

expect(maybe.isReady()).toBe(true);
expect(maybe.isRejected()).toBe(true);
expect(maybe.valueOrError()).toBe(error);
```

Building a maybe:

```javascript
function getMaybeForKey(key) {
  return Maybe.build(
    hasCachedEntryForKey(key),
    () => getCachedEntryForKey(key),
    () => loadAndCacheEntryForKey(key)
  );
}

const maybe = getMaybeForKey('example');
if (maybe.isReady()) {
  console.log('value is already ready: ', maybe.value());
} else {
  const value = await maybe.promise();
  expect(maybe.isReady()).toBe(true);
  expect(maybe.isResolved()).toBe(true);
  console.log('value loaded to:', value);
}
```

Chained resolutions:

```javascript
const { resolve, promise } = PromiseUtils.defer();
const maybe = Maybe.from(10)
  .when((value) => value * 2) // 20
  .when((value) => promise.then((otherValue) => otherValue + value)) // 30
  .when((value) => Maybe.from(Promise.resolve(value * 2))); // 60

expect(maybe.isReady()).toBe(false);

resolve(10);
await maybe.promise();

expect(maybe.isReady()).toBe(true);
expect(maybe.isResolved()).toBe(true);
expect(maybe.value()).toBe(60);
```

Chained rejections:

```javascript
const { reject, promise } = PromiseUtils.defer();
const notCalledFn = jest.fn();
const maybe = Maybe.from(10)
  .when((value) => value * 2) // 20
  .when((value) => promise.then((otherValue) => otherValue + value)) // 30
  .when(notCalledFn);

expect(maybe.isReady()).toBe(false);
const value = 123;
const caughtMaybe = maybe.catch(() => value);

const error = new Error('whoops');
reject(error);
await expect(maybe.promise()).rejects.toBe(error);

expect(maybe.isRejected()).toBe(true);
expect(maybe.valueOrError()).toBe(error);
expect(notCalledFn).not.toBeCalled();
expect(caughtMaybe.value()).toBe(value);
```

See the [unit tests](./js/maybe/Maybe.test.js) for more examples.

### React 18 - Suspend With Data Fetch

The `suspend` method on a Maybe is useful for React 18's "suspend with data fetch" feature. For example:

```javascript
const MyComponent = (props) => {
  const [firstData, secondData, thirdData] = Maybe.all([
    reactMaybeFetch('https://example.org/data-one'),
    reactMaybeFetch('https://example.org/data-two'),
    reactMaybeFetch('https://example.org/data-three')
  ]).suspend();

  return (
    <ul>
      <li>My favorite color is: {firstData.color}</li>
      <li>Her favorite flavor is: ${secondData.flavor}<li>
      <li>His favorite artist is: ${thirdData.artist}</li>
    </ul>
  );
};
```

In this example:

- All three requests start at once without waterfalling. Without the `Maybe` library, the typical `reactFetch` (which suspends immediately) only allows one request to start when the
previous completes.
- A single promise encompassing all three requests is thrown if not ready. This prevents React from needing to do extra renders for each one sequentially.
- If all data is already cached, we can render immediately.

Notably, the `Maybe` library on its own does not resolve the need to hook into React 18's still-nebulous caching system for suspense with data fetch. Once more details are released about this from the React team, we'll update these examples.

## PromiseUtils
The `PromiseUtils` object contains a set of nifty helper functions. See the [full docs](./js/promise-utils/PromiseUtils.js) for full details. Here is the gist:

- `defer` - Returns a pending promise alongside methods to resolve or reject it.
- `serialize(tasks)` - Initializes and runs each async task in serial
- `pollForCondition(condition)` - Returns a promise that resolves when a condition is met
- `isThenable(thing)` - Returns true if the `thing` is promise-alike
- `timeout(time)` - Returns a promise that resolves after the given time

## AsyncQueue
The `AsyncQueue` class allows running async tasks against a queue with a maximum concurrency. If the max concurrency is reached, tasks will be queued until capacity is available. See the [full docs](./js/async-queue/AsyncQueue) for more.

The main method here is `perform(task)`, where `task` is a method that returns a promise when called. This will return a promise that resolves/rejects with the same value as the promise returned from `task`.

## PeerDependencies
Since `Maybe.isMaybe` is merely doing an `instanceof` check under the hood, it is important that your app only has one instance of the `Maybe` library inside of it. To this end, we
recommend:

- Installing as a `dependency` if in a terminal package (one that won't be consumed by others)
- Installing as a `peerDependencies` in all other cases. If using `npm < 7`, you may want to install as a `devDependencies` as well.

### Webpack/Linking Considerations
If you have multiple nested libraries that use `Maybe` as a `peerDepeneency`, and you want to use `npm link` to link to one of them locally, you'll probably want to set the following
on your webpack config:

```
{
  resolve: {
    alias: {
      '@nextcapital/maybe': require.resolve('@nextcapital/maybe')
    }
    // other keys
  }
  // the rest
}
```

This will force webpack to use the top-level package for the linked module. See [this post](https://medium.com/@penx/managing-dependencies-in-a-node-package-so-that-they-are-compatible-with-npm-link-61befa5aaca7) for more.

## Contributing to Maybe

See [CONTRIBUTING.md](./CONTRIBUTING.md)

