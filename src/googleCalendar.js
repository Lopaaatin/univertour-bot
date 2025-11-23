const { google } = require('googleapis');

class GoogleCalendarService {
    constructor() {
        this.auth = new google.auth.GoogleAuth({
            credentials: process.env.SERVICE_ACCOUNT_KEY ? JSON.parse(process.env.SERVICE_ACCOUNT_KEY) : null,
            keyFile: process.env.SERVICE_ACCOUNT_KEY ? undefined : 'service-account-key.json',
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
        this.calendar = google.calendar({ version: 'v3', auth: this.auth });
    }

    async getFreeSlots() {
        try {
            const timeMin = new Date().toISOString();

            // Добавляем ограничение по времени - 21 день вперед (3 недели)
            const timeMax = new Date();
            timeMax.setDate(timeMax.getDate() + 21);

            console.log(`Запрос слотов с ${timeMin} по ${timeMax.toISOString()}`);

            const response = await this.calendar.events.list({
                calendarId: process.env.FREE_SLOTS_CALENDAR_ID,
                timeMin: timeMin,
                timeMax: timeMax.toISOString(),
                maxResults: 50, // Уменьшаем лимит, так как дней меньше
                singleEvents: true,
                orderBy: 'startTime',
            });

            console.log(`Получено событий за 21 день: ${response.data.items.length}`);
            return response.data.items;
        } catch (error) {
            console.error('Error fetching free slots:', error);
            return [];
        }
    }

    async getEvent(eventId) {
        const response = await this.calendar.events.get({
            calendarId: process.env.FREE_SLOTS_CALENDAR_ID,
            eventId: eventId,
        });
        return response.data;
    }

    async deleteEvent(eventId) {
        await this.calendar.events.delete({
            calendarId: process.env.FREE_SLOTS_CALENDAR_ID,
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
                timeZone: 'Asia/Novosibirsk',
            },
            end: {
                dateTime: new Date(eventDateTime.getTime() + 60 * 60 * 1000), // +1 час
                timeZone: 'Asia/Novosibirsk',
            },
            reminders: {
                useDefault: false,
                overrides: [
                    { method: 'popup', minutes: 24 * 60 }, // За 1 день
                    { method: 'popup', minutes: 60 }, // За 1 час
                ],
            },
        };

        await this.calendar.events.insert({
            calendarId: process.env.ADMIN_CALENDAR_ID,
            resource: event,
        });
    }

    parseDateTime(dateString, timeString) {
        // Преобразуем русскую дату в Date object
        const [day, month, year] = dateString.split('.');
        const [hours, minutes] = timeString.split(':');

        return new Date(`${year}-${month}-${day}T${hours}:${minutes}:00+07:00`);
    }
}

module.exports = { googleCalendar: new GoogleCalendarService() };