🚀 Шаг 1 — Зайти в папку проекта

На сервере или на своём компе (где изменения):

cd путь_к_проекту

Проверим статус:

git status
🚀 Шаг 2 — Проверить что .env НЕ попадёт в репозиторий

Очень важно.

Проверь:

cat .gitignore

Там должно быть:

.env
node_modules
logs
uploads

Если .env нет — добавь:

echo ".env" >> .gitignore

И закоммить сначала его.

🚀 Шаг 3 — Добавить изменения

Если всё ок:

git add .
🚀 Шаг 4 — Коммит
git commit -m "prod deploy: working version with docker + nginx"
🚀 Шаг 5 — Проверить ветку
git branch

Если ты в main:

git push origin main

Если master:

git push origin master
🔎 Если ошибка “no upstream branch”

Тогда:

git push -u origin main
🧠 Маленький совет прод-уровня

Лучше сделать:

git add docker-compose.yml
git add nginx.conf
git add src/

А не git add . вслепую.