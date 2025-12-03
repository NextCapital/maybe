/**
 * This error occurs when you try to access the `value()` of a Maybe that is not ready.
 */
class PendingValueError extends Error {}

module.exports = PendingValueError;
