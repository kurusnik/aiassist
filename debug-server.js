// debug-server.js
// Сервер с подробным логированием для отладки

require('dotenv').config();
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcrypt');
const path = require('path');
const pool = require('./db');
const PasswordManager = require('./services/passwordManager');
const { requireAuth, requireAdmin } = require('./middleware/auth');

const app = express();
app.use(express.json());

// Middleware для логирования всех запросов
app.use((req, res, next) => {
  const start = Date.now();
  const originalUrl = req.originalUrl;
  const method = req.method;
  
  console.log(`[${new Date().toISOString()}] ${method} ${originalUrl}`);
  console.log('  Headers:', JSON.stringify(req.headers, null, 2));
  console.log('  Body:', req.body ? JSON.stringify(req.body, null, 2) : '{}');
  console.log('  Session:', req.session ? JSON.stringify(req.session, null, 2) : 'no session');
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${method} ${originalUrl} -> ${res.statusCode} (${duration}ms)`);
    console.log('---');
  });
  
  next();
});

// Тестовый эндпоинт для проверки
app.get('/debug/test', (req, res) => {
  res.json({ 
    message: 'Сервер работает',
    time: new Date().toISOString(),
    session: req.session
  });
});

// Эндпоинт изменения пароля с подробным логированием
app.put('/api/change-password', requireAuth, async (req, res) => {
  try {
    console.log('[DEBUG-PASSWORD] Начало изменения пароля');
    console.log('[DEBUG-PASSWORD] userId из сессии:', req.session.userId);
    console.log('[DEBUG-PASSWORD] Тело запроса:', req.body);
    
    const userId = req.session.userId;
    const { currentPassword, newPassword, confirmPassword } = req.body;
    
    if (!currentPassword || !newPassword || !confirmPassword) {
      console.log('[DEBUG-PASSWORD] Ошибка: не все поля заполнены');
      return res.status(400).json({ 
        success: false, 
        error: 'Все поля обязательны для заполнения' 
      });
    }
    
    if (newPassword !== confirmPassword) {
      console.log('[DEBUG-PASSWORD] Ошибка: пароли не совпадают');
      return res.status(400).json({ 
        success: false, 
        error: 'Новый пароль и подтверждение не совпадают' 
      });
    }
    
    console.log('[DEBUG-PASSWORD] Вызов PasswordManager.validatePassword');
    const validation = PasswordManager.validatePassword(newPassword);
    console.log('[DEBUG-PASSWORD] Результат валидации:', validation);
    
    if (!validation.valid) {
      return res.status(400).json({ 
        success: false, 
        error: 'Пароль не соответствует требованиям безопасности',
        validationErrors: validation.errors
      });
    }
    
    console.log('[DEBUG-PASSWORD] Вызов PasswordManager.verifyCurrentPassword');
    const isCurrentPasswordValid = await PasswordManager.verifyCurrentPassword(userId, currentPassword);
    console.log('[DEBUG-PASSWORD] Текущий пароль верен:', isCurrentPasswordValid);
    
    if (!isCurrentPasswordValid) {
      return res.status(400).json({ 
        success: false, 
        error: 'Неверный текущий пароль'
      });
    }
    
    console.log('[DEBUG-PASSWORD] Вызов PasswordManager.changePassword');
    const success = await PasswordManager.changePassword(userId, newPassword);
    console.log('[DEBUG-PASSWORD] Результат изменения пароля:', success);
    
    if (!success) {
      return res.status(500).json({ 
        success: false, 
        error: 'Ошибка при изменении пароля' 
      });
    }
    
    console.log('[DEBUG-PASSWORD] Пароль успешно изменен');
    res.json({ 
      success: true, 
      message: 'Пароль успешно изменен' 
    });

  } catch (error) {
    console.error('[DEBUG-PASSWORD] Ошибка:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Внутренняя ошибка сервера' 
    });
  }
});

// Упрощенный эндпоинт для изменения пароля пользователя администратором
app.put('/api/admin/users/:id/change-password', requireAdmin, async (req, res) => {
  try {
    console.log('[DEBUG-ADMIN-PASSWORD] Начало изменения пароля администратором');
    console.log('[DEBUG-ADMIN-PASSWORD] Параметры запроса:', req.params);
    console.log('[DEBUG-ADMIN-PASSWORD] Тело запроса:', req.body);
    
    const targetUserId = parseInt(req.params.id);
    const adminUserId = req.session.userId;
    const { newPassword, confirmPassword } = req.body;
    
    console.log('[DEBUG-ADMIN-PASSWORD] targetUserId:', targetUserId);
    console.log('[DEBUG-ADMIN-PASSWORD] adminUserId:', adminUserId);
    
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
    console.error('[DEBUG-ADMIN-PASSWORD] Ошибка:', error);
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
  console.log(`[DEBUG-SERVER] Сервер запущен на http://localhost:${PORT}`);
  console.log(`[DEBUG-SERVER] Доступные эндпоинты:`);
  console.log(`  GET  /debug/test - тестовый эндпоинт`);
  console.log(`  PUT  /api/change-password - изменение собственного пароля`);
  console.log(`  PUT  /api/admin/users/:id/change-password - изменение пароля пользователя (админ)`);
});