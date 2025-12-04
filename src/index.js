require('dotenv').config();
const { Telegraf, Scenes: { Stage, BaseScene }, session } = require('telegraf');
const { googleSheets } = require('./googleSheets');
const { googleCalendar } = require('./googleCalendar');

// Проверка конфигурации при запуске
console.log('=== BOT STARTUP CHECK ===');
console.log('Process ID:', process.pid);
console.log('Start time:', new Date().toISOString());
console.log('=== Конфигурация бота ===');
console.log('ADMIN_CHAT_ID:', process.env.ADMIN_CHAT_ID);
console.log('GOOGLE_SHEET_ID:', process.env.GOOGLE_SHEET_ID);
console.log('FREE_SLOTS_CALENDAR_ID:', process.env.FREE_SLOTS_CALENDAR_ID);
console.log('=========================');

// Проверка подключения к Google Sheets при запуске
(async () => {
    console.log('Testing Google Sheets connection...');
    const isConnected = await googleSheets.testConnection();
    if (!isConnected) {
        console.error('❌ Cannot connect to Google Sheets. Please check configuration.');
    } else {
        console.log('✅ All services connected successfully');
    }
})();

const bot = new Telegraf(process.env.BOT_TOKEN);

// Устанавливаем меню команд бота
bot.telegram.setMyCommands([
    {
        command: 'start',
        description: 'Записаться на экскурсию'
    },
    {
        command: 'help',
        description: 'Помощь'
    }
]).catch(console.error);

// Обработчик команды /help
bot.help(async (ctx) => {
    await ctx.reply(
        '🤖 Помощь по боту:\n\n' +
        'Для записи на экскурсию просто нажмите /start и следуйте инструкциям.\n\n' +
        'Если у вас возникли проблемы, свяжитесь с администратором.'
    );
});

// Инициализируем сессию
bot.use(session({
    defaultSession: () => ({
        answers: {},
        step: 1
    })
}));

// Middleware для принудительного сброса сессии при определенных условиях
bot.use(async (ctx, next) => {
    // Если сессия существует но нет answers или step - сбрасываем
    if (ctx.session && (!ctx.session.answers || !ctx.session.step)) {
        ctx.session.answers = {};
        ctx.session.step = 1;
        ctx.session.groupedSlots = null;
        ctx.session.selectedDay = null;
        ctx.session.currentStep = null;
    }
    await next();
});

// Состояния для сцены
const EXCURSION_WIZARD = 'EXCURSION_WIZARD';

// Константы для состояний выбора даты
const SELECT_DAY = 'SELECT_DAY';
const SELECT_TIME = 'SELECT_TIME';

// Функция для получения названия месяца в родительном падеже
function getMonthName(date) {
    const months = [
        'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
        'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
    ];
    return months[date.getMonth()];
}

// Функция для получения названия дня недели
function getDayOfWeek(date) {
    const days = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
    return days[date.getDay()];
}

// Функция для форматирования даты
function formatDate(date) {
    const day = date.getDate();
    const month = getMonthName(date);
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
}

// Новая функция для генерации календаря с группировкой по месяцам (21 день)
function generateCalendar(groupedSlots) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Вычисляем дату через 21 день (3 недели)
    const maxDate = new Date(today);
    maxDate.setDate(today.getDate() + 21);

    // Создаем массив для хранения месяцев
    const months = [];

    // Начинаем с понедельника текущей недели
    const startDate = new Date(today);
    const dayOfWeek = today.getDay();
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    startDate.setDate(today.getDate() - daysFromMonday);

    let currentDate = new Date(startDate);
    let currentMonth = null;

    // Генерируем ровно 3 недели (21 день)
    let weeksGenerated = 0;
    const maxWeeks = 3;

    while (weeksGenerated < maxWeeks && currentDate <= maxDate) {
        const weekStart = new Date(currentDate);
        const weekMonth = weekStart.getMonth();
        const weekYear = weekStart.getFullYear();
        const monthKey = `${weekYear}-${weekMonth}`;

        // Если это новый месяц, создаем запись
        if (!currentMonth || currentMonth.key !== monthKey) {
            currentMonth = {
                key: monthKey,
                name: weekStart.toLocaleString('ru', { month: 'long', year: 'numeric' }),
                weeks: []
            };
            months.push(currentMonth);
        }

        const week = [];

        for (let i = 0; i < 7; i++) {
            // Если дата выходит за пределы 21 дня, останавливаемся
            if (currentDate > maxDate) {
                week.push({
                    text: ' ',
                    callback_data: 'ignore'
                });
                continue;
            }

            // Формируем ключ для группированных слотов
            const year = currentDate.getFullYear();
            const month = (currentDate.getMonth() + 1).toString().padStart(2, '0');
            const day = currentDate.getDate().toString().padStart(2, '0');
            const dateKey = `${year}-${month}-${day}`;

            const hasSlots = groupedSlots[dateKey] && groupedSlots[dateKey].length > 0;
            const isToday = currentDate.toDateString() === today.toDateString();
            const isPast = currentDate < today;
            const isCurrentMonth = currentDate.getMonth() === weekMonth;

            let text = '';
            let callbackData = 'ignore';

            // Логика отображения дней
            if (isToday) {
                // Сегодняшний день - всегда неактивный с эмодзи-цифрами
                text = numberToEmoji(currentDate.getDate());
            } else if (isCurrentMonth && !isPast && hasSlots) {
                // Активный день со слотами
                text = currentDate.getDate().toString() + ' ✅';
                callbackData = `select_day:${dateKey}`;
            } else if (isCurrentMonth && !isPast && !hasSlots) {
                // Активный день без слотов
                text = currentDate.getDate().toString() + ' ❌';
            } else {
                // Для прошедших дней и дней не из текущего месяца оставляем просто число
                text = currentDate.getDate().toString();
            }

            week.push({
                text: text,
                callback_data: callbackData
            });

            // Переходим к следующему дню
            currentDate.setDate(currentDate.getDate() + 1);
        }

        currentMonth.weeks.push(week);
        weeksGenerated++;

        // Если достигли maxDate, выходим
        if (currentDate > maxDate) {
            break;
        }
    }

    return months;
}

// Универсальная функция для построения календарной клавиатуры
function buildCalendarKeyboard(groupedSlots, forRejection = false, userId = null) {
    const months = generateCalendar(groupedSlots);
    const keyboard = [];

    for (const month of months) {
        // Заголовок месяца
        keyboard.push([{
            text: `📅 ${month.name}`,
            callback_data: 'ignore'
        }]);

        // Заголовки дней недели
        const dayHeaders = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(day => ({
            text: day,
            callback_data: 'ignore'
        }));
        keyboard.push(dayHeaders);

        // Недели месяца с правильными callback_data
        for (const week of month.weeks) {
            const modifiedWeek = week.map(day => {
                if (day.callback_data.startsWith('select_day:')) {
                    const dayKey = day.callback_data.split(':')[1];
                    if (forRejection && userId) {
                        return {
                            ...day,
                            callback_data: `select_new_day:${userId}:${dayKey}`
                        };
                    } else {
                        return day; // Оставляем оригинальный callback_data
                    }
                }
                return day;
            });
            keyboard.push(modifiedWeek);
        }

        // Пустая строка между месяцами
        keyboard.push([]);
    }

    // Убираем последнюю пустую строку если есть
    if (keyboard[keyboard.length - 1].length === 0) {
        keyboard.pop();
    }

    return keyboard;
}

// Функция для показа выбора дня через календарь
async function showDaySelection(ctx, groupedSlots) {
    const keyboard = buildCalendarKeyboard(groupedSlots);

    if (keyboard.length === 0) {
        await ctx.reply('К сожалению, нет доступных слотов для экскурсий в ближайшие 3 недели.', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🔄 Начать заново', callback_data: 'start_over' }]
                ]
            }
        });
        return;
    }

    // Сохраняем группированные слоты в сессии
    ctx.session.groupedSlots = groupedSlots;
    ctx.session.currentStep = SELECT_DAY;

    // Добавляем кнопки навигации
    keyboard.push([
        { text: '⬅️ Назад', callback_data: 'back_to_start' },
        { text: '🔄 Начать заново', callback_data: 'start_over' }
    ]);

    await ctx.reply(
        'Выберите удобный день для экскурсии:\n\n' +
        '✅ - есть свободные слоты\n' +
        '❌ - нет свободных слотов\n',
        {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: keyboard
            }
        }
    );
}

// Функция для показа выбора времени в выбранный день
async function showTimeSelection(ctx, dayKey) {
    const groupedSlots = ctx.session.groupedSlots;
    const daySlots = groupedSlots[dayKey];

    if (!daySlots || daySlots.length === 0) {
        await ctx.reply('В выбранный день нет доступных слотов.', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🔄 Начать заново', callback_data: 'start_over' }]
                ]
            }
        });
        await showDaySelection(ctx, groupedSlots);
        return;
    }

    ctx.session.selectedDay = dayKey;
    ctx.session.currentStep = SELECT_TIME;

    const keyboard = [];

    // Создаем кнопки для каждого временного слота
    const slotsPerRow = 2;
    for (let i = 0; i < daySlots.length; i += slotsPerRow) {
        const row = [];
        for (let j = 0; j < slotsPerRow && i + j < daySlots.length; j++) {
            const event = daySlots[i + j];
            const time = new Date(event.start.dateTime);

            // Конвертируем в местное время Новосибирска
            const localTime = time.toLocaleString('ru-RU', {
                timeZone: 'Asia/Novosibirsk',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });

            row.push({
                text: `🕐 ${localTime}`,
                callback_data: `select_time:${event.id}`
            });
        }
        keyboard.push(row);
    }

    // Правильно парсим дату из dayKey (формат YYYY-MM-DD)
    const [year, month, day] = dayKey.split('-').map(Number);
    const selectedDate = new Date(year, month - 1, day);
    const formattedDate = formatDate(selectedDate);

    // Добавляем кнопки навигации
    keyboard.push([
        { text: '⬅️ Выбрать другой день', callback_data: 'back_to_days' },
        { text: '🔄 Начать заново', callback_data: 'start_over' }
    ]);

    await ctx.reply(`Выберите время для ${formattedDate}:`, {
        reply_markup: {
            inline_keyboard: keyboard
        }
    });
}

// Функция для группировки слотов по дням
function groupSlotsByDay(events) {
    const grouped = {};

    events.forEach(event => {
        const date = new Date(event.start.dateTime);
        // Используем локальную дату с учетом часового пояса
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        const dateKey = `${year}-${month}-${day}`;

        if (!grouped[dateKey]) {
            grouped[dateKey] = [];
        }

        grouped[dateKey].push(event);
    });

    return grouped;
}

function isValidPhone(phone) {
    const phoneRegex = /^[\+]?[0-9\s\-\(\)]{10,15}$/;
    return phoneRegex.test(phone);
}

// Функция для преобразования числа в эмодзи-цифры
function numberToEmoji(number) {
    const emojiMap = {
        '0': '0️⃣',
        '1': '1️⃣',
        '2': '2️⃣',
        '3': '3️⃣',
        '4': '4️⃣',
        '5': '5️⃣',
        '6': '6️⃣',
        '7': '7️⃣',
        '8': '8️⃣',
        '9': '9️⃣',
        '10': '🔟'
    };

    if (number >= 0 && number <= 10) {
        return emojiMap[number.toString()];
    }

    // Для чисел больше 10 - разбиваем на цифры и преобразуем каждую
    return number.toString().split('').map(digit => emojiMap[digit] || digit).join('');
}

async function askForDateTime(ctx) {
    try {
        const events = await googleCalendar.getFreeSlots();
        console.log('Получены события из календаря:', events.length);

        if (events.length === 0) {
            await ctx.reply('К сожалению, нет доступных слотов для экскурсий.', {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔄 Начать заново', callback_data: 'start_over' }]
                    ]
                }
            });
            return;
        }

        // Группируем слоты по дням
        const groupedSlots = groupSlotsByDay(events);
        console.log('Сгруппированные слоты за 21 день:', Object.keys(groupedSlots));

        // Показываем выбор дня через календарь
        await showDaySelection(ctx, groupedSlots);

    } catch (error) {
        console.error('Error fetching free slots:', error);
        await ctx.reply('Извините, произошла ошибка при загрузке доступных слотов. Попробуйте позже.', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🔄 Начать заново', callback_data: 'start_over' }]
                ]
            }
        });
    }
}

async function askForPhone(ctx) {
    await ctx.reply('Оставьте свой номер телефона для связи, пожалуйста:', {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🔄 Начать заново', callback_data: 'start_over' }]
            ]
        }
    });
}

async function askForAdditionalInfo(ctx) {
    await ctx.reply('Хотели бы добавить что-то из информации?', {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Пропустить', callback_data: 'skip_additional' }],
                [{ text: '🔄 Начать заново', callback_data: 'start_over' }]
            ]
        }
    });
}

async function finishApplication(ctx) {
    try {
        await googleSheets.saveApplication(ctx.session.answers);
        await ctx.reply('Спасибо за оставленную заявку. Мы свяжемся с вами, как только она будет подтверждена у менеджера.');
        await sendApplicationToAdmin(ctx);
        return ctx.scene.leave();
    } catch (error) {
        console.error('Error finishing application:', error);
        await ctx.reply('Произошла ошибка при сохранении заявки. Пожалуйста, попробуйте еще раз.');
    }
}

async function sendApplicationToAdmin(ctx) {
    const { answers } = ctx.session;
    const message = `
🎯 Новая заявка на экскурсию:

👤 Имя: ${answers.name}
📅 Дата: ${answers.date}
⏰ Время: ${answers.time}
📏 Размер участка: ${answers.plotSize}
📞 Телефон: ${answers.phone}
💬 Дополнительно: ${answers.additional || 'Не указано'}

ID мероприятия: ${answers.eventId}
    `.trim();

    const keyboard = {
        inline_keyboard: [
            [
                {
                    text: '✅ Подтвердить',
                    callback_data: `approve:${ctx.from.id}:${answers.eventId}`
                },
                {
                    text: '❌ Отклонить',
                    callback_data: `reject:${ctx.from.id}:${answers.eventId}`
                }
            ]
        ]
    };

    try {
        console.log('Отправка заявки администратору. ADMIN_CHAT_ID:', process.env.ADMIN_CHAT_ID);

        // Преобразуем ADMIN_CHAT_ID в число, если это числовой ID
        let adminChatId = process.env.ADMIN_CHAT_ID;
        if (!isNaN(adminChatId)) {
            adminChatId = parseInt(adminChatId);
        }

        await bot.telegram.sendMessage(adminChatId, message, {
            reply_markup: keyboard,
            parse_mode: 'HTML'
        });

        console.log('✅ Заявка успешно отправлена администратору');
    } catch (error) {
        console.error('❌ Ошибка отправки заявки администратору:', error.message);
        console.error('Проверьте ADMIN_CHAT_ID в .env файле');

        // Отправляем сообщение об ошибке пользователю (опционально)
        await ctx.reply('Заявка сохранена, но произошла ошибка при уведомлении администратора. Мы свяжемся с вами вручную.');
    }
}

async function handleNewTimeSelection(ctx, userId, eventId) {
    try {
        console.log('Обработка выбора нового времени для пользователя:', userId, 'Событие:', eventId);

        const event = await googleCalendar.getEvent(eventId);
        if (!event) {
            await ctx.answerCbQuery('Событие не найдено');
            return;
        }

        // Получаем старую заявку пользователя
        const oldApplication = await googleSheets.getApplicationByEventId(eventId);
        if (!oldApplication) {
            await ctx.answerCbQuery('Заявка не найдена');
            return;
        }

        // Создаем новую заявку с обновленным временем
        const newApplication = {
            ...oldApplication,
            date: new Date(event.start.dateTime).toLocaleDateString('ru-RU'),
            time: new Date(event.start.dateTime).toLocaleTimeString('ru-RU', {
                hour: '2-digit', minute: '2-digit'
            }),
            eventId: eventId
        };

        // Сохраняем новую заявку
        await googleSheets.saveApplication(newApplication);

        // Отправляем заявку администратору
        const message = `
🔄 Обновленная заявка на экскурсию (после отклонения):

👤 Имя: ${newApplication.name}
📅 Новая дата: ${newApplication.date}
⏰ Новое время: ${newApplication.time}
📏 Размер участка: ${newApplication.plotSize}
📞 Телефон: ${newApplication.phone}
💬 Дополнительно: ${newApplication.additional || 'Не указано'}

ID мероприятия: ${newApplication.eventId}
        `.trim();

        const keyboard = {
            inline_keyboard: [
                [
                    {
                        text: '✅ Подтвердить',
                        callback_data: `approve:${userId}:${eventId}`
                    },
                    {
                        text: '❌ Отклонить',
                        callback_data: `reject:${userId}:${eventId}`
                    }
                ]
            ]
        };

        await bot.telegram.sendMessage(process.env.ADMIN_CHAT_ID, message, {
            reply_markup: keyboard
        });

        // Уведомляем пользователя
        await ctx.editMessageText('✅ Вы выбрали новое время. Заявка отправлена администратору на подтверждение.');
        await ctx.answerCbQuery();

        console.log('Новая заявка отправлена администратору после выбора времени');

    } catch (error) {
        console.error('Error handling new time selection:', error);
        await ctx.answerCbQuery('Ошибка при выборе времени. Попробуйте еще раз.');
    }
}

async function handleNewDaySelection(ctx, userId, dayKey) {
    try {
        const events = await googleCalendar.getFreeSlots();
        const groupedSlots = groupSlotsByDay(events);
        const daySlots = groupedSlots[dayKey];

        if (!daySlots || daySlots.length === 0) {
            await ctx.answerCbQuery('В выбранный день нет доступных слотов');
            return;
        }

        const keyboard = [];

        // Создаем кнопки для каждого временного слота
        const slotsPerRow = 2;
        for (let i = 0; i < daySlots.length; i += slotsPerRow) {
            const row = [];
            for (let j = 0; j < slotsPerRow && i + j < daySlots.length; j++) {
                const event = daySlots[i + j];
                const time = new Date(event.start.dateTime);
                const hours = time.getHours().toString().padStart(2, '0');
                const minutes = time.getMinutes().toString().padStart(2, '0');

                row.push({
                    text: `🕐 ${hours}:${minutes}`,
                    callback_data: `select_new_time:${userId}:${event.id}`
                });
            }
            keyboard.push(row);
        }

        const [year, month, day] = dayKey.split('-').map(Number);
        const selectedDate = new Date(year, month - 1, day);
        const formattedDate = formatDate(selectedDate);

        // Добавляем кнопку для возврата к календарю
        keyboard.push([{ text: '⬅️ Выбрать другой день', callback_data: `back_to_calendar:${userId}` }]);

        // Отправляем новое сообщение с выбором времени
        await ctx.reply(`Выберите время для ${formattedDate}:`, {
            reply_markup: { inline_keyboard: keyboard }
        });

    } catch (error) {
        console.error('Error handling new day selection:', error);
        await ctx.answerCbQuery('Ошибка при выборе дня');
    }
}

async function handleBack(ctx) {
    const currentStep = ctx.session.step || 1;
    const currentSelectionStep = ctx.session.currentStep;

    // Обработка навигации в выборе даты/времени
    if (currentSelectionStep === SELECT_TIME) {
        // Возврат от выбора времени к выбору дня
        const events = await googleCalendar.getFreeSlots();
        const groupedSlots = groupSlotsByDay(events);
        await showDaySelection(ctx, groupedSlots);
        return;
    }
    else if (currentSelectionStep === SELECT_DAY) {
        // Возврат от выбора дня к началу
        ctx.session.step = 1;
        await ctx.reply('Представьтесь, пожалуйста:');
        return;
    }

    // Старая логика для остальных шагов
    if (currentStep > 1) {
        ctx.session.step = currentStep - 1;

        switch (ctx.session.step) {
            case 1:
                await ctx.reply('Представьтесь, пожалуйста:');
                break;
            case 2:
                await askForDateTime(ctx);
                break;
            case 3:
                await ctx.reply('Какого размера участка хотели бы приобрести?');
                break;
            case 4:
                await askForPhone(ctx);
                break;
        }
    }
}

// Создаем сцену для опроса
const excursionScene = new BaseScene(EXCURSION_WIZARD);

// Обработчик /start ВНУТРИ сцены
excursionScene.start(async (ctx) => {
    // Полностью сбрасываем сессию
    ctx.session.answers = {};
    ctx.session.step = 1;
    ctx.session.groupedSlots = null;
    ctx.session.selectedDay = null;
    ctx.session.currentStep = null;

    await ctx.reply('🔄 Начинаем заново!');
    await ctx.reply(
        'Здравствуйте. Этот бот поможет вам записаться на экскурсию в поселок Университетский.\n\nПредставьтесь, пожалуйста:',
        {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '❌ Отменить', callback_data: 'cancel' }],
                    [{ text: '🔄 Начать заново', callback_data: 'start_over' }]
                ]
            }
        }
    );
});

excursionScene.enter(async (ctx) => {
    // Принудительно сбрасываем сессию при каждом входе в сцену
    ctx.session.answers = {};
    ctx.session.step = 1;
    ctx.session.groupedSlots = null;
    ctx.session.selectedDay = null;
    ctx.session.currentStep = null;

    await ctx.reply(
        'Здравствуйте. Этот бот поможет вам записаться на экскурсию в поселок Университетский.\n\nПредставьтесь, пожалуйста:',
        {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '❌ Отменить', callback_data: 'cancel' }],
                    [{ text: '🔄 Начать заново', callback_data: 'start_over' }]
                ]
            }
        }
    );
});

// Обработка текстовых сообщений в сцене
excursionScene.on('text', async (ctx) => {
    const currentStep = ctx.session.step || 1;

    switch (currentStep) {
        case 1:
            ctx.session.answers.name = ctx.message.text;
            ctx.session.step = 2;
            await askForDateTime(ctx);
            break;
        case 3:
            ctx.session.answers.plotSize = ctx.message.text;
            ctx.session.step = 4;
            await askForPhone(ctx);
            break;
        case 4:
            if (isValidPhone(ctx.message.text)) {
                ctx.session.answers.phone = ctx.message.text;
                ctx.session.step = 5;
                await askForAdditionalInfo(ctx);
            } else {
                await ctx.reply('Пожалуйста, введите корректный номер телефона:');
            }
            break;
        case 5:
            ctx.session.answers.additional = ctx.message.text;
            await finishApplication(ctx);
            break;
    }
});

// Обработка callback-ов в сцене
excursionScene.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;

    if (data === 'ignore') {
        await ctx.answerCbQuery();
        return;
    }

    if (data === 'start_over') {
        // Полностью сбрасываем сессию
        ctx.session.answers = {};
        ctx.session.step = 1;
        ctx.session.groupedSlots = null;
        ctx.session.selectedDay = null;
        ctx.session.currentStep = null;

        // Пытаемся редактировать предыдущее сообщение, если это callback
        try {
            await ctx.editMessageText('🔄 Начинаем заново!');
        } catch (error) {
            // Если не удалось редактировать (например, обычное сообщение), просто отправляем новое
            await ctx.reply('🔄 Начинаем заново!');
        }

        await ctx.reply(
            'Здравствуйте. Этот бот поможет вам записаться на экскурсию в поселок Университетский.\n\nПредставьтесь, пожалуйста:',
            {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '❌ Отменить', callback_data: 'cancel' }],
                        [{ text: '🔄 Начать заново', callback_data: 'start_over' }]
                    ]
                }
            }
        );
        await ctx.answerCbQuery();
        return;
    }

    if (data.startsWith('select_day:')) {
        const dayKey = data.split(':')[1];
        await showTimeSelection(ctx, dayKey);
    }
    else if (data.startsWith('select_time:')) {
        const eventId = data.split(':')[1];
        try {
            const event = await googleCalendar.getEvent(eventId);

            ctx.session.answers.eventId = eventId;

            // Используем локальное время Новосибирска для правильного отображения
            const eventDate = new Date(event.start.dateTime);

            // Конвертируем в местное время
            const localDate = new Date(eventDate.toLocaleString('ru-RU', {
                timeZone: 'Asia/Novosibirsk'
            }));

            const year = localDate.getFullYear();
            const month = (localDate.getMonth() + 1).toString().padStart(2, '0');
            const day = localDate.getDate().toString().padStart(2, '0');

            // Форматируем время
            const localTime = eventDate.toLocaleString('ru-RU', {
                timeZone: 'Asia/Novosibirsk',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });

            ctx.session.answers.date = `${day}.${month}.${year}`;
            ctx.session.answers.time = localTime;

            ctx.session.step = 3;
            await ctx.editMessageText(`Выбрано: ${ctx.session.answers.date} в ${ctx.session.answers.time}`);
            await ctx.reply('Какого размера участка хотели бы приобрести?');
        } catch (error) {
            console.error('Error selecting time:', error);
            await ctx.answerCbQuery('Ошибка при выборе времени');
        }
    }
    else if (data === 'back_to_days') {
        // Возврат к выбору дня
        const events = await googleCalendar.getFreeSlots();
        const groupedSlots = groupSlotsByDay(events);
        await showDaySelection(ctx, groupedSlots);
    }
    else if (data === 'back_to_start') {
        // Возврат к началу анкеты (представьтесь)
        ctx.session.step = 1;
        await ctx.reply('Представьтесь, пожалуйста:');
    }
    else if (data === 'back') {
        await handleBack(ctx);
    }
    else if (data === 'cancel') {
        await ctx.reply('Заполнение заявки отменено.');
        return ctx.scene.leave();
    }
    else if (data === 'skip_additional') {
        ctx.session.answers.additional = '';
        await finishApplication(ctx);
    }

    await ctx.answerCbQuery();
});

// Регистрация сцены
const stage = new Stage([excursionScene]);
bot.use(stage.middleware());

// === ГЛАВНЫЙ ОБРАБОТЧИК /start (ПОСЛЕ регистрации сцены) ===
bot.start(async (ctx) => {
    console.log('START команда от:', ctx.from.id, 'Username:', ctx.from.username);

    const adminChatId = process.env.ADMIN_CHAT_ID;
    const userId = ctx.from.id;

    // Если пользователь - администратор, показываем специальное сообщение
    if (adminChatId === userId.toString() || (parseInt(adminChatId) === userId && !isNaN(adminChatId))) {
        console.log('Пользователь идентифицирован как администратор');
        await ctx.reply('👑 Добро пожаловать в панель администратора!\n\nЗдесь вы будете получать заявки на подтверждение экскурсий.');
        return;
    }

    // Для обычных пользователей - сбрасываем сессию и запускаем процесс записи
    console.log('Запуск процесса записи на экскурсию для пользователя:', userId);

    // Сбрасываем сессию
    ctx.session = {
        answers: {},
        step: 1,
        groupedSlots: null,
        selectedDay: null,
        currentStep: null
    };

    await ctx.scene.enter(EXCURSION_WIZARD);
});

// Обработка callback-ов для пользователей и администратора
bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;
    console.log('Callback data от пользователя:', ctx.from.id, 'Data:', data);

    // Обработка возврата к календарю после отклонения заявки
    if (data.startsWith('back_to_calendar:')) {
        const [_, userId] = data.split(':');

        // Проверяем, что пользователь возвращается к своему календарю
        if (ctx.from.id.toString() !== userId) {
            console.log('Попытка доступа к чужому календарю:', ctx.from.id);
            await ctx.answerCbQuery('Эта кнопка не для вас');
            return;
        }

        try {
            // Получаем актуальные слоты и показываем календарь
            const events = await googleCalendar.getFreeSlots();
            const groupedSlots = groupSlotsByDay(events);

            // Используем универсальную функцию с флагом forRejection
            const keyboard = buildCalendarKeyboard(groupedSlots, true, userId);

            // Удаляем сообщение с выбором времени
            await ctx.deleteMessage();

            // Добавляем кнопку "Назад"
            keyboard.push([{ text: '⬅️ Назад', callback_data: 'back_to_start' }]);

            await ctx.reply(
                'Выберите удобный день для экскурсии:\n\n' +
                '✅ - есть свободные слоты\n' +
                '❌ - нет свободных слотов\n',
                {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: keyboard
                    }
                }
            );

            await ctx.answerCbQuery();

        } catch (error) {
            console.error('Error going back to calendar:', error);
            await ctx.answerCbQuery('Ошибка при возврате к календарю');
        }
        return;
    }

    // Игнорируем нажатия на неактивные элементы
    if (data === 'ignore') {
        await ctx.answerCbQuery();
        return;
    }

    // Обработка выбора нового дня после отклонения заявки
    if (data.startsWith('select_new_day:')) {
        const [_, originalUserId, dayKey] = data.split(':');

        // Проверяем, что пользователь выбирает день для своей заявки
        if (ctx.from.id.toString() !== originalUserId) {
            console.log('Попытка выбора дня для чужой заявки:', ctx.from.id);
            await ctx.answerCbQuery('Эта кнопка не для вас');
            return;
        }

        await handleNewDaySelection(ctx, originalUserId, dayKey);
        return;
    }

    // Обработка выбора нового времени после отклонения заявки
    if (data.startsWith('select_new_time:')) {
        const [_, originalUserId, eventId] = data.split(':');

        // Проверяем, что пользователь выбирает время для своей заявки
        if (ctx.from.id.toString() !== originalUserId) {
            console.log('Попытка выбора времени для чужой заявки:', ctx.from.id);
            await ctx.answerCbQuery('Эта кнопка не для вас');
            return;
        }

        await handleNewTimeSelection(ctx, originalUserId, eventId);
        return;
    }

    // Проверяем, является ли пользователь администратором для остальных действий
    const adminChatId = process.env.ADMIN_CHAT_ID;
    const userId = ctx.from.id.toString();

    if (userId !== adminChatId && parseInt(adminChatId) !== ctx.from.id) {
        console.log('Попытка доступа к админским функциям от не-администратора:', ctx.from.id);
        await ctx.answerCbQuery('У вас нет прав для этого действия');
        return;
    }

    // Обработка действий администратора
    if (data.startsWith('approve:')) {
        await handleAdminApproval(ctx, data);
    }
    else if (data.startsWith('reject:')) {
        await handleAdminRejection(ctx, data);
    }
});

async function handleAdminApproval(ctx, data) {
    const [_, userId, eventId] = data.split(':');

    try {
        const application = await googleSheets.getApplicationByEventId(eventId);

        if (application) {
            await googleCalendar.createAdminEvent(application);
            await googleCalendar.deleteEvent(eventId);

            // Форматируем дату для пользователя
            const [day, month, year] = application.date.split('.');
            const formattedDate = `${day}.${month}.${year}`;

            const userMessage = `
Спасибо за ожидание. Ваша заявка подтверждена.
Вы записались на экскурсию ${formattedDate} в ${application.time}.

В назначенное время у въезда в поселок Университетский вас встретит наш представитель.
Телеграм для связи: @univerland
Точка встречи на карте: [2GIS](https://go.2gis.com/rmAjM), [Яндекс Карты](https://yandex.ru/maps/-/CLGe4HpR)
            `.trim();

            await bot.telegram.sendMessage(userId, userMessage, { parse_mode: 'Markdown' });
            await ctx.editMessageText(`${ctx.callbackQuery.message.text}\n\n✅ Заявка подтверждена! Слот удален, мероприятие создано.`);
        } else {
            await ctx.answerCbQuery('Заявка не найдена');
        }

    } catch (error) {
        console.error('Error approving application:', error);
        await ctx.answerCbQuery('Ошибка при подтверждении заявки');
    }
}

async function handleAdminRejection(ctx, data) {
    const [_, userId, eventId] = data.split(':');

    try {
        // Возвращаем пользователя к выбору дня через календарь
        const events = await googleCalendar.getFreeSlots();

        if (events.length === 0) {
            await bot.telegram.sendMessage(userId,
                'К сожалению, сейчас нет доступных слотов для экскурсий. Пожалуйста, попробуйте позже.'
            );
            await ctx.editMessageText(`${ctx.callbackQuery.message.text}\n\n❌ Заявка отклонена. Нет доступных слотов.`);
            return;
        }

        // Группируем слоты по дням
        const groupedSlots = groupSlotsByDay(events);

        await bot.telegram.sendMessage(userId,
            `Спасибо за ожидание. К сожалению, у нас вышла накладка, и мы не сможем принять вас в выбранное время. Мы уже исправили расписание и предлагаем выбрать время приезда еще раз.`
        );

        // Используем универсальную функцию для построения календаря
        const keyboard = buildCalendarKeyboard(groupedSlots, true, userId);

        // Добавляем кнопку "Назад"
        keyboard.push([{ text: '⬅️ Назад', callback_data: 'back_to_start' }]);

        await bot.telegram.sendMessage(userId,
            'Выберите удобный день для экскурсии:\n\n' +
            '✅ - есть свободные слоты\n' +
            '❌ - нет свободных слотов\n',
            {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: keyboard
                }
            }
        );

        await ctx.editMessageText(`${ctx.callbackQuery.message.text}\n\n❌ Заявка отклонена. Пользователь выбирает новое время.`);

    } catch (error) {
        console.error('Error rejecting application:', error);
        await ctx.answerCbQuery('Ошибка при отклонении заявки');
    }
}

// Улучшенное логирование
bot.use(async (ctx, next) => {
    const updateType = ctx.updateType;
    const userId = ctx.from?.id;
    const username = ctx.from?.username;

    if (updateType === 'message') {
        console.log(`📨 Сообщение от ${userId} (@${username}): ${ctx.message.text}`);
    } else if (updateType === 'callback_query') {
        console.log(`🔘 Callback от ${userId} (@${username}): ${ctx.callbackQuery.data}`);
    }

    await next();
});

// Обработка ошибок
bot.catch((err, ctx) => {
    console.error(`Ошибка для ${ctx.updateType}:`, err);
    ctx.reply('Произошла ошибка. Пожалуйста, попробуйте еще раз.');
});

const http = require('http');

// Создаем HTTP сервер для Render
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('🤖 Univerland Excursions Bot is running!\n');
});

// Получаем порт из переменной окружения или используем стандартный
const PORT = process.env.PORT || 10000; // Используем 10000 для Render

// Функция запуска приложения
async function startApp() {
    try {
        console.log('🚀 Starting application... PID:', process.pid);

        // ЗАПУСКАЕМ СЕРВЕР ПЕРВЫМ
        server.listen(PORT, '0.0.0.0', () => {
            console.log(`✅ HTTP server started on port ${PORT}`);
        });

        // Добавляем задержку перед запуском бота
        console.log('⏳ Waiting 5 seconds before bot launch...');
        await new Promise(resolve => setTimeout(resolve, 5000));

        console.log('🤖 Starting Telegram bot...');

        // Явно закрываем предыдущие соединения
        try {
            await bot.telegram.close();
        } catch (e) {
            console.log('No previous connection to close');
        }

        // Запускаем бота с force
        await bot.launch({
            dropPendingUpdates: true,
            allowedUpdates: []
        });

        console.log('✅ Bot launched successfully!');

    } catch (error) {
        console.error('❌ Failed to start application:', error.message);

        // Если ошибка 409 - ждем и пробуем еще раз
        if (error.message.includes('409') || error.message.includes('Conflict')) {
            console.log('🔄 Conflict detected, waiting 10 seconds and retrying...');
            await new Promise(resolve => setTimeout(resolve, 10000));
            console.log('🔄 Retrying bot launch...');
            await bot.launch({
                dropPendingUpdates: true,
                allowedUpdates: []
            });
            console.log('✅ Bot launched on retry!');
        } else {
            process.exit(1);
        }
    }
}

// Graceful shutdown
const stopApp = () => {
    console.log('🛑 Stopping application...');
    bot.stop();
    server.close(() => {
        console.log('✅ Application stopped');
        process.exit(0);
    });
};

process.once('SIGINT', stopApp);
process.once('SIGTERM', stopApp);

// Запускаем приложение
startApp();