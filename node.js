const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const app = express();
const cron = require('node-cron');
const fs = require('fs');

const TOKEN = '8179494735:AAHH3-kzojS4oWcH5XVi6H7a-rjLofpap2k';
const bot = new TelegramBot(TOKEN); // webhook mode -> без polling
const data = require('./balance_data.js'); // об'єкт з балансами

let chatIdUser = null;
if (fs.existsSync('chatId.txt')) {
  chatIdUser = fs.readFileSync('chatId.txt', 'utf8').trim();
}

// ---------- EXPRESS + WEBHOOK ----------
app.use(express.json());

// маршрут повинен точно співпадати з тим, що в setWebhook
app.post(`/${TOKEN}`, (req, res) => {
  try {
    bot.processUpdate(req.body);
    res.sendStatus(200);
  } catch (err) {
    console.error('processUpdate error:', err);
    res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Bot running on port ${PORT}`);

  // Встановити webhook — заміни YOUR_RENDER_URL на свій render URL (без слеша в кінці)
  // Наприклад: https://my-bot-abc.onrender.com
  const RENDER_URL = 'https://bot.onrender.com';
  const webhookUrl = `${RENDER_URL}/${TOKEN}`;
  bot.setWebHook(webhookUrl)
    .then(() => console.log('Webhook set to', webhookUrl))
    .catch(err => console.error('Failed to set webhook:', err));
});

// ------------------ Логіка бота ------------------
let day = 1;
let history = [];

function getDayMessage(day) {
  const todayBalance = data[String(day)];
  const yesterdayBalance = data[String(day - 1)]  data[String(0)]  0;
  const dailyProfit = todayBalance - yesterdayBalance;

  return `День - ${day}
Баланс:   $${todayBalance.toFixed(2)}
Прибуток сьогодні:  $${dailyProfit.toFixed(2)}
🚀 +1 день ближче до мети!`;
}

// /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  chatIdUser = chatId;
  fs.writeFileSync('chatId.txt', String(chatId));
  bot.sendMessage(chatId, getDayMessage(day), {
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [[{ text: '✅ Виконано', callback_data: 'done' }]]
    }
  });
});

// /history
bot.onText(/\/history/, (msg) => {
  const chatId = msg.chat.id;
  if (history.length === 0) {
    bot.sendMessage(chatId, 'Історія порожня');
    return;
  }
  const text = history.map(h => `День ${h.day}: $${data[String(h.day)].toFixed(2)}`);
  bot.sendMessage(chatId, text);
});

// callback_query
bot.on('callback_query', (callbackQuery) => {
  const msg = callbackQuery.message;
  const chatId = msg.chat.id;

  if (callbackQuery.data === 'done') {
    history.push({ day, balance: data[String(day)] });

    if (data.hasOwnProperty(String(day + 1))) {
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

// CRON (поки що щохвилинно для тесту)
cron.schedule('*/1 * * * *', () => {
  if (!chatIdUser) {
    console.log('⚠️ Немає chatId — напиши /start у бота');
    return;
  }
  if (!data.hasOwnProperty(String(day))) {
    console.log('⚠️ День не знайдено в data:', day);
    return;
  }
  const opts = {
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [[{ text: '✅ Виконано', callback_data: 'done' }]]
    }
  };
  bot.sendMessage(chatIdUser, getDayMessage(day), opts);
}, {
  timezone: 'Europe/Kyiv'
});


