const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const nodemailer = require('nodemailer');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

// --- FILE UPLOAD ---
const uploadDir = './uploads';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
    destination: './uploads/',
    filename: (req, file, cb) => {
        cb(null, 'IMAGE-' + Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

app.use('/uploads', express.static('uploads'));

// --- DATABASE CONNECTION ---
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    ssl: {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: false
    }
});

// --- EMAIL TRANSPORTER ---
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, 
    auth: {
        user: 'gcp.bpmjudy@gmail.com', 
        pass: process.env.EMAIL_PASS 
    }
});

// --- ANNOUNCEMENT ---

app.get('/announcements', (req, res) => {
    db.query('SELECT * FROM announcements ORDER BY id DESC', (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

// CREATE WITH IMAGE
app.post('/announcements', upload.single('image'), (req, res) => {
    const { title, content } = req.body;
    const imageUrl = req.file ? req.file.filename : null;
    const formattedContent = (content || "").replace(/\n/g, '<br>');

    // 1. Save to Database
    db.query('INSERT INTO announcements (title, content, image_url) VALUES (?, ?, ?)', 
    [title, content, imageUrl], (err, result) => {
        if (err) {
            console.error("DB Error:", err);
            return res.status(500).json({ error: "Database Insert Failed" });
        }

        // 2. Fetch Emails
        db.query('SELECT email FROM emails', (err, emailResults) => {
            const emails = (emailResults && emailResults.length > 0) ? emailResults.map(row => row.email) : [];
            
            if (emails.length === 0) {
                return res.json({ id: result.insertId, message: "Saved (No emails to send)" });
            }

            // 3. Setup Email
            let attachments = [];
            let imageHtml = "";
            if (req.file) {
                attachments.push({
                    filename: req.file.filename,
                    path: req.file.path,
                    cid: 'announcementImage' 
                });
                imageHtml = `<br><div style="text-align:center;"><img src="cid:announcementImage" style="max-width: 100%; border-radius: 8px;"></div>`;
            }

            const mailOptions = {
                from: '"Awards Central Philippines" <gcp.bpmjudy@gmail.com>',
                to: 'gcp.bpmjudy@gmail.com', 
                bcc: emails,
                subject: 'NEW ANNOUNCEMENT: ' + title,
                html: `<div style="font-family: Arial, sans-serif; padding: 20px; background: #f4f4f4;">
                        <div style="max-width: 600px; margin: auto; background: white; padding: 25px; border-radius: 10px; border: 1px solid #ccc;">
                            <h2 style="color: #333; border-bottom: 2px solid #cccc4d; padding-bottom: 10px;">${title}</h2>
                            <p style="color: #555; line-height: 1.6;">${formattedContent}</p>
                            ${imageHtml}
                        </div>
                       </div>`,
                attachments: attachments
            };

            // 4. Send Email
            transporter.sendMail(mailOptions, (mailErr, info) => {
                if (mailErr) {
                    console.error("❌ EMAIL FAILED:", mailErr);
                } else {
                    console.log("✅ EMAIL SENT:", info.response);
                }
                res.json({ id: result.insertId });
            });
        });
    });
});

// UPDATE
app.put('/announcements/:id', upload.single('image'), (req, res) => {
    const { title, content, removeImage } = req.body;
    const id = req.params.id;
    const newImageUrl = req.file ? req.file.filename : null;
    const formattedContent = (content || "").replace(/\n/g, '<br>');

    // 1. Fetch current announcement to keep existing image if no new one is uploaded
    db.query('SELECT image_url FROM announcements WHERE id = ?', [id], (err, currentResults) => {
        if (err || currentResults.length === 0) return res.status(404).send("Not found");

        const existingImageUrl = currentResults[0].image_url;
        let finalImageUrl = existingImageUrl;

        // Determine what the new image_url should be in the DB
        if (removeImage === 'true' || removeImage === true) {
            finalImageUrl = null;
        } else if (newImageUrl) {
            finalImageUrl = newImageUrl;
        }

        // 2. Perform Database Update
        const updateQuery = 'UPDATE announcements SET title = ?, content = ?, image_url = ? WHERE id = ?';
        db.query(updateQuery, [title, content, finalImageUrl, id], (updateErr) => {
            if (updateErr) return res.status(500).send(updateErr);

            // 3. Fetch Emails for notification
            db.query('SELECT email FROM emails', (mailErr, emailResults) => {
                const emails = (emailResults && emailResults.length > 0) ? emailResults.map(row => row.email) : [];
                if (emails.length === 0) return res.send("Updated (No emails)");

                // 4. IMAGE LOGIC FOR EMAIL (Attaches new OR existing image)
                let attachments = [];
                let imageHtml = "";

                if (finalImageUrl) {
                    attachments.push({
                        filename: finalImageUrl,
                        path: path.join(__dirname, 'uploads', finalImageUrl),
                        cid: 'announcementImage' 
                    });
                    imageHtml = `<br><div style="text-align:center;"><img src="cid:announcementImage" style="max-width: 100%; border-radius: 8px;"></div>`;
                }

                const mailOptions = {
                    from: '"Awards Central Philippines" <gcp.bpmjudy@gmail.com>',
                    to: 'gcp.bpmjudy@gmail.com', 
                    bcc: emails,
                    subject: 'UPDATED ANNOUNCEMENT: ' + title,
                    html: `<div style="font-family: Arial, sans-serif; padding: 20px; background: #f4f4f4;">
                            <div style="max-width: 600px; margin: auto; background: white; padding: 25px; border-radius: 10px; border: 1px solid #ccc;">
                                <p style="color: #d4ac0d; font-weight: bold; margin-bottom: 5px;">Announcement Updated:</p>
                                <h2 style="color: #333; border-bottom: 2px solid #cccc4d; padding-bottom: 10px;">${title}</h2>
                                <p style="color: #555; line-height: 1.6;">${formattedContent}</p>
                                ${imageHtml}
                                <p style="font-size: 12px; color: #888; margin-top: 20px; text-align: center; border-top: 1px solid #eee; padding-top: 10px;">
                                    View the full details on the employee portal.
                                </p>
                            </div>
                           </div>`,
                    attachments: attachments
                };

                // 5. Send the updated email
                transporter.sendMail(mailOptions, (sendErr) => {
                    if (sendErr) console.error("Update Email Error:", sendErr);
                    res.send("Updated and Notification Sent");
                });
            });
        });
    });
});

// DELETE
// DELETE with Email Notification
app.delete('/announcements/:id', (req, res) => {
    const id = req.params.id;

    // 1. Fetch EVERYTHING before deleting so we can put it in the email
    db.query('SELECT title, content, image_url FROM announcements WHERE id = ?', [id], (err, results) => {
        if (err || results.length === 0) {
            return res.status(404).send("Announcement not found");
        }

        const { title, content, image_url } = results[0];
        const formattedContent = (content || "").replace(/\n/g, '<br>');

        // 2. Now perform the deletion
        db.query('DELETE FROM announcements WHERE id = ?', [id], (deleteErr) => {
            if (deleteErr) return res.status(500).send(deleteErr);

            // 3. Fetch Emails
            db.query('SELECT email FROM emails', (mailQueryErr, emailResults) => {
                const emails = (emailResults && emailResults.length > 0) ? emailResults.map(row => row.email) : [];
                if (emails.length === 0) return res.send("Deleted (No staff notified)");

                // 4. Handle Image for the "Deleted" email
                let attachments = [];
                let imageHtml = "";
                if (image_url) {
                    attachments.push({
                        filename: image_url,
                        path: path.join(__dirname, 'uploads', image_url),
                        cid: 'deletedImage' 
                    });
                    imageHtml = `<br><div style="text-align:center;"><img src="cid:deletedImage" style="max-width: 100%; border-radius: 8px; opacity: 0.6;"></div>`;
                }

                const mailOptions = {
                    from: '"Awards Central Philippines" <gcp.bpmjudy@gmail.com>',
                    to: 'gcp.bpmjudy@gmail.com', 
                    bcc: emails,
                    subject: 'CANCELLED ANNOUNCEMENT: ' + title,
                    html: `<div style="font-family: Arial, sans-serif; padding: 20px; background: #f4f4f4;">
                            <div style="max-width: 600px; margin: auto; background: white; padding: 25px; border-radius: 10px; border: 2px solid #cc0000;">
                                <h2 style="color: #cc0000; text-align:center;">Announcement Removed/Cancelled</h2>
                                <p style="color: #666; font-style: italic; text-align:center;">The following post has been taken down from the portal; Therefore, won't be implemented anymore:</p>
                                <hr style="border: 0; border-top: 1px solid #eee;">
                                <h3 style="color: #333;">${title}</h3>
                                <p style="color: #555; line-height: 1.6;">${formattedContent}</p>
                                ${imageHtml}
                            </div>
                           </div>`,
                    attachments: attachments
                };

                // 5. Send Email
                transporter.sendMail(mailOptions, (mailErr) => {
                    if (mailErr) console.error("Delete Email Error:", mailErr);
                    res.send("Deleted and Full Notification Sent");
                });
            });
        });
    });
});

// --- EMAIL MANAGEMENT ---
app.get('/emails', (req, res) => { db.query('SELECT * FROM emails ORDER BY id DESC', (err, results) => { res.json(results); }); });
app.post('/emails', (req, res) => { const { email } = req.body; db.query('INSERT INTO emails (email) VALUES (?)', [email], (err, result) => { if (err) return res.status(500).json(err); res.json({ id: result.insertId, email }); }); });
app.delete('/emails/:id', (req, res) => { db.query('DELETE FROM emails WHERE id = ?', [req.params.id], (err) => { res.send("Deleted"); }); });
app.get('/emails/check/:email', (req, res) => { db.query('SELECT * FROM emails WHERE email = ?', [req.params.email], (err, results) => { res.json({ exists: results.length > 0 }); }); });

const PORT = process.env.PORT || 10000; 
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));

