const Candidate = require('../../context-intelligence/models/Candidate');

class BaseSearchProvider {
  constructor(name, method) {
    this.name = name;
    this.method = method;
  }

  async search(query, options = {}) {
    throw new Error('search() must be implemented by subclass');
  }

  async getCandidates(queryContext, options = {}) {
    throw new Error('getCandidates() must be implemented by subclass');
  }

  async health() {
    return { name: this.name, available: false };
  }
}

module.exports = BaseSearchProvider;