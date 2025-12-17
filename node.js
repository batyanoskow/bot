const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// ====== ДАНІ ======
const data = require('./balance_data.js');

// ====== НАЛАШТУВАННЯ ======
const TOKEN = '8179494735:AAHH3-kzojS4oWcH5XVi6H7a-rjLofpap2k';
const bot = new TelegramBot(TOKEN, { polling: true });

// ====== CHAT ID ======
let chatIdUser = null;
if (fs.existsSync('chatId.txt')) {
    chatIdUser = fs.readFileSync('chatId.txt', 'utf8').trim();
}

// ====== ПОТОЧНИЙ ДЕНЬ ======
let day = 7;
if (fs.existsSync('day.txt')) {
    const savedDay = parseInt(fs.readFileSync('day.txt', 'utf8').trim());
    if (!isNaN(savedDay)) day = savedDay;
}

// ====== СТАНИ ======
let currentScreens = {};
let waitingFor = {
    screenshot: false,
    changeDay: false,
};

// ====== СКРІНИ ======
const screenshotsDir = path.join(__dirname, 'screens');
if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir);

// ================= ФУНКЦІЇ =================

function saveCurrentDay() {
    fs.writeFileSync('day.txt', String(day));
}

/**
 * ПЛАН НА НАСТУПНІ 7 ДНІВ
 */
function getNextWeekPlanMessage(currentDay) {
    const startDay = currentDay;
    const endDay = currentDay + 7;

    if (!data[startDay] || !data[endDay]) {
        return '❌ Недостатньо даних для плану на наступні 7 днів.';
    }

    const startBalance = data[startDay];
    const targetBalance = data[endDay];

    const targetProfit = targetBalance - startBalance;
    const weeklyStop = targetProfit / 4;

    return (
        `📅 <b>План на 7 днів:</b> ${startDay} → ${endDay}\n\n` +
        `💰 <b>Поточний баланс:</b> $${startBalance.toFixed(2) - 7000} `(+7000)`\n` +
        `🎯 <b>Цільовий баланс:</b> $${targetBalance.toFixed(2) - 7000} `+7000` \n\n` +
        `🚀 <b>Потрібно заробити:</b> <b>$${targetProfit.toFixed(2)}</b>\n` +
        `❌ <b>Макс стоп на тиждень:</b> <b>$${weeklyStop.toFixed(2)}</b>\n\n` +
        `🧠 Торгуй по плану, не по емоціях`
    );
}

// ================= /start =================

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;

    if (!chatIdUser) {
        chatIdUser = chatId;
        fs.writeFileSync('chatId.txt', String(chatIdUser));
    }

    bot.sendMessage(chatId, getNextWeekPlanMessage(day), {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '✅ Тиждень виконано', callback_data: 'done' },
                    { text: '🗓️ Змінити день', callback_data: 'change_day' }
                ],
                [
                    { text: '📸 Додати скріни', callback_data: 'add_screen' },
                    { text: '🖼️ Показати скріни', callback_data: 'show_screens' }
                ]
            ]
        }
    });
});

// ================= CALLBACK =================

bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const action = q.data;

    await bot.answerCallbackQuery(q.id);

    // ✅ ЗАКРИТИ ТИЖДЕНЬ
    if (action === 'done') {
        if (currentScreens[day]?.length) {
            await bot.sendMessage(
                chatId,
                `📸 Збережено ${currentScreens[day].length} скрін(ів)`,
                { parse_mode: 'HTML' }
            );
            delete currentScreens[day];
        }

        if (data[day + 7]) {
            day += 7;
            saveCurrentDay();

            bot.editMessageText(
                '✅ Тиждень закрито!\n<b>Новий план готовий 👇</b>',
                { chat_id: chatId, message_id: q.message.message_id, parse_mode: 'HTML' }
            );

            bot.sendMessage(chatId, getNextWeekPlanMessage(day), { parse_mode: 'HTML' });
        } else {
            bot.sendMessage(chatId, '🎉 Всі тижні завершені!');
        }
        return;
    }

    if (action === 'add_screen') {
        waitingFor.screenshot = true;
        bot.sendMessage(chatId, '📸 Надішли скріни за цей тиждень');
        return;
    }

    if (action === 'show_screens') {
        const folder = path.join(screenshotsDir, `day_${day}`);
        if (!fs.existsSync(folder)) {
            return bot.sendMessage(chatId, '⚠️ Скрінів немає');
        }

        for (const file of fs.readdirSync(folder)) {
            await bot.sendPhoto(chatId, path.join(folder, file));
        }
        return;
    }

    if (action === 'change_day') {
        waitingFor.changeDay = true;
        bot.sendMessage(chatId, '🗓️ Введи день (початок тижня)');
        return;
    }
});

// ================= ФОТО =================

bot.on('photo', async (msg) => {
    if (!waitingFor.screenshot) return;

    const fileId = msg.photo.at(-1).file_id;
    const file = await bot.getFile(fileId);
    const url = `https://api.telegram.org/file/bot${TOKEN}/${file.file_path}`;

    const folder = path.join(screenshotsDir, `day_${day}`);
    if (!fs.existsSync(folder)) fs.mkdirSync(folder);

    const index = fs.readdirSync(folder).length + 1;
    const filePath = path.join(folder, `screen_${index}.jpg`);

    const res = await axios.get(url, { responseType: 'arraybuffer' });
    fs.writeFileSync(filePath, res.data);

    if (!currentScreens[day]) currentScreens[day] = [];
    currentScreens[day].push(filePath);

    bot.sendMessage(msg.chat.id, `📸 Скрін ${index} збережено`);
});

// ================= ТЕКСТ =================

bot.on('message', (msg) => {
    if (msg.text?.startsWith('/')) return;

    if (waitingFor.changeDay) {
        const newDay = parseInt(msg.text);
        if (data[newDay]) {
            day = newDay;
            saveCurrentDay();
            waitingFor.changeDay = false;
            bot.sendMessage(msg.chat.id, `✅ День змінено на ${day}`);
        } else {
            bot.sendMessage(msg.chat.id, '❌ Невірний день');
        }
    }
});

// ================= CRON =================

cron.schedule(
    '0 8 * * 1', // понеділок 08:00
    () => {
        if (chatIdUser && data[day] && data[day + 7]) {
            bot.sendMessage(
                chatIdUser,
                getNextWeekPlanMessage(day),
                { parse_mode: 'HTML' }
            );
            console.log(`📨 План на тиждень ${day} → ${day + 7}`);
        }
    },
    {
        scheduled: true,
        timezone: 'Europe/Kyiv',
    }
);

console.log('✅ Бот запущено');

