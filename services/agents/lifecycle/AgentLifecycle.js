class TransitionError extends Error {
  constructor(fromState, targetState) {
    super(`Transition from "${fromState}" to "${targetState}" is not allowed`);
    this.name = 'TransitionError';
    this.fromState = fromState;
    this.targetState = targetState;
  }
}

class AgentLifecycle {
  constructor() {
    this.states = {
      CREATED: 'created',
      PLANNING_VALIDATED: 'planning_validated',
      SAFETY_CHECKED: 'safety_checked',
      EXECUTING: 'executing',
      RESULT_VALIDATED: 'result_validated',
      COMPLETED: 'completed',
      ERROR: 'error'
    };
    this._current = this.states.CREATED;
    this._transitions = [];
  }

  get current() {
    return this._current;
  }

  transition(state) {
    if (!Object.values(this.states).includes(state)) {
      throw new Error(`Unknown lifecycle state: ${state}`);
    }
    if (!this.canTransition(state)) {
      throw new TransitionError(this._current, state);
    }
    this._transitions.push({
      from: this._current,
      to: state,
      timestamp: Date.now()
    });
    this._current = state;
  }

  canTransition(state) {
    const valid = {
      [this.states.CREATED]: [this.states.PLANNING_VALIDATED, this.states.ERROR],
      [this.states.PLANNING_VALIDATED]: [this.states.SAFETY_CHECKED, this.states.ERROR],
      [this.states.SAFETY_CHECKED]: [this.states.EXECUTING, this.states.ERROR],
      [this.states.EXECUTING]: [this.states.RESULT_VALIDATED, this.states.ERROR],
      [this.states.RESULT_VALIDATED]: [this.states.COMPLETED, this.states.ERROR],
      [this.states.COMPLETED]: [],
      [this.states.ERROR]: []
    };
    return (valid[this._current] || []).includes(state);
  }

  isTerminal() {
    return this._current === this.states.COMPLETED || this._current === this.states.ERROR;
  }

  getTransitions() {
    return this._transitions.map(t => ({
      from: t.from,
      to: t.to,
      timestamp: new Date(t.timestamp).toISOString()
    }));
  }

  toJSON() {
    return {
      current: this._current,
      isTerminal: this.isTerminal(),
      transitions: this.getTransitions()
    };
  }
}

AgentLifecycle.TransitionError = TransitionError;

module.exports = AgentLifecycle;