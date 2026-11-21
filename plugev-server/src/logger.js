const config = require('./config');

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };
const threshold = LEVELS[config.logLevel] ?? LEVELS.info;

function log(level, args) {
    if (LEVELS[level] < threshold) return;
    const line = [`${new Date().toISOString()} ${level.toUpperCase().padEnd(5)}`, ...args];
    (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(...line);
}

module.exports = {
    debug: (...a) => log('debug', a),
    info: (...a) => log('info', a),
    warn: (...a) => log('warn', a),
    error: (...a) => log('error', a),
};
