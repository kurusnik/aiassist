---
name: aiassist-engineering
description: Извлечённые архитектурные принципы, структура проекта, конвенции и правила для дальнейшей разработки платформы AiAssist. Используй для: добавление модулей/сервисов, изменение архитектуры, ADR, рефакторинг, интеграция Workflow, работа с MCP/RAG/Knowledge Layer/Programming Agent.
---

# Skill: AiAssist Engineering

## Использование

Загрузи этот skill при работе над следующими задачами:
- Добавление нового модуля или сервиса в платформу
- Изменение существующей архитектуры (компоненты, pipeline, провайдеры)
- Создание ADR для архитектурных решений
- Рефакторинг в рамках архитектурного спринта
- Интеграция новых Workflow (Research, Academy, DeFi)
- Работа с MCP, RAG, Knowledge Layer, Programming Agent

## Структура

| Файл | Содержание |
|------|-----------|
| `01-OVERVIEW.md` | Манифест, принципы, технологический стек |
| `02-ARCHITECTURE.md` | Схема компонентов, маршрутизация, pipeline, MCP, Knowledge Layer, Distributed |
| `03-PROJECT-STRUCTURE.md` | Полная структура директорий с описанием каждого файла |
| `04-CORE-SERVICES.md` | Описание всех сервисов: LLM, Programming, RAG, MCP, OCR и т.д. |
| `05-API.md` | Все API endpoints |
| `06-DATABASE.md` | Миграции, ключевые таблицы, схемы |
| `07-DEVELOPMENT-WORKFLOW.md` | Процесс разработки, code style, npm команды, env, checklists |
| `08-GLOSSARY.md` | Глоссарий терминов |
| `09-ADR-SUMMARY.md` | Сводка всех архитектурных решений (38 ADR) |
| `10-REQUIRES-ARCHITECT.md` | Противоречия, пробелы и неоднозначности |
| `11-DISTRIBUTED-SYSTEMS.md` | Распределённый Workflow Runtime, Lease/Heartbeat, Idempotency |
| `12-WORKFLOW-RUNTIME.md` | Компоненты Runtime, контракты, таблицы |
| `13-PERSISTENCE-PATTERNS.md` | Адаптеры хранения, миграции, контракты |
| `14-CONTROL-PLANE.md` | Control Plane архитектура, Human Console, API boundaries |
| `15-OPERATIONS.md` | Production operations, worker scaling, incident recovery, debugging |
| `16-UI-ARCHITECTURE.md` | UI Architecture, Human Console, frontend/backend boundary, console design rules |

## Ключевые правила для разработчика

1. **Все внешние интеграции — через Provider Framework.** Прямые импорты внешних сервисов в ядро запрещены (ADR 006).
2. **Новый модуль = новая директория в `services/`**; экспорт: `module.exports = new Service()`.
3. **ExecutionContext — единый контейнер состояния.** Ни один этап pipeline не хранит состояние самостоятельно (ADR 007).
4. **План до выполнения.** Execution Planner только строит план, не выполняет (ADR 005).
5. **Рефакторинг отдельно от фич.** Либо рефакторинг, либо новая функциональность — не вместе.
6. **ADR на любое кросс-модульное решение.** Хранить в `docs/architecture/decisions/`.
7. **Foundation Frozen.** Ядро Execution Engine стабильно; новые функции — расширение, не изменение фундамента (ADR 009).
8. **Project владеет данными.** Ни один модуль не обращается напрямую к источникам — только через ProjectContextService (ADR 011).
9. **Два MCP-контура.** 1С и общий — независимы; при недоступности pipeline не прерывается.
10. **Правило двух кликов.** Любая функция доступна максимум за 2 клика от главного экрана (ADR 002).
11. **Persistent-first для distributed.** Любой распределённый компонент требует persistent-реализации. InMemory — только для тестов, если явно не маркировано иначе.
12. **Каждый action воркера обязан иметь:** lease ownership, heartbeat, idempotency, audit trace.
13. **Graceful shutdown.** Воркер обязан отпустить lease при SIGTERM.
14. **Адаптеры взаимозаменяемы.** Весь distributed-код работает через интерфейсы, не через конкретные реализации.
15. **Миграция под каждый адаптер.** Новый persistent-адаптер = новая SQL-миграция.
16. **Execution Runtime и Control Plane всегда разделяются.** Runtime — только исполнение; Control Plane — управление, авторизация, аудит.
17. **Любое пользовательское действие:** API → Authorization → Audit → Runtime. Запрещён прямой доступ UI/API → Executor.
18. **Каждое административное действие содержит:** actor, timestamp, reason, audit event.
19. **UI потребляет Control Plane, никогда Runtime напрямую.** Каждое UI-действие проходит Authorization → Control Service → Audit (ADR 054, ADR-057).
20. **Каждое UI-действие подлежит аудиту.** actor, action, resource, timestamp записываются в AuditEvent.
21. **Console-модули независимо развертываемы.** Каждый модуль — отдельная HTML-страница; модуль можно удалить/заменить без влияния на другие.
22. **Без дублирования бизнес-логики на фронтенде.** Валидация, авторизация, переходы состояний — только на backend. API Client слой — единственный интеграционный слой.
23. **Новые production функции сначала получают:** ADR → Contract → Implementation → Tests.