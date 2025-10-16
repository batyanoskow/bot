const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const fs = require('fs');
const app = express();

// ------------------ ⚙️ Налаштування ------------------
const TOKEN = '8179494735:AAHH3-kzojS4oWcH5XVi6H7a-rjLofpap2k';
const URL = 'https://srv-d3ohdfmr433s73a3mv6g.onrender.com'; // 🔗 твій Render URL
const PORT = process.env.PORT || 3000;

const data = require('./balance_data.js');
let chatIdUser = null;
if (fs.existsSync('chatId.txt')) {
    chatIdUser = fs.readFileSync('chatId.txt', 'utf8').trim();
}

let day = 1;
let history = [];

// ------------------ 🚀 Ініціалізація ------------------
const bot = new TelegramBot(TOKEN);
bot.setWebHook(`${URL}/bot${TOKEN}`);

app.use(express.json());
app.post(`/bot${TOKEN}`, (req, res) => {
    console.log("webhook +++");
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

app.get('/', (req, res) => {
    res.send('✅ Bot is live on Render!');
});

app.listen(PORT, () => console.log(`✅ Server started on ${PORT}`));

// ------------------ 📅 Логіка ------------------
function getDayMessage(day) {
    const todayBalance = data[day];
    const yesterdayBalance = data[day - 1] || 0;
    const dailyProfit = todayBalance - yesterdayBalance;

    return `День <b>${day}</b>\n +
           Баланс: <b>$${todayBalance.toFixed(2)}</b>\n +
           Приріст: <b>$${dailyProfit.toFixed(2)}</b>\n +
           🚀 +1 день ближче до мети!`;
}

// ------------------ 🧭 Команди ------------------
bot.onText(/\/start/, (msg) => {
    chatIdUser = msg.chat.id;
    fs.writeFileSync('chatId.txt', String(chatIdUser));

    bot.sendMessage(chatIdUser, getDayMessage(day), {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [[{ text: '✅ Виконано', callback_data: 'done' }]]
        }
    });
});

bot.onText(/\/history/, (msg) => {
    if (history.length === 0) {
        bot.sendMessage(msg.chat.id, 'Історія порожня');
    } else {
        const text = history.map(h => `День ${h.day}: $${data[h.day].toFixed(2)}`).join('\n');
        bot.sendMessage(msg.chat.id, text);
    }
});

// ------------------ ✅ Кнопка "Виконано" ------------------
bot.on('callback_query', (callbackQuery) => {
    const msg = callbackQuery.message;
    const chatId = msg.chat.id;

    if (callbackQuery.data === 'done') {
        history.push({ day, balance: data[day] });

        if (data.hasOwnProperty(day + 1)) {
            bot.editMessageText("✅ План на сьогодні виконано!\n<b>До зустрічі завтра 👋</b>", {
                chat_id: chatId,
                message_id: msg.message_id,
                parse_mode: 'HTML'
            });
            day += 1;
        } else {
            bot.editMessageText("🎉 Всі дні завершено! Вітаю! 🚀", {
                chat_id: chatId,
                message_id: msg.message_id,
                parse_mode: 'HTML'
            });
        }
    }
});

// ------------------ ⏰ Автоматичне сповіщення ------------------
cron.schedule('0 8 * * *', () => {
    if (chatIdUser && data.hasOwnProperty(day)) {
        bot.sendMessage(chatIdUser, getDayMessage(day), {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [[{ text: '✅ Виконано', callback_data: 'done' }]]
            }
        });
    } else {
        console.log("⚠️ Немає chatId або день не знайдено");
    }
}, {
    scheduled: true,
    timezone: "Europe/Kyiv"
});


