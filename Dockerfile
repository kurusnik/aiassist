FROM node:18-slim

# Установка системных зависимостей
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    postgresql-client \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Создание директорий
WORKDIR /app

# Копируем package.json и package-lock.json
COPY package*.json ./

# Установка зависимостей
RUN npm install --omit=dev && npm cache clean --force

# Копируем исходный код
COPY . .

# Создаем директории для логов и загрузок
RUN mkdir -p uploads logs

# Устанавливаем права доступа
RUN chown -R node:node /app
USER node

# Предзагрузка модели эмбеддингов в кэш (от имени node)
RUN node scripts/preload-model.mjs 2>&1 || echo "Preload skipped"

# Открываем порт
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Запуск приложения
CMD ["node", "index.js"]