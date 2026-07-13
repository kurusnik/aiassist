const registry = require('./registry');
const OpenAIProvider = require('./providers/openai');
const OpenRouterProvider = require('./providers/openrouter');
const LMStudioProvider = require('./providers/lmstudio');

registry.register('openai', OpenAIProvider);
registry.register('openrouter', OpenRouterProvider);
registry.register('lmstudio', LMStudioProvider);

console.log(`[LLM] Registered providers: ${registry.list().join(', ')}`);