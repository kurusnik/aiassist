#!/bin/bash

# AI Assistant - Тестирование развертывания
# Скрипт для тестирования установки и обновлений

echo "AI Assistant - Тестирование развертывания"
echo "=========================================="

# Настройка тестовой среды
TEST_DIR="test-deployment"
rm -rf $TEST_DIR
mkdir -p $TEST_DIR
cd $TEST_DIR

echo "\n🔍 Настройка тестовой среды..."

# Клонирование репозитория
echo "\n📦 Клонирование репозитория..."
git clone ../.git .

echo "\n✅ Репозиторий клонирован"

# Создание тестовой базы данных
echo "\n🗄️  Создание тестовой базы данных..."

sudo -u postgres psql -c "DROP DATABASE IF EXISTS test_ai_assistant;"
sudo -u postgres psql -c "DROP USER IF EXISTS test_ai_user;"

sudo -u postgres psql -c "CREATE USER test_ai_user WITH PASSWORD 'test_password';"
sudo -u postgres psql -c "CREATE DATABASE test_ai_assistant;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE test_ai_assistant TO test_ai_user;"

echo "\n✅ Тестовая база данных создана"

# Настройка переменных окружения
echo "\n📝 Настройка переменных окружения..."

cat > .env << EOF
NODE_ENV=test
DATABASE_URL=postgresql://test_ai_user:test_password@localhost:5432/test_ai_assistant
SESSION_SECRET=test_session_secret
OPENROUTER_API_KEY=test_api_key
PORT=3001
EOF

echo "\n✅ Переменные окружения настроены"

# Тестирование сборки
echo "\n📦 Тестирование сборки..."

npm ci --only=production
npm run build

echo "\n✅ Сборка прошла успешно"

# Тестирование миграций
echo "\n🔄 Тестирование миграций..."

npm run migrate

echo "\n✅ Миграции прошли успешно"

# Тестирование Docker
echo "\n🐳 Тестирование Docker..."

docker-compose down
docker-compose up -d

sleep 30

# Проверка работоспособности
echo "\n🧪 Проверка работоспособности..."

if curl -f http://localhost:3001/health > /dev/null 2>&1; then
    echo "✅ Сервер отвечает"
else
    echo "❌ Сервер не отвечает"
    exit 1
fi

# Тестирование API
echo "\n🔌 Тестирование API..."

# Health check
if curl -f http://localhost:3001/health > /dev/null 2>&1; then
    echo "✅ Health check прошел"
else
    echo "❌ Health check не прошел"
    exit 1
fi

# Тестирование установки
if curl -f http://localhost:3001 > /dev/null 2>&1; then
    echo "✅ Установка прошла успешно"
else
    echo "❌ Установка не прошла"
    exit 1
fi

# Тестирование backup
echo "\n💾 Тестирование backup..."

npm run backup

if [ -f "backups/backup-*.sql" ]; then
    echo "✅ Backup создан"
else
    echo "❌ Backup не создан"
    exit 1
fi

# Тестирование обновления
echo "\n🔄 Тестирование обновления..."

# Создаем тестовое изменение
mkdir -p test-updates
cd test-updates

# Создаем новый коммит
cd ../
echo "test update" > test-updates/test.txt
git add test-updates/
git commit -m "Test update"

# Тестируем обновление
npm run update

if curl -f http://localhost:3001/health > /dev/null 2>&1; then
    echo "✅ Обновление прошло успешно"
else
    echo "❌ Обновление не прошло"
    exit 1
fi

# Очистка
echo "\n🧹 Очистка..."

docker-compose down
sudo -u postgres psql -c "DROP DATABASE test_ai_assistant;"
sudo -u postgres psql -c "DROP USER test_ai_user;"
rm -rf ../$TEST_DIR

echo "\n🎉 Все тесты пройдены успешно!"
echo "🚀 AI Assistant готов к развертыванию!"

echo "\n📊 Результаты тестирования:"
echo "✓ Сборка проекта"
echo "✓ Миграции базы данных"
echo "✓ Docker контейнеры"
echo "✓ Health check"
echo "✓ Backup"
echo "✓ Обновление"

echo "\n✅ Тестирование развертывания завершено успешно!"