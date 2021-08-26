const PromiseUtils = require('./promise-utils/PromiseUtils');
const PendingValueError = require('./PendingValueError');

class Maybe {
  static from(thing) {
    if (this.isMaybe(thing)) {
      return thing;
    }

    return new Maybe(thing);
  }

  static build(isReady, valueGetter, promiseGetter) {
    if (isReady) {
      return new Maybe(valueGetter());
    }

    return new Maybe(promiseGetter());
  }

  static isMaybe(value) {
    return value instanceof Maybe;
  }

  static fromError(value) {
    return new Maybe(value, true);
  }

  static all(array) {
    const maybeArray = array.map((thing) => Maybe.from(thing));
    const allResolved = maybeArray.every((maybe) => maybe.isResolved());

    if (allResolved) {
      return Maybe.from(maybeArray.map((maybe) => maybe.value()));
    }

    const rejectedEntry = maybeArray.find((maybe) => maybe.isRejected());
    if (rejectedEntry) {
      return rejectedEntry;
    }

    return Maybe.from(Promise.all(maybeArray.map((maybe) => maybe.promise())));
  }

  constructor(thing, isError = false) {
    const isMaybe = Maybe.isMaybe(thing);
    const isPromise = PromiseUtils.isThenable(thing);

    this._isReady = !isPromise;
    this._isError = false;
    this._value = (isPromise || isMaybe) ? undefined : thing;
    this._wrappedPromise = null;

    if (this._isReady && isError) {
      this._isError = true;
    }

    if (isPromise) {
      this._wrappedPromise = promise.then(
        (value) => this._handleResolve(value),
        (error) => this._handleReject(error)
      );
    }

    if (isMaybe) {
      this._become(thing);
    }
  }

  isReady() {
    return this._isReady;
  }

  isResolved() {
    return this._isReady && !this._isError;
  }

  isRejected() {
    return this._isReady && this._isError;
  }

  value() {
    if (this.isResolved()) {
      return this._value;
    }

    if (this.isRejected()) {
      throw this._value;
    }

    throw new PendingValueError('cannot get value for a Maybe that is not ready');
  }

  valueOrError() {
    if (this.isReady()) {
      return this._value;
    }

    throw new PendingValueError('cannot get value or error for a Maybe that is not ready');
  }

  promise() {
    if (this.isResolved()) {
      return Promise.resolve(this._value);
    }

    if (this.isRejected()) {
      return Promise.reject(this._value);
    }

    return this._wrappedPromise;
  }

  when(onResolve, onReject, onProgress) {
    if (this.isResolved()) {
      if (onResolve) {
        return Maybe.from(onResolve(this._value));
      }

      return this;
    }

    if (this.isRejected()) {
      if (onReject) {
        return Maybe.from(onReject(this._value));
      }

      return this;
    }

    return Maybe.from(this._wrappedPromise.then(onResolve, onReject, onProgress));
  }

  catch(onReject) {
    return this.when(undefined, onReject);
  }

  finally(onFinally) {
    return this.when(() => onFinally(), () => onFinally());
  }

  suspend() {
    if (this.isReady()) {
      return this.value();
    }

    throw this.promise();
  }

  _become(otherMaybe) {
    this._isReady = otherMaybe._isReady;
    this._isError = otherMaybe._isError;
    this._value = otherMaybe._value;
    this._wrappedPromise = otherMaybe._wrappedPromise;

    if (!otherMaybe.isReady()) {
      otherMaybe.when(
        (value) => this._handleResolve(value),
        (error) => this._handleReject(error)
      );
    }
  }

  _handleResolve(value) {
    this._isReady = true;
    this._value = value;
    this._wrappedPromise = null;
  }

  _handleReject(error) {
    this._isReady = true;
    this._value = error;
    this._isError = true;
    this._wrappedPromise = null;
  }
}

module.exports = Maybe;
