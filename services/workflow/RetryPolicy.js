const STRATEGIES = {
  FIXED: 'fixed',
  EXPONENTIAL: 'exponential'
};

class RetryPolicy {
  constructor(options = {}) {
    this.maxAttempts = options.maxAttempts || 3;
    this.strategy = options.strategy || STRATEGIES.EXPONENTIAL;
    this.baseDelay = options.baseDelay || 1000;
    this.maxDelay = options.maxDelay || 30000;
    this.retryableErrors = options.retryableErrors || [];
  }

  shouldRetry(attempt, error) {
    if (attempt >= this.maxAttempts) {
      return false;
    }

    if (this.retryableErrors.length === 0) {
      return true;
    }

    const errorCode = error && (error.code || error.message || String(error));
    return this.retryableErrors.some(code =>
      errorCode && errorCode.includes(code)
    );
  }

  getDelay(attempt) {
    if (this.strategy === STRATEGIES.FIXED) {
      return this.baseDelay;
    }

    const delay = this.baseDelay * Math.pow(2, attempt);
    return Math.min(delay, this.maxDelay);
  }
}

RetryPolicy.STRATEGIES = STRATEGIES;

module.exports = RetryPolicy;