const registry = require('./registry');
const OpenAIProvider = require('./providers/openai');
const OpenRouterProvider = require('./providers/openrouter');
const LMStudioProvider = require('./providers/lmstudio');
const LlamaProvider = require('./providers/llama');

registry.register('openai', OpenAIProvider);
registry.register('openrouter', OpenRouterProvider);
registry.register('lmstudio', LMStudioProvider);
registry.register('llama', LlamaProvider);

console.log(`[LLM] Registered providers: ${registry.list().join(', ')}`);
