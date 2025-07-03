const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const dotenv = require("dotenv");

dotenv.config();
const app = express();
const PORT = process.env.PORT || 10000;

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
        const message = event.message.text;
        console.log("💬 Incoming message:", message);

        try {
          await axios.post(
            `https://graph.facebook.com/v18.0/me/messages?access_token=${process.env.PAGE_ACCESS_TOKEN}`,
            {
              recipient: { id: senderId },
              message: { text: `Pelukita says: ${message}` },
            }
          );
          console.log("✅ Response sent to user:", senderId);
        } catch (error) {
          console.error(
            "❌ Error sending message:",
            error.response?.data || error.message
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
