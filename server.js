const { Pool } = require("pg");
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const dotenv = require("dotenv");
const nodemailer = require("nodemailer");

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

// PostgreSQL Database Configuration
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASS,
    port: process.env.DB_PORT,
});

// Log database connection success or failure
pool.connect((err, client, release) => {
    if (err) {
        console.error("❌ Database connection failed:", err.stack);
    } else {
        console.log("✅ Database connected successfully!");
        release();
    }
});

// Middleware
app.use(bodyParser.json());
app.set("trust proxy", true);
// API Test Route
app.get("/", (req, res) => res.send("API is working!"));

// Create Table If Not Exists.
async function initializeDatabase() {
    try {
        await pool.query(`
                CREATE TABLE IF NOT EXISTS sign_up_forms (
                    id SERIAL PRIMARY KEY,
                    firstname TEXT NOT NULL,
                    lastname TEXT NOT NULL,
                    email TEXT NOT NULL,
                    phone TEXT NOT NULL,
                    fleetsize TEXT NOT NULL,
                    trailertype TEXT NOT NULL,
                    plan TEXT NOT NULL,
                    submittedat TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

        await pool.query(`
                CREATE TABLE IF NOT EXISTS contact_submissions (
                    id SERIAL PRIMARY KEY,
                    email TEXT NOT NULL,
                    phone TEXT,
                    message TEXT NOT NULL,
                    submittedat TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

        console.log("✅ Database tables checked/created successfully!");
    } catch (error) {
        console.error("❌ Error initializing database:", error);
    }
}

// Run database initialization AFTER the connection is established
pool.connect((err, client, release) => {
    if (err) console.error("❌ Database connection failed:", err.stack);
    console.log("✅ Database connected successfully!");
    initializeDatabase();
    release();
});

// Email Transporter Configuration
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST, // smtp.zoho.eu
    port: process.env.EMAIL_PORT, // 465
    secure: false, // Use STARTTLS, NOT SSL
    auth: {
        user: process.env.EMAIL_USER, // Your Zoho email
        pass: process.env.EMAIL_PASS, // Zoho App Password
    },
    tls: {
        ciphers: "SSLv3",
        rejectUnauthorized: false, // Sometimes needed for Zoho
    },
});

// Handle Form Submissions
app.post("/submit-form", async (req, res) => {
    console.log("📩 Received Form Data:", req.body); // Debugging log
    const { firstName, lastName, email, phone, fleetSize, trailerType, plan } =
        req.body;

    if (
        !firstName ||
        !lastName ||
        !email ||
        !phone ||
        !fleetSize ||
        !trailerType ||
        !plan
    ) {
        console.warn("⚠️ Missing required fields:", req.body);
        return res.status(400).json({ error: "All fields are required." });
    }

    try {
        const result = await pool.query(
            "INSERT INTO sign_up_forms (firstName, lastName, email, phone, fleetSize, trailerType, plan) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id",
            [firstName, lastName, email, phone, fleetSize, trailerType, plan]
        );
        console.log("✅ Inserted Sign-Up Form ID:", result.rows[0].id);
        res.status(200).json({
            message: "Form submitted successfully!",
            id: result.rows[0].id,
        });
    } catch (error) {
        console.error("❌ Full Database Error:", error);
        res.status(500).json({ error: error.message }); // Send full error message in response
    }

    // **1️⃣ Auto-Reply Email to the Potential Client**
    const clientMailOptions = {
        from: process.env.EMAIL_USER,
        replyTo: email,
        to: email,
        subject: "Thank You for Signing Up!",
        text: `Hello ${firstName},\n\nThank you for signing up with Iron Wing Dispatching. We will contact you shortly.\n\nAll the best,\nIron Wing Dispatching Team`,
    };

    try {
        console.log("📨 Sending email to admin...");
        await transporter.sendMail(clientMailOptions);
        console.log("📧 Email Auto-Reply Sent to Client Successfully!");
    } catch (emailError) {
        console.error("❌ Error sending email auto-reply:", emailError);
    }

    // **2️⃣ Email to Your Zoho admin Address with Full Submission Details**
    const adminMailOptions = {
        from: process.env.EMAIL_USER,
        to: process.env.EMAIL_USER,
        subject: "🚛 New Sign-Up Form Received",
        text: `
        📩 A new sign-up form has been received!

        👤 Name: ${firstName} ${lastName}
        📧 Email: ${email}
        📞 Phone: ${phone}
        🚛 Fleet Size: ${fleetSize}
        🛻 Trailer Type: ${trailerType}
        📌 Plan Selected: ${plan} 

        🕒 Submitted At: ${new Date().toLocaleString()}
    `,
    };

    try {
        await transporter.sendMail(adminMailOptions);
        console.log("📧 Form Data Sent to Admin Mail Successfully!");
    } catch (emailError) {
        console.error("❌ Error sending form data email to Admin:", emailError);
    }
});

// Handle Contact Form Submissions
app.post("/contact-form", async (req, res) => {
    const { email, phone, message } = req.body;

    if (!email || !message) {
        return res
            .status(400)
            .json({ error: "Email and message are required." });
    }
    console.log("📩 Contact Form Submission:", req.body);

    try {
        const result = await pool.query(
            "INSERT INTO contact_submissions (email, phone, message) VALUES ($1, $2, $3) RETURNING id",
            [email, phone, message]
        );
        console.log("✅ Contact Form Inserted ID:", result.rows[0].id);
        res.status(200).json({
            message: "Contact form submitted successfully!",
            id: result.rows[0].id,
        });
    } catch (error) {
        console.error("❌ Database error:", error);
        res.status(500).json({ error: "Database error" });
    }

    // **1️⃣ Auto-Reply Email to the Potential Client**
    const clientMailOptions = {
        from: process.env.EMAIL_USER,
        replyTo: email, // The sender’s email
        to: email,
        subject: "Thank You for contacting us!",
        text: `Hello,\n\nThank you for contacting Iron Wing Dispatching. We will reach out soon.\n\nAll the best,\nIron Wing Dispatching Team`,
    };

    try {
        console.log("📨 Sending email to admin...");
        await transporter.sendMail(clientMailOptions);
        console.log("📧 Email Auto-Reply Sent to Client Successfully!");
    } catch (emailError) {
        console.error("❌ Error sending email auto-reply:", emailError);
    }

    // **2️⃣ Email to Your Zoho Address with Full Submission Details**
    const adminMailOptions = {
        from: process.env.EMAIL_USER,
        to: process.env.EMAIL_USER,
        subject: "🚛 New Contact Form submission",
        text: `
        📩 A visitor submitted a question!

        📧 Email: ${email}
        📞 Phone: ${phone}
        📝 Message: ${message}

        🕒 Submitted At: ${new Date().toLocaleString()}
    `,
    };

    try {
        await transporter.sendMail(adminMailOptions);
        console.log("📧 Form Data Sent to Admin Mail Successfully!");
    } catch (emailError) {
        console.error("❌ Error sending form data email to Admin:", emailError);
    }
});

app.get("/submissions", async (req, res) => {
    try {
        // Fetch all submissions from the database
        const result = await pool.query(
            "SELECT * FROM submissions ORDER BY submittedAt DESC"
        );

        // Log the data for debugging
        console.log("📂 Retrieved Submissions:", result.rows);

        res.status(200).json(result.rows);
    } catch (error) {
        console.error("❌ Database error while fetching submissions:", error);
        res.status(500).json({
            error: "Database error while retrieving submissions.",
        });
    }
});

// Catch-all route for invalid URLs
app.use((req, res) => res.status(404).json({ error: "Not Found" }));
// Start Server
app.listen(PORT, "0.0.0.0", () =>
    console.log(`Server running at http://0.0.0.0:${PORT}`)
);
