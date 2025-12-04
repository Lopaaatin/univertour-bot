const { google } = require('googleapis');

class GoogleSheetsService {
    constructor() {
        try {
            this.auth = new google.auth.GoogleAuth({
                credentials: process.env.SERVICE_ACCOUNT_KEY ? JSON.parse(process.env.SERVICE_ACCOUNT_KEY) : null,
                keyFile: process.env.SERVICE_ACCOUNT_KEY ? undefined : 'service-account-key.json',
                scopes: ['https://www.googleapis.com/auth/spreadsheets'],
            });
            this.sheets = google.sheets({ version: 'v4', auth: this.auth });
            this.spreadsheetId = process.env.GOOGLE_SHEET_ID;

            console.log('Google Sheets ID:', this.spreadsheetId);
            console.log('Service Account Email:', this.auth.jsonContent?.client_email);
        } catch (error) {
            console.error('Error initializing Google Sheets:', error);
            throw error;
        }
    }

    async saveApplication(answers) {
        try {
            console.log('Saving application to Google Sheets:', answers);

            const values = [
                [
                    new Date().toISOString(),
                    answers.name || '',
                    answers.date || '',
                    answers.time || '',
                    answers.plotSize || '',
                    answers.phone || '',
                    answers.additional || '',
                    answers.eventId || '',
                    'pending'
                ]
            ];

            const request = {
                spreadsheetId: this.spreadsheetId,
                range: 'Sheet1!A:I', // Убедитесь, что лист называется именно Sheet1
                valueInputOption: 'RAW',
                insertDataOption: 'INSERT_ROWS',
                resource: {
                    values: values,
                },
            };

            console.log('Sending request to Google Sheets...');
            const response = await this.sheets.spreadsheets.values.append(request);
            console.log('✅ Data saved successfully to row:', response.data.updates.updatedRange);

            return response.data;
        } catch (error) {
            console.error('❌ Error saving to Google Sheets:');
            console.error('Error details:', error.message);
            console.error('Spreadsheet ID:', this.spreadsheetId);

            if (error.code === 404) {
                throw new Error(`Таблица не найдена. Проверьте ID таблицы: ${this.spreadsheetId}`);
            } else if (error.code === 403) {
                throw new Error('Нет доступа к таблице. Убедитесь, что сервисный аккаунт имеет права редактора.');
            }

            throw error;
        }
    }

    async getApplicationByEventId(eventId) {
        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'Sheet1!A:I',
            });

            if (!response.data.values) {
                return null;
            }

            const rows = response.data.values;
            const applicationRow = rows.find(row => row[7] === eventId); // eventId в колонке H (8-я колонка, индекс 7)

            if (applicationRow) {
                return {
                    date: applicationRow[2],
                    time: applicationRow[3],
                    name: applicationRow[1],
                    plotSize: applicationRow[4],
                    phone: applicationRow[5],
                    additional: applicationRow[6],
                    eventId: applicationRow[7]
                };
            }

            return null;
        } catch (error) {
            console.error('Error getting application from Google Sheets:', error);
            throw error;
        }
    }

    // Метод для проверки подключения
    async testConnection() {
        try {
            console.log('Testing Google Sheets connection...');
            const response = await this.sheets.spreadsheets.get({
                spreadsheetId: this.spreadsheetId,
            });
            console.log('✅ Google Sheets connection successful');
            console.log('Sheet title:', response.data.properties.title);
            return true;
        } catch (error) {
            console.error('❌ Google Sheets connection failed:', error.message);
            return false;
        }
    }

    [file name]: googleSheets.js
    // Добавьте этот метод в класс GoogleSheetsService:

    async getApplicationsByUserId(userId) {
        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'Sheet1!A:K',
            });

            if (!response.data.values) {
                return [];
            }

            const rows = response.data.values.slice(1); // Пропускаем заголовок
            const userApplications = [];

            // Ищем все заявки пользователя (userId в колонке J, индекс 9)
            for (const row of rows) {
                if (row[9] === userId) { // userId в колонке J
                    userApplications.push({
                        timestamp: row[0],
                        name: row[1],
                        date: row[2],
                        time: row[3],
                        plotSize: row[4],
                        phone: row[5],
                        additional: row[6],
                        eventId: row[7],
                        status: row[8],
                        userId: row[9],
                        reminderStatus: row[10] || 'no'
                    });
                }
            }

            // Сортируем по времени (новые сначала)
            return userApplications.sort((a, b) =>
                new Date(b.timestamp) - new Date(a.timestamp)
            );

        } catch (error) {
            console.error('Error getting applications by userId:', error);
            return [];
        }
    }
}

module.exports = { googleSheets: new GoogleSheetsService() };