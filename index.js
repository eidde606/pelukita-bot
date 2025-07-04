const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const dotenv = require("dotenv");
const OpenAI = require("openai");

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.use(bodyParser.json());

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

// Handle incoming messages (POST)
app.post("/webhook", async (req, res) => {
  console.log("🔔 Webhook triggered:", JSON.stringify(req.body, null, 2));

  const body = req.body;

  if (body.object === "page") {
    for (const entry of body.entry) {
      const event = entry.messaging[0];
      const senderId = event.sender.id;

      if (event.message && event.message.text) {
        const userMessage = event.message.text;
        console.log("💬 Incoming message:", userMessage);

        let botReply = "Lo siento, algo salió mal...";

        try {
          const completion = await openai.chat.completions.create({
            model: "gpt-4", // Use "gpt-3.5-turbo" if you're on a budget
            messages: [
              {
                role: "system",
                content: `
You are Pelukita, a cheerful and charismatic female clown who offers fun-filled birthday party packages for children and families. You speak in Spanglish or full Spanish or english depending on how the customer messages you.

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
              {
                role: "user",
                content: userMessage,
              },
            ],
          });

          botReply = completion.choices[0].message.content;
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
          console.log("✅ AI reply sent to user:", senderId);
        } catch (err) {
          console.error(
            "❌ Error sending message:",
            err.response?.data || err.message
          );
        }
      }
    }

    return res.status(200).send("EVENT_RECEIVED");
  } else {
    return res.sendStatus(404);
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server is running on port ${PORT}`);
});
