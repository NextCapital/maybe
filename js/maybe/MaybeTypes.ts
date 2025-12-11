import type Maybe from './Maybe.js';

/* eslint-disable @typescript-eslint/no-explicit-any, @stylistic/max-len */
/**
 * Recursively unwraps nested Maybe types to get the innermost Maybe.
 *
 * If T is a Maybe wrapping another Maybe (e.g., Maybe<Maybe<number>>), this type will
 * recursively unwrap until it reaches the innermost Maybe (e.g., Maybe<number>).
 * If T is not a Maybe, it returns T unchanged.
 *
 * @example
 * ```typescript
 * type A = UnwrapMaybe<Maybe<number, unknown>>;                 // Maybe<number, unknown>
 * type B = UnwrapMaybe<Maybe<Maybe<string, unknown>, unknown>>; // Maybe<string, unknown>
 * type C = UnwrapMaybe<number>;                                  // number
 * type D = UnwrapMaybe<Promise<number>>;                         // Promise<number>
 * ```
 */
export type UnwrapMaybe<T> = T extends Maybe<infer U, infer V>
  ? U extends Maybe<any, any>
    ? UnwrapMaybe<U>
    : Maybe<U, V>
  : T;

/**
 * Extracts the inner value type from a Maybe, Promise, or raw value.
 *
 * This type handles Maybe types with or without the __state intersection property by using
 * the __value type brand for extraction when __state is present, falling back to standard
 * generic parameter inference for plain Maybe types, and direct extraction for Promises.
 *
 * @example
 * ```typescript
 * type A = UnwrapValue<number>;                                           // number
 * type B = UnwrapValue<Promise<number>>;                                  // number
 * type C = UnwrapValue<Maybe<number, unknown>>;                           // number
 * type D = UnwrapValue<Maybe<number, unknown> & { __state: 'resolved' }>; // number
 * type E = UnwrapValue<Maybe<number, unknown> & { __state: 'rejected' }>; // number
 * type F = UnwrapValue<Maybe<number, unknown> & { __state: 'pending' }>;  // number
 * ```
 */
export type UnwrapValue<T> =
  T extends Promise<infer V> ? V :
    T extends { __value: infer V; __state: any; } ? V : // Has __state intersection - use __value
      T extends Maybe<infer V, any> ? V : // Plain Maybe - use generic
        T; // Raw value

/**
 * Applies UnwrapValue to all elements in an array, preserving array structure.
 *
 * Maps over each element in the input array type and extracts the inner value type
 * using UnwrapValue. This is particularly useful with Maybe.all() to determine the resolved
 * value types from an array of Maybes, Promises, and raw values.
 *
 * @example
 * ```typescript
 * type A = UnwrapAll<[number, string, undefined, null]>;
 * // [number, string, undefined, null]
 *
 * type B = UnwrapAll<[number, string, Promise<undefined>, Maybe<boolean, unknown>]>;
 * // [number, string, undefined, boolean]
 *
 * type C = UnwrapAll<[
 *   Maybe<number, unknown> & { __state: 'resolved' },
 *   Maybe<string, unknown> & { __state: 'resolved' },
 *   Maybe<boolean, unknown> & { __state: 'resolved' },
 * ]>;
 * // [number, string, boolean]
 *
 * type D = UnwrapAll<[
 *   Maybe<number, unknown> & { __state: 'resolved' },
 *   Maybe<number, unknown> & { __state: 'pending' },
 *   Maybe<number, unknown> & { __state: 'resolved' }
 * ]>;
 * // [number, number, number]
 *
 * type E = UnwrapAll<[
 *   Maybe<number, unknown> & { __state: 'pending' },
 *   Maybe<number, unknown> & { __state: 'rejected' },
 *   Maybe<number, unknown> & { __state: 'pending' },
 * ]>;
 * // [number, number, number]
 * ```
 */
export type UnwrapAll<U extends readonly unknown[]> = { -readonly [P in keyof U]: UnwrapValue<U[P]> };

/**
 * Constraint type for Maybe.all() that ensures all Maybes in the input are resolved.
 *
 * This type is used as an overload constraint to narrow the return type of Maybe.all() to
 * a resolved Maybe when all input Maybes are resolved. The constraint is satisfied when:
 * - Raw values (non-Maybe, non-Promise) are present - they pass through
 * - Maybe types have __state: 'resolved'.
 *
 * The constraint is violated (causing the overload to be skipped) when:
 * - Any Maybe has __state: 'pending' or 'rejected'
 * - Any Promise is present (indicates pending state).
 *
 * @example
 * ```typescript
 * // ✅ Constraint satisfied - only raw values
 * type A = AllResolved<[number, string, undefined, null]>;
 * // Preserves: [number, string, undefined, null]
 *
 * // ❌ Constraint violated - contains Promise (becomes never)
 * type B = AllResolved<[number, string, Promise<undefined>]>;
 * // Constraint fails due to never in tuple
 *
 * // ✅ Constraint satisfied - all Maybes are resolved
 * type C = AllResolved<[
 *   Maybe<number, unknown> & { __state: 'resolved' },
 *   Maybe<string, unknown> & { __state: 'resolved' },
 * ]>;
 * // Preserves input type
 *
 * // ❌ Constraint violated - contains pending Maybe
 * type D = AllResolved<[
 *   Maybe<number, unknown> & { __state: 'resolved' },
 *   Maybe<number, unknown> & { __state: 'pending' },
 * ]>;
 * // Does not match constraint (pending Maybe not transformed to resolved)
 *
 * // ❌ Constraint violated - contains rejected Maybe
 * type E = AllResolved<[
 *   Maybe<number, unknown> & { __state: 'rejected' },
 * ]>;
 * // Does not match constraint
 *
 * // ✅ Constraint satisfied - mixed raw values and resolved Maybes
 * type F = AllResolved<[
 *   number,
 *   Maybe<string, unknown> & { __state: 'resolved' },
 *   boolean
 * ]>;
 * // Preserves: [number, Maybe<string, unknown> & { __state: 'resolved' }, boolean]
 * ```
 */
export type AllResolved<U extends readonly unknown[]> = {
  [K in keyof U]: U[K] extends Maybe<any, any>
    ? (U[K] & { __state: 'resolved'; })
    : U[K] extends Promise<any>
      ? never // Promises make it pending, not resolved
      : U[K]
};

/**
 * Identity constraint type for Maybe.all() that matches any input (catch-all overload).
 *
 * This type performs no transformation - it simply returns the input type unchanged. It's used
 * as the second overload constraint in Maybe.all() to handle cases where at least one Maybe is
 * pending or rejected. The name "HasPending" communicates semantic intent even though the type
 * itself doesn't enforce any constraint.
 *
 * TypeScript's overload resolution works top-to-bottom:
 * 1. First tries AllResolved<U> - only matches if all Maybes are resolved
 * 2. Then tries HasPending<U> (this type) - always matches as a fallback
 * 3. The third overload should rarely be reached.
 *
 * By always matching, this overload captures all non-fully-resolved cases (pending/rejected/mixed)
 * and returns a pending Maybe, since the result must wait for async resolution.
 *
 * @example
 * ```typescript
 * // ✅ Constraint satisfied (always matches) - raw values
 * type A = HasPending<[number, string]>;
 * // Preserves: [number, string]
 *
 * // ✅ Constraint satisfied - mixed pending and resolved
 * type B = HasPending<[
 *   Maybe<number, unknown> & { __state: 'pending' },
 *   Maybe<string, unknown> & { __state: 'resolved' },
 * ]>;
 * // Preserves: [Maybe<number, unknown> & { __state: 'pending' }, Maybe<string, unknown> & { __state: 'resolved' }]
 *
 * // ✅ Constraint satisfied - contains Promise
 * type C = HasPending<[Promise<number>, string]>;
 * // Preserves: [Promise<number>, string]
 *
 * // ✅ Constraint satisfied - all resolved (will match, but AllResolved takes precedence)
 * type D = HasPending<[
 *   Maybe<number, unknown> & { __state: 'resolved' },
 *   Maybe<string, unknown> & { __state: 'resolved' },
 * ]>;
 * // Preserves input, but AllResolved overload is chosen instead due to overload order
 * ```
 */
export type HasPending<U extends readonly unknown[]> = U;

/**
 * Helper type to check if an element is a rejected Maybe with __state intersection.
 */
type IsRejectedMaybe<T> = T extends { __state: 'rejected'; } ? true : false;

/**
 * Helper type to extract the first rejected Maybe from a tuple, or never if none exist.
 */
export type FirstRejected<U extends readonly unknown[]> =
  U extends readonly [infer First, ...infer Rest]
    ? IsRejectedMaybe<First> extends true
      ? First
      : FirstRejected<Rest>
    : never;

/**
 * Constraint type for Maybe.all() that checks if any input Maybe is rejected.
 *
 * This type is used as an overload constraint to detect when at least one Maybe in the input
 * has __state: 'rejected', allowing Maybe.all() to return that rejected Maybe immediately
 * rather than attempting to resolve the array.
 *
 * The constraint is satisfied when:
 * - At least one Maybe has __state: 'rejected'.
 *
 * The constraint is violated when:
 * - No Maybes are rejected (all are resolved, pending, or raw values).
 *
 * When this constraint matches, FirstRejected<U> extracts the first rejected Maybe to use
 * as the return type.
 *
 * @example
 * ```typescript
 * // ✅ Constraint satisfied - contains rejected Maybe
 * type A = HasRejected<[
 *   Maybe<number, string> & { __state: 'resolved' },
 *   Maybe<number, string> & { __state: 'rejected' },
 * ]>;
 * // FirstRejected would extract: Maybe<number, string> & { __state: 'rejected' }
 *
 * // ❌ Constraint violated - no rejected Maybes
 * type B = HasRejected<[
 *   Maybe<number, unknown> & { __state: 'resolved' },
 *   Maybe<string, unknown> & { __state: 'pending' },
 * ]>;
 * // FirstRejected would be: never
 *
 * // ✅ Constraint satisfied - multiple rejected, returns first
 * type C = HasRejected<[
 *   Maybe<number, Error> & { __state: 'rejected' },
 *   Maybe<string, unknown> & { __state: 'resolved' },
 *   Maybe<boolean, Error> & { __state: 'rejected' },
 * ]>;
 * // FirstRejected would extract: Maybe<number, Error> & { __state: 'rejected' }
 * ```
 */
export type HasRejected<U extends readonly unknown[]> = FirstRejected<U> extends never ? never : U;

/* eslint-enable @typescript-eslint/no-explicit-any, @stylistic/max-len */
