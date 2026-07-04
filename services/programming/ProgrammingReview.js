class ProgrammingReview {
  constructor() {
    this.passed = false;
    this.score = 0;
    this.warnings = [];
    this.errors = [];
    this.recommendations = [];
  }

  toJSON() {
    return {
      passed: this.passed,
      score: this.score,
      warnings: this.warnings,
      errors: this.errors,
      recommendations: this.recommendations
    };
  }

  static fromJSON(data) {
    const review = new ProgrammingReview();
    review.passed = data.passed || false;
    review.score = data.score || 0;
    review.warnings = Array.isArray(data.warnings) ? data.warnings : [];
    review.errors = Array.isArray(data.errors) ? data.errors : [];
    review.recommendations = Array.isArray(data.recommendations) ? data.recommendations : [];
    return review;
  }
}

module.exports = ProgrammingReview;