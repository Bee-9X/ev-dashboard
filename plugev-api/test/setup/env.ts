// Runs before each test file. Configuration is read when the app is created, so these apply to every test app.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.DB_SSL = 'false';
process.env.DB_RUN_MIGRATIONS = 'true';
process.env.JWT_ACCESS_SECRET = 'test-only-secret-that-is-long-enough-0123456789';
process.env.LOG_LEVEL = 'silent';
process.env.AUTH_RATE_LIMIT_PER_MIN = '10000';
process.env.LOGIN_MAX_FAILED_ATTEMPTS = '5';
process.env.LOGIN_LOCK_MINUTES = '15';
process.env.PORTAL_URL = 'http://portal.test';
process.env.CORS_ORIGINS = 'http://portal.test';
