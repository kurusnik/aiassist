# AiAssist Engineering Skill — Glossary

| Термин | Определение |
|--------|------------|
| **ADR** | Architecture Decision Record — документированное архитектурное решение в `docs/architecture/decisions/` |
| **Context Collector** | Слой подготовки данных: переносит `projectContext` в `collectedData` перед Pipeline |
| **Context Builder** | Компонент Knowledge Layer: `build()` + `render()` — поиск метаданных 1С и форматирование для LLM |
| **ExecutionContext** | Единый контейнер состояния выполнения Pipeline; сериализуется через `toJSON()` |
| **ExecutionPlan** | Последовательность шагов (providers), построенная ExecutionPlanner |
| **ExecutionPipeline** | Оркестратор: проходит по шагам плана, вызывает провайдеров, ведёт ExecutionLog |
| **ExecutionPlanner** | Компонент, который строит ExecutionPlan (но не выполняет его) |
| **Full Refresh** | Режим импорта: очистка всех таблиц перед загрузкой (MVP для Knowledge Layer) |
| **Injection** | Вставка Knowledge Context в системный промпт в index.js |
| **Knowledge Layer** | Слой хранения и предоставления метаданных 1С для LLM |
| **LLM Aggregator** | Универсальный провайдер для OpenAI-совместимых API (OpenRouter, MixRoute, Custom) |
| **MCP** | Model Context Protocol — протокол взаимодействия с внешними инструментами (1С) |
| **ModelManager** | Единая точка доступа к моделям для всех ролей; управление через админ-панель |
| **Programming Agent** | Модуль для инженерных задач: код, ревью, 1С-метаданные |
| **ProgrammingReview** | Результат ревью: `passed`, `score` (0–100), `warnings`, `errors`, `recommendations` |
| **ProjectContextService** | Единый фасад для получения контекста проекта (история, файлы, RAG-статистика) |
| **Prompt Assembly** | Процесс сборки messages array для LLM: системный промпт + RAG + Knowledge + история |
| **Provider Framework** | Единый слой абстракции для внешних интеграций (MCP, RAG, FS, LLM) |
| **RAG** | Retrieval-Augmented Generation — семантический поиск по базе знаний |
| **Reviewer** | Модуль эвристической проверки кода без LLM |
| **TaskAnalyzer** | Классификатор запросов (type, language, domain) по ключевым словам |
| **TaskRouter** | Маршрутизатор: chat vs programming на основе confidence |

## Типы задач Programming Agent

| Тип | Описание |
|-----|----------|
| `find_object` | Поиск объектов 1С метаданных |
| `analyze_metadata` | Анализ структуры метаданных |
| `get_structure` | Получение структуры объекта |
| `create_processor` | Создание обработки 1С |
| `create_report` | Создание отчёта 1С |
| `modify_code` | Изменение существующего кода |
| `explain_code` | Объяснение кода |
| `review_code` | Ревью кода |
| `find_bug` | Поиск бага |
| `unknown` | Fallback |

## Prompt Builder Sections

| Секция | Условие включения |
|--------|-------------------|
| SYSTEM | Всегда |
| TASK | `context.task` существует |
| PROJECT CONTEXT | `context.metadata.projectStats` существует |
| PROJECT FILES | `context.collectedData.projectFiles` не пуст |
| EXAMPLES | `context.collectedData.examples` не пуст |
| RAG CONTEXT | `context.collectedData.collect_rag` не пуст |
| MCP CONTEXT | `context.collectedData.collect_metadata` не пуст |
| OUTPUT REQUIREMENTS | Всегда |

## RAG Similarity Levels

| Уровень | Порог | Поведение |
|---------|-------|-----------|
| 🟢 Высокий | >= 0.7 | Ответ на основе документов с цитированием |
| 🟡 Средний | 0.3 – 0.7 | Ответ из общих знаний модели с пометкой |
| 🔴 Низкий | < 0.3 | Сообщение об отсутствии информации |