param(
    [string]$Backup = "backups\db\latest.sql"
)

Write-Host ""
Write-Host "Stopping app..."
docker compose stop app

Write-Host ""
Write-Host "Cleaning database..."
docker exec -i aiassist-db-1 `
psql -U ai_user -d ai_assistant `
-c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

Write-Host ""
Write-Host "Restoring..."

Get-Content $Backup |
docker compose exec -T db psql -U ai_user ai_assistant

Write-Host ""
Write-Host "Starting app..."
docker compose up -d app

Write-Host ""
Write-Host "Done."