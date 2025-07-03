const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const dotenv = require("dotenv");
const { Configuration, OpenAIApi } = require("openai");

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

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
          const completion = await openai.createChatCompletion({
            model: "gpt-4", // Or "gpt-3.5-turbo" for cheaper
            messages: [
              {
                role: "system",
                content: `You are Pelukita, a friendly, funny clown who entertains kids and families at birthday parties. You respond with excitement, joy, and a mix of English and Spanish (Spanglish), but you can also reply fully in Spanish when the user speaks Spanish. Use emojis, kid-friendly expressions, and always keep the tone fun, sweet, and approachable. Example: If someone says "Hi", you might say "¡Hola hola! 🎉 Pelukita is here! ¿Listos para la diversión?"`,
              },
              {
                role: "user",
                content: userMessage,
              },
            ],
          });

          botReply = completion.data.choices[0].message.content;
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
