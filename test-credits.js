// Тестовый скрипт для проверки API OpenRouter
const apiKey = process.env.OPENROUTER_API_KEY;

if (!apiKey) {
  console.error('OPENROUTER_API_KEY не настроен');
  process.exit(1);
}

async function testCredits() {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/credits', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    console.log('Полный ответ API:', JSON.stringify(data, null, 2));
    
    if (data?.data) {
      console.log('\nКлючи в data.data:', Object.keys(data.data));
      console.log('credits:', data.data.credits);
      console.log('balance:', data.data.balance);
      console.log('total_usage:', data.data.total_usage);
      console.log('usage:', data.data.usage);
      console.log('available_credits:', data.data.available_credits);
      console.log('spent:', data.data.spent);
    }
  } catch (error) {
    console.error('Ошибка:', error.message);
  }
}

testCredits();
