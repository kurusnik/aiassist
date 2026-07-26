const LINK_TYPES = {
  DEPENDS_ON: 'depends_on',
  FORK: 'fork',
  JOIN: 'join',
  SEQUENCE: 'sequence'
};

class ExecutionEdge {
  constructor(from, to, type = LINK_TYPES.DEPENDS_ON, metadata = {}) {
    this.from = from;
    this.to = to;
    this.type = type;
    this.metadata = metadata;
  }

  toJSON() {
    return {
      from: this.from,
      to: this.to,
      type: this.type,
      metadata: this.metadata
    };
  }
}

ExecutionEdge.LINK_TYPES = LINK_TYPES;

module.exports = ExecutionEdge;