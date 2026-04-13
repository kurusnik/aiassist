// server.js
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcrypt');
const path = require('path');
const pool = require('./db');

// Настройка подключения к базе данных в Docker
if (process.env.NODE_ENV === 'production') {
  process.env.DATABASE_URL = 'postgresql://ai_user:ai_password@db:5432/ai_assistant';
  // Принудительно для того, чтобы приложение использовало правильный хост
  process.env.PGHOST = 'db';
  process.env.PGPORT = '5432';
  process.env.PGDATABASE = 'ai_assistant';
  process.env.PGUSER = 'ai_user';
  process.env.PGPASSWORD = 'ai_password';
}
const openrouter = require('./openrouter');
const { requireAuth, requireAdmin } = require('./middleware/auth');
const PasswordManager = require('./services/passwordManager');
const multer = require('multer');
const fs = require('fs');

// RAG сервисы
const rag = require('./services/rag');
const { indexFile, indexText, deleteDocument, getStats } = require('./services/rag/ingestion');

const app = express();
app.use(express.json());

// Настройка загрузки файлов
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});

const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } }); // 10 MB limit

function isProbablyTextFile(mime, originalName) {
  const m = (mime || '').toLowerCase();
  if (m.startsWith('text/')) return true;
  if ([
    'application/json',
    'application/xml',
    'application/x-yaml',
    'application/yaml',
    'application/javascript',
    'application/x-javascript',
    'application/sql',
    'application/csv'
  ].includes(m)) return true;

  const ext = (originalName || '').toLowerCase().split('.').pop();
  if (!ext || ext === (originalName || '').toLowerCase()) return false;
  return [
    'txt', 'md', 'markdown', 'json', 'xml', 'yaml', 'yml', 'csv',
    'js', 'ts', 'jsx', 'tsx', 'html', 'css', 'sql',
    'log', 'ini', 'env'
  ].includes(ext);
}

function formatBytes(n) {
  const num = Number(n) || 0;
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${Math.round(num / 1024)} KB`;
  return `${Math.round(num / (1024 * 1024))} MB`;
}

// Настройка сессий
app.use(session({
  store: new pgSession({
    pool: pool,
    tableName: 'session'
  }),
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 дней
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production'
  }
}));

// Healthcheck
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ========== OPENROUTER CREDITS ==========

// Получение баланса OpenRouter
app.get('/api/credits', async (req, res) => {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'OPENROUTER_API_KEY not configured' });
    }

    const response = await fetch('https://openrouter.ai/api/v1/credits', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    const data = await response.json();
    
    // OpenRouter возвращает: { data: { total_credits: 15, total_usage: 5.56 } }
    // balance = total_credits - total_usage
    let balance = '0.00';
    let totalUsage = '0.00';
    
    if (data?.data) {
      const d = data.data;
      
      // Потрачено
      if (typeof d.total_usage === 'number') {
        totalUsage = d.total_usage.toFixed(2);
      } else if (typeof d.total_usage === 'string') {
        totalUsage = parseFloat(d.total_usage).toFixed(2);
      }
      
      // Баланс = total_credits - total_usage
      if (typeof d.total_credits === 'number' && typeof d.total_usage === 'number') {
        balance = (d.total_credits - d.total_usage).toFixed(2);
      } else if (typeof d.total_credits === 'string' && typeof d.total_usage === 'string') {
        balance = (parseFloat(d.total_credits) - parseFloat(d.total_usage)).toFixed(2);
      }
    }
    
    res.json({
      balance: balance,
      spent: totalUsage,
      currency: 'USD'
    });
  } catch (error) {
    console.error('Error fetching OpenRouter credits:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========== АВТОРИЗАЦИЯ ==========

// Регистрация нового пользователя
app.post('/register', async (req, res) => {
  try {
    const { username, password, email } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'username и password обязательны' });
    }

    // Проверка существования пользователя
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE username = $1',
      [username]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Пользователь уже существует' });
    }

    // Хеширование пароля
    const passwordHash = await bcrypt.hash(password, 10);

    // Создание пользователя
    const result = await pool.query(
      `INSERT INTO users (username, password_hash, email, name)
       VALUES ($1, $2, $3, $4)
       RETURNING id, username, email`,
      [username, passwordHash, email || null, username]
    );

    const user = result.rows[0];

    // Автоматический вход после регистрации
    req.session.userId = user.id;
    req.session.username = user.username;

    res.json({ 
      success: true, 
      user: { id: user.id, username: user.username, email: user.email }
    });
  } catch (err) {
    console.error('POST /register error:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Вход
app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'username и password обязательны' });
    }

    // Поиск пользователя
    const result = await pool.query(
      'SELECT id, username, password_hash, email FROM users WHERE username = $1',
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    const user = result.rows[0];

    // Проверка пароля
    const isValid = await bcrypt.compare(password, user.password_hash);

    if (!isValid) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    // Создание сессии
    req.session.userId = user.id;
    req.session.username = user.username;

    res.json({ 
      success: true, 
      user: { id: user.id, username: user.username, email: user.email }
    });
  } catch (err) {
    console.error('POST /login error:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Выход
app.post('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ error: 'internal_error' });
    }
    res.json({ success: true });
  });
});

// Проверка авторизации
app.get('/auth/check', async (req, res) => {
  if (req.session && req.session.userId) {
    try {
      // Получаем is_admin из базы данных
      const userResult = await pool.query(
        'SELECT is_admin FROM users WHERE id = $1',
        [req.session.userId]
      );
      
      const isAdmin = userResult.rows.length > 0 ? userResult.rows[0].is_admin : false;
      
      res.json({
        authenticated: true,
        user: {
          id: req.session.userId,
          username: req.session.username,
          isAdmin: isAdmin
        }
      });
    } catch (err) {
      console.error('/auth/check error:', err);
      res.json({
        authenticated: true,
        user: {
          id: req.session.userId,
          username: req.session.username,
          isAdmin: false
        }
      });
    }
  } else {
    res.json({ authenticated: false });
  }
});

// ========== ЗАЩИЩЕННЫЕ ЭНДПОИНТЫ ==========

// Получить список проектов
app.get('/projects', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const result = await pool.query(
      'SELECT id, name FROM projects WHERE user_id = $1 ORDER BY id DESC',
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('GET /projects error:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Получить всех пользователей
app.get('/users', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('GET /users error:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Добавить пользователя
app.post('/users', requireAuth, async (req, res) => {
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
app.post('/projects', requireAuth, async (req, res) => {
  try {
    const { name } = req.body;
    const userId = req.session.userId;
    
    if (!name) {
      return res.status(400).json({ error: 'name обязателен' });
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
app.post('/messages', requireAuth, async (req, res) => {
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
app.get('/projects/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.session.userId;

    const result = await pool.query(
      'SELECT * FROM projects WHERE id = $1 AND user_id = $2',
      [id, userId]
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
app.delete('/projects/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.session.userId;

    // Проверка владельца
    const checkResult = await pool.query(
      'SELECT id FROM projects WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    await pool.query('DELETE FROM messages WHERE project_id = $1', [id]);
    await pool.query('DELETE FROM projects WHERE id = $1', [id]);

    res.json({ status: 'deleted' });
  } catch (err) {
    console.error('DELETE /projects/:id error:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Сбросить диалог проекта
app.delete('/projects/:id/messages', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.session.userId;

    // Проверка владельца
    const checkResult = await pool.query(
      'SELECT id FROM projects WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    await pool.query('DELETE FROM messages WHERE project_id = $1', [id]);

    res.json({ status: 'reset' });
  } catch (err) {
    console.error('DELETE /projects/:id/messages error:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Получить историю сообщений проекта
app.get('/projects/:id/messages', requireAuth, async (req, res) => {
  try {
    const projectId = req.params.id;
    const userId = req.session.userId;

    // Проверка владельца
    const checkResult = await pool.query(
      'SELECT id FROM projects WHERE id = $1 AND user_id = $2',
      [projectId, userId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

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
  { id: 'arcee-ai/trinity-large-preview:free:online', name: 'ARcee free' },
  { id: 'openai/gpt-5.2:online', name: 'GPT‑5.2 Base (универсальная)' },
  { id: 'openai/gpt-5.2-pro', name: 'GPT‑5.2 Pro (макс качество)' },
  { id: 'anthropic/claude-opus-4.5', name: 'Claude Opus 4.5 (SEO / сложные тексты)' },
  { id: 'anthropic/claude-sonnet-4.5', name: 'Claude Sonnet 4.5 (универсал)' },
];

app.get('/models', (req, res) => {
  res.json(AVAILABLE_MODELS);
});

// ========== АДМИН-ПАНЕЛЬ ==========

// Получить всех пользователей (для админа)
app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, email, name, is_admin, is_approved, created_at FROM users ORDER BY id DESC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('GET /api/admin/users error:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Изменить пароль другого пользователя (для супер-администраторов)
app.put('/api/admin/users/:id/change-password', requireAdmin, async (req, res) => {
  try {
    const targetUserId = parseInt(req.params.id);
    const adminUserId = req.session.userId;
    const { newPassword, confirmPassword, requireTwoFactor = false } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];

    // Проверка, что не меняем пароль самому себе (чтобы использовать обычный эндпоинт)
    if (targetUserId === adminUserId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Для изменения собственного пароля используйте /api/change-password' 
      });
    }

    // Проверка обязательных полей
    if (!newPassword || !confirmPassword) {
      return res.status(400).json({ 
        success: false, 
        error: 'Новый пароль и подтверждение обязательны' 
      });
    }

    // Проверка совпадения паролей
    if (newPassword !== confirmPassword) {
      await PasswordManager.logPasswordChange({
        userId: targetUserId,
        changedByUserId: adminUserId,
        ipAddress,
        userAgent,
        success: false,
        errorMessage: 'Новый пароль и подтверждение не совпадают (админ)'
      });
      
      return res.status(400).json({ 
        success: false, 
        error: 'Новый пароль и подтверждение не совпадают' 
      });
    }

    // Валидация пароля
    const validation = PasswordManager.validatePassword(newPassword);
    if (!validation.valid) {
      await PasswordManager.logPasswordChange({
        userId: targetUserId,
        changedByUserId: adminUserId,
        ipAddress,
        userAgent,
        success: false,
        errorMessage: `Невалидный пароль (админ): ${validation.errors.join(', ')}`
      });
      
      return res.status(400).json({ 
        success: false, 
        error: 'Пароль не соответствует требованиям безопасности',
        validationErrors: validation.errors
      });
    }

    // Проверка, что целевой пользователь существует
    const targetUser = await PasswordManager.getUserInfo(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ 
        success: false, 
        error: 'Пользователь не найден' 
      });
    }

    // Опциональная проверка двухфакторной аутентификации
    if (requireTwoFactor) {
      // Здесь можно добавить проверку 2FA кода
      // В текущей реализации просто отмечаем, что 2FA требуется
      return res.status(400).json({ 
        success: false, 
        error: 'Двухфакторная аутентификация требуется, но не реализована' 
      });
    }

    // Изменение пароля
    const success = await PasswordManager.changePassword(targetUserId, newPassword, adminUserId);
    if (!success) {
      await PasswordManager.logPasswordChange({
        userId: targetUserId,
        changedByUserId: adminUserId,
        ipAddress,
        userAgent,
        success: false,
        errorMessage: 'Ошибка при изменении пароля администратором'
      });
      
      return res.status(500).json({ 
        success: false, 
        error: 'Ошибка при изменении пароля' 
      });
    }

    // Логирование успешного изменения администратором
    await PasswordManager.logPasswordChange({
      userId: targetUserId,
      changedByUserId: adminUserId,
      ipAddress,
      userAgent,
      success: true
    });

    res.json({ 
      success: true, 
      message: `Пароль пользователя ${targetUser.username} успешно изменен администратором` 
    });

  } catch (error) {
    console.error('PUT /api/admin/users/:id/change-password error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Внутренняя ошибка сервера' 
    });
  }
});

// Редактировать пользователя (для админа)
app.put('/api/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { username, email, name, is_admin, is_approved } = req.body;
    
    // Нельзя редактировать самого себя
    if (parseInt(id) === req.session.userId) {
      return res.status(400).json({ error: 'Нельзя редактировать самого себя' });
    }
    
    const updates = [];
    const values = [];
    let paramCount = 1;
    
    if (username !== undefined) {
      updates.push(`username = $${paramCount++}`);
      values.push(username);
    }
    if (email !== undefined) {
      updates.push(`email = $${paramCount++}`);
      values.push(email);
    }
    if (name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(name);
    }
    if (is_admin !== undefined) {
      updates.push(`is_admin = $${paramCount++}`);
      values.push(is_admin);
    }
    if (is_approved !== undefined) {
      updates.push(`is_approved = $${paramCount++}`);
      values.push(is_approved);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'Не указаны данные для обновления' });
    }
    
    values.push(id);
    
    await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount}`,
      values
    );
    
    res.json({ success: true });
  } catch (err) {
    console.error('PUT /api/admin/users/:id error:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Одобрить пользователя (для админа)
app.put('/api/admin/users/:id/approve', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Нельзя одобрить самого себя
    if (parseInt(id) === req.session.userId) {
      return res.status(400).json({ error: 'Нельзя одобрить самого себя' });
    }
    
    await pool.query(
      'UPDATE users SET is_approved = true WHERE id = $1',
      [id]
    );
    
    res.json({ success: true, message: 'Пользователь одобрен' });
  } catch (err) {
    console.error('PUT /api/admin/users/:id/approve error:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Удалить пользователя (для админа)
app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Нельзя удалить самого себя
    if (parseInt(id) === req.session.userId) {
      return res.status(400).json({ error: 'Нельзя удалить самого себя' });
    }
    
    // Удаляем проекты и сообщения пользователя (CASCADE)
    // Сначала получаем проекты пользователя
    const projectsResult = await pool.query(
      'SELECT id FROM projects WHERE user_id = $1',
      [id]
    );
    
    // Удаляем сообщения проектов
    for (const project of projectsResult.rows) {
      await pool.query('DELETE FROM messages WHERE project_id = $1', [project.id]);
    }
    
    // Удаляем проекты
    await pool.query('DELETE FROM projects WHERE user_id = $1', [id]);
    
    // Удаляем вложения
    await pool.query('DELETE FROM attachments WHERE user_id = $1', [id]);
    
    // Удаляем сессии пользователя
    await pool.query('DELETE FROM "session" WHERE sess->>\'userId\' = $1', [id]);
    
    // Удаляем пользователя
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    
    res.json({ success: true, message: 'Пользователь удален' });
  } catch (err) {
    console.error('DELETE /api/admin/users/:id error:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// ========== ИЗМЕНЕНИЕ ПАРОЛЯ ==========

// Изменить собственный пароль
app.put('/api/change-password', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const { currentPassword, newPassword, confirmPassword } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];

    console.log('[DEBUG] Изменение пароля: userId =', userId);
    console.log('[DEBUG] Сессия:', req.session);

    // Проверка обязательных полей
    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ 
        success: false, 
        error: 'Все поля обязательны для заполнения' 
      });
    }

    // Проверка совпадения паролей
    if (newPassword !== confirmPassword) {
      await PasswordManager.logPasswordChange({
        userId,
        ipAddress,
        userAgent,
        success: false,
        errorMessage: 'Новый пароль и подтверждение не совпадают'
      });
      
      return res.status(400).json({ 
        success: false, 
        error: 'Новый пароль и подтверждение не совпадают' 
      });
    }

    // Проверка лимита попыток
    const rateLimit = await PasswordManager.checkRateLimit(userId, ipAddress);
    if (!rateLimit.allowed) {
      return res.status(429).json({ 
        success: false, 
        error: `Слишком много попыток. Попробуйте через ${rateLimit.timeLeft} минут`,
        remainingAttempts: rateLimit.remainingAttempts,
        timeLeft: rateLimit.timeLeft
      });
    }

    // Валидация пароля
    const validation = PasswordManager.validatePassword(newPassword);
    if (!validation.valid) {
      await PasswordManager.incrementAttemptCount(userId, ipAddress);
      await PasswordManager.logPasswordChange({
        userId,
        ipAddress,
        userAgent,
        success: false,
        errorMessage: `Невалидный пароль: ${validation.errors.join(', ')}`
      });
      
      return res.status(400).json({ 
        success: false, 
        error: 'Пароль не соответствует требованиям безопасности',
        validationErrors: validation.errors
      });
    }

    // Проверка текущего пароля
    const isCurrentPasswordValid = await PasswordManager.verifyCurrentPassword(userId, currentPassword);
    if (!isCurrentPasswordValid) {
      await PasswordManager.incrementAttemptCount(userId, ipAddress);
      await PasswordManager.logPasswordChange({
        userId,
        ipAddress,
        userAgent,
        success: false,
        errorMessage: 'Неверный текущий пароль'
      });
      
      return res.status(400).json({ 
        success: false, 
        error: 'Неверный текущий пароль',
        remainingAttempts: rateLimit.remainingAttempts - 1
      });
    }

    // Проверка, что новый пароль не совпадает с текущим
    const isSameAsCurrent = await PasswordManager.checkPreviousPasswords(userId, newPassword);
    if (isSameAsCurrent) {
      await PasswordManager.incrementAttemptCount(userId, ipAddress);
      await PasswordManager.logPasswordChange({
        userId,
        ipAddress,
        userAgent,
        success: false,
        errorMessage: 'Новый пароль совпадает с текущим'
      });
      
      return res.status(400).json({ 
        success: false, 
        error: 'Новый пароль должен отличаться от текущего' 
      });
    }

    // Изменение пароля
    const success = await PasswordManager.changePassword(userId, newPassword);
    if (!success) {
      await PasswordManager.logPasswordChange({
        userId,
        ipAddress,
        userAgent,
        success: false,
        errorMessage: 'Ошибка при изменении пароля в базе данных'
      });
      
      return res.status(500).json({ 
        success: false, 
        error: 'Ошибка при изменении пароля' 
      });
    }

    // Логирование успешного изменения
    await PasswordManager.resetAttemptCount(userId, ipAddress);
    await PasswordManager.logPasswordChange({
      userId,
      ipAddress,
      userAgent,
      success: true
    });

    res.json({ 
      success: true, 
      message: 'Пароль успешно изменен' 
    });

  } catch (error) {
    console.error('PUT /api/change-password error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Внутренняя ошибка сервера' 
    });
  }
});



// Получить информацию о пользователе (для админов)
app.get('/api/admin/users/:id/info', requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const userInfo = await PasswordManager.getUserInfo(userId);
    
    if (!userInfo) {
      return res.status(404).json({ 
        success: false, 
        error: 'Пользователь не найден' 
      });
    }

    res.json({ 
      success: true, 
      user: userInfo 
    });

  } catch (error) {
    console.error('GET /api/admin/users/:id/info error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Внутренняя ошибка сервера' 
    });
  }
});

// Получить все логи изменения паролей (для админов)
app.get('/api/admin/users/password-logs', requireAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    
    const logs = await PasswordManager.getPasswordChangeLogs(null, limit);
    
    res.json({ 
      success: true, 
      logs: logs,
      count: logs.length
    });

  } catch (error) {
    console.error('GET /api/admin/users/password-logs error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Внутренняя ошибка сервера' 
    });
  }
});

// Получить логи изменения пароля пользователя (для админов)
app.get('/api/admin/users/:id/password-logs', requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const limit = parseInt(req.query.limit) || 50;
    
    const logs = await PasswordManager.getPasswordChangeLogs(userId, limit);
    
    res.json({ 
      success: true, 
      logs: logs,
      count: logs.length
    });

  } catch (error) {
    console.error('GET /api/admin/users/:id/password-logs error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Внутренняя ошибка сервера' 
    });
  }
});

// Получить информацию о лимитах попыток изменения пароля
app.get('/api/password-change/rate-limit', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const ipAddress = req.ip || req.connection.remoteAddress;
    
    const rateLimit = await PasswordManager.checkRateLimit(userId, ipAddress);
    
    res.json({ 
      success: true, 
      rateLimit: rateLimit 
    });

  } catch (error) {
    console.error('GET /api/password-change/rate-limit error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Внутренняя ошибка сервера' 
    });
  }
});

// Получить все модели (для админа)
app.get('/api/admin/models', requireAdmin, (req, res) => {
  res.json(AVAILABLE_MODELS);
});

// Добавить модель (для админа)
app.post('/api/admin/models', requireAdmin, (req, res) => {
  try {
    const { id, name } = req.body;
    
    if (!id || !name) {
      return res.status(400).json({ error: 'id и name обязательны' });
    }
    
    // Проверяем, не существует ли модель уже
    if (AVAILABLE_MODELS.some(m => m.id === id)) {
      return res.status(400).json({ error: 'Модель с таким id уже существует' });
    }
    
    AVAILABLE_MODELS.push({ id, name });
    
    res.json({ success: true, models: AVAILABLE_MODELS });
  } catch (err) {
    console.error('POST /api/admin/models error:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Удалить модель (для админа)
app.delete('/api/admin/models/:id', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    
    const index = AVAILABLE_MODELS.findIndex(m => m.id === id);
    
    if (index === -1) {
      return res.status(404).json({ error: 'Модель не найдена' });
    }
    
    AVAILABLE_MODELS.splice(index, 1);
    
    res.json({ success: true, models: AVAILABLE_MODELS });
  } catch (err) {
    console.error('DELETE /api/admin/models/:id error:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Загрузка вложений для проекта
app.post('/projects/:id/attachments', requireAuth, upload.single('file'), async (req, res) => {
  try {
    const projectId = req.params.id;
    const userId = req.session.userId;

    // Проверка наличия файла
    if (!req.file) {
      return res.status(400).json({ error: 'file is required' });
    }

    // Проверка владельца проекта
    const checkResult = await pool.query(
      'SELECT id FROM projects WHERE id = $1 AND user_id = $2',
      [projectId, userId]
    );

    if (checkResult.rows.length === 0) {
      // удалить файл, если загрузили
      try { fs.unlinkSync(req.file.path); } catch (e) {}
      return res.status(404).json({ error: 'Project not found' });
    }

    const insert = await pool.query(
      `INSERT INTO attachments (project_id, user_id, filename, original_name, mime, size, path)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [projectId, userId, req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, req.file.path]
    );

    const row = insert.rows[0];
    // URL для доступа к файлу
    const url = `/uploads/${row.filename}`;

    res.json({ attachment: { id: row.id, filename: row.filename, original_name: row.original_name, mime: row.mime, size: row.size, url, created_at: row.created_at } });
  } catch (err) {
    console.error('POST /projects/:id/attachments error:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Получить список вложений проекта
app.get('/projects/:id/attachments', requireAuth, async (req, res) => {
  try {
    const projectId = req.params.id;
    const userId = req.session.userId;

    const checkResult = await pool.query(
      'SELECT id FROM projects WHERE id = $1 AND user_id = $2',
      [projectId, userId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const result = await pool.query(
      `SELECT id, filename, original_name, mime, size, created_at FROM attachments WHERE project_id = $1 ORDER BY created_at DESC`,
      [projectId]
    );

    const rows = result.rows.map(r => ({ ...r, url: `/uploads/${r.filename}` }));
    res.json(rows);
  } catch (err) {
    console.error('GET /projects/:id/attachments error:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Ассистент
app.post('/assistant', requireAuth, async (req, res) => {
  // Streaming (SSE): если заголовки отдать поздно, браузер часто буферизует
  // и UI получает весь ответ только в конце. Поэтому:
  // - отдаем SSE заголовки + flushHeaders() ДО запроса к модели
  // - шлем начальный байт и keep-alive комментарии
  // - обрабатываем закрытие соединения клиентом
  const abortController = new AbortController();
  let sseStarted = false;
  let pingTimer = null;

  req.on('close', () => {
    try { abortController.abort(); } catch (e) {}
    if (pingTimer) clearInterval(pingTimer);
  });

  try {
    const { projectId, userMessage, model, attachmentIds } = req.body;
    const userId = req.session.userId;

    // Клиенты в проекте исторически ожидали JSON ({ reply }).
    // Поэтому включаем SSE только если клиент ЯВНО этого хочет.
    // Иначе возвращаем обычный JSON-ответ (backward compatible).
    const accepts = String(req.headers?.accept || '');
    const xStreamHeader = req.headers?.['x-stream'] || '';
    const wantsStream =
      accepts.includes('text/event-stream') ||
      String(xStreamHeader) === '1' ||
      String(req.query?.stream || '') === '1';
    
    console.log('[DEBUG] x-stream header:', xStreamHeader, 'wantsStream:', wantsStream);

    // Вложения (опционально)
    const attIds = Array.isArray(attachmentIds)
      ? [...new Set(attachmentIds.map(Number).filter(n => Number.isInteger(n) && n > 0))]
      : [];

    const userMessageText = typeof userMessage === 'string' ? userMessage : '';
    const userMessageTrimmed = userMessageText.trim();

    if (!projectId || (!userMessageTrimmed && attIds.length === 0)) {
      return res.status(400).json({ error: 'projectId и userMessage обязательны' });
    }

    // Проверка владельца проекта
    const projectCheck = await pool.query(
      'SELECT id FROM projects WHERE id = $1 AND user_id = $2',
      [projectId, userId]
    );

    if (projectCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const selectedModel = model || 'openai/gpt-5.2';

    // 0) Вложения (опционально): подмешиваем содержимое текстовых файлов в контекст

    if (attIds.length > 10) {
      return res.status(400).json({ error: 'too_many_attachments', details: 'Максимум 10 вложений за сообщение' });
    }

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

    if (attIds.length) {
      const attRes = await pool.query(
        `SELECT id, filename, original_name, mime, size, path, created_at
         FROM attachments
         WHERE project_id = $1 AND id = ANY($2::int[])
         ORDER BY created_at ASC`,
        [projectId, attIds]
      );

      const MAX_TEXT_BYTES = 2 * 1024 * 1024; // читаем максимум 2MB на файл
      const MAX_TEXT_CHARS = 200_000; // и ограничиваем по символам

      const blocks = [];
      for (const a of attRes.rows) {
        const meta = `${a.original_name || a.filename} (${a.mime || 'unknown'}, ${formatBytes(a.size)})`;
        const url = `/uploads/${a.filename}`;

        if (!a.path || !isProbablyTextFile(a.mime, a.original_name) || (a.size && a.size > MAX_TEXT_BYTES)) {
          blocks.push(
            `Файл: ${meta}\nURL: ${url}\n(Содержимое не подгружено: бинарный/слишком большой файл)`
          );
          continue;
        }

        try {
          let text = fs.readFileSync(a.path, 'utf8');
          if (text.length > MAX_TEXT_CHARS) {
            text = text.slice(0, MAX_TEXT_CHARS) + `\n\n... (обрезано до ${MAX_TEXT_CHARS} символов)`;
          }
          blocks.push(
            `Файл: ${meta}\nURL: ${url}\nСодержимое:\n\n\`\`\`\n${text}\n\`\`\``
          );
        } catch (e) {
          blocks.push(
            `Файл: ${meta}\nURL: ${url}\n(Не удалось прочитать содержимое на сервере: ${e?.message || 'read_error'})`
          );
        }
      }

      if (blocks.length) {
        messages.push({
          role: 'user',
          content:
            'Пользователь приложил файлы. Используй их содержимое как контекст для ответа.\n\n' +
            blocks.join('\n\n---\n\n')
        });
      }
    }

    messages.push(...history.map(m => ({ role: m.role, content: m.content })));

    const finalUserMessage = userMessageTrimmed || 'См. прикрепленные файлы.';
    messages.push({ role: 'user', content: finalUserMessage });

    // 6) Сохраняем пользовательское сообщение
    await pool.query(
      `INSERT INTO messages (project_id, role, content) VALUES ($1, $2, $3)`,
      [projectId, 'user', finalUserMessage]
    );

    // 7) Если нужен SSE — стартуем его ДО запроса к модели
    if (wantsStream) {
      res.status(200);
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      // Если будет прокси (например, Nginx) — не буферизовать.
      res.setHeader('X-Accel-Buffering', 'no');

      // Немедленно отправляем заголовки, чтобы браузер начал читать поток.
      res.flushHeaders();
      sseStarted = true;

      // Стартовый пакет (валидный JSON).
      res.write(`data: ${JSON.stringify({ ready: true })}\n\n`);

      // Keep-alive (валидный JSON).
      pingTimer = setInterval(() => {
        try {
          res.write(`data: ${JSON.stringify({ ping: true })}\n\n`);
        } catch (e) {}
      }, 15000);
    }

    // 8) Запрос в модель (OpenRouter) с потоковой выдачей
    let stream;
    try {
      stream = await openrouter.chat.completions.create(
        {
          model: selectedModel,
          messages,
          stream: true
        },
        {
          signal: abortController.signal
        }
      );
    } catch (e) {
      // На случай, если установленная версия клиента не поддерживает options/signal.
      stream = await openrouter.chat.completions.create({
        model: selectedModel,
        messages,
        stream: true
      });
    }

    let fullReply = '';

    for await (const chunk of stream) {
      const content = chunk?.choices?.[0]?.delta?.content || '';
      if (!content) continue;
      fullReply += content;
      if (wantsStream) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
        // Если включен какой-то middleware, добавляющий flush(), выталкиваем данные.
        if (typeof res.flush === 'function') res.flush();
      }
    }

    // 9) Сохраняем полный ответ ассистента
    await pool.query(
      `INSERT INTO messages (project_id, role, content) VALUES ($1, $2, $3)`,
      [projectId, 'assistant', fullReply]
    );

    if (wantsStream) {
      // Завершаем поток
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } else {
      // Backward compatible: обычный JSON
      res.json({ reply: fullReply });
    }
  } catch (err) {
    console.error('POST /assistant error:', err);
    if (pingTimer) clearInterval(pingTimer);

    // Если SSE уже стартовал — обычный JSON-ответ невозможен.
    if (sseStarted) {
      try {
        res.write(`event: error\ndata: ${JSON.stringify({ error: 'internal_error', details: err?.message })}\n\n`);
        res.end();
      } catch (e) {}
      return;
    }

    res.status(500).json({ error: 'internal_error', details: err?.message });
  } finally {
    if (pingTimer) clearInterval(pingTimer);
  }
});

// ========== RAG ENDPOINTS ==========

// Индексирование текста
app.post('/api/rag/index', requireAuth, async (req, res) => {
  try {
    const { projectId, content, fileName, metadata } = req.body;
    const userId = req.session.userId;

    if (!content) {
      return res.status(400).json({ error: 'content обязателен' });
    }

    const result = await indexText({
      text: content,
      userId,
      projectId: projectId || null,
      fileName: fileName || 'unknown',
      metadata: metadata || {}
    });

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('[RAG] Index text error:', error);
    res.status(500).json({ error: 'internal_error', details: error.message });
  }
});

// Индексирование файла
app.post('/api/rag/index-file', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'file обязателен' });
    }

    const projectId = req.body.projectId ? parseInt(req.body.projectId) : null;
    const userId = req.session.userId;

    const result = await indexFile({
      filePath: req.file.path,
      userId,
      projectId,
      metadata: {
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size
      }
    });

    // Очистка временного файла
    fs.unlinkSync(req.file.path);

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('[RAG] Index file error:', error);
    
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ error: 'internal_error', details: error.message });
  }
});

// Удаление документа из индекса
app.delete('/api/rag/document/:id', requireAuth, async (req, res) => {
  try {
    const documentId = parseInt(req.params.id);
    const userId = req.session.userId;

    const result = await deleteDocument(documentId, userId);

    if (result.success) {
      res.json(result);
    } else {
      res.status(result.error === 'Access denied' ? 403 : 404).json(result);
    }
  } catch (error) {
    console.error('[RAG] Delete error:', error);
    res.status(500).json({ error: 'internal_error', details: error.message });
  }
});

// Поиск по базе знаний
app.get('/api/rag/search', requireAuth, async (req, res) => {
  try {
    const { q, projectId, limit, threshold, useHybrid } = req.query;

    if (!q) {
      return res.status(400).json({ error: 'Query parameter q is required' });
    }

    const searchFn = useHybrid === 'true' ? rag.search.hybridSearch : rag.search.vectorSearch;
    
    const results = await searchFn(q, {
      projectId: projectId ? parseInt(projectId) : null,
      userId: req.session.userId,
      limit: limit ? parseInt(limit) : 5,
      threshold: threshold ? parseFloat(threshold) : 0.7
    });

    res.json({
      success: true,
      query: q,
      results,
      count: results.length
    });
  } catch (error) {
    console.error('[RAG] Search error:', error);
    res.status(500).json({ error: 'internal_error', details: error.message });
  }
});

// Статистика RAG
app.get('/api/rag/stats', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const result = await getStats(userId);
    res.json(result);
  } catch (error) {
    console.error('[RAG] Stats error:', error);
    res.status(500).json({ error: 'internal_error', details: error.message });
  }
});

// ========== RAG ENDPOINTS ==========

// Индексирование текста
app.post('/api/rag/index', requireAuth, async (req, res) => {
  try {
    const { projectId, content, fileName, metadata } = req.body;
    const userId = req.session.userId;

    if (!content) {
      return res.status(400).json({ error: 'content обязателен' });
    }

    const result = await indexText({
      text: content,
      userId,
      projectId: projectId || null,
      fileName: fileName || 'unknown',
      metadata: metadata || {}
    });

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('[RAG] Index text error:', error);
    res.status(500).json({ error: 'internal_error', details: error.message });
  }
});

// Индексирование файла
app.post('/api/rag/index-file', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'file обязателен' });
    }

    const projectId = req.body.projectId ? parseInt(req.body.projectId) : null;
    const userId = req.session.userId;

    const result = await indexFile({
      filePath: req.file.path,
      userId,
      projectId,
      metadata: {
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size
      }
    });

    // Очистка временного файла
    fs.unlinkSync(req.file.path);

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('[RAG] Index file error:', error);
    
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ error: 'internal_error', details: error.message });
  }
});

// Удаление документа из индекса
app.delete('/api/rag/document/:id', requireAuth, async (req, res) => {
  try {
    const documentId = parseInt(req.params.id);
    const userId = req.session.userId;

    const result = await deleteDocument(documentId, userId);

    if (result.success) {
      res.json(result);
    } else {
      res.status(result.error === 'Access denied' ? 403 : 404).json(result);
    }
  } catch (error) {
    console.error('[RAG] Delete error:', error);
    res.status(500).json({ error: 'internal_error', details: error.message });
  }
});

// Поиск по базе знаний
app.get('/api/rag/search', requireAuth, async (req, res) => {
  try {
    const { q, projectId, limit, threshold, useHybrid } = req.query;

    if (!q) {
      return res.status(400).json({ error: 'Query parameter q is required' });
    }

    const searchFn = useHybrid === 'true' ? rag.search.hybridSearch : rag.search.vectorSearch;
    
    const results = await searchFn(q, {
      projectId: projectId ? parseInt(projectId) : null,
      userId: req.session.userId,
      limit: limit ? parseInt(limit) : 5,
      threshold: threshold ? parseFloat(threshold) : 0.7
    });

    res.json({
      success: true,
      query: q,
      results,
      count: results.length
    });
  } catch (error) {
    console.error('[RAG] Search error:', error);
    res.status(500).json({ error: 'internal_error', details: error.message });
  }
});

// Статистика RAG
app.get('/api/rag/stats', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const result = await getStats(userId);
    res.json(result);
  } catch (error) {
    console.error('[RAG] Stats error:', error);
    res.status(500).json({ error: 'internal_error', details: error.message });
  }
});

// ========== OCR ENDPOINT ==========

// Распознавание текста с изображений с автоматической отправкой в AI
app.post('/api/ocr', requireAuth, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Изображение не загружено' });
    }

    // Валидация типа файла
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(req.file.mimetype)) {
      return res.status(400).json({ error: 'Неподдерживаемый формат файла. Поддерживаются: JPEG, PNG, WebP' });
    }

    // Распознавание текста
    const ocrService = require('./services/ocr');
    const recognizedText = await ocrService.recognize(req.file.path);

    // Очистка временного файла
    fs.unlinkSync(req.file.path);

    // Получение ID проекта из запроса или сессии
    const projectId = req.body.projectId || req.session.projectId;
    
    if (!projectId) {
      return res.status(400).json({ error: 'projectId обязателен' });
    }

    // Отправка распознанного текста в AI
    const aiResponse = await processAiRequest({
      text: recognizedText,
      projectId: projectId,
      userId: req.session.userId
    });

    res.json({
      success: true,
      recognizedText: recognizedText,
      aiResponse: aiResponse,
      filename: req.file.originalname
    });
  } catch (error) {
    console.error('OCR Error:', error);
    
    // Очистка файла в случае ошибки
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ error: 'Ошибка распознавания текста: ' + error.message });
  }
});

// Вспомогательная функция для обработки AI запроса
async function processAiRequest({ text, projectId, userId }) {
  try {
    // Получение проекта и system prompt
    const project = await pool.query(
      'SELECT * FROM projects WHERE id = $1',
      [projectId]
    );
    
    if (project.rows.length === 0) {
      throw new Error('Проект не найден');
    }
    
    const projectData = project.rows[0];
    const systemPrompt = projectData.systemPrompt || '';
    const model = projectData.model || 'default';

    // Формирование контекста
    const messages = [];
    
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    // История сообщений проекта
    const history = await pool.query(
      'SELECT content, role FROM messages WHERE project_id = $1 ORDER BY created_at DESC LIMIT 10',
      [projectId]
    );

    // Добавляем последние сообщения в обратном порядке
    history.rows.forEach(msg => {
      messages.push({ role: msg.role, content: msg.content });
    });

    // Добавляем распознанный текст
    messages.push({ role: 'user', content: text });

    // Вызов OpenRouter API
    let stream;
    try {
      stream = await openrouter.chat.completions.create({
        model: model,
        messages: messages,
        stream: false
      });
    } catch (e) {
      // На случай, если установленная версия клиента не поддерживает options/signal.
      stream = await openrouter.chat.completions.create({
        model: model,
        messages: messages,
        stream: false
      });
    }

    const fullReply = stream?.choices?.[0]?.message?.content || '';

    // Сохранение в БД (без user_id, так как этой колонки нет в таблице messages)
    await pool.query(
      `INSERT INTO messages (project_id, role, content)
       VALUES ($1, $2, $3)`,
      [projectId, 'user', text]
    );

    await pool.query(
      `INSERT INTO messages (project_id, role, content)
       VALUES ($1, $2, $3)`,
      [projectId, 'assistant', fullReply]
    );

    return fullReply;
  } catch (error) {
    console.error('AI Processing Error:', error);
    throw new Error('Не удалось обработать запрос в AI: ' + error.message);
  }
}

// Защита админ-панели
app.get('/admin.html', requireAdmin, (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Статика
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname, 'public')));

// Старт сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API started on http://localhost:${PORT}`);
});
