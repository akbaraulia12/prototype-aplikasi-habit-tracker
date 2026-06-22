// ================================================================
// server.js — HabitFlow Backend (Full Custom MySQL)
// Runtime: Node.js | Framework: Express.js
// DB: MySQL via Laragon (mysql2) | Auth: bcryptjs + nodemailer
// ================================================================

require('dotenv').config(); // Harus di baris paling atas

const express    = require('express');
const mysql      = require('mysql2');
const cors       = require('cors');
const crypto     = require('crypto');   // built-in Node.js
const bcrypt     = require('bcryptjs');
const nodemailer = require('nodemailer');

const app = express();

app.use(cors());
app.use(express.json());

// ================================================================
// 1. KONEKSI DATABASE (dari .env — standar Laragon)
// ================================================================
const db = mysql.createConnection({
    host    : process.env.DB_HOST     || 'localhost',
    user    : process.env.DB_USER     || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME     || 'habit_tracker',
    port    : parseInt(process.env.DB_PORT) || 3306
});

db.connect((err) => {
    if (err) {
        console.error('❌ Koneksi ke Laragon Gagal:', err.stack);
        return;
    }
    console.log(`✅ Terhubung ke MySQL Laragon → database: ${process.env.DB_NAME || 'habit_tracker'}`);
});

// ================================================================
// 2. KONFIGURASI NODEMAILER (SMTP Kustom dari .env)
// ================================================================
const mailer = nodemailer.createTransport({
    host  : process.env.SMTP_HOST,
    port  : parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true', // true untuk port 465, false untuk 587
    auth  : {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

// Verifikasi koneksi SMTP saat server pertama kali startup
mailer.verify((err, success) => {
    if (err) {
        console.error('❌ SMTP Koneksi GAGAL:', err.message);
        console.error('   → Cek SMTP_USER, SMTP_PASS, SMTP_HOST, SMTP_PORT di file .env');
    } else {
        console.log(`✅ SMTP Siap! Terhubung ke ${process.env.SMTP_HOST}:${process.env.SMTP_PORT} sebagai ${process.env.SMTP_USER}`);
    }
});

// ── Endpoint debug SMTP (hanya untuk development) ────────────────
// Akses via browser: http://localhost:3000/auth/test-smtp
app.get('/auth/test-smtp', async (req, res) => {
    mailer.verify((err, success) => {
        if (err) {
            return res.status(500).json({
                ok     : false,
                message: 'Koneksi SMTP GAGAL',
                detail : err.message,
                tips   : [
                    'Pastikan SMTP_USER dan SMTP_PASS di .env sudah benar',
                    'Untuk Gmail: gunakan App Password (bukan password biasa)',
                    'App Password: https://myaccount.google.com/apppasswords',
                    'Pastikan Verifikasi 2 Langkah aktif di akun Google kamu'
                ]
            });
        }
        return res.status(200).json({
            ok     : true,
            message: `SMTP OK! Terhubung ke ${process.env.SMTP_HOST}:${process.env.SMTP_PORT}`,
            user   : process.env.SMTP_USER
        });
    });
});


// ================================================================
// 3. ENDPOINT: Register Akun Baru
//    POST /api/register
//    Body: { username, fullName, email, password }
// ================================================================
app.post('/api/register', async (req, res) => {
    const { username, fullName, email, password } = req.body;

    console.log('Register attempt:', { username, email, password: '***' });

    if (!username || !fullName || !email || !password) {
        return res.status(400).json({ success: false, message: 'Semua field wajib diisi.' });
    }

    try {
        const dbPromise = db.promise();

        // Hash password dengan bcrypt (cost factor 10)
        const passwordHash = await bcrypt.hash(password, 10);

        // Generate ID berurutan 4 digit (0001, 0002, dst)
        const [rows] = await dbPromise.query(
            'SELECT id FROM users ORDER BY CAST(id AS UNSIGNED) DESC LIMIT 1'
        );

        let nextIdNumber = 1;
        if (rows.length > 0 && rows[0].id) {
            const lastId = parseInt(rows[0].id, 10);
            if (!isNaN(lastId)) nextIdNumber = lastId + 1;
        }
        const userId = String(nextIdNumber).padStart(4, '0');

        // INSERT dengan prepared statement (anti SQL Injection)
        await dbPromise.query(
            'INSERT INTO users (id, username, full_name, email, password_hash) VALUES (?, ?, ?, ?, ?)',
            [userId, username, fullName, email, passwordHash]
        );

        console.log(`✅ User baru terdaftar: ${email} (id: ${userId})`);
        return res.status(201).json({ success: true, message: 'Akun berhasil terdaftar!' });

    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            if (err.sqlMessage && err.sqlMessage.includes('email')) {
                return res.status(409).json({ success: false, message: 'Email sudah terdaftar.' });
            }
            if (err.sqlMessage && err.sqlMessage.includes('username')) {
                return res.status(409).json({ success: false, message: 'Username sudah digunakan.' });
            }
        }
        console.error('❌ Register error:', err);
        return res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server.' });
    }
});

// ================================================================
// 4. ENDPOINT: Login
//    POST /api/login
//    Body: { email, password }
// ================================================================
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    console.log('Login attempt:', email);

    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Email dan password wajib diisi.' });
    }

    try {
        const dbPromise = db.promise();

        // Cari user berdasarkan email — prepared statement
        const [results] = await dbPromise.query(
            'SELECT id, username, full_name, email, password_hash FROM users WHERE email = ?',
            [email]
        );

        if (results.length === 0) {
            // Respons generic agar tidak membocorkan info "email tidak ada"
            return res.status(401).json({ success: false, message: 'Email atau password salah.' });
        }

        const user = results[0];

        // Verifikasi password dengan bcrypt (timing-safe)
        const isValid = await bcrypt.compare(password, user.password_hash);
        if (!isValid) {
            return res.status(401).json({ success: false, message: 'Email atau password salah.' });
        }

        console.log(`✅ Login berhasil: ${user.email}`);

        // Kembalikan data user tanpa password_hash
        return res.status(200).json({
            success: true,
            message: 'Login berhasil!',
            user: {
                id      : user.id,
                username: user.username,
                fullName: user.full_name,
                email   : user.email
            }
        });

    } catch (err) {
        console.error('❌ Login error:', err);
        return res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server.' });
    }
});

// ================================================================
// 5. ENDPOINT: Forgot Password (Kirim Email Reset)
//    POST /auth/forgot-password
//    Body: { email }
//
//    Alur:
//    1. Cari email di tabel users
//    2. Generate token unik (crypto.randomBytes)
//    3. Simpan token + expires_at ke password_resets
//    4. Kirim email HTML profesional via Nodemailer
// ================================================================
app.post('/auth/forgot-password', async (req, res) => {
    const { email } = req.body;
    console.log(`\n[DEBUG] 1. Menerima request forgot password untuk email: "${email}"`);

    // Validasi input
    if (!email || typeof email !== 'string' || !email.includes('@')) {
        console.log(`[DEBUG] -> Validasi gagal: Format email tidak valid.`);
        return res.status(400).json({ success: false, message: 'Format email tidak valid.' });
    }

    const safeEmail = email.trim().toLowerCase();

    try {
        const dbPromise = db.promise();

        // Cek apakah email terdaftar (prepared statement)
        const [users] = await dbPromise.query(
            'SELECT id, full_name FROM users WHERE email = ?',
            [safeEmail]
        );

        console.log(`[DEBUG] 2. Hasil pencarian DB untuk "${safeEmail}": Ditemukan ${users.length} user.`);

        // PENTING: Selalu kembalikan respons sukses meski email tidak ada
        // Ini mencegah attacker mengetahui email mana yang terdaftar (user enumeration)
        if (users.length === 0) {
            console.log(`[DEBUG] -> Email tidak ada di database. Respons sukses palsu dikirim.`);
            return res.status(200).json({
                success: true,
                message: 'Jika email terdaftar, tautan reset akan segera dikirim.'
            });
        }

        const user = users[0];

        // Generate token aman secara kriptografi (64 karakter hex)
        const token = crypto.randomBytes(32).toString('hex');

        // Hitung waktu kedaluwarsa (default 60 menit dari .env)
        const expMinutes = parseInt(process.env.RESET_TOKEN_EXPIRES_MINUTES) || 60;
        const expiresAt = new Date(Date.now() + expMinutes * 60 * 1000);
        // Format untuk MySQL DATETIME: 'YYYY-MM-DD HH:MM:SS'
        const expiresAtMysql = expiresAt.toISOString().slice(0, 19).replace('T', ' ');

        // Simpan atau perbarui token di tabel password_resets
        // Gunakan INSERT ... ON DUPLICATE KEY UPDATE agar satu email = satu token aktif
        await dbPromise.query(
            `INSERT INTO password_resets (email, token, expires_at)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE
                 token = VALUES(token),
                 expires_at = VALUES(expires_at),
                 created_at = CURRENT_TIMESTAMP`,
            [safeEmail, token, expiresAtMysql]
        );
        console.log(`[DEBUG] 3. Token reset berhasil di-generate dan disimpan ke tabel password_resets.`);

        // Bangun URL reset yang akan disisipkan ke email
        const frontendUrl = process.env.FRONTEND_BASE_URL || 'http://localhost:5500/views';
        const resetLink = `${frontendUrl}/reset-password.html?token=${token}`;

        // ── Template Email HTML Profesional ──────────────────────
        const htmlBody = `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Password — HabitFlow</title>
</head>
<body style="margin:0;padding:0;background-color:#f9fafb;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#10B981 0%,#059669 100%);padding:40px 40px 32px;text-align:center;">
              <div style="width:56px;height:56px;background:rgba(255,255,255,0.2);border-radius:50%;margin:0 auto 16px;display:flex;align-items:center;justify-content:center;font-size:28px;">🌿</div>
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.5px;">HabitFlow</h1>
              <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">Reset Kata Sandi Kamu</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <p style="margin:0 0 8px;color:#374151;font-size:16px;font-weight:600;">Halo, ${user.full_name}!</p>
              <p style="margin:0 0 24px;color:#6b7280;font-size:14px;line-height:1.6;">
                Kami menerima permintaan untuk mereset kata sandi akun HabitFlow kamu yang terdaftar dengan email ini.
                Klik tombol di bawah untuk membuat kata sandi baru.
              </p>

              <!-- CTA Button -->
              <div style="text-align:center;margin:32px 0;">
                <a href="${resetLink}"
                   style="display:inline-block;background:linear-gradient(135deg,#10B981 0%,#059669 100%);
                          color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;
                          padding:14px 40px;border-radius:12px;
                          box-shadow:0 4px 14px rgba(16,185,129,0.4);">
                  🔑 Reset Kata Sandi
                </a>
              </div>

              <!-- Info Box -->
              <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
                <p style="margin:0;color:#065f46;font-size:13px;line-height:1.5;">
                  ⏰ <strong>Tautan ini berlaku selama ${expMinutes} menit</strong> dan hanya bisa digunakan sekali.
                </p>
              </div>

              <p style="margin:0 0 8px;color:#9ca3af;font-size:12px;line-height:1.6;">
                Jika tombol di atas tidak berfungsi, salin dan tempel URL berikut ke browser kamu:
              </p>
              <p style="margin:0 0 24px;word-break:break-all;">
                <a href="${resetLink}" style="color:#10B981;font-size:12px;">${resetLink}</a>
              </p>

              <hr style="border:none;border-top:1px solid #f3f4f6;margin:24px 0;">

              <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.6;">
                Jika kamu tidak meminta reset kata sandi, abaikan email ini. Akun kamu tetap aman.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;padding:20px 40px;text-align:center;border-top:1px solid #f3f4f6;">
              <p style="margin:0;color:#d1d5db;font-size:11px;">
                © ${new Date().getFullYear()} HabitFlow. Semua hak dilindungi.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

        console.log(`[DEBUG] 4. Mencoba mengirim email via Nodemailer ke SMTP Server...`);
        // Kirim email via Nodemailer
        await mailer.sendMail({
            from   : `"${process.env.MAIL_FROM_NAME || 'HabitFlow'}" <${process.env.MAIL_FROM_ADDRESS}>`,
            to     : safeEmail,
            subject: '🔑 Reset Kata Sandi HabitFlow Kamu',
            html   : htmlBody
        });

        console.log(`[DEBUG] 5. ✅ Email reset password BERHASIL terkirim ke: "${safeEmail}"`);
        return res.status(200).json({
            success: true,
            message: 'Jika email terdaftar, tautan reset akan segera dikirim.'
        });

    } catch (err) {
        console.error('\n[DEBUG] ❌ ERROR PADA PROSES FORGOT PASSWORD:');
        console.error(err);
        return res.status(500).json({
            success: false,
            message: 'Gagal mengirim email. Pastikan konfigurasi SMTP di .env sudah benar.'
        });
    }
});

// ================================================================
// 6. ENDPOINT: Reset Password (Proses Token)
//    POST /auth/reset-password
//    Body: { token, newPassword }
//
//    Alur:
//    1. Cek token di password_resets
//    2. Validasi expires_at belum lewat
//    3. Hash password baru
//    4. UPDATE password_hash di tabel users
//    5. DELETE token agar tidak bisa di-reuse
// ================================================================
app.post('/auth/reset-password', async (req, res) => {
    const { token, newPassword } = req.body;

    // Validasi input dasar
    if (!token || typeof token !== 'string' || token.length !== 64) {
        return res.status(400).json({ success: false, message: 'Token tidak valid.' });
    }
    if (!newPassword || newPassword.length < 8) {
        return res.status(400).json({ success: false, message: 'Password baru minimal 8 karakter.' });
    }

    try {
        const dbPromise = db.promise();

        // Cari token di tabel password_resets — prepared statement
        const [resets] = await dbPromise.query(
            'SELECT email, expires_at FROM password_resets WHERE token = ?',
            [token]
        );

        // Token tidak ditemukan
        if (resets.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Token tidak valid atau sudah tidak aktif.'
            });
        }

        const reset = resets[0];

        // Cek apakah token sudah kedaluwarsa
        const now = new Date();
        const expiresAt = new Date(reset.expires_at);

        if (now > expiresAt) {
            // Hapus token kedaluwarsa dari DB
            await dbPromise.query('DELETE FROM password_resets WHERE token = ?', [token]);
            return res.status(400).json({
                success: false,
                message: 'Token sudah kedaluwarsa. Silakan minta reset password baru.'
            });
        }

        // Token valid — hash password baru
        const newPasswordHash = await bcrypt.hash(newPassword, 10);

        // UPDATE password_hash di tabel users
        const [updateResult] = await dbPromise.query(
            'UPDATE users SET password_hash = ? WHERE email = ?',
            [newPasswordHash, reset.email]
        );

        if (updateResult.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'User tidak ditemukan. Hubungi admin.'
            });
        }

        // HAPUS semua token milik email ini agar tidak bisa di-reuse
        await dbPromise.query(
            'DELETE FROM password_resets WHERE email = ?',
            [reset.email]
        );

        console.log(`✅ Password berhasil direset untuk: ${reset.email}`);
        return res.status(200).json({
            success: true,
            message: 'Password berhasil direset! Silakan login dengan password baru kamu.'
        });

    } catch (err) {
        console.error('❌ Reset password error:', err);
        return res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan pada server.'
        });
    }
});

// ================================================================
// 7. ENDPOINT: Submit Feedback / Rate App
//    POST /api/feedback
//    Header: X-User-Id: <user_id>
//    Body: { rating: 1-5, comments }
// ================================================================
app.post('/api/feedback', async (req, res) => {
    const { rating, comments } = req.body;
    const userId = req.headers['x-user-id'];

    if (!userId) {
        return res.status(401).json({ success: false, message: 'User tidak terautentikasi.' });
    }

    const ratingNum = parseInt(rating, 10);
    if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
        return res.status(400).json({ success: false, message: 'Rating harus antara 1 dan 5.' });
    }

    const safeComments = (comments && typeof comments === 'string')
        ? comments.trim().substring(0, 1000)
        : null;

    try {
        const dbPromise = db.promise();
        await dbPromise.query(
            'INSERT INTO app_feedback (user_id, rating, comments) VALUES (?, ?, ?)',
            [userId, ratingNum, safeComments]
        );
        console.log(`✅ Feedback dari user_id=${userId}, rating=${ratingNum}`);
        return res.status(201).json({ success: true, message: 'Feedback berhasil dikirim! Terima kasih.' });
    } catch (err) {
        console.error('❌ Feedback error:', err);
        return res.status(500).json({ success: false, message: 'Gagal menyimpan feedback.' });
    }
});

// ================================================================
// 8. ENDPOINT: Toggle Checklist Habit
//    POST /api/habit-logs/toggle
//    Header: X-User-Id: <user_id>
//    Body: { habit_id, date }
// ================================================================
app.post('/api/habit-logs/toggle', async (req, res) => {
    const { habit_id, date } = req.body;
    const userId = req.headers['x-user-id'];

    if (!userId) {
        return res.status(401).json({ success: false, message: 'User tidak terautentikasi.' });
    }

    const habitIdNum = parseInt(habit_id, 10);
    if (isNaN(habitIdNum) || habitIdNum <= 0) {
        return res.status(400).json({ success: false, message: 'habit_id tidak valid.' });
    }

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ success: false, message: 'Format tanggal tidak valid (YYYY-MM-DD).' });
    }

    try {
        const dbPromise = db.promise();

        // Ownership check — pastikan habit milik user ini
        const [habitRows] = await dbPromise.query(
            'SELECT id FROM habits WHERE id = ? AND user_id = ?',
            [habitIdNum, userId]
        );
        if (habitRows.length === 0) {
            return res.status(403).json({ success: false, message: 'Habit tidak ditemukan atau bukan milik Anda.' });
        }

        // Atomic toggle via ON DUPLICATE KEY UPDATE
        await dbPromise.query(
            `INSERT INTO habit_logs (habit_id, date, status)
             VALUES (?, ?, 'Completed')
             ON DUPLICATE KEY UPDATE
                 status = IF(status = 'Completed', 'Pending', 'Completed')`,
            [habitIdNum, date]
        );

        const [logRows] = await dbPromise.query(
            'SELECT status, elapsed_time FROM habit_logs WHERE habit_id = ? AND date = ?',
            [habitIdNum, date]
        );

        const newStatus = logRows[0]?.status || 'Pending';
        console.log(`✅ Toggle habit_id=${habitIdNum}, date=${date} → ${newStatus}`);

        return res.status(200).json({
            success: true,
            habit_id: habitIdNum,
            date,
            status: newStatus,
            message: `Habit ditandai sebagai ${newStatus}.`
        });

    } catch (err) {
        console.error('❌ Toggle habit log error:', err);
        return res.status(500).json({ success: false, message: 'Gagal memperbarui status habit.' });
    }
});

// ================================================================
// 9. ENDPOINT: Sinkronisasi Data (LEFT JOIN habits + habit_logs)
//    GET /api/habits-with-logs?date=YYYY-MM-DD
//    Header: X-User-Id: <user_id>
// ================================================================
app.get('/api/habits-with-logs', async (req, res) => {
    const userId = req.headers['x-user-id'];
    const { date } = req.query;

    if (!userId) {
        return res.status(401).json({ success: false, message: 'User tidak terautentikasi.' });
    }

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ success: false, message: 'Parameter ?date= wajib diisi (YYYY-MM-DD).' });
    }

    try {
        const dbPromise = db.promise();

        // LEFT JOIN: semua habit + status log di tanggal tertentu
        // COALESCE memastikan habit tanpa log tetap muncul dengan status 'Pending'
        const [rows] = await dbPromise.query(
            `SELECT
                h.id          AS habit_id,
                h.name        AS habit_name,
                h.description AS habit_description,
                h.category    AS habit_category,
                h.created_at  AS habit_created_at,
                COALESCE(hl.status, 'Pending')  AS status,
                COALESCE(hl.elapsed_time, 0)    AS elapsed_time,
                hl.date                          AS log_date
             FROM habits h
             LEFT JOIN habit_logs hl
                 ON h.id = hl.habit_id
                 AND hl.date = ?
             WHERE h.user_id = ?
             ORDER BY h.created_at ASC`,
            [date, userId]
        );

        console.log(`✅ Sync: ${rows.length} habit untuk user_id=${userId}, date=${date}`);
        return res.status(200).json({ success: true, date, habits: rows });

    } catch (err) {
        console.error('❌ Habits-with-logs error:', err);
        return res.status(500).json({ success: false, message: 'Gagal mengambil data habit.' });
    }
});

// ================================================================
// 10. ENDPOINT: CRUD Habits (MySQL)
//     GET    /api/habits           — ambil semua habit milik user
//     POST   /api/habits           — tambah habit baru
//     PUT    /api/habits/:id       — edit habit
//     DELETE /api/habits/:id       — hapus habit
// ================================================================

// GET semua habit milik user
app.get('/api/habits', async (req, res) => {
    const userId = req.headers['x-user-id'];
    if (!userId) return res.status(401).json({ success: false, message: 'Tidak terautentikasi.' });

    try {
        const dbPromise = db.promise();
        const [rows] = await dbPromise.query(
            'SELECT id, name, description, category, created_at FROM habits WHERE user_id = ? ORDER BY created_at ASC',
            [userId]
        );
        return res.status(200).json({ success: true, habits: rows });
    } catch (err) {
        console.error('❌ GET habits error:', err);
        return res.status(500).json({ success: false, message: 'Gagal mengambil data habit.' });
    }
});

// POST tambah habit baru
app.post('/api/habits', async (req, res) => {
    const userId = req.headers['x-user-id'];
    const { name, description, category } = req.body;

    if (!userId) return res.status(401).json({ success: false, message: 'Tidak terautentikasi.' });
    if (!name || !name.trim()) return res.status(400).json({ success: false, message: 'Nama habit wajib diisi.' });

    try {
        const dbPromise = db.promise();
        const [result] = await dbPromise.query(
            'INSERT INTO habits (user_id, name, description, category) VALUES (?, ?, ?, ?)',
            [userId, name.trim(), description || '', category || 'other']
        );
        console.log(`✅ Habit baru dibuat: id=${result.insertId}, user=${userId}`);
        return res.status(201).json({ success: true, habitId: result.insertId, message: 'Habit berhasil ditambahkan.' });
    } catch (err) {
        console.error('❌ POST habit error:', err);
        return res.status(500).json({ success: false, message: 'Gagal menyimpan habit.' });
    }
});

// PUT edit habit (ownership check)
app.put('/api/habits/:id', async (req, res) => {
    const userId = req.headers['x-user-id'];
    const habitId = parseInt(req.params.id, 10);
    const { name, description, category } = req.body;

    if (!userId) return res.status(401).json({ success: false, message: 'Tidak terautentikasi.' });
    if (isNaN(habitId)) return res.status(400).json({ success: false, message: 'ID habit tidak valid.' });
    if (!name || !name.trim()) return res.status(400).json({ success: false, message: 'Nama habit wajib diisi.' });

    try {
        const dbPromise = db.promise();
        const [result] = await dbPromise.query(
            'UPDATE habits SET name = ?, description = ?, category = ? WHERE id = ? AND user_id = ?',
            [name.trim(), description || '', category || 'other', habitId, userId]
        );

        if (result.affectedRows === 0) {
            return res.status(403).json({ success: false, message: 'Habit tidak ditemukan atau bukan milik Anda.' });
        }

        return res.status(200).json({ success: true, message: 'Habit berhasil diperbarui.' });
    } catch (err) {
        console.error('❌ PUT habit error:', err);
        return res.status(500).json({ success: false, message: 'Gagal memperbarui habit.' });
    }
});

// DELETE habit (ownership check via CASCADE akan hapus habit_logs juga)
app.delete('/api/habits/:id', async (req, res) => {
    const userId = req.headers['x-user-id'];
    const habitId = parseInt(req.params.id, 10);

    if (!userId) return res.status(401).json({ success: false, message: 'Tidak terautentikasi.' });
    if (isNaN(habitId)) return res.status(400).json({ success: false, message: 'ID habit tidak valid.' });

    try {
        const dbPromise = db.promise();
        const [result] = await dbPromise.query(
            'DELETE FROM habits WHERE id = ? AND user_id = ?',
            [habitId, userId]
        );

        if (result.affectedRows === 0) {
            return res.status(403).json({ success: false, message: 'Habit tidak ditemukan atau bukan milik Anda.' });
        }

        return res.status(200).json({ success: true, message: 'Habit berhasil dihapus.' });
    } catch (err) {
        console.error('❌ DELETE habit error:', err);
        return res.status(500).json({ success: false, message: 'Gagal menghapus habit.' });
    }
});

// ================================================================
// START SERVER
// ================================================================
const PORT = parseInt(process.env.PORT) || 3000;
app.listen(PORT, () => {
    console.log(`🚀 HabitFlow Backend berjalan di http://localhost:${PORT}`);
    console.log(`📧 SMTP: ${process.env.SMTP_HOST}:${process.env.SMTP_PORT}`);
    console.log(`🗄️  DB  : ${process.env.DB_HOST}/${process.env.DB_NAME}`);
});