# OCR Функционал - Документация

## 📋 Обзор

Добавлена возможность распознавания текста с изображений (OCR) для AI-ассистента. Пользователи могут загружать скриншоты, фото документов или любые изображения, и система автоматически извлекает текст и отправляет его в AI для обработки.

## 🎯 Возможности

- **Загрузка изображений:** JPEG, PNG, WebP до 10MB
- **Распознавание текста:** русский + английский языки
- **Автоматическая отправка в AI:** распознанный текст сразу отправляется в модель
- **Кэширование:** избегание повторного распознавания одинаковых файлов
- **Обработка ошибок:** graceful degradation при неудачном распознавании

## 🚀 Как использовать

### 1. Загрузка изображения

1. Нажмите кнопку **📷** в области ввода сообщения
2. Выберите изображение (JPEG, PNG, WebP до 10MB)
3. Система автоматически распознает текст
4. Распознанный текст отправляется AI для обработки
5. Получите ответ от ассистента

### 2. Отображение результата

- Распознанный текст и ответ AI отображаются в чате
- Индикатор загрузки показывает прогресс распознавания
- При ошибке отображается сообщение об ошибке

## 🔧 Технические детали

### API Endpoint

**POST** `/api/ocr`

**Headers:**
```
Authorization: Bearer <token>
```

**Body:** `multipart/form-data`
- `image` — файл изображения
- `projectId` — ID проекта

**Response:**
```json
{
  "success": true,
  "recognizedText": "Распознанный текст...",
  "aiResponse": "Ответ AI...",
  "filename": "image.jpg"
}
```

### OCR Service

**Файл:** [`services/ocr.js`](services/ocr.js)

Основные функции:
- `recognize(imagePath, languages)` — распознавание текста
- `getCacheStats()` — статистика кэша
- `cleanupCache()` — очистка устаревших записей

### Поддерживаемые форматы

| Формат | MIME тип | Макс. размер |
|--------|----------|--------------|
| JPEG | image/jpeg | 10MB |
| PNG | image/png | 10MB |
| WebP | image/webp | 10MB |

## 🛠️ Установка

### Зависимости

```bash
npm install tesseract.js
```

### Структура файлов

```
aiassist/
├── services/
│   └── ocr.js              # OCR service модуль
├── public/
│   ├── index.html          # Добавлена кнопка 📷 и индикатор
│   ├── app.js              # Добавлен обработчик загрузки
│   └── styles.css          # Добавлены стили для индикатора
└── index.js                # Добавлен API endpoint /api/ocr
```

## 🔒 Безопасность

### Валидация файлов

- Проверка MIME типа (только изображения)
- Проверка размера (максимум 10MB)
- Проверка заголовка файла (magic bytes)

### Очистка временных файлов

- Файлы удаляются после обработки
- В случае ошибки файлы также удаляются

## 📊 Производительность

### Кэширование

- Результаты распознавания кэшируются в памяти
- TTL кэша: 24 часа
- Очистка кэша: каждые 1 час

### Оптимизации

1. **Кэширование** — одинаковые изображения не распознаются повторно
2. **Асинхронная обработка** — не блокирует основной поток
3. **Очередь задач** — обработка по очереди при высокой нагрузке

## 🧪 Тестирование

### Unit-тесты

```javascript
// tests/ocr.test.js
const { recognize } = require('../services/ocr');

test('recognizes text from image', async () => {
  const result = await recognize('./test-images/sample.jpg');
  expect(result).toContain('тест');
  expect(typeof result).toBe('string');
});

test('caches results', async () => {
  const result1 = await recognize('./test-images/sample.jpg');
  const result2 = await recognize('./test-images/sample.jpg');
  expect(result1).toBe(result2);
});
```

### Integration-тесты

```javascript
// tests/ocr-api.test.js
test('POST /api/ocr returns recognized text and AI response', async () => {
  const response = await request(app)
    .post('/api/ocr')
    .set('Authorization', `Bearer ${testToken}`)
    .attach('image', './test-images/sample.jpg');
  
  expect(response.status).toBe(200);
  expect(response.body.success).toBe(true);
  expect(response.body.recognizedText).toBeDefined();
  expect(response.body.aiResponse).toBeDefined();
});
```

## 📈 Будущие улучшения

1. **Поддержка других языков** — добавить 10+ языков
2. **Предварительная обработка** — улучшение качества изображений
3. **Распознавание таблиц** — структурирование данных
4. **OCR в фоновом режиме** — асинхронные уведомления
5. **Интеграция с Google Vision** — для сложных документов
6. **Batch-обработка** — распознавание нескольких изображений сразу

## 📚 Ресурсы

- [Tesseract.js Documentation](https://tesseract.projectnaptha.com/)
- [Multer Documentation](https://expressjs.com/en/resources/middleware/multer.html)
- [OpenCV.js](https://opencv.org/javascript/) — для предобработки изображений

## 🐛 Известные проблемы

- Распознавание может быть медленным на слабых устройствах (2-5 секунд)
- Точность распознавания зависит от качества изображения
- Сложные документы с таблицами могут распознаваться некорректно

## 📝 Примечания

- Для лучшего результата используйте изображения с высоким контрастом
- Избегайте размытых или тёмных фото
- Для документов держите камеру перпендикулярно
- Убедитесь, что текст хорошо читается

---

**Версия:** 1.0  
**Дата:** 2026-03-18
