# AiAssist Architecture

## Назначение проекта

AiAssist — модульная AI-платформа, построенная вокруг интеллектуального ассистента. Проект начинался как чат с OpenRouter, но архитектура спроектирована так, что чат — лишь один из модулей.

Главная идея: ассистент умеет не только общаться, но и выполнять предметные инженерные задачи — писать код, анализировать баги, формировать отчёты, управлять данными. Это достигается за счёт модульной архитектуры, где каждый модуль реализует конкретный домен.

Это не чат, а платформа, потому что:
- Каждый модуль (Chat, Programming, Knowledge) изолирован и имеет собственный pipeline
- Модули могут использовать общие сервисы (авторизация, RAG, OpenRouter), но не зависят от них
- Добавление нового модуля не требует изменения существующих

## Основные принципы

### Текущие архитектурные правила

1. **Правило двух кликов.** Любая функция должна быть доступна максимум за два клика от главного экрана. Исключение — многошаговые операции (авторизация, подтверждение), но сама точка входа должна быть в два клика.

2. **Разделение ответственности.** Компонент либо думает, либо делает. Анализатор (Task Analyzer) анализирует запрос, но не генерирует код. Исполнитель (Execution) генерирует код, но не анализирует запрос. Это предотвращает появление "божественных объектов" и позволяет тестировать и заменять каждый этап независимо.

3. **Programming — модуль AiAssist.** Programming Engine не является самостоятельным приложением. Он разделяет инфраструктуру проекта (авторизация, Express, БД) и следует тем же конвенциям, что Chat и RAG.

4. **Единая система авторизации.** Все API используют middleware `requireAuth` из `middleware/auth`. Исключение — публичные эндпоинты (status, health), которые не раскрывают чувствительных данных.

5. **Архитектурный спринт.** Каждый пятый спринт является архитектурным. В нём не добавляется новый функционал — только рефакторинг, документация, устранение технического долга и улучшение архитектуры.

6. **План всегда строится до выполнения.** Execution Planner составляет последовательность действий, не выполняя их. Это позволяет анализировать, логировать и при необходимости изменять план перед запуском.

7. **Provider Framework.** Любая внешняя зависимость (LLM, MCP, Git, RAG, файловая система, Docker, PostgreSQL и другие) подключается только через Provider Framework. Код ядра Programming Engine не имеет прямых импортов внешних сервисов.

8. **Единый ExecutionContext.** Все этапы pipeline работают через единый контейнер состояния. Каждый этап читает данные из контекста и записывает результат в контекст.

9. **Project Context.** Все приложения (Chat, Programming, Academy) работают только через ProjectContextService. Project является единственным владельцем данных. Ни один модуль не обращается напрямую к RAG, History, OCR, Attachments или Filesystem — только через ProjectContextService.

10. **Providers работают только с ExecutionContext.** Получение данных выполняется исключительно ContextCollector. Provider'ы не выполняют SQL-запросы, не вызывают RAG, не обращаются к файловой системе. Все данные уже находятся в `executionContext.collectedData`.

11. **ModelManager — единая точка доступа к моделям.** Ни один модуль не знает конкретного имени модели. Все модули (Chat, Programming, Reviewer, Academy) получают модель через ModelManager. Администратор управляет моделями через Admin UI. Пользователь не выбирает модель в чате — модель для роли `chat` назначается в админ-панели.

### Будущие архитектурные правила

*— будут добавлены по мере развития проекта*

## Структура проекта

### Chat
Основной модуль общения с AI. Принимает сообщение пользователя, собирает контекст (RAG, файлы проекта), отправляет запрос в LLM (модель определяется через `ModelManager.getModel('chat')`) и возвращает ответ. Реализован как поток (SSE) для стриминга токенов. Пользователь не выбирает модель — модель для чата назначается администратором через `model_assignments`.

### Programming
Модуль для инженерных задач: написание кода, ревью, поиск багов, формирование отчётов. Использует собственный pipeline (Task Analyzer → Execution Planner → ProjectContextService → ContextCollector → ExecutionPipeline → ProviderManager → Providers → ProgrammingResult).

### Knowledge (RAG)
Модуль управления базой знаний. Индексирует документы, файлы и справочники, предоставляет семантический поиск и контекст для Chat и Programming.

### Admin
Панель управления пользователями, моделями и мониторингом. Доступна только администраторам.

### Authentication
Система аутентификации и авторизации. Сессии на основе cookie/express-session. Middleware: `requireAuth`, `requireAdmin`.

---

## Programming Engine

Programming Engine реализует сквозной pipeline обработки инженерной задачи.

```
User
  │
  ▼
Task Analyzer
  │
  ▼
Execution Planner
  │
  ▼
ProjectContextService
  │
  ▼
ContextCollector
  │
  ▼
ExecutionContext
  │
  ▼
ExecutionPipeline
  │
  ▼
ProviderManager
  │
  ▼
Providers
  │
  ├── InternalProvider
  ├── FilesystemProvider
  ├── RagProvider
  ├── MCP Provider ─── Infrastructure Layer
  │                           │
  │                    McpConnectionManager
  │                           │
  │                    McpToolClient
  │                           │
  │                    http / stdio 🔜 / tcp 🔜 / sse 🔜
  │                           │
  │                    RSV Data
  │
  ├── OpenRouterProvider ─── ModelManager ─── OpenRouter
  │
  ▼
ProgrammingResult
```

### Блоки pipeline

| Блок | Ответственность | Статус |
|---|---|---|
| **Task Analyzer** | Классифицирует текстовый запрос в структурированную ProgrammingTask. Не генерирует код. Не использует LLM. | ✅ Реализован |
| **Execution Planner** | Составляет последовательность действий для выполнения задачи. Не выполняет действия. | ✅ Реализован |
| **ProjectContextService** | Загружает контекст проекта из существующих сервисов (БД, RAG, attachments). | ✅ Реализован |
| **ContextCollector** | Копирует данные из projectContext в collectedData. Не выполняет SQL, не вызывает RAG, не обращается к файловой системе. | ✅ Реализован |
| **ExecutionContext** | Единый контейнер состояния выполнения. Хранит task, plan, collectedData, prompt, result. | ✅ Реализован |
| **ExecutionPipeline** | Оркестратор выполнения. Проходит по шагам плана, получает провайдера через ProviderManager, вызывает его, сохраняет результат в ExecutionContext. | ✅ Реализован |
| **ProviderManager** | Реестр и маршрутизация к провайдерам. | ✅ Реализован |
| **InternalProvider** | Встроенные операции: сборка промпта, проверка результата, ревью. | ✅ Реализован |
| **FilesystemProvider** | Доступ к файловой системе. При наличии collectedData.files использует готовые данные. | ✅ Реализован |
| **RagProvider** | Поиск в базе знаний. При наличии collectedData.rag использует кешированные данные. | ✅ Реализован |
| **OpenRouterProvider** | Отправка запросов в LLM через OpenRouter. | ✅ Реализован |
| **Prompt Builder** | Собирает единый Prompt из ExecutionContext по независимым секциям. | ✅ Реализован |
| **Reviewer** | Проверяет корректность результата: синтаксис, соответствие типу задачи, безопасность. | ✅ Реализован |
| **McpProvider** | Доступ к данным через MCP-протокол. Получает клиент через McpConnectionManager. Вызов инструментов через McpToolClient. | ✅ Реализован |

---

## Источники данных

Все данные проекта проходят через единый конвейер: внешний источник → ProjectContext → ContextCollector → collectedData → Providers.

```
Project
  │
  ▼
ProjectContextService
  │
  ├── project       ← projects table (id, name, summary)
  ├── history       ← messages table (последние 20 записей)
  ├── files         ← attachments table (метаданные, без содержимого)
  ├── rag           ← document_embeddings / message_embeddings (статистика)
  └── metadata      ← projects table (createdAt, ownerId)
  │
  ▼
ContextCollector → collectedData
  │
  ▼
Providers ← читают collectedData, не выполняют внешних вызовов
```

### Правило

Providers никогда не обращаются напрямую к БД или HTTP. Provider получает только ExecutionContext. Получение данных выполняется исключительно ContextCollector.

---

## Provider Framework

Все внешние интеграции проходят через Provider Framework — единый слой абстракции между Programming Engine и внешними сервисами.

```
Programming Engine
        │
        ▼
 ProviderManager  — реестр провайдеров: регистрация, поиск, получение по имени
        │
        ▼
    Providers      — конкретные реализации для каждого внешнего сервиса
        │
  ├── MCP Provider ─── Infrastructure Layer
  │                           │
  │                    McpConnectionManager
  │                           │
  │                    McpToolClient
  │                           │
  │                    http / stdio 🔜 / tcp 🔜 / sse 🔜
  │                           │
  │                    RSV Data
│                    http / stdio 🔜 / tcp 🔜 / sse 🔜
│
├── OpenRouterProvider ─── ModelManager ─── OpenRouter
        │
        └── Internal / Filesystem / RAG ─── collectedData

| Provider | Статус | Источник данных |
|---|---|---|
| **InternalProvider** | ✅ Реализован | `executionContext` (prompt, result) |
| **FilesystemProvider** | ✅ Переведён | `collectedData.files` (или fallback: файловая система) |
| **RagProvider** | ✅ Переведён | `collectedData.rag` (или fallback: RAG-сервис) |
| **MCP Provider** | ✅ Реализован | `McpConnectionManager` → `McpToolClient` → `collectedData.collect_metadata` |
| **OpenRouterProvider** | ✅ Реализован | `executionContext` (prompt) |
```
Programming Engine
        │
        ▼
 ProviderManager  — реестр провайдеров: регистрация, поиск, получение по имени
        │
        ▼
    Providers      — конкретные реализации для каждого внешнего сервиса
        │
        ▼
  ModelManager    — единая точка доступа к моделям (выбор модели по роли)
        │
        ▼
   OpenRouter     — HTTP-клиент к OpenRouter API

| Provider | Статус | Источник данных |
|---|---|---|---|
| **InternalProvider** | ✅ Реализован | `executionContext` (prompt, result) |
| **FilesystemProvider** | ✅ Переведён | `collectedData.files` (или fallback: файловая система) |
| **RagProvider** | ✅ Переведён | `collectedData.rag` (или fallback: RAG-сервис) |
| **MCP Provider** | ✅ Реализован | `collectedData.collect_metadata` (или McpToolClient → MCP) |
| **OpenRouterProvider** | ✅ Реализован | `executionContext` (prompt) |

---

## Execution Context

ExecutionContext — единый контейнер состояния выполнения, который сопровождает задачу через весь pipeline.

```
Task Analyzer → Execution Planner → Execution Context → Providers → Prompt Builder → LLM → Reviewer → Result
                                            │
                                    { collectedData, prompt, result }
```

ExecutionContext содержит:

| Поле | Назначение |
|---|---|
| `id` | Уникальный идентификатор контекста |
| `task` | Исходная ProgrammingTask |
| `executionPlan` | ExecutionPlan с последовательностью шагов |
| `collectedData` | Словарь данных, собранных ContextCollector и провайдерами (project, history, files, attachments, rag, metadata, projectFiles, examples, collect_rag, collect_metadata) |
| `prompt` | Объект промпта вида `{ sections, prompt, statistics }`, построенный PromptBuilder. `prompt.prompt` содержит итоговую строку для LLM. |
| `result` | ProgrammingResult, полученный после выполнения |
| `metadata` | Дополнительные метаданные выполнения |

ExecutionContext — это data-контейнер, он не содержит бизнес-логики. Все этапы pipeline читают и записывают данные через него, но не используют его для принятия решений.

ExecutionContext является **сериализуемым объектом**: поддерживает `toJSON()` для сериализации и статический `fromJSON(data)` для восстановления. Любой этап Pipeline может сохранить его состояние и восстановить позже. Это является обязательным архитектурным требованием.

---

## Философия AiAssist

• **AiAssist — модульная AI-платформа.** Чат — лишь один из модулей. Любой новый домен (программирование, аналитика, документооборот) подключается как отдельный модуль.

• **LLM — один из провайдеров, а не центр системы.** LLM — это внешний сервис, подключённый через Provider Framework. Ядро системы не зависит от LLM.

• **Сначала анализ, затем планирование, затем выполнение.** Ни один этап pipeline не может быть пропущен или переставлен.

• **Все этапы работают через единый ExecutionContext.** Каждый этап читает данные из контекста и записывает результат в контекст. Это делает pipeline предсказуемым и тестируемым.

• **Компоненты должны быть максимально независимыми.** Task Analyzer не знает о провайдерах. Execution Planner не знает о реализации провайдеров. ProviderManager не содержит бизнес-логики.

---

## Project Context

ProjectContextService — единый фасад для получения контекста проекта. Все модули платформы работают только через него, не обращаясь напрямую к RAG, History, OCR, Attachments или Filesystem.

```
    Project
        │
        ▼
ProjectContextService
        │
  ┌─────┼────────┐
  │     │        │
Chat Programming Academy
```

### Интерфейс

```js
class ProjectContextService {
  async load(projectId) {
    return {
      projectId,
      project: {},
      history: [],
      files: [],
      rag: null,
      metadata: {}
    };
  }
}
```

### ExecutionContext

| Поле | Назначение |
|------|-----------|
| `projectId` | ID текущего проекта |
| `projectContext` | Объект контекста, загруженный через ProjectContextService |

### Правила

1. **Project владеет данными.** Ни один модуль не обращается напрямую к внешним сервисам.
2. **ProjectContextService — фасад.** Агрегирует данные из всех источников в единый объект.
3. **Programming Engine знает только projectId.** Он не знает, откуда пришёл RAG или где лежат файлы.
4. **Обратная совместимость.** Если projectId не передан — используется null, проект не загружается.

### Схема платформы

```
User
  │
  ▼
Project
  │
  ▼
ProjectContextService
  │
  ├── Programming
  ├── Academy
  ├── Chat
  └── Future Apps
```

### Источники данных ProjectContextService

| Поле | Источник |
|------|----------|
| `project` | `projects` таблица (id, name, summary) |
| `history` | `messages` таблица (последние 20 сообщений) |
| `files` | `attachments` таблица (метаданные, без содержимого) |
| `rag` | `document_embeddings` / `message_embeddings` (статистика, без поиска) |
| `metadata` | `projects` таблица (createdAt, ownerId) |

### Полный поток данных

```
Project
  │
  ▼
ProjectContextService.load(projectId)
  │
  ▼
ProjectContext — единый объект контекста
  │
  ▼
ContextCollector.collect(context) — копирует в collectedData
  │
  ▼
ExecutionContext.collectedData
  │
  ├── project
  ├── history
  ├── files
  ├── attachments
  ├── rag
  └── metadata
  │
  ▼
Providers — читают collectedData, не выполняют внешних вызовов
  │
  ▼
Pipeline — выполнение шагов
```
