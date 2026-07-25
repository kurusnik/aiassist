# AiAssist Engineering Skill — Требует решения архитектора

## Противоречия

1. **Размерность эмбеддингов**
   - RAG документация (RAG_IMPLEMENTATION.md) указывает `embedding vector(1536)` — размерность OpenAI text-embedding-3-small
   - Фактическая реализация (миграция 006 + project.md) использует `Xenova/multilingual-e5-small` с размерностью **384**
   - Необходимо определить: документация устарела, или есть план поддержки обоих размеров

2. **Система меток RAG (RAG_SOURCE_MARKERS.md, README_RAG_MARKERS.md)**
   - Помечена как "реализована, частично сломана" (README.md:301)
   - Требуется проверка интеграции и исправление SSE-коррупции

3. **deployment-guide.md**
   - Содержит множество неактуальных инструкций: ручная установка Postgres, systemd сервис, ручная настройка nginx, JWT secret
   - `README.md.303` помечает deployment-guide.md как устаревший, но сам файл не обновлён
   - Единственный поддерживаемый способ — Docker Compose

## Пробелы

4. **Тестирование отсутствует**
   - `DEVELOPMENT.md.47-48`: "дополняется по мере внедрения тестов"
   - Нет unit-тестов, integration-тестов или e2e-тестов
   - Нет файлов тестов в `tests/` (каталог пуст или почти пуст)
   - Нет test runner в package.json (тестовая команда заглушка)
   - `README.md.7: `"test": "echo ..."`

5. **Голосовой ввод (voice_input_plan.md)**
   - Реализован интерфейс (кнопка Web Speech API), но нет тестирования и документации
   - Статус: 🔧 частично выполнено

6. **2FA заглушка**
   - Поля `two_factor_enabled`, `two_factor_secret` в таблице users созданы, но функционал не реализован
   - password-management.md.73-83: помечено как "заглушка для будущей реализации"
   - README.md.293: помечено как отменён

7. **Relations API (Knowledge Layer)**
   - Таблица `knowledge.relations` создана, но не заполняется
   - ROADMAP.md.57-61: помечено как Future

8. **Knowledge Context в Programming Engine**
   - ROADMAP.md.63-67: интеграция помечена как planned
   - Context Builder не используется в Programming Agent, только в Chat

## Неоднозначности

9. **Авторизация: Bearer vs Session**
   - ocr-feature.md документирует `Authorization: Bearer <token>`
   - Фактически используется httpOnly session cookies (express-session + connect-pg-simple)
   - Неясно, поддерживается ли Bearer-авторизация

10. **MCP метаданные — пустой источник**
    - ADR-017.161: "metadata в данный момент всегда пустая (нет реального источника)"
    - Knowledge Importer использует MCP для импорта, но McpProvider в Programming Agent всё ещё без данных