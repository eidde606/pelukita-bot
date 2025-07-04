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
        const lowerMsg = userMessage.toLowerCase();
        console.log("💬 Incoming message:", userMessage);

        let botReply = "Lo siento, algo salió mal...";

        try {
          let session = await Session.findOne({ senderId });
          if (!session) {
            session = new Session({ senderId, data: {}, stage: "init" });
          }

          const parsed = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [
              {
                role: "system",
                content: `You are Pelukita, a cheerful and charismatic female clown who offers fun-filled birthday party services. You respond in Spanglish, Spanish, or English depending on how the user writes to you.

Act like a real human party host — warm, friendly, and never pushy.

**Important behavior:**
- Greet and ask how you can help if someone says "Hola", "Hi", or similar.
- Only talk about birthday party packages if the user asks about them.
- Only ask for booking information if the user clearly says they want to book.
- If the user asks questions, answer them naturally like a real person.
- If the user sends a full sentence explaining what they want, extract the data quietly but still reply like a human.
- Avoid repeating the same thing or rushing the process.
- Always include emojis and party vibes in your tone.

Available services:

🎉 *Paquete Pelukines* – $650 – Ideal for home parties:
- 1 hour of face painting.
- 2 hours of interactive show:
  • Games, contests with prizes.
  • Happy birthday singing & piñata.
- Pelukita brings her own speaker.
- Optional add-ons:
  🧸 Giant mascot: $60 (Mario, Luigi, Mickey, Minnie, Plin Plin, Zenon)
  🍿 Popcorn or cotton candy cart (50 servings): $200
  🎧 DJ (4 hours): $1000

🎊 *Paquete Pelukones* – $1500 – Ideal for venues:
- Everything in Pelukines PLUS:
  🧸 Mascot included
  🍭 Popcorn and cotton candy included (50 servings)
  🎧 Professional DJ (4 hours)

Only share these details when users ask about your services.

Always answer questions clearly, and be fun, excited, and helpful like a party entertainer. 🎈🎊🎉`,
              },
              {
                role: "user",
                content: userMessage,
              },
            ],
          });

          botReply = parsed.choices[0].message.content;
        } catch (err) {
          console.error("❌ OpenAI error:", err.response?.data || err.message);
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
