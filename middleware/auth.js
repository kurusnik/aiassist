// middleware/auth.js
function requireAuth(req, res, next) {
  // DEBUG: логируем заголовки для /assistant
  if (req.path === '/assistant') {
    console.log('[AUTH DEBUG] /assistant headers:', JSON.stringify(req.headers));
    console.log('[AUTH DEBUG] x-stream:', req.headers['x-stream']);
  }
  
  if (req.session && req.session.userId) {
    return next();
  }
  
  // Для API запросов возвращаем JSON
  if (req.path.startsWith('/api') || req.xhr || req.headers.accept?.includes('application/json')) {
    return res.status(401).json({ error: 'unauthorized', message: 'Требуется авторизация' });
  }
  
  // Для обычных запросов редирект на логин
  res.redirect('/login.html');
}

module.exports = { requireAuth };
