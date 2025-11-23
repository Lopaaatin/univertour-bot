require('dotenv').config();

console.log('=== Проверка настроек ===');
console.log('BOT_TOKEN:', process.env.BOT_TOKEN ? '✅ Установлен' : '❌ Отсутствует');
console.log('GOOGLE_SHEET_ID:', process.env.GOOGLE_SHEET_ID ? '✅ Установлен' : '❌ Отсутствует');
console.log('ADMIN_CHAT_ID:', process.env.ADMIN_CHAT_ID ? '✅ Установлен' : '❌ Отсутствует');
console.log('FREE_SLOTS_CALENDAR_ID:', process.env.FREE_SLOTS_CALENDAR_ID ? '✅ Установлен' : '❌ Отсутствует');