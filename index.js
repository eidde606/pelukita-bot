// const express = require("express");
// const bodyParser = require("body-parser");
// const axios = require("axios");
// const dotenv = require("dotenv");
// const mongoose = require("mongoose");
// const handleUserMessage = require("./handleUserMessage");

// dotenv.config();

// const app = express();
// const PORT = process.env.PORT || 3000;

// // ✅ Connect to MongoDB
// mongoose
//   .connect(process.env.MONGODB_URI, {
//     useNewUrlParser: true,
//     useUnifiedTopology: true,
//   })
//   .then(() => console.log("✅ Connected to MongoDB"))
//   .catch((err) => {
//     console.error("❌ MongoDB connection error:", err.message);
//     process.exit(1);
//   });

// app.use(bodyParser.json());

// // Root endpoint
// app.get("/", (req, res) => {
//   res.send("Pelukita Messenger Bot is live!");
// });

// // Webhook verification
// app.get("/webhook", (req, res) => {
//   const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
//   const mode = req.query["hub.mode"];
//   const token = req.query["hub.verify_token"];
//   const challenge = req.query["hub.challenge"];

//   if (mode && token === VERIFY_TOKEN) {
//     console.log("✅ Webhook verified successfully");
//     return res.status(200).send(challenge);
//   } else {
//     console.warn("❌ Webhook verification failed");
//     return res.sendStatus(403);
//   }
// });

// // Handle messages
// app.post("/webhook", async (req, res) => {
//   console.log("🔔 Webhook triggered:", JSON.stringify(req.body, null, 2));

//   if (req.body.object === "page") {
//     for (const entry of req.body.entry) {
//       const event = entry.messaging[0];
//       const senderId = event.sender.id;

//       if (event.message && event.message.text) {
//         const userMessage = event.message.text.trim();
//         console.log("💬 Incoming:", userMessage);

//         let botReply = "Lo siento, algo salió mal...";

//         try {
//           botReply = await handleUserMessage(senderId, userMessage); // pass senderId too
//         } catch (err) {
//           console.error("❌ handleUserMessage error:", err.message);
//         }

//         try {
//           await axios.post(
//             `https://graph.facebook.com/v18.0/me/messages?access_token=${process.env.PAGE_ACCESS_TOKEN}`,
//             {
//               recipient: { id: senderId },
//               message: { text: botReply },
//             }
//           );
//           console.log("✅ Reply sent to user:", senderId);
//         } catch (err) {
//           console.error(
//             "❌ Message sending error:",
//             err.response?.data || err.message
//           );
//         }
//       }
//     }

//     return res.sendStatus(200);
//   }

//   res.sendStatus(404);
// });

// // Start server
// app.listen(PORT, () => {
//   console.log(`✅ Server is running on port ${PORT}`);
// });
