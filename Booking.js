const moongose = require("mongoose");

const bookingSchema = new moongose.Schema(
  {
    name: String,
    date: String,
    time: String,
    service: String,
    price: String,
    phone: String,
    address: String,
    status: {
      type: String,
      default: "Booked",
    },
    notes: String,
  },
  { timestamps: true }
);

module.exports = moongose.model("Booking", bookingSchema);
