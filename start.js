// start.js - УПРОЩЕННЫЙ запуск для Render
const { exec } = require('child_process');
const http = require('http');

console.log('🚀 ULTRA SIMPLE LAUNCHER FOR RENDER');
console.log('Time:', new Date().toISOString());

// 1. Сначала запускаем HTTP сервер (ОБЯЗАТЕЛЬНО!)
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
        status: 'ok', 
        bot: 'Univerland Bot',
        time: new Date().toISOString()
    }));
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ HTTP server listening on port ${PORT}`);
    
    // 2. Запускаем бота только ПОСЛЕ успешного запуска сервера
    setTimeout(() => {
        console.log('🤖 Starting Telegram bot...');
        
        const botProcess = exec('node src/index.js', (error, stdout, stderr) => {
            if (error) {
                console.error('❌ Bot crashed:', error.message);
                
                // Перезапуск через 15 секунд
                console.log('🔄 Restarting in 15 seconds...');
                setTimeout(() => {
                    console.log('🔄 Restarting bot process...');
                    botProcess = exec('node src/index.js');
                }, 15000);
            }
        });
        
        // Логирование вывода бота
        botProcess.stdout.on('data', (data) => {
            console.log(`🤖 BOT: ${data.toString().trim()}`);
        });
        
        botProcess.stderr.on('data', (data) => {
            console.error(`🤖 BOT ERROR: ${data.toString().trim()}`);
        });
        
    }, 2000); // Ждем 2 секунды после запуска сервера
});

// Keep-alive каждые 4 минуты
setInterval(() => {
    console.log('💓 Keep-alive ping');
}, 4 * 60 * 1000);