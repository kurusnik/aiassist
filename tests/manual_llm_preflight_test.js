const QueryInterpreter = require('../services/intelligence/QueryInterpreter');
const LLMHealthService = require('../services/intelligence/LLMHealthService');

async function testLLMPreflight() {
  console.log('=== Testing LLM Preflight ===\n');
  
  // Test 1: Check LLM health
  console.log('Test 1: LLMHealthService.checkInterpreter()');
  const health = await LLMHealthService.checkInterpreter();
  console.log('Health check result:', JSON.stringify(health, null, 2));
  console.log();
  
  // Test 2: QueryInterpreter with LLM unavailable
  console.log('Test 2: QueryInterpreter.analyze() with simulated LLM unavailability');
  const originalCheck = LLMHealthService.checkInterpreter;
  LLMHealthService.checkInterpreter = async () => ({
    available: false,
    reason: 'model_not_found',
    provider: null,
    model: null
  });
  
  const qi = new QueryInterpreter();
  const result = await qi.analyze('сколько реализаций создано');
  console.log('Result:', JSON.stringify(result, null, 2));
  
  if (result.needsClarification && result.error === 'semantic_resolver_unavailable') {
    console.log('✓ Test passed: LLM unavailable correctly handled\n');
  } else {
    console.log('✗ Test failed: Expected needsClarification=true and error=semantic_resolver_unavailable\n');
  }
  
  LLMHealthService.checkInterpreter = originalCheck;
  
  // Test 3: QueryInterpreter with LLM available
  console.log('Test 3: QueryInterpreter.analyze() with LLM available');
  if (health.available) {
    const result2 = await qi.analyze('тест');
    console.log('Result:', JSON.stringify(result2, null, 2));
    console.log('✓ Test passed: LLM available, analysis completed\n');
  } else {
    console.log('⊘ Test skipped: LLM not available\n');
  }
  
  // Test 4: SemanticResolverUnavailableError
  console.log('Test 4: SemanticResolverUnavailableError class');
  const { SemanticResolverUnavailableError } = QueryInterpreter;
  const err = new SemanticResolverUnavailableError('Test error');
  console.log('Error name:', err.name);
  console.log('Error code:', err.code);
  console.log('Error message:', err.message);
  
  if (err.name === 'SemanticResolverUnavailableError' && err.code === 'LLM_UNAVAILABLE') {
    console.log('✓ Test passed: SemanticResolverUnavailableError created correctly\n');
  } else {
    console.log('✗ Test failed: SemanticResolverUnavailableError properties incorrect\n');
  }
  
  console.log('=== All tests completed ===');
}

testLLMPreflight().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
