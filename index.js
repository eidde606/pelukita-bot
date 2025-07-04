const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const dotenv = require("dotenv");
const OpenAI = require("openai");
const mongoose = require("mongoose");

const Booking = require("./Booking");
const Session = require("./Session");

dotenv.config();

mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

const app = express();
const PORT = process.env.PORT || 3000;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.use(bodyParser.json());

app.get("/", (req, res) => {
  res.send("Pelukita Messenger Bot is live!");
});

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

app.post("/webhook", async (req, res) => {
  console.log("🔔 Webhook triggered:", JSON.stringify(req.body, null, 2));

  const body = req.body;

  if (body.object === "page") {
    for (const entry of body.entry) {
      const event = entry.messaging[0];
      const senderId = event.sender.id;

      if (event.message && event.message.text) {
        const userMessage = event.message.text.trim();
        console.log("💬 Incoming message:", userMessage);

        let botReply = "Lo siento, algo salió mal...";

        try {
          let session = await Session.findOne({ senderId });
          if (!session) {
            session = new Session({ senderId, data: {}, stage: "initial" });
          }

          const stage = session.stage;
          const data = session.data || {};

          // Determine intent
          const intentCheck = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [
              {
                role: "system",
                content: `You are a friendly assistant. Identify the user's intent based on their message. Reply with one word: greeting, ask_services, ask_packages, start_booking, provide_info, unknown.`,
              },
              {
                role: "user",
                content: userMessage,
              },
            ],
          });

          const intent = intentCheck.choices[0].message.content
            .trim()
            .toLowerCase();

          if (intent === "greeting") {
            botReply = `¡Hola, hola! 🎈🎉 ¿Cómo puedo alegrar tu día? ¿Estás buscando dar una sorpresa especial o pensando en una fiesta divertidísima? 🎁🎂`;
          } else if (intent === "ask_services" || intent === "ask_packages") {
            botReply = `🎊 ¡Claro! Ofrezco dos paquetes de fiesta llenos de diversión:

1️⃣ 🎉 *Paquete Pelukines* – $650 – Ideal para fiestas en casa:
- 1 hora de pinta caritas
- 2 horas de show con juegos y concursos
- Piñata y Happy Birthday 🎂
- Parlante incluido 🔊
Adicionales:
🧸 Muñeco gigante: $60
🍿 Popcorn o algodón (50): $200
🎧 DJ (4 horas): $1000

2️⃣ 🎊 *Paquete Pelukones* – $1500 – Ideal para locales:
- Todo lo de Pelukines
- Muñeco incluido 🧸
- Popcorn y algodón incluidos 🍭
- DJ profesional (4 horas) 🎧

¿Quieres reservar alguno o tienes dudas? 🎈`;
          } else if (intent === "start_booking") {
            session.stage = "booking";

            const parsed = await openai.chat.completions.create({
              model: "gpt-4",
              messages: [
                {
                  role: "system",
                  content: `You are a data parser. Given a message about booking a clown party, extract and return JSON: name, date (YYYY-MM-DD), time (HH:MM AM/PM), service (Pelukines or Pelukones), phone, address, notes. If unknown, set to null.`,
                },
                {
                  role: "user",
                  content: userMessage,
                },
              ],
            });

            const extracted = JSON.parse(parsed.choices[0].message.content);
            const fields = [
              "name",
              "date",
              "time",
              "service",
              "phone",
              "address",
              "notes",
            ];

            for (const field of fields) {
              if (!data[field] && extracted[field]) {
                data[field] = extracted[field];
                if (field === "service") {
                  data.price = extracted[field]
                    .toLowerCase()
                    .includes("pelukon")
                    ? "$1500"
                    : "$650";
                }
              }
            }

            session.data = data;

            const nextMissing = fields.find((f) => !data[f]);

            if (!nextMissing) {
              const newBooking = new Booking({ ...data });
              await newBooking.save();
              await Session.deleteOne({ senderId });
              botReply = `✅ ¡Reservación guardada! 🎉 Pelukita te verá el ${data.date} a las ${data.time}. 🥳`;
            } else {
              await session.save();
              const askPrompt = await openai.chat.completions.create({
                model: "gpt-4",
                messages: [
                  {
                    role: "system",
                    content: `You are Pelukita, the party clown. Ask nicely for the missing booking info: ${nextMissing}. Be joyful.`,
                  },
                ],
              });
              botReply = askPrompt.choices[0].message.content;
            }
          } else {
            botReply = `😊 ¡Gracias por tu mensaje! Puedes preguntarme sobre los paquetes, reservar una fiesta, o pedirme información. ¡Estoy aquí para ayudarte! 🎈`;
          }

          await session.save();
        } catch (err) {
          console.error("❌ Error:", err);
          botReply =
            "😓 Pelukita no entendió. ¿Podrías repetirlo de otra forma?";
        }

        try {
          await axios.post(
            `https://graph.facebook.com/v18.0/me/messages?access_token=${process.env.PAGE_ACCESS_TOKEN}`,
            {
              recipient: { id: senderId },
              message: { text: botReply },
            }
          );
          console.log("✅ Bot reply sent to:", senderId);
        } catch (err) {
          console.error("❌ Sending error:", err.response?.data || err.message);
        }
      }
    }

    return res.status(200).send("EVENT_RECEIVED");
  } else {
    return res.sendStatus(404);
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server is running on port ${PORT}`);
});
