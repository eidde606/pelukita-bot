const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const dotenv = require("dotenv");
const OpenAI = require("openai");
const { google } = require("googleapis");

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.use(bodyParser.json());

const userStates = {};

// Root endpoint
app.get("/", (req, res) => {
  res.send("Pelukita Messenger Bot is live!");
});

// Webhook verification (GET)
app.get("/webhook", (req, res) => {
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verified successfully");
    return res.status(200).send(challenge);
  } else {
    console.warn("❌ Webhook verification failed");
    return res.sendStatus(403);
  }
});

// Save bookings to Google Sheets (uses env var GOOGLE_SERVICE_ACCOUNT_JSON)
async function addBookingToSheet(data) {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const client = await auth.getClient();
  const sheets = google.sheets({ version: "v4", auth: client });

  const spreadsheetId = "1--bA2wp6b3sDIIdAqbQMOnhCFeGLQihYeQtwj6hfcbQ";
  const range = "Sheet1!A:I";

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
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

// Webhook handler (POST)
app.post("/webhook", async (req, res) => {
  const body = req.body;

  if (body.object === "page") {
    for (const entry of body.entry) {
      const event = entry.messaging[0];
      const senderId = event.sender.id;

      if (event.message && event.message.text) {
        const userMessage = event.message.text.trim();
        const state = userStates[senderId] || { step: 0 };

        const reply = async (text) => {
          await axios.post(
            `https://graph.facebook.com/v18.0/me/messages?access_token=${process.env.PAGE_ACCESS_TOKEN}`,
            {
              recipient: { id: senderId },
              message: { text },
            }
          );
        };

        switch (state.step) {
          case 0:
            if (/book|reserva/i.test(userMessage)) {
              userStates[senderId] = { step: 1 };
              return reply("🎉 Great! What's your *full name*?");
            }
            break;

          case 1:
            state.name = userMessage;
            state.step = 2;
            return reply("📅 What *date* is the party? (YYYY-MM-DD)");

          case 2:
            state.date = userMessage;
            state.step = 3;
            return reply("⏰ What *time* is the party? (e.g. 3:00 PM)");

          case 3:
            state.time = userMessage;
            state.step = 4;
            return reply(
              "🎈 Which *package* would you like? (Pelukines or Pelukones)"
            );

          case 4:
            state.service = userMessage;
            state.price = /pelukones/i.test(userMessage) ? 1500 : 650;
            state.step = 5;
            return reply("📞 What's your *phone number*?");

          case 5:
            state.phone = userMessage;
            state.step = 6;
            return reply(
              "📍 What's the *address* where the party will be held?"
            );

          case 6:
            state.address = userMessage;
            state.step = 7;
            return reply("📝 Any special *notes* or requests?");

          case 7:
            state.notes = userMessage;
            state.step = 8;
            userStates[senderId] = state;

            const summary = `🎉 Confirm your booking:

👤 Name: ${state.name}
📅 Date: ${state.date}
⏰ Time: ${state.time}
🎁 Package: ${state.service}
💵 Price: $${state.price}
📞 Phone: ${state.phone}
📍 Address: ${state.address}
📝 Notes: ${state.notes || "None"}

Type "yes" to confirm or "cancel" to abort.`;

            return reply(summary);

          case 8:
            if (/yes|sí/i.test(userMessage.toLowerCase())) {
              await addBookingToSheet(state);
              delete userStates[senderId];
              return reply(
                "🎉 Booking confirmed! Pelukita will see you soon! 🥳"
              );
            } else {
              delete userStates[senderId];
              return reply(
                "❌ Booking canceled. Let me know if you want to start over!"
              );
            }
        }

        // Default AI reply if not booking flow
        try {
          const completion = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [
              {
                role: "system",
                content: `
You are Pelukita, a cheerful and charismatic female clown who offers fun-filled birthday party packages for children and families. You speak in Spanglish or full Spanish or English depending on how the customer messages you.

These are your services:

🎉 *Paquete Pelukines* – $650 – Ideal para fiestas en casa:
- 1 hora de pinta caritas para todos los niños.
- 2 horas de show interactivo que incluye:
  • Juegos y concursos con premios para niños y adultos.
  • Rompe la piñata y canto del Happy Birthday.
- Pelukita lleva su propio speaker para animar el evento.
- Adicionales disponibles:
  🧸 Muñeco gigante: $60 (Mario, Luigi, Mickey, Minnie, Plin Plin, Zenon)
  🍿 Carrito de popcorn o algodón de azúcar (50 unidades): $200
  🎧 DJ adicional (4 horas): $1000

🎊 *Paquete Pelukones* – $1500 – Ideal para fiestas en local:
- Todo lo incluido en Pelukines, más:
  🧸 Muñeco gigante incluido a elección.
  🍭 Carrito de popcorn y algodón de azúcar con 50 unidades.
  🎧 DJ profesional (4 horas).

Always respond with joy, emojis, and excitement like a party host. Be helpful, answer customer questions clearly, and offer to explain the differences between packages if asked.
`.trim(),
              },
              { role: "user", content: userMessage },
            ],
          });

          return reply(completion.choices[0].message.content);
        } catch (err) {
          console.error("❌ OpenAI error:", err.response?.data || err.message);
          return reply("Oops! Something went wrong. Try again later.");
        }
      }
    }
    return res.sendStatus(200);
  }
  return res.sendStatus(404);
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server is running on port ${PORT}`);
});
