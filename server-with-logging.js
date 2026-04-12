// server-with-logging.js
// Основной сервер с логированием маршрутов

require('dotenv').config();
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcrypt');
const path = require('path');
const pool = require('./db');
const openrouter = require('./openrouter');
const { requireAuth, requireAdmin } = require('./middleware/auth');
const PasswordManager = require('./services/passwordManager');
const multer = require('multer');
const fs = require('fs');

const app = express();
app.use(express.json());

// Логирование всех запросов
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// Копируем настройки из оригинального index.js
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

const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// Импортируем основные эндпоинты из index.js
// Здесь я просто скопирую минимальный набор для тестирования

// Проверка работы сервера
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Тестовый эндпоинт для проверки маршрутов
app.get('/api/test-routes', (req, res) => {
  const routes = [
    'PUT /api/change-password',
    'PUT /api/admin/users/:id/change-password',
    'GET /api/admin/users/password-logs',
    'GET /api/admin/users/:id/password-logs',
    'GET /api/password-change/rate-limit'
  ];
  res.json({ routes });
});

// Копируем ключевые эндпоинты изменения пароля из index.js

// Изменить собственный пароль (упрощенная версия)
app.put('/api/change-password', requireAuth, async (req, res) => {
  console.log('[ROUTE] PUT /api/change-password вызван');
  try {
    const userId = req.session.userId;
    const { currentPassword, newPassword, confirmPassword } = req.body;
    
    console.log('[ROUTE] userId:', userId);
    console.log('[ROUTE] body:', req.body);

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ 
        success: false, 
        error: 'Все поля обязательны для заполнения' 
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ 
        success: false, 
        error: 'Новый пароль и подтверждение не совпадают' 
      });
    }

    const validation = PasswordManager.validatePassword(newPassword);
    if (!validation.valid) {
      return res.status(400).json({ 
        success: false, 
        error: 'Пароль не соответствует требованиям безопасности',
        validationErrors: validation.errors
      });
    }

    const isCurrentPasswordValid = await PasswordManager.verifyCurrentPassword(userId, currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({ 
        success: false, 
        error: 'Неверный текущий пароль'
      });
    }

    const success = await PasswordManager.changePassword(userId, newPassword);
    
    if (!success) {
      return res.status(500).json({ 
        success: false, 
        error: 'Ошибка при изменении пароля' 
      });
    }

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

// Изменить пароль другого пользователя (для админов)
app.put('/api/admin/users/:id/change-password', requireAdmin, async (req, res) => {
  console.log('[ROUTE] PUT /api/admin/users/:id/change-password вызван');
  console.log('[ROUTE] Параметры:', req.params);
  console.log('[ROUTE] Тело:', req.body);
  
  try {
    const targetUserId = parseInt(req.params.id);
    const adminUserId = req.session.userId;
    const { newPassword, confirmPassword } = req.body;

    if (targetUserId === adminUserId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Для изменения собственного пароля используйте /api/change-password' 
      });
    }

    if (!newPassword || !confirmPassword) {
      return res.status(400).json({ 
        success: false, 
        error: 'Новый пароль и подтверждение обязательны' 
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ 
        success: false, 
        error: 'Новый пароль и подтверждение не совпадают' 
      });
    }

    const validation = PasswordManager.validatePassword(newPassword);
    if (!validation.valid) {
      return res.status(400).json({ 
        success: false, 
        error: 'Пароль не соответствует требованиям безопасности',
        validationErrors: validation.errors
      });
    }

    const success = await PasswordManager.changePassword(targetUserId, newPassword, adminUserId);
    
    if (!success) {
      return res.status(500).json({ 
        success: false, 
        error: 'Ошибка при изменении пароля' 
      });
    }

    res.json({ 
      success: true, 
      message: 'Пароль успешно изменен администратором' 
    });

  } catch (error) {
    console.error('PUT /api/admin/users/:id/change-password error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Внутренняя ошибка сервера' 
    });
  }
});

// Статика
app.use(express.static(path.join(__dirname, 'public')));

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Сервер запущен на http://localhost:${PORT}`);
  console.log('Доступные маршруты:');
  console.log('  GET  /health - проверка работы сервера');
  console.log('  GET  /api/test-routes - список маршрутов');
  console.log('  PUT  /api/change-password - изменение пароля');
  console.log('  PUT  /api/admin/users/:id/change-password - изменение пароля (админ)');
});