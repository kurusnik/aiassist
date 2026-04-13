# RAG — Быстрый старт

## 📦 Установка и настройка

### Шаг 1: Применение миграции

Выполните миграцию для создания таблиц векторных представлений:

```bash
# Подключение к БД в Docker
docker compose exec db psql -U ai_user -d ai_assistant

# Применение миграции
docker compose exec db psql -U ai_user -d ai_assistant -f /docker-entrypoint-initdb.d/005_add_rag_embeddings.sql
```

Или напрямую:

```bash
psql -U ai_user -d ai_assistant -f migrations/005_add_rag_embeddings.sql
```

### Шаг 2: Установка зависимостей

RAG система не требует дополнительных зависимостей для базовой работы.

**Опционально** для поддержки PDF и DOCX:

```bash
npm install pdf-parse mammoth
```

### Шаг 3: Настройка переменных окружения

Добавьте в `.env`:

```env
# RAG Settings
RAG_ENABLED=true
RAG_EMBEDDING_MODEL=text-embedding-3-small
RAG_CHUNK_SIZE=512
RAG_CHUNK_OVERLAP=50
RAG_SIMILARITY_THRESHOLD=0.7
RAG_MAX_RESULTS=10

# OpenAI Embeddings (можно использовать тот же ключ, что для OpenRouter)
OPENAI_EMBEDDING_API_KEY=your_openrouter_api_key
```

### Шаг 4: Перезапуск приложения

```bash
docker compose restart app
# или
npm run docker:restart
```

---

## 🚀 Использование

### 1. Индексирование текста

```bash
curl -X POST http://localhost:3000/api/rag/index \
  -H "Content-Type: application/json" \
  -H "Cookie: session=YOUR_SESSION_COOKIE" \
  -d '{
    "projectId": 1,
    "content": "Ваш текст для индексирования...",
    "fileName": "document.txt",
    "metadata": {
      "category": "documentation",
      "tags": ["api", "guide"]
    }
  }'
```

**Response:**
```json
{
  "success": true,
  "documentId": 123,
  "chunksCount": 5,
  "insertedIds": [456, 457, 458, 459, 460],
  "message": "Successfully indexed 5 chunks"
}
```

### 2. Индексирование файла

```bash
curl -X POST http://localhost:3000/api/rag/index-file \
  -H "Cookie: session=YOUR_SESSION_COOKIE" \
  -F "file=@/path/to/document.pdf" \
  -F "projectId=1"
```

### 3. Поиск по базе знаний

```bash
curl "http://localhost:3000/api/rag/search?q=как+авторизоваться&projectId=1&limit=5" \
  -H "Cookie: session=YOUR_SESSION_COOKIE"
```

**Response:**
```json
{
  "success": true,
  "query": "как авторизоваться",
  "results": [
    {
      "id": 42,
      "content": "Для авторизации используйте заголовок Authorization...",
      "similarity": 0.89,
      "metadata": {
        "fileName": "api-docs.md",
        "category": "documentation",
        "chunkIndex": 3
      },
      "source": {
        "projectId": 1,
        "projectName": "My API Project",
        "userId": 5,
        "userName": "john"
      }
    }
  ],
  "count": 1
}
```

### 4. Удаление документа

```bash
curl -X DELETE http://localhost:3000/api/rag/document/123 \
  -H "Cookie: session=YOUR_SESSION_COOKIE"
```

### 5. Статистика

```bash
curl http://localhost:3000/api/rag/stats \
  -H "Cookie: session=YOUR_SESSION_COOKIE"
```

**Response:**
```json
{
  "success": true,
  "stats": {
    "total_documents": "15",
    "projects_count": "3",
    "total_size": "125000",
    "documents": "10",
    "code_files": "5"
  }
}
```

---

## 🔧 Интеграция с ассистентом

Для использования RAG в запросах к ассистенту добавьте контекст через `rag.prepareRagContext`:

```javascript
const rag = require('./services/rag');

// В обработчике /assistant
app.post('/assistant', requireAuth, async (req, res) => {
  const { projectId, userMessage, useRag } = req.body;
  const userId = req.session.userId;

  // Получение RAG контекста
  let ragContext = '';
  let hasRelevantContext = false;

  if (useRag) {
    const ragResult = await rag.prepareRagContext(userMessage, {
      projectId,
      userId,
      threshold: 0.7,
      limit: 5
    });

    ragContext = ragResult.context;
    hasRelevantContext = ragResult.hasRelevantContext;
  }

  // Формирование system prompt с RAG
  const systemPrompt = rag.buildSystemPrompt(
    baseSystemPrompt,
    ragContext,
    hasRelevantContext
  );

  // Отправка в модель...
});
```

---

## 📊 Режимы ответа модели

### 🟢 Высокая релевантность (>= 0.7)

Модель отвечает на основе найденных документов с цитированием:

```
Согласно документу "API Documentation" (раздел "Authentication"):

Для авторизации необходимо передать заголовок:
Authorization: Bearer <your_token>

[Источник: document_id=42, chunk=3, релевантность: 89%]
```

### 🟡 Средняя релевантность (0.3 - 0.7)

Модель отвечает из общих знаний с пометкой:

```
В базе знаний проекта нет этой информации, но из общих знаний:

Для авторизации используется стандарт JWT. Токен передаётся в 
заголовке Authorization.

[Из общих знаний модели]
```

### 🔴 Низкая релевантность (< 0.3)

Модель сообщает об отсутствии информации:

```
К сожалению, я не могу ответить на этот вопрос.

В базе знаний нет релевантной информации по этой теме. 
Возможно, стоит переформулировать вопрос или обратиться 
к документации проекта.
```

---

## 🎯 Сценарии использования

### Сценарий 1: Поиск по документации проекта

1. Загрузите документацию проекта через `/api/rag/index-file`
2. Пользователи спрашивают через ассистента с `useRag: true`
3. Модель находит ответы в документации с цитированием

### Сценарий 2: Семантический поиск по истории диалогов

1. История автоматически индексируется при сохранении
2. При новом вопросе модель находит похожие обсуждения
3. Предлагает решения из прошлого опыта

### Сценарий 3: Общая база знаний

1. Администратор загружает FAQ, гайды, документацию в `public_embeddings`
2. Все пользователи получают доступ к общей базе
3. Модель использует общие знания + личные документы проекта

---

## ⚙️ Конфигурация

### Переменные окружения

| Переменная | Значение по умолчанию | Описание |
|------------|----------------------|----------|
| `RAG_ENABLED` | `true` | Включить RAG |
| `RAG_EMBEDDING_MODEL` | `text-embedding-3-small` | Модель для embeddings |
| `RAG_CHUNK_SIZE` | `512` | Размер чанка в токенах |
| `RAG_CHUNK_OVERLAP` | `50` | Перекрытие между чанками |
| `RAG_SIMILARITY_THRESHOLD` | `0.7` | Порог релевантности |
| `RAG_MAX_RESULTS` | `10` | Макс. результатов поиска |

### Настройка порогов

```javascript
// В services/rag/search.js
const SIMILARITY_THRESHOLD = 0.7; // Измените для большей/меньшей строгости

// Высокий порог (0.8-0.9) — только очень релевантные результаты
// Низкий порог (0.5-0.6) — больше результатов, но менее точных
```

---

## 🆘 Troubleshooting

### Ошибка: `extension "vector" does not exist`

**Решение:** Установите pgvector в PostgreSQL:

```bash
# Для Docker
docker compose exec db sh -c "apt-get update && apt-get install -y postgresql-15-pgvector"
```

Или используйте образ с pgvector:

```yaml
# docker-compose.yml
db:
  image: pgvector/pgvector:pg15
  # ...
```

### Ошибка: Rate limit exceeded

**Решение:** Уменьшите частоту запросов или используйте кэширование:

```javascript
// Кэширование embeddings
const cache = new Map();

async function getCachedEmbedding(text) {
  const hash = crypto.createHash('md5').update(text).digest('hex');
  
  if (cache.has(hash)) {
    return cache.get(hash);
  }
  
  const embedding = await generateEmbedding(text);
  cache.set(hash, embedding);
  return embedding;
}
```

### Медленный поиск

**Решение:** Проверьте индексы:

```sql
-- Проверка индексов
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'document_embeddings';

-- Пересоздание индекса
REINDEX INDEX idx_doc_emb_vector;
```

---

## 📈 Метрики

### Отслеживание качества

```javascript
// Логирование в services/rag/index.js
await rag.logRagRequest({
  userId,
  projectId,
  query: userMessage,
  resultsCount: documents.length,
  maxSimilarity: maxSimilarity,
  latencyMs: latencyMs,
  source: 'document'
});
```

### Целевые метрики

| Метрика | Цель |
|---------|------|
| `hit_rate` | > 80% запросов с контекстом |
| `avg_similarity` | > 0.7 |
| `latency_ms` | < 200ms |
| `embedding_cost` | < $0.01 на 1000 запросов |

---

## 🔗 Ссылки

- [RAG_IMPLEMENTATION.md](./RAG_IMPLEMENTATION.md) — Полная документация
- [005_add_rag_embeddings.sql](../migrations/005_add_rag_embeddings.sql) — Миграция БД
- [services/rag/](../services/rag/) — Исходный код сервисов

---

**Версия:** 1.0  
**Дата:** 2026-04-13  
**Статус:** Готово к использованию
