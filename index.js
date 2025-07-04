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

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
          const intentClassifier = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [
              {
                role: "system",
                content: `You are an intent classifier. Classify the user's message into one of these: greeting, ask_services, booking_intent, general_question, other. Return just the label.`,
              },
              {
                role: "user",
                content: userMessage,
              },
            ],
          });

          const intent = intentClassifier.choices[0].message.content.trim();

          if (intent === "greeting") {
            botReply =
              "¡Hola, hola! 🎈🎉 ¿Cómo puedo alegrar tu día? ¿Estás buscando dar una sorpresa especial o pensando en una fiesta divertidísima? 🎁🎂";
          } else if (intent === "ask_services") {
            botReply = `🎊 ¡Claro! Ofrezco dos paquetes de fiesta llenos de diversión:

1️⃣ 🎉 *Paquete Pelukines* – $650 – Ideal para fiestas en casa:
- 1 hora de pinta caritas para todos los niños.
- 2 horas de show interactivo con juegos y concursos.
- Canto del Happy Birthday y rompe la piñata.
- Parlante incluido.
Adicionales:
🧸 Muñeco gigante: $60
🍿 Carrito de popcorn o algodón (50 unidades): $200
🎧 DJ adicional (4 horas): $1000

2️⃣ 🎊 *Paquete Pelukones* – $1500 – Ideal para fiestas en local:
- Todo lo incluido en Pelukines
- Muñeco gigante incluido
- Carrito de popcorn y algodón (50 unidades)
- DJ profesional (4 horas)`;
          } else if (intent === "booking_intent") {
            let session = await Session.findOne({ senderId });
            if (!session)
              session = new Session({ senderId, data: {}, stage: "init" });

            const parserResponse = await openai.chat.completions.create({
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

            const extracted = JSON.parse(
              parserResponse.choices[0].message.content
            );
            const fields = [
              "name",
              "date",
              "time",
              "service",
              "phone",
              "address",
              "notes",
            ];
            const data = session.data || {};

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
              const pelukitaPrompt = await openai.chat.completions.create({
                model: "gpt-4",
                messages: [
                  {
                    role: "system",
                    content: `You are Pelukita, a cheerful and charismatic female clown who offers fun-filled birthday party packages. Respond in Spanish/Spanglish/English depending on user's input. Ask nicely for: ${nextMissing}`,
                  },
                ],
              });
              botReply = pelukitaPrompt.choices[0].message.content;
            }
          } else {
            // Handle general questions
            const response = await openai.chat.completions.create({
              model: "gpt-4",
              messages: [
                {
                  role: "system",
                  content: `You are Pelukita, a joyful clown who responds kindly and clearly in Spanglish or Spanish or English depending on user language. Provide helpful answers and guide politely.`,
                },
                {
                  role: "user",
                  content: userMessage,
                },
              ],
            });
            botReply = response.choices[0].message.content;
          }
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
