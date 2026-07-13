# LLM Providers

Каждый провайдер реализует единый интерфейс `BaseProvider`:

- `chat(messages, options)` — не-потоковый вызов
- `stream(messages, options)` — потоковый вызов (SSE)
- `listModels()` — список доступных моделей
- `health()` — проверка соединения

## Добавление нового провайдера

1. Создать `services/llm/providers/<name>/index.js`
2. Реализовать методы `BaseProvider`
3. Зарегистрировать в `services/llm/register.js`:
   ```js
   registry.register('<name>', MyProvider);
   ```

Провайдеры не используют switch/case — регистрация через registry.