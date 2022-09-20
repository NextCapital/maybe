export = PromiseUtils;
/**
 * A helpful set of utilities for working with native promises.
 *
 * @type {Object}
 */
declare const PromiseUtils: {
  defer(): { promise: Promise<any>, resolve: Function, reject: Function }

  serialize(tasks: (() => any)[]): Promise<any>[]

  pollForCondition(condition: () => boolean, timeout?: number): Promise<void>;

  isThenable(thing: any): boolean;

  timeout(time: number): Promise<NodeJS.Timeout>;
};
