// // sendEmail.js
// const nodemailer = require("nodemailer");

// const transporter = nodemailer.createTransport({
//   service: "gmail",
//   auth: {
//     user: process.env.GMAIL_USER,
//     pass: process.env.GMAIL_PASS, // This is the 16-digit Gmail app password
//   },
// });

// /**
//  * Sends reservation confirmation email
//  */
// async function sendConfirmationEmail(to, bookingData) {
//   const mailOptions = {
//     from: `"Pelukita" <${process.env.GMAIL_USER}>`,
//     to,
//     subject: "🎉 Confirmación de tu reservación con Pelukita 🎈",
//     html: `
//       <h2>¡Gracias por tu reservación con Pelukita!</h2>
//       <p>Estos son los detalles de tu fiesta:</p>
//       <ul>
//         <li><strong>Nombre:</strong> ${bookingData.name}</li>
//         <li><strong>Fecha:</strong> ${bookingData.date}</li>
//         <li><strong>Hora:</strong> ${bookingData.time}</li>
//         <li><strong>Servicio:</strong> ${bookingData.service}</li>
//         <li><strong>Precio:</strong> ${bookingData.price}</li>
//         <li><strong>Dirección:</strong> ${bookingData.address}</li>
//         <li><strong>Teléfono:</strong> ${bookingData.phone}</li>
//         <li><strong>Notas:</strong> ${bookingData.notes || "Ninguna"}</li>
//       </ul>
//       <p>Nos vemos pronto para celebrar 🎊</p>
//       <p>📞 Pelukita: 804-735-8835</p>
//     `,
//   };

//   return transporter.sendMail(mailOptions);
// }

// module.exports = sendConfirmationEmail;
