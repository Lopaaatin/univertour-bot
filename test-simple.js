require('dotenv').config();
const { Telegraf, session } = require('telegraf');

const bot = new Telegraf(process.env.BOT_TOKEN);

// Простая сессия
bot.use(session({
    defaultSession: () => ({})
}));

bot.start((ctx) => {
    console.log('START команда от:', ctx.from.id);
    ctx.reply('✅ Бот работает! Команда /start обработана.');
});

bot.command('excursion', (ctx) => {
    console.log('EXCURSION команда от:', ctx.from.id);
    ctx.reply('🚀 Команда /excursion обработана! Скоро здесь будет анкета.');
});

bot.on('text', (ctx) => {
    console.log('Текст от пользователя:', ctx.message.text);
    ctx.reply(`Вы написали: "${ctx.message.text}"`);
});

console.log('Запускаем тестового бота...');
bot.launch()
    .then(() => console.log('✅ Тестовый бот запущен!'))
    .catch(err => console.error('❌ Ошибка запуска:', err));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));