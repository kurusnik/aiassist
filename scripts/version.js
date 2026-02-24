#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const semver = require('semver');

console.log('🔄 AI Assistant - Управление версиями');
console.log('================================');

// Проверка package.json
const packagePath = path.join(process.cwd(), 'package.json');
if (!fs.existsSync(packagePath)) {
  console.log('❌ package.json не найден');
  process.exit(1);
}

const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const currentVersion = packageJson.version;

console.log(`✅ Текущая версия: ${currentVersion}`);

// Парсинг версии
const parsedVersion = semver.parse(currentVersion);
if (!parsedVersion) {
  console.log('❌ Некорректный формат версии');
  process.exit(1);
}

// Определение типа обновления
const bumpType = process.argv[2];
let newVersion;

switch (bumpType) {
  case 'major':
    newVersion = semver.inc(currentVersion, 'major');
    break;
  case 'minor':
    newVersion = semver.inc(currentVersion, 'minor');
    break;
  case 'patch':
    newVersion = semver.inc(currentVersion, 'patch');
    break;
  case 'premajor':
    newVersion = semver.inc(currentVersion, 'premajor');
    break;
  case 'preminor':
    newVersion = semver.inc(currentVersion, 'preminor');
    break;
  case 'prepatch':
    newVersion = semver.inc(currentVersion, 'prepatch');
    break;
  case 'prerelease':
    newVersion = semver.inc(currentVersion, 'prerelease');
    break;
  default:
    console.log('ℹ️  Использование: node version.js <type>');
    console.log('<type> может быть: major, minor, patch, premajor, preminor, prepatch, prerelease');
    process.exit(1);
}

console.log(`🔄 Новая версия: ${newVersion}`);

// Обновление package.json
packageJson.version = newVersion;
fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n');

// Создание git тега
console.log('🔖 Создание git тега...');
try {
  require('child_process').execSync(`git tag -a v${newVersion} -m "Version ${newVersion}"`);
  console.log(`✅ Тег v${newVersion} создан`);
} catch (error) {
  console.log('⚠️  Не удалось создать git тег');
}

// Обновление CHANGELOG
console.log('📝 Обновление CHANGELOG...');
try {
  const changelogPath = path.join(process.cwd(), 'CHANGELOG.md');
  if (fs.existsSync(changelogPath)) {
    const changelog = fs.readFileSync(changelogPath, 'utf8');
    const newEntry = `
## [${newVersion}] - ${new Date().toISOString().split('T')[0]}

### Добавлено

- **Новая версия** ${newVersion}
`;
    
    const updatedChangelog = changelog.replace('## [Unreleased]', `## [Unreleased]

${newEntry}

## [Unreleased]`);
    fs.writeFileSync(changelogPath, updatedChangelog);
    console.log('✅ CHANGELOG обновлен');
  }
} catch (error) {
  console.log('⚠️  Не удалось обновить CHANGELOG');
}

// Создание релиза
console.log('📦 Создание релиза...');
try {
  require('child_process').execSync(`npm run build`);
  require('child_process').execSync(`tar -czf ai-assistant-${newVersion}.tar.gz . --exclude=node_modules --exclude=.git --exclude=uploads --exclude=backups`);
  console.log(`✅ Релиз ai-assistant-${newVersion}.tar.gz создан`);
} catch (error) {
  console.log('⚠️  Не удалось создать релиз');
}

console.log('\n🎉 Версия обновлена успешно!');
console.log(`🚀 Новая версия: ${newVersion}`);
console.log('📋 Следующие шаги:');
console.log('1. Протестируйте новую версию');
console.log('2. Обновите документацию');
console.log('3. Опубликуйте релиз');
console.log('4. Обновите production');