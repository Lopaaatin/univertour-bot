const { google } = require('googleapis');

class GoogleCalendarService {
    constructor() {
        this.auth = new google.auth.GoogleAuth({
            credentials: process.env.SERVICE_ACCOUNT_KEY
                ? JSON.parse(process.env.SERVICE_ACCOUNT_KEY)
                : null,
            keyFile: process.env.SERVICE_ACCOUNT_KEY
                ? undefined
                : 'service-account-key.json',
            scopes: ['https://www.googleapis.com/auth/calendar'],
        });
        this.calendar = google.calendar({ version: 'v3', auth: this.auth });
        this.calendarId = process.env.FREE_SLOTS_CALENDAR_ID;
        this.timeZone = 'Asia/Novosibirsk'; // Часовой пояс Новосибирска
    }

    async getFreeSlots() {
        try {
            const timeMin = new Date().toISOString();
            const timeMax = new Date();
            timeMax.setDate(timeMax.getDate() + 21);

            console.log(`📅 Запрос событий из календаря: ${this.calendarId}`);
            console.log(`   Часовой пояс: ${this.timeZone}`);
            console.log(`   Период: ${timeMin} - ${timeMax.toISOString()}`);

            const response = await this.calendar.events.list({
                calendarId: this.calendarId,
                timeMin: timeMin,
                timeMax: timeMax.toISOString(),
                maxResults: 50,
                singleEvents: true,
                orderBy: 'startTime',
                timeZone: this.timeZone // Добавляем часовой пояс в запрос
            });

            console.log(`✅ Получено событий: ${response.data.items.length}`);

            // Логируем события с правильным временем
            if (response.data.items.length > 0) {
                console.log('📋 Примеры событий (местное время):');
                response.data.items.slice(0, 3).forEach(event => {
                    const localTime = this.convertToLocalTime(event.start.dateTime);
                    console.log(`   - ${event.summary || 'Без названия'}: ${localTime}`);
                });
            }

            return response.data.items;
        } catch (error) {
            console.error('❌ Error fetching free slots:', error.message);
            return [];
        }
    }

    // Новая функция: конвертация времени в локальный часовой пояс
    convertToLocalTime(utcDateTime) {
        if (!utcDateTime) return 'Нет времени';

        const date = new Date(utcDateTime);

        // Преобразуем в местное время Новосибирска (UTC+7)
        return date.toLocaleString('ru-RU', {
            timeZone: this.timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
    }

    async getEvent(eventId) {
        const response = await this.calendar.events.get({
            calendarId: this.calendarId,
            eventId: eventId,
            timeZone: this.timeZone // Добавляем часовой пояс
        });
        return response.data;
    }

    async deleteEvent(eventId) {
        await this.calendar.events.delete({
            calendarId: this.calendarId,
            eventId: eventId,
        });
    }

    async createAdminEvent(application) {
        const eventDateTime = this.parseDateTime(application.date, application.time);

        const event = {
            summary: `Экскурсия: ${application.name}`,
            description: `Экскурсия для ${application.name}
Размер участка: ${application.plotSize}
Телефон: ${application.phone}
Дополнительно: ${application.additional || 'Не указано'}`,
            start: {
                dateTime: eventDateTime,
                timeZone: this.timeZone,
            },
            end: {
                dateTime: new Date(eventDateTime.getTime() + 60 * 60 * 1000), // +1 час
                timeZone: this.timeZone,
            },
            reminders: {
                useDefault: false,
                overrides: [
                    { method: 'popup', minutes: 24 * 60 },
                    { method: 'popup', minutes: 60 },
                ],
            },
        };

        await this.calendar.events.insert({
            calendarId: process.env.ADMIN_CALENDAR_ID,
            resource: event,
        });
    }

    parseDateTime(dateString, timeString) {
        // Преобразуем русскую дату в Date object с учетом часового пояса
        const [day, month, year] = dateString.split('.');
        const [hours, minutes] = timeString.split(':');

        // Создаем строку в формате для часового пояса Новосибирска
        const dateStr = `${year}-${month}-${day}T${hours}:${minutes}:00`;

        // Создаем Date с явным указанием часового пояса
        return new Date(`${dateStr}+07:00`);
    }
}

module.exports = { googleCalendar: new GoogleCalendarService() };