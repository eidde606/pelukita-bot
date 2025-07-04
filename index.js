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
  .connect(process.env.MONGODB_URI)
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
  const body = req.body;

  if (body.object === "page") {
    for (const entry of body.entry) {
      const event = entry.messaging[0];
      const senderId = event.sender.id;

      if (event.message && event.message.text) {
        const userMessage = event.message.text.trim();
        let botReply =
          "😓 Lo siento, no entendí eso. ¿Podrías repetirlo de otra manera?";

        try {
          let session = await Session.findOne({ senderId });
          if (!session)
            session = new Session({ senderId, data: {}, stage: "init" });

          const extract = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [
              {
                role: "system",
                content: `You're a JSON extractor. Given a message about Pelukita bookings, extract:
{
  name, date (YYYY-MM-DD), time (HH:MM AM/PM), phone, address, service (Pelukines/Pelukones), notes
}
Missing = null.`,
              },
              {
                role: "user",
                content: userMessage,
              },
            ],
          });

          const extracted = JSON.parse(extract.choices[0].message.content);
          const fields = [
            "name",
            "date",
            "time",
            "phone",
            "address",
            "service",
            "notes",
          ];
          const data = session.data;

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

          const needsHelp = !fields.some((f) => extracted[f]);

          if (needsHelp) {
            const answer = await openai.chat.completions.create({
              model: "gpt-4",
              messages: [
                {
                  role: "system",
                  content: `You are Pelukita, a joyful bilingual party clown. Greet users, answer questions about your services or pricing, and only move to booking if they show interest. NEVER ask for booking details unless they clearly want to book.`,
                },
                {
                  role: "user",
                  content: userMessage,
                },
              ],
            });
            botReply = answer.choices[0].message.content;
          } else {
            const nextField = fields.find((f) => !data[f]);

            if (!nextField) {
              await Booking.create({ ...data });
              await Session.deleteOne({ senderId });
              botReply = `🎉 ¡Gracias! Tu reservación para el paquete ${data.service} ha sido confirmada para el ${data.date} a las ${data.time}. 📞 ${data.phone}`;
            } else {
              await session.save();
              const prompt = await openai.chat.completions.create({
                model: "gpt-4",
                messages: [
                  {
                    role: "system",
                    content: `You are Pelukita. The user is trying to book a party. Ask nicely for their missing '${nextField}'. Respond in the user's language.`,
                  },
                ],
              });
              botReply = prompt.choices[0].message.content;
            }
          }
        } catch (err) {
          console.error("❌ Error:", err);
        }

        try {
          await axios.post(
            `https://graph.facebook.com/v18.0/me/messages?access_token=${process.env.PAGE_ACCESS_TOKEN}`,
            {
              recipient: { id: senderId },
              message: { text: botReply },
            }
          );
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

app.listen(PORT, () => console.log(`✅ Server is running on port ${PORT}`));
