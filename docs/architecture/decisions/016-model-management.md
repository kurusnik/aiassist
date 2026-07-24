# ADR-016: Model Management Platform

## Статус

✅ Принято (Sprint 015)  
🔄 Актуализировано (Sprint 016 — LLM Aggregator)

## Контекст

Платформа содержала названия моделей в коде:
- `AVAILABLE_MODELS` в `index.js`
- `selectedModel = model || 'openai/gpt-5.2'` в Chat
- `process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini'` в Programming
- Каталог моделей синхронизировался только из OpenRouter

После внедрения LLM Aggregator (Sprint 016) провайдер OpenRouter был заменён на универсальный агрегатор, поддерживающий OpenRouter, MixRoute и любые OpenAI-совместимые API. Каталог моделей теперь синхронизируется из активного агрегатора, а не только из OpenRouter.

## Решение

Создан ModelManager — единая точка доступа к моделям.

### Архитектура

```
Admin UI
    │
    ▼
Backend API (/api/admin/models/*)
    │
    ▼
ModelManager (services/models/ModelManager.js)
    │
    ├── PostgreSQL (models table — каталог)
    └── PostgreSQL (model_assignments table — назначения)

LLM Aggregator (OpenRouter / MixRoute / Custom) ─── syncModels()
```

### ModelManager

Методы:
- `syncModels()` — загружает каталог моделей из активного LLM-провайдера (агрегатора)
- `getAvailableModels()` — возвращает все модели из БД
- `getModel(role)` — возвращает модель, назначенную роли (с fallback на первую модель в каталоге или `openai/gpt-4o-mini`)
- `setModel(role, modelId)` — назначает модель роли
- `getRoles()` — возвращает список ролей
- `getAssignments()` — возвращает все назначения с информацией о моделях

### База данных

**Таблица `models`:**

| Поле | Тип | Описание |
|------|-----|----------|
| id | TEXT PK | ID модели из OpenRouter |
| slug | TEXT | Slug |
| name | TEXT | Человеческое название |
| provider | TEXT | Провайдер модели |
| context_length | BIGINT | Длина контекста в токенах |
| pricing_prompt | NUMERIC(12,6) | Цена за prompt токен |
| pricing_completion | NUMERIC(12,6) | Цена за completion токен |
| supports_tools | BOOLEAN | Поддержка tools |
| supports_reasoning | BOOLEAN | Поддержка reasoning |
| supports_vision | BOOLEAN | Поддержка vision |
| active | BOOLEAN | Активна |
| created_at | TIMESTAMPTZ | Дата создания |
| updated_at | TIMESTAMPTZ | Дата обновления |

**Таблица `model_assignments`:**

| Поле | Тип | Описание |
|------|-----|----------|
| role | TEXT PK | Роль (chat, programming, reviewer, academy, summarizer, vision) |
| model_id | TEXT FK → models.id | Назначенная модель |
| updated_at | TIMESTAMPTZ | Дата назначения |

### API Endpoints

| Метод | Path | Описание |
|-------|------|----------|
| GET | `/api/admin/models/catalog` | Каталог моделей |
| POST | `/api/admin/models/sync` | Синхронизация с активным провайдером (LLM Aggregator / LM Studio / OpenAI) |
| GET | `/api/admin/models/assignments` | Назначения моделей |
| PUT | `/api/admin/models/assignments` | Назначить модель роли |

Все endpoints защищены `requireAdmin`.

### Интеграция с LLM Aggregator

При сохранении настроек LLM Aggregator (`POST /api/settings/llm`):
1. Удаляются все старые модели из таблицы `models` (каскадно удаляются устаревшие назначения)
2. Модель из конфига агрегатора вставляется в `models` и назначается всем 6 ролям
3. Автоматически вызывается `ModelManager.syncModels()` для загрузки актуального каталога моделей от нового провайдера

### Интеграция с Programming

`OpenRouterProvider` в Programming Pipeline получает модель через `ModelManager.getModel('programming')`.
Если роль не назначена — используется первая модель из каталога или `'openai/gpt-4o-mini'`.

### Обратная совместимость

- Старые endpoints `/api/admin/models` (GET/POST/DELETE) сохранены
- Старый `AVAILABLE_MODELS` и `GET /models` сохранены
- Fallback на `OPENROUTER_MODEL` сохранён
- Chat не изменён (использует модель из запроса клиента)

## Последствия

Положительные:
- Ни один модуль не знает конкретного имени модели
- Администратор управляет моделями через UI
- Каталог синхронизируется с OpenRouter
- Роли могут быть расширены без изменения кода

Отрицательные:
- Добавлена зависимость от БД для получения модели
- Требуется миграция БД