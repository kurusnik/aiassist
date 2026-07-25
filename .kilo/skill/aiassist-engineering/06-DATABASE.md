# AiAssist Engineering Skill — Database

## Миграции

| # | Файл | Описание |
|---|------|----------|
| 000 | `000_initial_schema.sql` | Основные таблицы: users, projects, messages, session |
| 001 | `001_add_auth.sql` | Поля авторизации |
| 002 | `002_add_attachments.sql` | Таблица вложений |
| 003 | `003_add_admin_fields.sql` | Поля администратора |
| 004 | `004_password_change_logs.sql` | Логирование паролей + password_change_attempts |
| 005 | `005_add_rag_embeddings.sql` | pgvector, document_embeddings, message_embeddings, public_embeddings |
| 006 | `006_embedding_dimension_384.sql` | Переход на 384d (Xenova/multilingual-e5-small) |
| 007 | `007_model_management.sql` | models, model_assignments |
| 008 | `008_llm_settings.sql` | Настройки LLM провайдеров |
| 009 | `009_knowledge_schema.sql` | Схема knowledge (конфигурации 1С) |

## Ключевые таблицы

### knowledge schema (1C metadata)

| Таблица | Назначение | Ключевые поля |
|---------|-----------|---------------|
| `configurations` | Конфигурация 1С | `id UUID PK`, `name`, `version`, `platform` |
| `objects` | Объекты метаданных | `id UUID PK`, `configuration_id FK`, `type`, `name`, `synonym`, `full_name`, `comment` |
| `fields` | Реквизиты объектов | `id UUID PK`, `object_id FK`, `name`, `synonym`, `datatype`, `required`, `length`, `precision`, `reference_type` |
| `relations` | Связи (зарезервировано) | `id UUID PK`, `from_object_id FK`, `from_field`, `to_object_id FK`, `relation_type` |

### models и model_assignments

**models:** `id TEXT PK`, `slug`, `name`, `provider`, `context_length`, `pricing_prompt`, `pricing_completion`, `supports_tools`, `supports_reasoning`, `supports_vision`, `active`

**model_assignments:** `role TEXT PK`, `model_id TEXT FK → models.id`

### RAG embeddings

**document_embeddings:** `id SERIAL PK`, `user_id FK`, `project_id FK`, `document_id`, `chunk_index`, `embedding vector(384)`, `content TEXT`, `metadata JSONB`
- Индексы: IVFFlat (cosine), user_id, project_id

Также: `message_embeddings` (история диалогов), `public_embeddings` (общая база знаний)

### llm_settings

Хранит настройки LLM провайдера в JSONB колонке `config`:
- Для openrouter: `{ aggregatorType, baseURL, apiKey, model }`
- Для lmstudio: `{ baseURL, model }`