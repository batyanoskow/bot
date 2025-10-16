const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const app = express();
const bot = new TelegramBot(TOKEN);
const cron = require('node-cron'); // не забудь npm install node-cron
const fs = require('fs');
const data = require('./balance_data.js'); // Імпортуємо об’єкт з даними

let chatIdUser = null;

if (fs.existsSync('chatId.txt')) {
    chatIdUser = fs.readFileSync('chatId.txt', 'utf8').trim();
}
const growth_list = require('./balance_data.js')

// ------------------ Налаштування ------------------
const TOKEN = '8179494735:AAHH3-kzojS4oWcH5XVi6H7a-rjLofpap2k'; 
bot.setWebHook(`https://api.render.com/deploy/srv-d3ohdfmr433s73a3mv6g?key=iHvHIf0DJ0s`);

app.use(express.json());
app.post(`/${TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Bot running on port ${PORT}`));


let day = 1;
let history = [];

// ------------------ Функції ------------------
function getDayMessage(day) {
    const todayBalance = data[day];
    const yesterdayBalance = data[day - 1];
    const dailyProfit = todayBalance - yesterdayBalance;

    return `День - ${day}
Баланс:   $${todayBalance.toFixed(2)}
Ціль:  $${dailyProfit.toFixed(2)}
🚀 +1 день ближче до мети!`
}

// ------------------ Обробка команд ------------------
bot.onText(/\/start/, (msg) => {
    chatIdUser = msg.chat.id;
    fs.writeFileSync('chatId.txt', String(chatIdUser)); // зберігаємо ID
    bot.sendMessage(chatIdUser, getDayMessage(day), {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [[{ text: '✅ Виконано', callback_data: 'done' }]]
        }
    });
});

bot.onText(/\/history/, (msg) => {
    const chatId = msg.chat.id;
    if (history.length === 0) {
        bot.sendMessage(chatId, 'Історія порожня');
    } else {
        let text = history
            .map(h => `День ${h.day}: $${data[h.day].toFixed(2)}`)
            .join('\n');
        bot.sendMessage(chatId, text);
    }
});

// ------------------ Обробка кнопки ✅ ------------------
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

            day += 1; // переходимо на наступний день
        } else {
            bot.editMessageText("🎉 Всі дні завершено! Вітаю! 🚀", { 
                chat_id: chatId, 
                message_id: msg.message_id,
                parse_mode: 'HTML' 
            });
        }
    }
});
// ------------------ Автоматичне сповіщення о 8:00 ------------------

cron.schedule('*/1 * * * *', () => {
    if (chatIdUser && data.hasOwnProperty(day)) {
        const opts = {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '✅ Виконано', callback_data: 'done' }]
                ]
            }
        };
        bot.sendMessage(chatIdUser, getDayMessage(day), opts);
    } else {
        console.log("⚠️ Немає chatId або день не знайдено");
    }
}, {
    scheduled: true,
    timezone: "Europe/Kyiv"

});



