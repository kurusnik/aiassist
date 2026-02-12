// server.js
require('dotenv').config();
const express = require('express');
const path = require('path');
const pool = require('./db');
const openrouter = require('./openrouter');

const app = express();
app.use(express.json());

// Healthcheck
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Получить список проектов
app.get('/projects', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name FROM projects ORDER BY id DESC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('GET /projects error:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Получить всех пользователей
app.get('/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('GET /users error:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Добавить пользователя
app.post('/users', async (req, res) => {
  try {
    const { name, email } = req.body;
    if (!name || !email) {
      return res.status(400).json({ error: 'name и email обязательны' });
    }

    await pool.query(
      `INSERT INTO users (name, email)
       VALUES ($1, $2)
       ON CONFLICT (email) DO NOTHING`,
      [name, email]
    );

    res.json({ status: 'created' });
  } catch (err) {
    console.error('POST /users error:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Создать проект
app.post('/projects', async (req, res) => {
  try {
    const { name, userId } = req.body;
    if (!name || !userId) {
      return res.status(400).json({ error: 'name и userId обязательны' });
    }

    const result = await pool.query(
      `INSERT INTO projects (name, user_id)
       VALUES ($1, $2)
       RETURNING *`,
      [name, userId]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('POST /projects error:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Добавить сообщение в проект
app.post('/messages', async (req, res) => {
  try {
    const { projectId, role, content } = req.body;
    if (!projectId || !role || !content) {
      return res.status(400).json({ error: 'projectId, role и content обязательны' });
    }

    const result = await pool.query(
      `INSERT INTO messages (project_id, role, content)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [projectId, role, content]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('POST /messages error:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Получить один проект
app.get('/projects/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'SELECT * FROM projects WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('GET /projects/:id error:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Удалить проект (сначала его сообщения)
app.delete('/projects/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await pool.query('DELETE FROM messages WHERE project_id = $1', [id]);
    await pool.query('DELETE FROM projects WHERE id = $1', [id]);

    res.json({ status: 'deleted' });
  } catch (err) {
    console.error('DELETE /projects/:id error:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Сбросить диалог проекта
app.delete('/projects/:id/messages', async (req, res) => {
  try {
    const { id } = req.params;

    await pool.query('DELETE FROM messages WHERE project_id = $1', [id]);

    res.json({ status: 'reset' });
  } catch (err) {
    console.error('DELETE /projects/:id/messages error:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Получить историю сообщений проекта
app.get('/projects/:id/messages', async (req, res) => {
  try {
    const projectId = req.params.id;

    const result = await pool.query(
      `SELECT role, content, created_at
       FROM messages
       WHERE project_id = $1
       ORDER BY created_at ASC`,
      [projectId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('GET /projects/:id/messages error:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Список доступных моделей
const AVAILABLE_MODELS = [
  { id: 'openai/gpt-5.2-codex', name: 'GPT‑5.2 Codex (программирование)' },
  { id: 'openai/gpt-5.2', name: 'GPT‑5.2 Base (универсальная)' },
  { id: 'openai/gpt-5.2-pro', name: 'GPT‑5.2 Pro (макс качество)' },
  { id: 'anthropic/claude-opus-4.5', name: 'Claude Opus 4.5 (SEO / сложные тексты)' },
  { id: 'anthropic/claude-sonnet-4.5', name: 'Claude Sonnet 4.5 (универсал)' },
];

app.get('/models', (req, res) => {
  res.json(AVAILABLE_MODELS);
});

// Ассистент
app.post('/assistant', async (req, res) => {
  try {
    const { projectId, userMessage, model } = req.body;
    if (!projectId || !userMessage) {
      return res.status(400).json({ error: 'projectId и userMessage обязательны' });
    }

    const selectedModel = model || 'openai/gpt-5.2';

    // 1) История
    const historyResult = await pool.query(
      `SELECT id, role, content
       FROM messages
       WHERE project_id = $1
       ORDER BY created_at ASC`,
      [projectId]
    );

    let history = historyResult.rows;

    // 2) Суммаризация при длинной истории
    if (history.length > 20) {
      const oldMessages = history.slice(0, history.length - 10);

      const summaryResponse = await openrouter.chat.completions.create({
        model: selectedModel,
        messages: [
          { role: 'system', content: 'Кратко суммируй диалог. Сохрани факты и решения.' },
          ...oldMessages.map(m => ({ role: m.role, content: m.content }))
        ]
      });

      const summaryText = summaryResponse?.choices?.[0]?.message?.content || '';

      await pool.query(
        'UPDATE projects SET summary = $1 WHERE id = $2',
        [summaryText, projectId]
      );

      const ids = oldMessages.map(m => m.id).filter(Boolean);
      if (ids.length) {
        await pool.query(
          'DELETE FROM messages WHERE id = ANY($1::int[])',
          [ids]
        );
      }

      history = history.slice(-10);
    }

    // 3) Подтягиваем summary проекта
    const projectResult = await pool.query(
      'SELECT summary FROM projects WHERE id = $1',
      [projectId]
    );
    const summary = projectResult.rows?.[0]?.summary;

    // 4) System prompt
    const systemPrompt = {
      role: "system",
      content: `
Ты — senior AI-ассистент и практический наставник.

Твоя задача — помогать пользователю эффективно решать прикладные задачи
в следующих областях:

1) Программирование как хобби:
- JavaScript, Node.js, Telegram-боты
- Объяснять с нуля и до среднего уровня
- Давать рабочий код, готовый к использованию
- Комментировать код
- Объяснять ошибки и архитектурные решения
- Не усложнять без необходимости

2) Управление оптово-розничной компанией и торговлей на маркетплейсах:
- Помогать с управлением процессами, аналитикой, автоматизацией
- Подсказывать по логике учёта, KPI, юнит-экономике, складу, закупкам
- Давать практичные советы, а не общие бизнес-цитаты
- Допускать, что данные могут быть неполными — задавать уточняющие вопросы

3) DeFi-инвестирование (долгосрок и доход):
- Объяснять DeFi простым языком
- Помогать разбираться в стратегиях дохода, рисках, механиках протоколов
- Не давать финансовых гарантий
- Всегда указывать риски и допущения
- Не выдумывать доходности и не придумывать несуществующие протоколы

Общие правила:
- Отвечай кратко, структурировано, по делу
- Если используешь термин — коротко объясни его
- Не выдумывай API, цифры, источники и факты
- Если не уверен — прямо скажи об этом
- Если есть несколько вариантов — предложи лучший и объясни почему
- Избегай флуда, философии и воды
- Ориентируйся на практическую пользу

Формат ответов:
- Короткие абзацы или списки
- Пошаговое объяснение
- Код — сразу готовый к использованию
`
    };

    // 5) Собираем сообщения
    const messages = [systemPrompt];
    if (summary) {
      messages.push({ role: 'system', content: 'Сводка прошлого диалога: ' + summary });
    }
    messages.push(...history.map(m => ({ role: m.role, content: m.content })));
    messages.push({ role: 'user', content: userMessage });

    // 6) Запрос в модель (OpenRouter)
    const completion = await openrouter.chat.completions.create({
      model: selectedModel,
      messages
    });

    const reply = completion?.choices?.[0]?.message?.content || '';

    // 7) Сохранение сообщений
    await pool.query(
      `INSERT INTO messages (project_id, role, content) VALUES ($1, $2, $3)`,
      [projectId, 'user', userMessage]
    );
    await pool.query(
      `INSERT INTO messages (project_id, role, content) VALUES ($1, $2, $3)`,
      [projectId, 'assistant', reply]
    );

    res.json({ reply });
  } catch (err) {
    console.error('POST /assistant error:', err);
    res.status(500).json({ error: 'internal_error', details: err?.message });
  }
});

// Статика
app.use(express.static(path.join(__dirname, 'public')));

// Старт сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API started on http://localhost:${PORT}`);
});