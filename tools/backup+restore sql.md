Перед любым крупным рефакторингом:

1. git status
2. git commit
3. .\tools\backup.ps1

После аварии:

1. docker compose stop app
2. .\tools\restore.ps1
3. docker compose up -d app