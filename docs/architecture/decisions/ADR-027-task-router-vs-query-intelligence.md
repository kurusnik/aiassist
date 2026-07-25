# ADR-027: TaskRouter vs Query Intelligence — Разделение ответственности

**Status:** Accepted

**Date:** 2026-07-25

## Context

В текущей архитектуре существует два компонента, работающих с пользовательским запросом:

1. **TaskRouter** (`services/router/TaskRouter.js`) — классифицирует запрос на chat vs programming
2. **Query Intelligence** (`services/query-intelligence/`) — интерпретирует смысл запроса

Оба компонента анализируют raw query, но их функции пересекаются. Без чёткой границы разработчики будущих модулей могут дублировать логику или неправильно распределять ответственность.

## Decision

Зафиксировать строгое разделение ответственности:

### TaskRouter — Технический маршрут

Отвечает на вопрос: **"Куда направить запрос?"**

| Маршрут | Описание |
|---------|----------|
| `chat` | Обычный диалог (RAG + LLM) |
| `programming` | Инженерная задача (Programming Agent) |
| `admin` | Административная команда (диагностика, управление) |
| `voice` | Голосовой ввод (Sprint 4+) |

**Вход:** сырой текст запроса

**Выход:** `{ type, confidence, domain }`

**Метод:** keyword-based scoring (TaskAnalyzer)

**Изменение:** при появлении нового технического маршрута расширяется TaskRouter, не Query Intelligence

### Query Intelligence — Смысл запроса

Отвечает на вопрос: **"Что пользователь хочет сделать?"**

| Тип | Описание |
|-----|----------|
| `search_information` | Поиск информации в базе знаний |
| `explain_concept` | Объяснение концепции |
| `execute_action` | Выполнение действия |
| `modify_code` | Изменение кода |
| `generate_report` | Генерация отчёта |
| `learn_topic` | Изучение темы (Academy) |
| `analyze_problem` | Анализ проблемы |

**Вход:** сырой текст запроса

**Выход:** `QueryContext { intent, entities, queryPlan }`

**Метод:** в будущем LLM или эвристики (Sprint 4+)

## Rationale

### Почему это два разных слоя

- **TaskRouter** нужен **до** всей обработки — он определяет, какой pipeline запускать (chat vs programming)
- **Query Intelligence** нужен **внутри** обработки — он определяет, какие шаги выполнять в рамках выбранного pipeline
- TaskRouter работает на ранних стадиях (до трассировки), Query Intelligence — после создания TraceContext
- У них разные потребители: TaskRouter → маршрутизация запроса в index.js, Query Intelligence → все downstream-модули

### Сценарий, демонстрирующий различие

Запрос: *"исправь ошибку в отчёте по продажам"*

1. **TaskRouter** определяет: тип `programming`, программирование (`modify_code`)
2. **Query Intelligence** определяет: намерение `modify_code`, сущности `{ отчёт: "продажи" }`, QueryPlan `[retrieve(knowledge), execute(mcp), generate(llm)]`

TaskRouter не знает и не должен знать о сущностях и плане. Query Intelligence не выбирает технический маршрут — он уже выбран.

## Consequences

**Positive:**
- Каждый слой имеет единую ответственность
- Query Intelligence может развиваться независимо (Sprint 4+)
- TaskRouter остаётся лёгким и быстрым (без LLM, как требует ADR-003)

**Negative:**
- Оба слоя анализируют один и тот же запрос — потенциальное дублирование
- Разработчики могут путать, куда добавлять новый тип анализа

**Neutral:**
- В будущем QueryIntelligence может влиять на маршрут (например, `analyze_problem` → programming). Тогда появится feedback loop: QI → TaskRouter

## Future Considerations

- При реализации классификации намерений (Sprint 4) Query Intelligence может получать результат TaskRouter как подсказку
- Если оба слоя начнут дублировать NLP-анализ, рассмотреть объединение или shared pipeline

## Related

- ADR-003: Task Analyzer без LLM
- ADR-026: Query Intelligence Layer
- `services/router/TaskRouter.js`
- `services/query-intelligence/`