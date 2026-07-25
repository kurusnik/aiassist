# AiAssist Engineering Skill — API Endpoints

## Авторизация

| Endpoint | Метод | Описание |
|----------|-------|----------|
| `/register` | POST | Регистрация |
| `/login` | POST | Вход |
| `/logout` | POST | Выход |
| `/auth/check` | GET | Проверка авторизации |
| `/api/change-password` | PUT | Изменение пароля |

## Проекты

| Endpoint | Метод | Описание |
|----------|-------|----------|
| `/projects` | GET/POST | Список / создать |
| `/projects/:id` | GET/PUT/DELETE | Получить / обновить / удалить |
| `/projects/:id/messages` | GET/DELETE | История / сброс |
| `/projects/:id/attachments` | GET/POST | Вложения |

## Ассистент

| Endpoint | Метод | Описание |
|----------|-------|----------|
| `/assistant` | POST | Отправить сообщение (SSE stream) |
| `/models` | GET | Список моделей |
| `/api/ocr` | POST | Распознавание текста с изображения |

## RAG

| Endpoint | Метод | Описание |
|----------|-------|----------|
| `/api/rag/index` | POST | Индексировать текст |
| `/api/rag/index-file` | POST | Индексировать файл |
| `/api/rag/search` | GET | Поиск по базе знаний |
| `/api/rag/document/:id` | DELETE | Удалить документ |
| `/api/rag/stats` | GET | Статистика |

## Админ-панель

| Endpoint | Метод | Описание |
|----------|-------|----------|
| `/api/admin/users` | GET | Все пользователи |
| `/api/admin/users/:id` | PUT/DELETE | Редактировать / удалить |
| `/api/admin/users/:id/approve` | PUT | Одобрить пользователя |
| `/api/admin/users/:id/change-password` | PUT | Сменить пароль пользователя |
| `/api/admin/users/password-logs` | GET | Логи изменений паролей |
| `/api/admin/models/catalog` | GET | Каталог моделей |
| `/api/admin/models/sync` | POST | Синхронизация моделей |
| `/api/admin/models/assignments` | GET/PUT | Назначения моделей |
| `/api/admin/mcp/status` | GET | Статус MCP |
| `/api/admin/mcp/reload` | POST | Перезагрузка MCP |
| `/api/admin/mcp/ping` | GET | Проверка MCP соединения |
| `/api/admin/mcp/config` | GET | Конфигурация MCP |
| `/api/admin/mcp/describe` | GET | Описание возможностей MCP |
| `/api/admin/mcp/help` | GET | Справка MCP |
| `/api/settings/llm` | GET/POST | Настройки LLM провайдера |
| `/api/settings/llm/test` | POST | Проверка соединения LLM |