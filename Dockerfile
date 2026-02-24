FROM node:18-alpine

# Установка системных зависимостей
RUN apk add --no-cache \
    curl \
    postgresql-client \
    && rm -rf /var/cache/apk/*

# Создание директорий
WORKDIR /app

# Копируем package.json и package-lock.json
COPY package*.json ./

# Установка зависимостей
RUN npm ci --only=production && npm cache clean --force

# Копируем исходный код
COPY . .

# Создаем директории для логов и загрузок
RUN mkdir -p uploads logs

# Устанавливаем права доступа
RUN chown -R node:node /app
USER node

# Открываем порт
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Запуск приложения
CMD ["node", "index.js"]