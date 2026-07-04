# ADR-016: Model Management Platform

## Статус

✅ Принято (Sprint 015)

## Контекст

Платформа содержала названия моделей в коде:
- `AVAILABLE_MODELS` в `index.js`
- `selectedModel = model || 'openai/gpt-5.2'` в Chat
- `process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini'` в Programming

Это создавало проблемы:
- Каждый модуль знал конкретные имена моделей
- Изменение модели требовало изменения кода
- Администратор не мог управлять моделями через UI
- Список моделей не синхронизировался с OpenRouter

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

OpenRouter ---> syncFromOpenRouter()
```

### ModelManager

Методы:
- `syncFromOpenRouter()` — загружает каталог моделей из OpenRouter API
- `getAvailableModels()` — возвращает все модели из БД
- `getModel(role)` — возвращает модель, назначенную роли (с fallback на OPENROUTER_MODEL)
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
| POST | `/api/admin/models/sync` | Синхронизация с OpenRouter |
| GET | `/api/admin/models/assignments` | Назначения моделей |
| PUT | `/api/admin/models/assignments` | Назначить модель роли |

Все endpoints защищены `requireAdmin`.

### Интеграция с Programming

`OpenRouterProvider` получает модель через `ModelManager.getModel('programming')`.
Если роль не назначена — используется fallback через `OPENROOTER_MODEL`.

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