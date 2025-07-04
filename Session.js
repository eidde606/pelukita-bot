const mongoose = require("mongoose");

const sessionSchema = new mongoose.Schema(
  {
    senderId: { type: String, required: true, unique: true },
    messages: { type: Array, default: [] }, // stores conversation history
    data: {
      name: String,
      date: String,
      time: String,
      service: String,
      price: String,
      phone: String,
      address: String,
      notes: String,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Session", sessionSchema);
