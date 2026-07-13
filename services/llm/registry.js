const _providers = new Map();

function register(name, providerClass) {
  if (_providers.has(name)) {
    throw new Error(`Provider "${name}" is already registered`);
  }
  _providers.set(name, providerClass);
}

function get(name) {
  const cls = _providers.get(name);
  if (!cls) {
    throw new Error(`Unknown provider: "${name}". Available: ${list().join(', ')}`);
  }
  return cls;
}

function list() {
  return Array.from(_providers.keys());
}

module.exports = { register, get, list };