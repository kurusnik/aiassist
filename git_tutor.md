1️⃣ На рабочем компьютере

Проверяешь изменения:

git status

Добавляешь файлы:

git add .

Делаешь коммит:

git commit -m "update"

Отправляешь на GitHub:

git push
2️⃣ Подключаешься к серверу
ssh user@192.168.0.84

или через Putty/MobaXterm.

3️⃣ Переходишь в папку проекта
cd ~/aiassist
4️⃣ Скачиваешь обновления с GitHub
git pull
5️⃣ Пересобираешь контейнер
docker compose up -d --build
✅ Всё.

Проект обновлён.

📌 Вся схема выглядит так
Рабочий комп
     │
git push
     ↓
GitHub
     │
git pull
     ↓
Сервер
     │
docker compose up -d --build
⚡ Супер-лайфхак (1 команда)

На сервере можно просто делать:

cd ~/aiassist && git pull && docker compose up -d --build
