import Maybe from './Maybe.js';

// Scenario 5
const pendingMaybe = Maybe.from(new Promise<string>((resolve) => setTimeout(() => resolve('async'), 500)));
const withPendingMaybe = Maybe.all([42, pendingMaybe]);
type Test5 = typeof withPendingMaybe; // Hover to see: Maybe<[42, string], unknown> & { __state: 'pending' }

// Scenario 6
const resolvedA = Maybe.from(1);
const pendingB = Maybe.from(Promise.resolve(2));
const resolvedC = Maybe.from(3);
const mixedResolvedPending = Maybe.all([resolvedA, pendingB, resolvedC]);
type Test6 = typeof mixedResolvedPending; // Hover to see: Maybe<[number, number, number], unknown> & { __state: 'pending' }

// Scenario 7
const rejectedMaybe = Maybe.fromError(new Error('Failed!'));
const resolvedForReject = Maybe.from(123);
const withRejected = Maybe.all([resolvedForReject, rejectedMaybe]);
type Test7 = typeof withRejected; // Hover to see: Maybe<[number, undefined], unknown>

console.log('Check types by hovering over Test5, Test6, Test7');

export type { Test5, Test6, Test7 };
