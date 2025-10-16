const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const app = express();
const fs = require('fs');
const cron = require('node-cron');

// === ТВОЙ TOKEN ===
const TOKEN = '8179494735:AAHH3-kzojS4oWcH5XVi6H7a-rjLofpap2k';
const URL = 'https://srv-d3ohdfmr433s73a3mv6g.onrender.com'; // твій Render URL

// === Ініціалізація бота ===
const bot = new TelegramBot(TOKEN);
bot.setWebHook(`${URL}/bot${TOKEN}`);

// === Express middleware ===
app.use(express.json());

// === Обробка webhook ===
app.post(`/bot${TOKEN}`, (req, res) => {
  console.log('📩 Webhook отримано!');
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// === Тестовий маршрут ===
app.get('/', (req, res) => res.send('✅ Bot server is running!'));

// === Запуск сервера ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server started on port ${PORT}`);
  sendStartupTestMessage();
});

// === Дані ===
const data = require('./balance_data.js');
let day = 60;
let chatIdUser = null;
let history = [];

// === Якщо chatId збережений — беремо його ===
if (fs.existsSync('chatId.txt')) {
  chatIdUser = fs.readFileSync('chatId.txt', 'utf8').trim();
  console.log(`💾 Відновлено chatId: ${chatIdUser}`);
}

// === Функція тестового повідомлення ===
function sendStartupTestMessage() {
  if (chatIdUser) {
    bot.sendMessage(chatIdUser, '🟢 Бот перезапущено і працює ✅', { parse_mode: 'HTML' });
  } else {
    console.log('⚠️ Chat ID не знайдено — потрібно відправити /start у Telegram.');
  }
}

// === Функція повідомлення дня ===
function getDayMessage(day) {
  const today = data[day];
  const yesterday = data[day - 1] || today;
  const diff = today - yesterday;

  return `День - ${day}
<b>Баланс:</b> $${today.toFixed(2)}
<b>Ціль:</b> $${diff.toFixed(2)}
🚀 +1 день ближче до мети!`;
}

// === Обробка команди /start ===
bot.onText(/\/start/, (msg) => {
  chatIdUser = msg.chat.id;
  fs.writeFileSync('chatId.txt', String(chatIdUser));
  console.log(`💾 Збережено chatId: ${chatIdUser}`);

  bot.sendMessage(chatIdUser, getDayMessage(day), {
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [[{ text: '✅ Виконано', callback_data: 'done' }]],
    },
  });
});

// === Обробка кнопки "✅ Виконано" ===
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  if (query.data === 'done') {
    bot.sendMessage(chatId, '✅ План на сьогодні виконано!\n<b>До зустрічі завтра 👋</b>', { parse_mode: 'HTML' });
    day += 1;
  }
});

// === Cron (кожну хвилину для тесту) ===
cron.schedule('0 8 * * *', () => {
  if (chatIdUser && data.hasOwnProperty(day)) {
    bot.sendMessage(chatIdUser, getDayMessage(day), { parse_mode: 'HTML' });
  } else {
    console.log('⚠️ Немає chatId або день не знайдено');
  }
}, { timezone: 'Europe/Kyiv' });
