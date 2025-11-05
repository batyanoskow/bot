const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// ====== Імпорт даних та налаштування ======
const data = require('./balance_data.js'); // Імпортована таблиця з балансами

// Налаштування
const TOKEN = '8179494735:AAHH3-kzojS4oWcH5XVi6H7a-rjLofpap2k';
const bot = new TelegramBot(TOKEN, { polling: true });

// Зберігання станів
let chatIdUser = null;
if (fs.existsSync('chatId.txt')) {
    chatIdUser = fs.readFileSync('chatId.txt', 'utf8').trim();
}

// Стійкість дня: читаємо останній день із файлу або встановлюємо 103
let day = 103;
if (fs.existsSync('day.txt')) {
    const savedDay = parseInt(fs.readFileSync('day.txt', 'utf8').trim());
    if (!isNaN(savedDay)) {
        day = savedDay;
    }
}

let history = [];
let currentScreens = {}; // Зберігає тимчасово фото до "✅ Виконано"

// Об'єкт для управління станами очікування
let waitingFor = {
    changeDay: false,
    diffInput: false,
    screenshot: false,
};

// Налаштування директорії для скріншотів
const screenshotsDir = path.join(__dirname, 'screens');
if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir);

// ------------------ Функції ------------------

/**
 * Генерує повідомлення про поточний день, баланс та стоп-лосс.
 * @param {number} currentDay - Номер поточного дня.
 * @returns {string} Сформоване HTML повідомлення.
 */
function getDayMessage(currentDay) {
    if (!data.hasOwnProperty(currentDay)) {
        return '❌ Невірний номер дня або день не знайдено в таблиці.';
    }

    const todayBalance = data[currentDay];
    const yesterdayBalance = data[currentDay - 1] || todayBalance;
    const dailyProfit = todayBalance - yesterdayBalance;
    const dailyStop = dailyProfit / 4;

    return `📅 <b>День:</b> ${currentDay}\n💰 <b>Баланс:</b> <b>$${todayBalance.toFixed(2)}</b>\n🎯 <b>Заробіток за день:</b> <b>$${dailyProfit.toFixed(2)}</b>\n ❌<b>Максимальний стоп-лосс на день:</b> <b>$${dailyStop.toFixed(2)}</b>\n 🚀 +1 день ближче до мети!`;
}

/**
 * Оновлює файл з поточним днем.
 */
function saveCurrentDay() {
    fs.writeFileSync('day.txt', String(day));
}

// ------------------ /start ------------------
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;

    // Зберігаємо chatId першого користувача
    if (chatIdUser === null) {
        chatIdUser = chatId;
        fs.writeFileSync('chatId.txt', String(chatIdUser));
    }

    bot.sendMessage(chatId, getDayMessage(day), {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '✅ Виконано', callback_data: 'done' },
                    { text: '🗓️ Змінити день', callback_data: 'change_day' }
                ],
                [
                    { text: '📸 Додати скрін', callback_data: 'add_screen' },
                    { text: '🖼️ Показати скріни', callback_data: 'show_screens' }
                ],
                [
                    { text: '➗ Різниця між днями', callback_data: 'calc_diff' }
                ]
            ]
        }
    });
});

// ------------------ /history ------------------
bot.onText(/\/history/, (msg) => {
    const chatId = msg.chat.id;
    if (history.length === 0) {
        bot.sendMessage(chatId, 'Історія порожня');
    } else {
        const text = history
            .map((h) => `📅 День ${h.day}: $${data[h.day].toFixed(2)}`)
            .join('\n');
        bot.sendMessage(chatId, `**Історія виконання:**\n${text}`, { parse_mode: 'Markdown' });
    }
});

// ------------------ Обробка всіх кнопок (callback_query) ------------------
bot.on('callback_query', async (callbackQuery) => {
    const msg = callbackQuery.message;
    const chatId = msg.chat.id;
    const actionData = callbackQuery.data; // actionData, щоб уникнути конфлікту з імпортом 'data'

    await bot.answerCallbackQuery(callbackQuery.id);

    // --- ✅ Виконано (done) ---
    if (actionData === 'done') {
        // 1. Оповіщення про збереження скрінів
        if (currentScreens[day]?.length) {
            await bot.sendMessage(chatId, `✅ Збережено **${currentScreens[day].length}** скрін(ів) для дня **${day}**`, { parse_mode: 'HTML' });
            delete currentScreens[day];
        }

        // 2. Скидання станів очікування
        waitingFor.screenshot = false;
        waitingFor.changeDay = false;
        waitingFor.diffInput = false;

        // 3. Збереження в історію та перехід на наступний день
        history.push({ day, balance: data[day] });

        if (data.hasOwnProperty(day + 1)) {
            day += 1;
            saveCurrentDay();

            bot.editMessageText("✅ План на сьогодні виконано!\n<b>До зустрічі завтра 👋</b>", {
                chat_id: chatId,
                message_id: msg.message_id,
                parse_mode: 'HTML',
            });
        } else {
            bot.editMessageText("🎉 Всі дні завершено! Вітаю! 🚀", {
                chat_id: chatId,
                message_id: msg.message_id,
                parse_mode: 'HTML',
            });
        }
        return;
    }

    // --- 📸 Додати скрін (add_screen) ---
    if (actionData === 'add_screen') {
        waitingFor.screenshot = true;
        bot.sendMessage(chatId, `📎 Надішли одне або кілька фото для <b>дня ${day}</b>. Коли все — просто натисни ✅ Виконано.`, { parse_mode: 'HTML' });
        return;
    }

    // --- 🖼️ Показати скріни (show_screens) ---
    if (actionData === 'show_screens') {
        const folder = path.join(screenshotsDir, `day_${day}`);
        if (!fs.existsSync(folder)) {
            return bot.sendMessage(chatId, `⚠️ Для дня ${day} скрінів немає`);
        }

        const files = fs.readdirSync(folder);
        if (files.length === 0) {
            return bot.sendMessage(chatId, `⚠️ Для дня ${day} скрінів немає`);
        }

        for (const file of files) {
            await bot.sendPhoto(chatId, path.join(folder, file), { caption: `📅 День ${day}` });
        }
        return;
    }

    // --- 🗓️ Змінити день (change_day) ---
    if (actionData === 'change_day') {
        waitingFor.changeDay = true;
        bot.sendMessage(chatId, '🗓️ Введи новий день (наприклад: 65)');
        return;
    }

    // --- ➗ Різниця між днями (calc_diff) ---
    if (actionData === 'calc_diff') {
        waitingFor.diffInput = true;
        bot.sendMessage(chatId, '➗ Введи два дні через пробіл (наприклад: 61 65)');
        return;
    }
});

// ------------------ Обробка фото ------------------
bot.on('photo', async (msg) => {
    const chatId = msg.chat.id;
    if (!waitingFor.screenshot) return;

    const fileId = msg.photo[msg.photo.length - 1].file_id;
    const file = await bot.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${TOKEN}/${file.file_path}`;

    const folder = path.join(screenshotsDir, `day_${day}`);
    if (!fs.existsSync(folder)) fs.mkdirSync(folder);

    // Визначаємо наступний індекс для імені файлу
    const files = fs.readdirSync(folder).filter(f => f.startsWith('screen_'));
    let maxIndex = 0;
    files.forEach(file => {
        const match = file.match(/screen_(\d+)\.jpg/);
        if (match) {
            maxIndex = Math.max(maxIndex, parseInt(match[1]));
        }
    });
    const index = maxIndex + 1;
    const filePath = path.join(folder, `screen_${index}.jpg`);

    const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
    fs.writeFileSync(filePath, response.data);

    if (!currentScreens[day]) currentScreens[day] = [];
    currentScreens[day].push(filePath);

    bot.sendMessage(chatId, `📸 Скрін ${index} для дня **${day}** збережено`, { parse_mode: 'Markdown' });
});

// ------------------ Обробка текстових відповідей ------------------
bot.on('message', (msg) => {
    const chatId = msg.chat.id;

    // ВИПРАВЛЕННЯ: Ігноруємо усі команди (повідомлення, що починаються з /),
    // щоб уникнути конфлікту зі /start, /history тощо.
    if (msg.text && msg.text.startsWith('/')) {
        return;
    }

    // --- Зміна дня ---
    if (waitingFor.changeDay) {
        const newDay = parseInt(msg.text);
        if (!isNaN(newDay) && data.hasOwnProperty(newDay)) {
            day = newDay;
            saveCurrentDay();
            waitingFor.changeDay = false;
            bot.sendMessage(chatId, `✅ День змінено на <b>${day}</b>`, { parse_mode: 'HTML' });
        } else {
            bot.sendMessage(chatId, '❌ Введи число — номер дня, який існує у списку.');
        }
        return;
    }

    // --- Різниця між днями ---
    if (waitingFor.diffInput) {
        const parts = msg.text.trim().split(/\s+/);
        waitingFor.diffInput = false;

        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            const d1 = parseInt(parts[0]);
            const d2 = parseInt(parts[1]);

            if (data[d1] && data[d2]) {
                const diff = data[d2] - data[d1];
                bot.sendMessage(chatId, `📊 Різниця між <b>${d1}</b> і <b>${d2}</b>: <b>$${diff.toFixed(2)}</b>`, { parse_mode: 'HTML' });
            } else {
                bot.sendMessage(chatId, '⚠️ Одного з цих днів немає у списку балансів.');
            }
        } else {
            bot.sendMessage(chatId, '❌ Формат неправильний. Напиши так: 61 65');
        }
        return;
    }
});

// ------------------ Автоматичне сповіщення (Cron) ------------------
cron.schedule(
    '0 8 * * *', // кожен день о 8:00 ранку
    () => {
        if (chatIdUser && data.hasOwnProperty(day)) {
            const opts = {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '✅ Виконано', callback_data: 'done' },
                            { text: '🗓️ Змінити день', callback_data: 'change_day' }
                        ],
                        [
                            { text: '📸 Додати скрін', callback_data: 'add_screen' },
                            { text: '🖼️ Показати скріни', callback_data: 'show_screens' }
                        ],
                        [
                            { text: '➗ Різниця між днями', callback_data: 'calc_diff' }
                        ]
                    ]
                },
            };
            bot.sendMessage(chatIdUser, getDayMessage(day), opts);
            console.log(`📨 Надіслано сповіщення на день ${day}`);
        } else {
            console.log('⚠️ Немає chatId або поточний день не знайдено в таблиці балансів');
        }
    },
    {
        scheduled: true,
        timezone: 'Europe/Kyiv',
    }
);

console.log('✅ Бот запущено у режимі polling');
