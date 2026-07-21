$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"

New-Item -ItemType Directory -Force backups\db | Out-Null

docker compose exec -T db pg_dump -U ai_user ai_assistant `
| Out-File "backups\db\backup-$timestamp.sql" -Encoding utf8

Copy-Item "backups\db\backup-$timestamp.sql" `
          "backups\db\latest.sql"

Write-Host ""
Write-Host "✅ Backup completed"
Write-Host "backups\db\backup-$timestamp.sql"