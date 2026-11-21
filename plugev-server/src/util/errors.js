/** An OCPP-level error. `code` uses OCPP-J CallError codes (NotImplemented, SecurityError, ...). */
class OcppError extends Error {
    constructor(code, description, details = {}) {
        super(description);
        this.code = code;
        this.details = details;
    }
}

/** Bad input from the portal API. */
class ValidationError extends Error {
    constructor(message) {
        super(message);
        this.status = 400;
    }
}

/** The command could not be delivered or answered (transport problem, timeout, CallError, SOAP fault). */
class CommandError extends Error {
    constructor(state, message, details) {
        super(message);
        this.state = state; // 'Failed' | 'Timeout'
        this.details = details;
    }
}

module.exports = { OcppError, ValidationError, CommandError };
