const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const dotenv = require("dotenv");
const OpenAI = require("openai");
const { google } = require("googleapis");

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
app.use(bodyParser.json());
const userStates = {}; // Session memory

app.get("/", (req, res) => {
  res.send("Pelukita Messenger Bot is live!");
});

app.get("/webhook", (req, res) => {
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  } else {
    return res.sendStatus(403);
  }
});

async function addBookingToSheet(data) {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const client = await auth.getClient();
  const sheets = google.sheets({ version: "v4", auth: client });
  const spreadsheetId = "1--bA2wp6b3sDIIdAqbQMOnhCFeGLQihYeQtwj6hfcbQ";

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "Sheet1!A:I",
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [
        [
          data.name,
          data.date,
          data.time,
          data.service,
          data.price,
          data.phone,
          data.address,
          "Booked",
          data.notes || "",
        ],
      ],
    },
  });
}

async function isDateTimeAvailable(date, time) {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const client = await auth.getClient();
  const sheets = google.sheets({ version: "v4", auth: client });
  const spreadsheetId = "1--bA2wp6b3sDIIdAqbQMOnhCFeGLQihYeQtwj6hfcbQ";
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "Sheet1!A:I",
  });
  const rows = res.data.values || [];
  return !rows.some(
    (row) => row[1] === date && row[2] === time && row[7] === "Booked"
  );
}

app.post("/webhook", async (req, res) => {
  const body = req.body;
  if (body.object !== "page") return res.sendStatus(404);

  for (const entry of body.entry) {
    const event = entry.messaging[0];
    const senderId = event.sender.id;
    if (!event.message || !event.message.text) continue;

    const userMessage = event.message.text.trim();
    const state = userStates[senderId] || {
      step: 0,
      lang: /\bes\b|\b(reserva|fecha)\b/i.test(userMessage) ? "es" : "en",
    };
    const reply = async (text) => {
      await axios.post(
        `https://graph.facebook.com/v18.0/me/messages?access_token=${process.env.PAGE_ACCESS_TOKEN}`,
        { recipient: { id: senderId }, message: { text } }
      );
    };

    const prompts = {
      en: [
        "🎉 Great! What's your *full name*?",
        "📅 What *date* is the party? (YYYY-MM-DD)",
        "⏰ What *time* is the party? (e.g. 3:00 PM)",
        "🎈 Which *package* would you like? (Pelukines or Pelukones)",
        "📞 What's your *phone number*?",
        "📍 What's the *address* where the party will be held?",
        "📝 Any special *notes* or requests?",
        '🎉 Confirm your booking:\n\n👤 Name: ${name}\n📅 Date: ${date}\n⏰ Time: ${time}\n🎁 Package: ${service}\n💵 Price: $${price}\n📞 Phone: ${phone}\n📍 Address: ${address}\n📝 Notes: ${notes}\n\nType "yes" to confirm or "cancel" to abort.',
        "🎉 Booking confirmed! Pelukita will see you soon! 🥳",
        "❌ Booking canceled. Let me know if you want to start over!",
        "⚠️ Sorry, that slot is already booked. Try another date/time.",
      ],
      es: [
        "🎉 ¡Genial! ¿Cuál es tu *nombre completo*?",
        "📅 ¿Qué *fecha* es la fiesta? (AAAA-MM-DD)",
        "⏰ ¿A qué *hora* será la fiesta? (Ej. 3:00 PM)",
        "🎈 ¿Qué *paquete* deseas? (Pelukines o Pelukones)",
        "📞 ¿Cuál es tu *número de teléfono*?",
        "📍 ¿Cuál es la *dirección* donde se celebrará la fiesta?",
        "📝 ¿Alguna *nota especial* o petición?",
        '🎉 Confirma tu reserva:\n\n👤 Nombre: ${name}\n📅 Fecha: ${date}\n⏰ Hora: ${time}\n🎁 Paquete: ${service}\n💵 Precio: $${price}\n📞 Teléfono: ${phone}\n📍 Dirección: ${address}\n📝 Notas: ${notes}\n\nEscribe "sí" para confirmar o "cancelar" para abortar.',
        "🎉 ¡Reserva confirmada! ¡Pelukita te verá pronto! 🥳",
        "❌ Reserva cancelada. ¡Avísame si quieres empezar otra vez!",
        "⚠️ Lo siento, ese horario ya está reservado. Intenta otra fecha/hora.",
      ],
    };

    const p = prompts[state.lang];

    switch (state.step) {
      case 0:
        if (/\b(book|reserva)\b/i.test(userMessage)) {
          userStates[senderId] = { ...state, step: 1 };
          return reply(p[0]);
        }
        break;
      case 1:
        state.name = userMessage;
        state.step = 2;
        return reply(p[1]);
      case 2:
        state.date = userMessage;
        state.step = 3;
        return reply(p[2]);
      case 3:
        state.time = userMessage;
        state.step = 4;
        return reply(p[3]);
      case 4:
        state.service = userMessage;
        state.price = /pelukones/i.test(userMessage) ? 1500 : 650;
        state.step = 5;
        return reply(p[4]);
      case 5:
        state.phone = userMessage;
        state.step = 6;
        return reply(p[5]);
      case 6:
        state.address = userMessage;
        state.step = 7;
        return reply(p[6]);
      case 7:
        state.notes = userMessage;
        const available = await isDateTimeAvailable(state.date, state.time);
        if (!available) {
          delete userStates[senderId];
          return reply(p[10]);
        }
        state.step = 8;
        userStates[senderId] = state;
        const summary = p[7]
          .replace("${name}", state.name)
          .replace("${date}", state.date)
          .replace("${time}", state.time)
          .replace("${service}", state.service)
          .replace("${price}", state.price)
          .replace("${phone}", state.phone)
          .replace("${address}", state.address)
          .replace("${notes}", state.notes || "None");
        return reply(summary);
      case 8:
        if (/\b(yes|sí)\b/i.test(userMessage.toLowerCase())) {
          await addBookingToSheet(state);
          delete userStates[senderId];
          return reply(p[8]);
        } else {
          delete userStates[senderId];
          return reply(p[9]);
        }
    }

    // Fallback to AI if not in booking
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content:
              "You are Pelukita, a bilingual party clown. Respond in the language the user uses.",
          },
          { role: "user", content: userMessage },
        ],
      });
      return reply(completion.choices[0].message.content);
    } catch (err) {
      return reply("❌ Error! Try again later.");
    }
  }
  return res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(`✅ Server is running on port ${PORT}`);
});
