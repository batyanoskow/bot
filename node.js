const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const fs = require('fs');
const data = require('./balance_data.js'); // Імпортуємо таблицю з балансами

// ====== ТВОЇ НАЛАШТУВАННЯ ======
const TOKEN = '8179494735:AAHH3-kzojS4oWcH5XVi6H7a-rjLofpap2k';
const bot = new TelegramBot(TOKEN, { polling: true }); // ✅ використовуємо polling

let chatIdUser = null;
if (fs.existsSync('chatId.txt')) {
  chatIdUser = fs.readFileSync('chatId.txt', 'utf8').trim();
}

let day = 60; // початковий день
let history = [];

// ------------------ Функції ------------------
function getDayMessage(day) {
  const todayBalance = data[day];
  const yesterdayBalance = data[day - 1] || todayBalance;
  const dailyProfit = todayBalance - yesterdayBalance;

  return `📅 <b>День:</b> ${day}\n💰 <b>Баланс:</b> <b>$${todayBalance.toFixed(2)}</b>\n🎯 <b>Заробіток за день:</b> <b>$${dailyProfit.toFixed(2)}</b>\n🚀 +1 день ближче до мети!`;
}

// ------------------ /start ------------------
bot.onText(/\/start/, (msg) => {
  chatIdUser = msg.chat.id;
  fs.writeFileSync('chatId.txt', String(chatIdUser)); // зберігаємо chat id
  bot.sendMessage(chatIdUser, getDayMessage(day), {
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [[{ text: '✅ Виконано', callback_data: 'done' }]],
    },
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
        parse_mode: 'HTML',
      });

      day += 1; // переходимо на наступний день
    } else {
      bot.editMessageText("🎉 Всі дні завершено! Вітаю! 🚀", {
        chat_id: chatId,
        message_id: msg.message_id,
        parse_mode: 'HTML',
      });
    }
  }
});

// ------------------ Автоматичне сповіщення ------------------
cron.schedule(
  '0 8 * * *', // кожен день о 8:00 ранку
  () => {
    if (chatIdUser && data.hasOwnProperty(day)) {
      const opts = {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[{ text: '✅ Виконано', callback_data: 'done' }]],
        },
      };
      bot.sendMessage(chatIdUser, getDayMessage(day), opts);
      console.log(`📨 Надіслано сповіщення на день ${day}`);
    } else {
      console.log('⚠️ Немає chatId або день не знайдено');
    }
  },
  {
    scheduled: true,
    timezone: 'Europe/Kyiv',
  }
);

console.log('✅ Бот запущено у режимі polling');

