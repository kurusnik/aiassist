# Этап 1: Загрузка модели
FROM node:18-slim AS model-stage
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
RUN mkdir -p .cache/transformers && timeout 600 node scripts/preload-model.mjs || echo "Preload completed or timed out"

# Этап 2: Основной образ
FROM node:18-slim AS stage-1

# Установка системных зависимостей
RUN apt-get update && apt-get install -y --no-install-recommends curl postgresql-client ca-certificates && rm -rf /var/lib/apt/lists/*

# Создание директорий
WORKDIR /app

# Копируем package.json и package-lock.json
COPY package*.json ./

# Установка зависимостей
RUN npm install --omit=dev

# Копируем кэш модели из предыдущего этапа
COPY --from=model-stage /app/.cache/transformers /app/.cache/transformers

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
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 CMD curl -f http://localhost:3000/health || exit 1

# Запуск приложения
CMD ["node", "index.js"]
