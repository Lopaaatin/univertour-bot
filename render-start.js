// render-start.js - специальный запуск для Render
const { spawn } = require('child_process');
const http = require('http');

console.log('🚀 Starting Render-optimized bot launcher...');
console.log('Time:', new Date().toISOString());
console.log('Node version:', process.version);
console.log('Port:', process.env.PORT || 10000);

// Health check сервер (обязательно для Render)
const server = http.createServer((req, res) => {
    if (req.url === '/health' || req.url === '/') {
        console.log(`[${new Date().toISOString()}] Health check from: ${req.headers['user-agent'] || 'unknown'}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
            status: 'ok', 
            service: 'Univerland Excursions Bot',
            timestamp: new Date().toISOString(),
            launcher: 'render-start.js'
        }));
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

// Запускаем сервер на порту из переменной окружения
const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Health check server started on port ${PORT}`);
    console.log(`🔗 Health endpoint: http://0.0.0.0:${PORT}/health`);
});

// Счетчик перезапусков
let restartCount = 0;
const MAX_RESTARTS_PER_HOUR = 10;
const restartTimestamps = [];

// Функция запуска бота с перезапуском
function startBot() {
    console.log(`\n🤖 Starting bot process (attempt ${restartCount + 1})...`);
    
    const botProcess = spawn('node', ['src/index.js'], {
        stdio: 'inherit',
        env: { 
            ...process.env,
            RENDER_STARTED: 'true' // Флаг для основного скрипта
        }
    });
    
    botProcess.on('close', (code) => {
        console.log(`\n⚠️  Bot process exited with code ${code}`);
        
        // Ограничиваем количество перезапусков в час
        const now = Date.now();
        const hourAgo = now - 60 * 60 * 1000;
        
        // Удаляем старые записи
        while (restartTimestamps.length > 0 && restartTimestamps[0] < hourAgo) {
            restartTimestamps.shift();
        }
        
        restartTimestamps.push(now);
        restartCount++;
        
        if (restartTimestamps.length >= MAX_RESTARTS_PER_HOUR) {
            console.error(`❌ Too many restarts (${restartTimestamps.length}) in the last hour. Waiting 5 minutes...`);
            
            // Ждем 5 минут при частых перезапусках
            setTimeout(() => {
                console.log('🔄 Attempting restart after cooldown...');
                startBot();
            }, 5 * 60 * 1000);
            
            return;
        }
        
        // Стандартный перезапуск через 10 секунд
        const delay = Math.min(10000 * Math.pow(1.5, restartCount - 1), 60000); // Экспоненциальная задержка до 60 секунд
        
        console.log(`🔄 Restarting bot in ${delay/1000} seconds...`);
        
        setTimeout(() => {
            console.log('🔄 Restarting bot...');
            startBot();
        }, delay);
    });
    
    botProcess.on('error', (error) => {
        console.error('❌ Failed to start bot:', error.message);
        
        // При ошибке запуска ждем дольше
        setTimeout(() => {
            console.log('🔄 Retrying after error...');
            startBot();
        }, 30000);
    });
    
    // Отслеживаем использование памяти
    const memoryCheck = setInterval(() => {
        const memoryUsage = process.memoryUsage();
        const usedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
        const totalMB = Math.round(memoryUsage.heapTotal / 1024 / 1024);
        
        if (usedMB > 200) { // Предупреждение при использовании >200MB
            console.warn(`⚠️  High memory usage: ${usedMB}MB / ${totalMB}MB`);
        }
    }, 60000); // Проверка каждую минуту
    
    botProcess.on('close', () => {
        clearInterval(memoryCheck);
    });
}

// Keep alive ping каждые 4 минуты (чаще чем 5 минут сна на Render)
console.log('\n💓 Starting keep-alive pings...');
setInterval(() => {
    console.log(`[${new Date().toISOString()}] 💓 Keep-alive ping`);
    
    // Также делаем self health check
    fetch(`http://localhost:${PORT}/health`).catch(() => {
        console.log('⚠️  Self health check failed');
    });
}, 4 * 60 * 1000); // 4 минуты

// Первый запуск бота (через 2 секунды после запуска сервера)
setTimeout(() => {
    console.log('\n🎯 Initial bot launch in 2 seconds...');
    startBot();
}, 2000);

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
    server.close(() => {
        console.log('✅ Health server closed');
        process.exit(0);
    });
    
    setTimeout(() => {
        console.log('⚠️  Force shutdown after timeout');
        process.exit(1);
    }, 5000);
});

process.on('SIGINT', () => {
    console.log('\n🛑 Received SIGINT, shutting down...');
    server.close(() => {
        process.exit(0);
    });
});