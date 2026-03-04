// middleware/auth.js
const pool = require('../db');

// Проверка авторизации и одобрения пользователя
async function requireAuth(req, res, next) {
  // DEBUG: логируем заголовки для /assistant
  if (req.path === '/assistant') {
    console.log('[AUTH DEBUG] /assistant headers:', JSON.stringify(req.headers));
    console.log('[AUTH DEBUG] x-stream:', req.headers['x-stream']);
  }
  
  if (req.session && req.session.userId) {
    // Проверяем, одобрен ли пользователь
    try {
      const userResult = await pool.query(
        'SELECT is_approved, is_admin FROM users WHERE id = $1',
        [req.session.userId]
      );
      
      if (userResult.rows.length === 0) {
        // Пользователь не найден в базе данных
        req.session.destroy();
        return res.status(401).json({ error: 'unauthorized', message: 'Пользователь не найден' });
      }
      
      const user = userResult.rows[0];
      
      // Проверка одобрения пользователя
      if (!user.is_approved) {
        // Для API запросов возвращаем JSON
        if (req.path.startsWith('/api') || req.xhr || req.headers.accept?.includes('application/json')) {
          return res.status(403).json({ error: 'not_approved', message: 'Ваш аккаунт ожидает одобрения администратора' });
        }
        // Для обычных запросов показываем сообщение
        return res.status(403).send('<html><body><h1>Доступ запрещен</h1><p>Ваш аккаунт ожидает одобрения администратора.</p></body></html>');
      }
      
      // Добавляем информацию о пользователе в запрос
      req.session.isAdmin = user.is_admin;
      
    } catch (err) {
      console.error('[AUTH DEBUG] Error checking user approval:', err);
      return res.status(500).json({ error: 'internal_error', message: 'Ошибка проверки статуса пользователя' });
    }
    
    return next();
  }
  
  // Для API запросов возвращаем JSON
  if (req.path.startsWith('/api') || req.xhr || req.headers.accept?.includes('application/json')) {
    return res.status(401).json({ error: 'unauthorized', message: 'Требуется авторизация' });
  }
  
  // Для обычных запросов редирект на логин
  res.redirect('/login.html');
}

// Проверка прав администратора
async function requireAdmin(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'unauthorized', message: 'Требуется авторизация' });
  }
  
  try {
    const userResult = await pool.query(
      'SELECT is_admin FROM users WHERE id = $1',
      [req.session.userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'unauthorized', message: 'Пользователь не найден' });
    }
    
    if (!userResult.rows[0].is_admin) {
      return res.status(403).json({ error: 'forbidden', message: 'Доступ запрещен. Требуются права администратора' });
    }
    
    next();
  } catch (err) {
    console.error('[ADMIN DEBUG] Error checking admin status:', err);
    res.status(500).json({ error: 'internal_error', message: 'Ошибка проверки прав администратора' });
  }
}

module.exports = { requireAuth, requireAdmin };
