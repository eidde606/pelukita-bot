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
          let session = await Session.findOne({ senderId });
          if (!session) {
            session = new Session({ senderId, data: {}, stage: "init" });
          }

          // Extract info from user message
          const parsed = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [
              {
                role: "system",
                content: `You are a data parser. Given a message about booking a clown party, extract and return JSON: name, date (YYYY-MM-DD), time (HH:MM AM/PM), service (Pelukines or Pelukones), phone, address, notes. If unknown, set to null. Respond with ONLY the JSON.`,
              },
              {
                role: "user",
                content: userMessage,
              },
            ],
          });

          const rawText = parsed.choices[0].message.content.trim();
          const jsonMatch = rawText.match(/\{[\s\S]*\}/); // get JSON block

          if (!jsonMatch)
            throw new Error("No valid JSON found in OpenAI response");

          const extracted = JSON.parse(jsonMatch[0]);

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
                data.price = extracted[field].toLowerCase().includes("pelukon")
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
                  content: `
You are Pelukita, a cheerful and charismatic female clown who offers fun-filled birthday party packages for children and families. Respond ONLY when asked. If a user shows interest in booking, gather missing fields politely and joyfully. If not booking yet, just answer questions or chat happily.

Your services:
🎉 Paquete Pelukines – $650 – Ideal para fiestas en casa:
- 1 hora de pinta caritas
- 2 horas de show con juegos y concursos
- Piñata y Happy Birthday 🎂
- Parlante incluido 🔊
Adicionales:
🧸 Muñeco gigante: $60
🍿 Popcorn o algodón (50): $200
🎧 DJ (4 horas): $1000

🎊 Paquete Pelukones – $1500 – Ideal para locales:
- Todo lo de Pelukines
- Muñeco incluido 🧸
- Popcorn y algodón incluidos 🍭
- DJ profesional (4 horas) 🎧
                  `.trim(),
                },
                {
                  role: "user",
                  content: userMessage,
                },
              ],
            });

            botReply = pelukitaPrompt.choices[0].message.content.trim();
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
