# Руководство по развертыванию AI Assistant

## Содержание

1. [Требования](#требования)
2. [Быстрое развертывание](#быстрое-развертывание)
3. [Ручная установка](#ручная-установка)
4. [Конфигурация](#конфигурация)
5. [Обновление](#обновление)
6. [Backup и восстановление](#backup-и-восстановление)
7. [Мониторинг](#мониторинг)
8. [Безопасность](#безопасность)
9. [Устранение неполадок](#устранение-неполадок)

## Требования

### Системные требования

- **Операционная система:** Linux (рекомендуется Ubuntu 20.04+)
- **Память:** 2GB RAM (рекомендуется 4GB+)
- **Диск:** 10GB свободного места
- **Сеть:** Порт 80, 443, 5432

### Программное обеспечение

- **Node.js** 18+
- **Docker** 20+
- **Docker Compose** 2+
- **PostgreSQL** 12+
- **Nginx** (опционально)

### Браузеры

- **Chrome** 90+
- **Firefox** 88+
- **Safari** 14+
- **Edge** 90+

## Быстрое развертывание

### 1. Клонирование репозитория

```bash
git clone https://github.com/your-repo/ai-assistant.git
cd ai-assistant
```

### 2. Установка зависимостей

```bash
npm ci --only=production
```

### 3. Настройка базы данных

```bash
# Создание базы данных
sudo -u postgres psql -c "CREATE DATABASE ai_assistant;"
sudo -u postgres psql -c "CREATE USER ai_user WITH PASSWORD 'secure_password';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ai_assistant TO ai_user;"
```

### 4. Конфигурация

```bash
# Создание .env файла
cp .env.example .env
nano .env
```

### 5. Запуск

```bash
# Сборка и запуск
docker-compose up -d

# Или ручной запуск
npm run start
```

## Ручная установка

### 1. Установка зависимостей

```bash
# Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# PostgreSQL
sudo apt-get install -y postgresql postgresql-contrib

# Docker
sudo apt-get install -y docker.io docker-compose
```

### 2. Создание пользователя

```bash
# Создаем пользователя для приложения
sudo useradd -m -s /bin/bash ai-assistant
sudo usermod -aG docker ai-assistant
```

### 3. Установка приложения

```bash
# Клонируем репозиторий
sudo -u ai-assistant git clone https://github.com/your-repo/ai-assistant.git /opt/ai-assistant
cd /opt/ai-assistant

# Устанавливаем зависимости
sudo -u ai-assistant npm ci --only=production

# Настраиваем права доступа
sudo chown -R ai-assistant:ai-assistant /opt/ai-assistant
```

### 4. Настройка systemd

```bash
# Создаем сервис
cat > /etc/systemd/system/ai-assistant.service << EOF
[Unit]
Description=AI Assistant Service
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/ai-assistant
ExecStart=/usr/bin/docker-compose up -d
ExecStop=/usr/bin/docker-compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable ai-assistant
sudo systemctl start ai-assistant
```

## Конфигурация

### Переменные окружения

```env
# Базовая конфигурация
NODE_ENV=production
PORT=3000

# База данных
DATABASE_URL=postgresql://ai_user:password@localhost:5432/ai_assistant

# Сессии
SESSION_SECRET=your_random_secret_key

# OpenRouter API
OPENROUTER_API_KEY=your_openrouter_api_key

# Безопасность
JWT_SECRET=your_jwt_secret

# Логирование
LOG_LEVEL=info
LOG_FILE=/var/log/ai-assistant.log

# Максимальный размер файла
MAX_FILE_SIZE=10485760

# Rate limiting
RATE_LIMIT_WINDOW=900000
RATE_LIMIT_MAX=100
```

### Конфигурация Nginx

```nginx
# Файл: /etc/nginx/sites-available/ai-assistant

server {
    listen 80;
    server_name your-domain.com;
    
    # SSL (рекомендуется)
    # listen 443 ssl http2;
    # ssl_certificate /path/to/cert.pem;
    # ssl_certificate_key /path/to/key.pem;
    
    # Проксирование
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # WebSocket
    location /ws/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## Обновление

### Автоматическое обновление

```bash
# Запуск обновления
cd /opt/ai-assistant
npm run update
```

### Ручное обновление

```bash
# Получение обновлений
git pull origin main

# Установка зависимостей
npm ci --only=production

# Миграция базы данных
npm run migrate

# Перезапуск сервиса
sudo systemctl restart ai-assistant
```

### Обновление версии

```bash
# Увеличение версии
cd /opt/ai-assistant
npm run version minor

# Создание релиза
npm run build
```

## Backup и восстановление

### Создание backup

```bash
# Автоматический backup
npm run backup

# Ручной backup
./scripts/backup.js
```

### Восстановление из backup

```bash
# Остановка сервиса
sudo systemctl stop ai-assistant

# Восстановление базы данных
psql -d ai_assistant < backups/backup-2024-01-01.sql

# Восстановление файлов
cp -r backups/files-backup-2024-01-01 uploads/

# Запуск сервиса
sudo systemctl start ai-assistant
```

### Автоматический backup

```bash
# Добавляем в cron
crontab -e

# Добавляем строку:
0 2 * * * cd /opt/ai-assistant && npm run backup
```

## Мониторинг

### Health check

```bash
# Проверка работоспособности
curl http://localhost:3000/health

# Ожидаемый ответ
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 3600
}
```

### Логи

```bash
# Просмотр логов
sudo journalctl -u ai-assistant -f

# Логи приложения
tail -f /var/log/ai-assistant.log

# Логи Docker
docker-compose logs -f app
```

### Метрики

```bash
# Проверка метрик
curl http://localhost:3000/metrics

# Пример метрик
{
  "memory": {
    "rss": 123456789,
    "heapUsed": 23456789,
    "heapTotal": 34567890
  },
  "uptime": 3600,
  "requests": 1234,
  "errors": 12
}
```

## Безопасность

### Firewall

```bash
# Разрешаем необходимые порты
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 5432/tcp

# Запрещаем остальные
ufw default deny incoming
ufw default allow outgoing
```

### SSL сертификаты

```bash
# Установка certbot
sudo apt-get install -y certbot python3-certbot-nginx

# Получение сертификата
certbot --nginx -d your-domain.com

# Автоматическое обновление
certbot renew --dry-run
```

### Security headers

```nginx
# Добавляем в конфигурацию Nginx
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
```

## Устранение неполадок

### Частые проблемы

#### 1. Ошибка подключения к базе данных

```bash
# Проверка подключения
psql -h localhost -U ai_user -d ai_assistant

# Если ошибка, проверьте:
# - Пользователь существует
# - База данных создана
# - Пароль правильный
```

#### 2. Docker не запускается

```bash
# Проверка статуса
systemctl status docker

# Перезапуск
systemctl restart docker

# Проверка логов
journalctl -u docker -f
```

#### 3. Приложение не запускается

```bash
# Проверка логов
docker-compose logs app

# Проверка конфигурации
cat .env

# Проверка портов
netstat -tlnp | grep 3000
```

#### 4. Ошибка миграций

```bash
# Просмотр миграций
ls migrations/

# Ручное выполнение
psql -d ai_assistant -f migrations/000_initial_schema.sql

# Проверка схемы
psql -d ai_assistant -c "\dt"
```

### Полезные команды

```bash
# Перезапуск сервиса
sudo systemctl restart ai-assistant

# Просмотр статуса
sudo systemctl status ai-assistant

# Просмотр логов
sudo journalctl -u ai-assistant -f

# Проверка Docker контейнеров
docker-compose ps

# Просмотр метрик
curl http://localhost:3000/health
curl http://localhost:3000/metrics
```

## Поддержка

### Получение помощи

- **GitHub Issues:** https://github.com/your-repo/ai-assistant/issues
- **Discord:** https://discord.gg/your-server
- **Email:** support@your-domain.com

### Сообщество

- **GitHub Discussions:** https://github.com/your-repo/ai-assistant/discussions
- **Stack Overflow:** тег `ai-assistant`
- **Reddit:** r/ai_assistant

## Лицензия

Этот проект распространяется под лицензией ISC. Подробности в файле LICENSE.