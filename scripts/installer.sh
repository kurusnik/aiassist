#!/bin/bash

# AI Assistant Installer
# Автоматическая установка AI Assistant на сервер

echo "AI Assistant Installer"
echo "====================="

# Проверка прав администратора
if [ "$EUID" -ne 0 ]; then 
  echo "❌ Требуются права администратора"
  exit 1
fi

# Проверка системных требований
echo "\n🔍 Проверка системных требований..."

# Проверка Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js не установлен"
    echo "Установка Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    apt-get install -y nodejs
else
    NODE_VERSION=$(node -v)
    echo "✅ Node.js: $NODE_VERSION"
fi

# Проверка Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker не установлен"
    echo "Установка Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh
    systemctl enable docker
    systemctl start docker
else
    DOCKER_VERSION=$(docker --version)
    echo "✅ Docker: $DOCKER_VERSION"
fi

# Проверка Docker Compose
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose не установлен"
    echo "Установка Docker Compose..."
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
else
    COMPOSE_VERSION=$(docker-compose --version)
    echo "✅ Docker Compose: $COMPOSE_VERSION"
fi

# Проверка PostgreSQL
if ! command -v psql &> /dev/null; then
    echo "❌ PostgreSQL не установлен"
    echo "Установка PostgreSQL..."
    apt-get update
    apt-get install -y postgresql postgresql-contrib
    systemctl enable postgresql
    systemctl start postgresql
else
    PG_VERSION=$(psql --version | head -n 1)
    echo "✅ PostgreSQL: $PG_VERSION"
fi

echo "\n✅ Системные требования установлены"

# Клонирование репозитория
echo "\n📦 Клонирование репозитория..."
if [ -d "ai-assistant" ]; then
    echo "⚠️  Директория ai-assistant уже существует"
    read -p "Перезаписать? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm -rf ai-assistant
    else
        echo "❌ Установка отменена"
        exit 1
    fi
fi

git clone https://github.com/your-repo/ai-assistant.git
cd ai-assistant

echo "\n✅ Репозиторий клонирован"

# Установка зависимостей
echo "\n📦 Установка зависимостей..."
npm ci --only=production

echo "\n✅ Зависимости установлены"

# Настройка базы данных
echo "\n🗄️  Настройка базы данных..."

# Создание пользователя и базы данных
DB_USER="ai_user"
DB_PASSWORD="$(openssl rand -base64 32)"
DB_NAME="ai_assistant"

# Создаем пользователя
sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';"

# Создаем базу данных
sudo -u postgres psql -c "CREATE DATABASE $DB_NAME;"

# Предоставляем права
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"

echo "✅ База данных настроена"

# Настройка переменных окружения
echo "\n📝 Настройка переменных окружения..."

# Создаем .env файл
cat > .env << EOF
NODE_ENV=production
DATABASE_URL=postgresql://$DB_USER:$DB_PASSWORD@localhost:5432/$DB_NAME
SESSION_SECRET=$(openssl rand -hex 32)
OPENROUTER_API_KEY=your_openrouter_api_key_here
PORT=3000
EOF

echo "✅ Переменные окружения настроены"

# Применение миграций
echo "\n🔄 Применение миграций..."
npm run migrate

echo "\n✅ Миграции применены"

# Сборка проекта
echo "\n📦 Сборка проекта..."
npm run build

echo "\n✅ Проект собран"

# Запуск сервиса
echo "\n🚀 Запуск сервиса..."
docker-compose up -d

echo "\n⏳ Ожидание запуска сервиса..."
sleep 30

# Проверка работоспособности
echo "\n🧪 Проверка работоспособности..."
if curl -f http://localhost:3000/health > /dev/null 2>&1; then
    echo "✅ Сервис запущен и отвечает"
else
    echo "⚠️  Сервис запущен, но health check не прошел"
fi

# Создание сервиса systemd
echo "\n🔧 Создание сервиса systemd..."
cat > /etc/systemd/system/ai-assistant.service << EOF
[Unit]
Description=AI Assistant Service
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$(pwd)
ExecStart=/usr/bin/docker-compose up -d
ExecStop=/usr/bin/docker-compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable ai-assistant
systemctl start ai-assistant

echo "✅ Сервис systemd создан"

# Создание backup стратегии
echo "\n💾 Создание backup стратегии..."

# Создаем cron задачу для backup
cat > /etc/cron.d/ai-assistant-backup << EOF
# AI Assistant Backup
0 2 * * * root cd $(pwd) && npm run backup
EOF

echo "✅ Backup стратегия настроена"

# Настройка firewall
echo "\n🔒 Настройка firewall..."

# Разрешаем порт 3000
ufw allow 3000/tcp

echo "✅ Firewall настроен"

# Установка завершена
echo "\n🎉 Установка завершена успешно!"
echo "🚀 AI Assistant запущен на http://$(hostname -I | awk '{print $1}'):3000"
echo "\n📋 Следующие шаги:"
echo "1. Откройте http://$(hostname -I | awk '{print $1}'):3000 в браузере"
echo "2. Настройте SSL сертификаты"
echo "3. Настройте мониторинг"
echo "4. Настройте уведомления"
echo "5. Создайте учетную запись администратора"

# Показываем пароль от базы данных
echo "\n🔑 Информация о базе данных:"
echo "Пользователь: $DB_USER"
echo "Пароль: $DB_PASSWORD"
echo "База данных: $DB_NAME"
echo "Хост: localhost"
echo "Порт: 5432"

echo "\nℹ️  Сохраните эту информацию в безопасном месте"

echo "\n✅ Установка завершена!"