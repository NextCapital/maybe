/**
 * This error occurs when you try to access the `value()` of a Maybe that is not ready.
 */
export default class PendingValueError extends Error {
    constructor(message) {
        super(message);
        this.name = 'PendingValueError';
        Object.setPrototypeOf(this, PendingValueError.prototype);
    }
}
//# sourceMappingURL=PendingValueError.js.map