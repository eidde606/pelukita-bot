const mongoose = require("mongoose");

const sessionSchema = new mongoose.Schema(
  {
    senderId: { type: String, required: true, unique: true },
    messages: { type: Array, default: [] }, // stores conversation history
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Session", sessionSchema);
