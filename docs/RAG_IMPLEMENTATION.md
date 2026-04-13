# RAG (Retrieval-Augmented Generation) — Документация

## 📖 Описание

RAG — это система семантического поиска и генерации ответов на основе базы знаний проекта. Система позволяет находить релевантную информацию в документах и истории диалогов, а также генерировать ответы с использованием контекста из базы знаний.

## 🎯 Архитектура

### Общая база знаний

Система использует **общую базу векторных представлений** для всех пользователей и проектов. Это позволяет:

- ✅ Осуществлять кросс-проектный поиск
- ✅ Избегать дублирования общих документов
- ✅ Делиться знаниями между проектами

### Структура базы данных

```sql
-- Основная таблица векторных представлений документов
CREATE TABLE document_embeddings (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),           -- Владелец документа
  project_id INTEGER REFERENCES projects(id),     -- Привязка к проекту (опционально)
  document_id INTEGER,                             -- ID документа (если есть)
  chunk_index INTEGER,                             -- Номер чанка в документе
  embedding vector(1536),                          -- Векторное представление (OpenAI)
  content TEXT NOT NULL,                           -- Текст чанка
  metadata JSONB,                                  -- Метаданные
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Индексы для ускорения поиска
CREATE INDEX idx_document_embeddings_embedding ON document_embeddings USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX idx_document_embeddings_user ON document_embeddings(user_id);
CREATE INDEX idx_document_embeddings_project ON document_embeddings(project_id);
```

### Компоненты системы

```
┌─────────────────────────────────────────────────────────────┐
│                     AI Assistant                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐     ┌─────────────────────────────┐   │
│  │  Ingestion      │     │  RAG Pipeline               │   │
│  │  Pipeline       │     │                             │   │
│  │                 │     │  1. Поиск контекста         │   │
│  │  • Загрузка     │     │  2. Ранжирование            │   │
│  │  • Чанкинг      │────▶│  3. Генерация ответа        │   │
│  │  • Embeddings   │     │  4. Цитирование             │   │
│  │  • Индексация   │     │                             │   │
│  └─────────────────┘     └─────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Vector Database (pgvector)             │   │
│  │                                                     │   │
│  │  • document_embeddings — документы пользователей    │   │
│  │  • message_embeddings — история диалогов            │   │
│  │  • public_embeddings — общая база знаний            │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 🔧 Режимы ответа модели

Система использует трёхуровневую логику ответов:

### 🟢 Уровень 1: Ответ найден в базе знаний

**Условие:** `similarity >= 0.7`

**Ответ:**
```
Согласно документу "API Documentation" (раздел "Authentication"):

Для авторизации необходимо передать заголовок:
Authorization: Bearer <your_token>

[Источник: document_id=42, chunk=3]
```

### 🟡 Уровень 2: Ответа нет в базе, но модель знает

**Условие:** `0.3 <= similarity < 0.7`

**Ответ:**
```
В базе знаний проекта нет этой информации, но из общих знаний:

Для авторизации используется стандарт JWT. Токен передаётся в 
заголовке Authorization.

[Из общих знаний модели]
```

### 🔴 Уровень 3: Ответа нет нигде

**Условие:** `similarity < 0.3`

**Ответ:**
```
К сожалению, я не могу ответить на этот вопрос.

В базе знаний нет релевантной информации по этой теме. 
Возможно, стоит переформулировать вопрос или обратиться 
к документации проекта.
```

## 📁 Источники данных

### 1. Загруженные файлы

| Формат | Обработка |
|--------|-----------|
| `.txt`, `.md`, `.json` | Прямое чтение текста |
| `.js`, `.ts`, `.py` | Чтение кода с комментариями |
| `.pdf` | Извлечение текста (требуется pdf-parse) |
| `.docx` | Извлечение текста (требуется mammoth) |
| `.jpg`, `.png` | OCR через Tesseract.js уже реализовано |

### 2. История диалогов

Автоматическая индексация сообщений с генерацией embeddings.

### 3. Общая база знаний (опционально)

- FAQ проекта
- Документация API
- Гайды и инструкции

## 🚀 API Endpoints

### Индексирование документов

#### POST `/api/rag/index`

Индексировать файл или текст.

**Request:**
```json
{
  "projectId": 1,
  "content": "Текст документа или base64 файла",
  "fileName": "document.pdf",
  "metadata": {
    "category": "documentation",
    "tags": ["api", "auth"]
  }
}
```

**Response:**
```json
{
  "success": true,
  "documentId": 123,
  "chunksCount": 5,
  "message": "Документ успешно индексирован"
}
```

#### DELETE `/api/rag/index/:documentId`

Удалить документ из индекса.

**Response:**
```json
{
  "success": true,
  "message": "Документ удалён из индекса"
}
```

### Поиск

#### GET `/api/rag/search`

Поиск релевантных документов.

**Query Parameters:**

| Параметр | Тип | Описание |
|----------|-----|----------|
| `q` | string | Поисковый запрос |
| `projectId` | number | Фильтр по проекту (опционально) |
| `limit` | number | Количество результатов (по умолчанию 5) |
| `threshold` | number | Минимальный порог релевантности (0.0-1.0) |

**Request:**
```
GET /api/rag/search?q=как+авторизоваться&projectId=1&limit=5
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
        "userId": 5,
        "createdAt": "2026-04-10T10:00:00Z"
      }
    }
  ],
  "count": 1
}
```

### RAG запрос к ассистенту

#### POST `/assistant` (расширенный)

Отправка сообщения с использованием RAG.

**Request:**
```json
{
  "projectId": 1,
  "userMessage": "Как работает авторизация?",
  "model": "openai/gpt-5.2",
  "useRag": true,
  "ragThreshold": 0.7,
  "attachmentIds": [1, 2]
}
```

**Response (SSE stream):**
```
data: {"ready": true}

data: {"content": "Согласно документации проекта..."}

data: {"content": "Авторизация осуществляется через..."}

data: {"citations": [{"documentId": 42, "chunk": 3}]}

data: {"done": true}
```

## 🔐 Права доступа

### Изоляция данных

| Тип данных | Доступ |
|------------|--------|
| **Личные документы** | Только владелец + админы |
| **Документы проекта** | Участники проекта |
| **Публичная база** | Все пользователи |

### Проверка прав

```javascript
// Middleware для проверки доступа к документам
async function checkDocumentAccess(req, res, next) {
  const { documentId } = req.params;
  const userId = req.session.userId;
  const isAdmin = req.session.isAdmin;

  const doc = await db.query(
    `SELECT user_id, project_id FROM document_embeddings 
     WHERE id = $1 LIMIT 1`,
    [documentId]
  );

  if (doc.rows.length === 0) {
    return res.status(404).json({ error: 'Document not found' });
  }

  const owner = doc.rows[0];

  // Проверка прав
  if (
    isAdmin || 
    owner.user_id === userId || 
    await isProjectMember(owner.project_id, userId)
  ) {
    next();
  } else {
    res.status(403).json({ error: 'Access denied' });
  }
}
```

## ⚙️ Конфигурация

### Переменные окружения

```env
# RAG Settings
RAG_ENABLED=true
RAG_EMBEDDING_MODEL=text-embedding-3-small
RAG_CHUNK_SIZE=512
RAG_CHUNK_OVERLAP=50
RAG_SIMILARITY_THRESHOLD=0.7
RAG_MAX_RESULTS=10

# Vector Database
PGVECTOR_EXTENSION=vector
PGVECTOR_INDEX_TYPE=ivfflat
PGVECTOR_LISTS=100

# OpenAI
OPENAI_EMBEDDING_API_KEY=sk-...
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

### Настройки чанкинга

| Параметр | Значение | Описание |
|----------|----------|----------|
| `CHUNK_SIZE` | 512 | Размер чанка в токенах |
| `CHUNK_OVERLAP` | 50 | Перекрытие между чанками |
| `MAX_CHUNKS_PER_DOC` | 100 | Максимум чанков на документ |

## 📊 Метрики

### Мониторинг качества

| Метрика | Описание | Цель |
|---------|----------|------|
| `rag.hit_rate` | Доля запросов с найденным контекстом | > 80% |
| `rag.avg_similarity` | Средняя релевантность найденного | > 0.7 |
| `rag.latency_ms` | Время поиска контекста | < 200ms |
| `rag.embedding_cost` | Стоимость генерации embeddings | $0.0001/запрос |

### Логирование

```javascript
// Логирование RAG запросов
{
  timestamp: "2026-04-13T15:00:00Z",
  userId: 5,
  projectId: 1,
  query: "как авторизоваться",
  resultsCount: 3,
  maxSimilarity: 0.89,
  latencyMs: 145,
  embeddingTokens: 128,
  source: "document" | "message" | "public"
}
```

## 🗂️ Структура файлов

```
services/
├── rag/
│   ├── index.js              # Основной сервис RAG
│   ├── embedding.js          # Генерация embeddings
│   ├── chunking.js           # Разбиение на чанки
│   ├── search.js             # Векторный поиск
│   ├── ingestion.js          # Индексирование документов
│   └── citations.js          # Формирование цитат
│
migrations/
├── 005_add_rag_embeddings.sql
├── 006_add_rag_indexes.sql
└── 007_add_public_knowledge.sql
│
docs/
├── RAG_IMPLEMENTATION.md     # Эта документация
├── RAG_API.md                # API спецификация
└── RAG_TROUBLESHOOTING.md    # Решение проблем
│
public/
├── rag-search.js             # Frontend поиск
└── rag-settings.html         # UI настроек RAG
```

## 🔧 Расширения

### Будущие улучшения

1. **Гибридный поиск** — комбинация векторного и полнотекстового поиска
2. **Переформулирование запросов** — авто-улучшение поисковых запросов
3. **Мультиязычность** — поддержка разных языков для embeddings
4. **Кэширование** — Redis для частых запросов
5. **Аналитика** — дашборд использования RAG

## 📝 Примеры использования

### Пример 1: Индексирование файла

```javascript
const formData = new FormData();
formData.append('file', fileInput.files[0]);
formData.append('projectId', 1);
formData.append('metadata', JSON.stringify({
  category: 'documentation',
  tags: ['api', 'auth']
}));

const response = await fetch('/api/rag/index', {
  method: 'POST',
  body: formData
});

const result = await response.json();
console.log(`Индексировано ${result.chunksCount} чанков`);
```

### Пример 2: Поиск с цитированием

```javascript
const response = await fetch('/api/rag/search?q=авторизация&limit=5');
const results = await response.json();

results.results.forEach(r => {
  console.log(`[${r.similarity.toFixed(2)}] ${r.content.substring(0, 100)}...`);
  console.log(`Источник: ${r.metadata.fileName}, чанк ${r.metadata.chunkIndex}`);
});
```

### Пример 3: RAG запрос к ассистенту

```javascript
const response = await fetch('/assistant', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    projectId: 1,
    userMessage: 'Как работает авторизация в API?',
    useRag: true,
    ragThreshold: 0.7
  })
});

// SSE stream обрабатывается в app.js
```

## 🆘 Troubleshooting

### Проблема: Низкая релевантность результатов

**Решение:**
1. Уменьшите `RAG_CHUNK_SIZE` (256-512)
2. Увеличьте `RAG_MAX_RESULTS` (10-20)
3. Проверьте качество embeddings модели

### Проблема: Медленный поиск

**Решение:**
1. Создайте индекс IVFFlat: `CREATE INDEX ... USING ivfflat`
2. Уменьшите `RAG_MAX_RESULTS`
3. Добавьте фильтрацию по проекту/пользователю

### Проблема: Высокая стоимость embeddings

**Решение:**
1. Кэшируйте embeddings для одинаковых файлов
2. Используйте локальную модель (Sentence-BERT)
3. Ограничьте `MAX_CHUNKS_PER_DOC`

---

**Версия документации:** 1.0  
**Дата обновления:** 2026-04-13  
**Статус:** В разработке
