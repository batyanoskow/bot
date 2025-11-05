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

let day = 103;// початковий день
let history = [];

// ------------------ Функції ------------------
function getDayMessage(day) {
  const todayBalance = data[day];
  const yesterdayBalance = data[day - 1] || todayBalance;
  const dailyProfit = todayBalance - yesterdayBalance;
  const dailyStop = dailyProfit / 4;

  return `📅 <b>День:</b> ${day}\n💰 <b>Баланс:</b> <b>$${todayBalance.toFixed(2)}</b>\n🎯 <b>Заробіток за день:</b> <b>$${dailyProfit.toFixed(2)}</b>\n ❌<b>Максимальний стоп-лосс на день:</b> <b>$${dailyStop.toFixed(2)}</b>\n 🚀 +1 день ближче до мети!`;
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

const path = require('path');
const axios = require('axios');

// ------------------ Налаштування скрінів ------------------
const screenshotsDir = path.join(__dirname, 'screens');
if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir);

let waitingForScreenshot = false;
let currentScreens = {}; // Зберігає тимчасово фото до "✅ Виконано"

// ------------------ /start ------------------
bot.onText(/\/start/, (msg) => {
  chatIdUser = msg.chat.id;
  fs.writeFileSync('chatId.txt', String(chatIdUser));

  bot.sendMessage(chatIdUser, getDayMessage(day), {
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

// ------------------ Обробка кнопок ------------------
bot.on('callback_query', async (callbackQuery) => {
  const msg = callbackQuery.message;
  const chatId = msg.chat.id;

  if (callbackQuery.data === 'add_screen') {
    waitingForScreenshot = true;
    bot.sendMessage(chatId,` 📎 Надішли одне або кілька фото для <b>дня ${day}</b>. Коли все — просто натисни ✅ Виконано., { parse_mode: 'HTML' }`);
  }

  if (callbackQuery.data === 'show_screens') {
    const folder = path.join(screenshotsDir, `day_${day}`);
    if (!fs.existsSync(folder)) {
      return bot.sendMessage(chatId, `⚠️ Для дня ${day} скрінів немає`);
    }

    const files = fs.readdirSync(folder);
    if (files.length === 0) {
      return bot.sendMessage(chatId, `⚠️ Для дня ${day} скрінів немає`);
    }

    for (const file of files) {
      await bot.sendPhoto(chatId, path.join(folder, file), { caption: 📅 День ${day} });
    }
  }

  if (callbackQuery.data === 'done') {
    if (currentScreens[day]?.length) {
      bot.sendMessage(chatId,` ✅ Збережено ${currentScreens[day].length} скрін(ів) для дня ${day}, { parse_mode: 'HTML' }`);
    }

    bot.editMessageText("✅ План на сьогодні виконано!\n<b>До зустрічі завтра 👋</b>", { 
      chat_id: chatId, 
      message_id: msg.message_id,
      parse_mode: 'HTML' 
    });

    history.push({ day, balance: data[day] });
    day += 1;
    waitingForScreenshot = false;
  }
});

// ------------------ Обробка фото ------------------
bot.on('photo', async (msg) => {
  const chatId = msg.chat.id;
  if (!waitingForScreenshot) return;

  const fileId = msg.photo[msg.photo.length - 1].file_id;
  const file = await bot.getFile(fileId);
  const fileUrl = https://api.telegram.org/file/bot${TOKEN}/${file.file_path};

  const folder = path.join(screenshotsDir, `day_${day}`);
  if (!fs.existsSync(folder)) fs.mkdirSync(folder);

  const index = (fs.readdirSync(folder).length + 1);
  const filePath = path.join(folder, `screen_${index}.jpg`);

  const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
  fs.writeFileSync(filePath, response.data);

  if (!currentScreens[day]) currentScreens[day] = [];
  currentScreens[day].push(filePath);

  bot.sendMessage(chatId,` 📸 Скрін ${index} для дня ${day} збережено, { parse_mode: 'HTML' }`);
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









