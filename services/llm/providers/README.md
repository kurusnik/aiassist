# LLM Providers

Каждый провайдер реализует единый интерфейс `BaseProvider`:

- `chat(messages, options)` — не-потоковый вызов
- `stream(messages, options)` — потоковый вызов (SSE)
- `listModels()` — список доступных моделей
- `health()` — проверка соединения

## Текущие провайдеры

| Провайдер | Назначение |
|-----------|------------|
| **openrouter** | LLM Aggregator (OpenRouter, MixRoute, Custom OpenAI-совместимые API). Base URL и API key настраиваются через UI. |
| **openai** | OpenAI API (совместимость сохранена) |
| **lmstudio** | Локальный LM Studio |

## LLM Aggregator (openrouter)

Провайдер `openrouter` переименован в UI в **LLM Aggregator** и поддерживает:

- **OpenRouter** — `https://openrouter.ai/api/v1`
- **MixRoute** — `https://api.mixroute.ai/v1`
- **Custom** — любой OpenAI-совместимый API

Base URL не хардкодится — берётся из сохранённых настроек. Если отсутствует — используется `https://openrouter.ai/api/v1`.

### Конфигурация

```json
{
  "aggregatorType": "openrouter",
  "baseURL": "https://openrouter.ai/api/v1",
  "apiKey": "sk-...",
  "model": "openai/gpt-4o-mini"
}
```

Хранится в таблице `llm_settings`, колонка `config` (JSONB), ключ `openrouter`.

## Добавление нового провайдера

1. Создать `services/llm/providers/<name>/index.js`
2. Реализовать методы `BaseProvider`
3. Зарегистрировать в `services/llm/register.js`:
   ```js
   registry.register('<name>', MyProvider);
   ```

Провайдеры не используют switch/case — регистрация через registry.