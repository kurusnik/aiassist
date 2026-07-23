# Knowledge Layer v1.0

## Назначение

Knowledge Layer — слой хранения и предоставления метаданных конфигурации 1С для LLM.

Проблема: LLM не имеет контекста о структуре конфигурации 1С (документы, справочники, регистры, их реквизиты). Без этого контекста модель не может сформировать корректный запрос к данным 1С или объяснить структуру метаданных.

Решение: при каждом пользовательском запросе выполняется поиск по метаданным конфигурации 1С, и найденные объекты с их реквизитами добавляются в системный промпт перед отправкой в LLM.

Knowledge Layer — read-only слой. Он не изменяет данные 1С, не обращается к LLM, не участвует в маршрутизации запросов. Его единственная задача — предоставить контекст о конфигурации 1С для Prompt Assembly.

Место в архитектуре:

```
1С
│
▼
MCP (RSV Data)
│
▼
Knowledge Importer ── CLI (npm run knowledge:import)
│
▼
PostgreSQL (knowledge schema)
│
▼
Knowledge Service ── читает knowledge.*
│
▼
Context Builder ─── build() + render()
│
▼
Prompt Injection ── index.js (системный промпт)
│
▼
LLM
```

## Компоненты

### Schema

**Файл:** `migrations/009_knowledge_schema.sql`

Четыре таблицы в схеме `knowledge`:

| Таблица | Назначение | Ключевые поля |
|---|---|---|
| `configurations` | Конфигурация 1С (имя, версия, платформа) | `id UUID PK`, `name`, `version`, `platform`, `created_at` |
| `objects` | Объекты метаданных (документы, справочники и т.д.) | `id UUID PK`, `configuration_id FK`, `type`, `name`, `synonym`, `full_name`, `comment` |
| `fields` | Реквизиты объектов | `id UUID PK`, `object_id FK`, `name`, `synonym`, `datatype`, `required`, `length`, `precision`, `reference_type` |
| `relations` | Связи между объектами (зарезервировано) | `id UUID PK`, `from_object_id FK`, `from_field`, `to_object_id FK`, `relation_type` |

Миграция идемпотентна — повторный запуск не вызывает ошибок.

### Importer

**Файл:** `services/knowledge/importer.js`

Импортёр метаданных из 1С в PostgreSQL.

- **Источник данных:** 1С через MCP-протокол (RSV Data), вызовы `describe({ type })` и `getStructure({ object })`.
- **Процесс:** получение списка объектов каждой категории (Документы, Справочники, РегистрыСведений, РегистрыНакопления, Перечисления), затем для каждого объекта — получение структуры с реквизитами.
- **Режим Full Refresh:** перед импортом все таблицы `knowledge.*` очищаются. Инкрементальный импорт не реализован (MVP).
- **Запуск:** `npm run knowledge:import` (`scripts/knowledge-import.js`).

Статистика после импорта выводится в консоль:

```
Configuration:    1
Objects imported: 3580
Fields imported:  55433
Skipped:          0
Elapsed time:     279.00s
```

Если категория недоступна через MCP — выводится предупреждение, импорт остальных категорий продолжается.

### Knowledge Service

**Файл:** `services/knowledge/service.js`

Read-only сервис для запросов к knowledge schema. Не использует ORM — прямые SQL-запросы через `pg.Pool`.

Публичные методы:

#### `health()`

Возвращает общее количество объектов, полей и дату последнего импорта.

```js
const health = await knowledge.health();
// { objects: 3580, fields: 55433, importedAt: "2026-07-23T16:50:10.627Z" }
```

#### `getObject(identifier)`

Принимает `full_name` (содержит `.`) или `name`. Возвращает объект со всеми реквизитами. Если не найден — `null`.

```js
const obj = await knowledge.getObject('Справочник.Организации');
// { id, type, name, synonym, full_name, comment, fields: [...] }
```

#### `findObjects(query)`

Поиск по `name`, `synonym`, `full_name` через `ILIKE`. Возвращает массив объектов (без реквизитов).

```js
const results = await knowledge.findObjects('контрагент');
// [{ id, type, name, synonym, full_name, comment }, ...]
```

#### `getFields(objectId)`

Возвращает реквизиты объекта по его ID.

```js
const fields = await knowledge.getFields('uuid-...');
// [{ id, name, synonym, datatype, required, length, precision, reference_type }, ...]
```

### Context Builder

**Файл:** `services/knowledge/contextBuilder.js`

Преобразует пользовательский запрос в структурированный контекст для LLM.

#### `build(userQuery)`

- Вызывает `knowledge.findObjects(userQuery)`.
- Для каждого найденного объекта вызывает `knowledge.getObject(full_name)` для получения полной структуры с реквизитами.
- Возвращает `{ found, objects }`.

```js
const ctx = await build('расходная накладная');
// { found: true, objects: [{ type, name, full_name, synonym, comment, fields }] }
```

#### `render(context)`

Форматирует контекст в текст для вставки в промпт.

- Выводит до 10 реквизитов на объект.
- Если реквизитов больше — добавляет строку `... (+N реквизитов)`.
- Не выводит блок `Реквизиты:`, если реквизитов нет.
- Комментарий выводится только если не null и не пустая строка.

```
Найдены объекты конфигурации:

Документ.РасходнаяНакладная
  Синоним: Расходная накладная
  Комментарий: Основной документ отгрузки
  Реквизиты:
    - Дата — Дата
    - Контрагент (Покупатель) — Справочник -> Справочник.Контрагенты
    - Номенклатура — Справочник -> Справочник.Номенклатура
    ...
  ... (+232 реквизитов)
```

### Injection

**Файл:** `index.js` (строки 1511–1532)

Knowledge Context добавляется в системный промпт после RAG-контекста, перед сборкой массива messages.

Логика:

1. Вызов `contextBuilder.build(userMessageTrimmed)`.
2. Если `found === false` — промпт не изменяется.
3. Если найдено больше 3 объектов — используются только первые 3.
4. Вызов `contextBuilder.render(limited)`.
5. Если размер превышает 4000 символов — обрезка по границе строки с добавлением `...\nКонтекст сокращён для соблюдения лимита.`.
6. Результат добавляется к `finalSystemPrompt` через разделитель `---`.
7. Логирование:

```json
{"enabled":true,"objectsFound":3,"objectsInjected":3,"charactersBefore":1652,"charactersAfter":1652,"truncated":false}
```

## Переменные окружения

| Переменная | Назначение |
|---|---|
| `ONEC_MCP_ENABLED` | Включение 1C MCP (true/false) |
| `ONEC_MCP_URL` | URL MCP-сервера 1С |
| `ONEC_MCP_LOGIN` | Логин для Basic Auth |
| `ONEC_MCP_PASSWORD` | Пароль для Basic Auth |
| `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` | Подключение к PostgreSQL |

## Запуск

```bash
# Миграция схемы
npm run migrate:run

# Импорт метаданных
npm run knowledge:import

# Запуск сервера (контекст добавляется автоматически)
npm start
```
