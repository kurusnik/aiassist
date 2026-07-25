# Query Intelligence Layer

Промежуточный слой между User Input и всеми AI-пайплайнами.

## Назначение

Query Intelligence преобразует сырой пользовательский запрос в структурированный объект `QueryContext`, который могут потреблять любые downstream-модули:

- Programming Agent
- Academy
- MCP Orchestrator
- Workflow Engine
- Memory System
- Hybrid Retrieval
- Context Intelligence

## Статус

**Foundation Sprint 3.5.** Только архитектурный слот. Классификация, сущности и план выполнения не реализованы.

## Архитектура

```
User Input
  │
  ▼
Query Intelligence
  ├── QueryInterpreter (интерфейс)
  ├── QueryContext (модель передачи)
  ├── Intent (намерение)
  ├── Entity (сущность)
  └── QueryPlan (план выполнения)
  │
  ▼
Downstream Pipelines
```

## Конфигурация

| Переменная | По умолчанию | Описание |
|-----------|-------------|----------|
| `QUERY_INTELLIGENCE_ENABLED` | `false` | Включить слой интерпретации |

## Компоненты

### QueryContext
Единый объект передачи запроса между слоями.

### Intent
Модель намерения пользователя. Поддерживаемые типы:
- `search_information`
- `explain_concept`
- `execute_action`
- `modify_code`
- `generate_report`
- `learn_topic`
- `analyze_problem`

### Entity
Модель сущности, извлечённой из запроса. Независима от 1С.

### QueryPlan
План выполнения: последовательность действий для downstream-агентов.

### QueryInterpreter
Интерфейс интерпретации. На текущем этапе возвращает `QueryContext` без изменений.

## Потребители (будущие)

- Programming Agent
- Academy
- MCP Orchestrator
- Workflow Engine
- Memory System