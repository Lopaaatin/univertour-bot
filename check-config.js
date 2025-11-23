require('dotenv').config();
const fs = require('fs');

console.log('🔍 Проверка конфигурации...\n');

// Проверка переменных окружения
const requiredEnvVars = [
  'BOT_TOKEN',
  'GOOGLE_SHEET_ID', 
  'ADMIN_CHAT_ID'
];

let allGood = true;

requiredEnvVars.forEach(varName => {
  if (process.env[varName]) {
    console.log(`✅ ${varName}: установлен`);
  } else {
    console.log(`❌ ${varName}: отсутствует`);
    allGood = false;
  }
});

// Проверка файла сервисного аккаунта
try {
  const serviceAccount = require('./service-account-key.json');
  console.log('✅ service-account-key.json: найден и валиден');
} catch (error) {
  console.log('❌ service-account-key.json: отсутствует или невалиден');
  allGood = false;
}

// Проверка зависимостей
try {
  require('telegraf');
  require('googleapis');
  console.log('✅ Зависимости: установлены');
} catch (error) {
  console.log('❌ Зависимости: не установлены. Запустите: npm install');
  allGood = false;
}

console.log('\n' + (allGood ? '🎉 Все проверки пройдены! Можно запускать бота.' : '⚠️ Есть проблемы, которые нужно исправить перед запуском.'));