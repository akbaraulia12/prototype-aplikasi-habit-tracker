const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const app = express();

app.use(cors());
app.use(express.json()); // Supaya backend bisa membaca data JSON dari frontend

// 1. Konfigurasi Koneksi ke phpMyAdmin Laragon
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',          // Default user Laragon
    password: '',          // Default password Laragon kosong
    database: 'habit_tracker'
});

// Cek apakah koneksi ke Laragon berhasil
db.connect((err) => {
    if (err) {
        console.error('❌ Koneksi ke Laragon Gagal: ' + err.stack);
        return;
    }
    console.log('✅ Berhasil terhubung ke database Laragon (habit_tracker).');
});

// 2. Endpoint API untuk Register Akun Baru
app.post('/api/register', async (req, res) => {
    // 1. Ambil data dari body request frontend
    const { username, fullName, email, password } = req.body;

    console.log("Data diterima dari frontend:", { username, fullName, email, password: '***' });

    // Validasi sederhana
    if (!username || !fullName || !email || !password) {
        return res.status(400).json({ success: false, message: 'Semua field wajib diisi.' });
    }

    try {
        // 2. Hash password sebelum disimpan ke database
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // 3. Buat ID berurutan (0001, 0002, dst)
        const dbPromise = db.promise();
        const [rows] = await dbPromise.query("SELECT id FROM users ORDER BY CAST(id AS UNSIGNED) DESC LIMIT 1");

        let nextIdNumber = 1;
        if (rows.length > 0 && rows[0].id) {
            const lastId = parseInt(rows[0].id, 4);
            if (!isNaN(lastId)) {
                nextIdNumber = lastId + 1;
            }
        }

        const userId = String(nextIdNumber).padStart(4, '0');

        // 4. Query INSERT ke tabel users
        const query = "INSERT INTO users (id, username, full_name, email, password_hash) VALUES (?, ?, ?, ?, ?)";

        // 5. Eksekusi ke database Laragon
        try {
            await dbPromise.query(query, [userId, username, fullName, email, passwordHash]);
            console.log('✅ User baru berhasil disimpan ke database Laragon!');
            return res.status(201).json({ success: true, message: 'Akun berhasil terdaftar!' });
        } catch (insertErr) {
            console.error('=================== MYSQL ERROR ===================');
            console.error(insertErr);
            console.error('===================================================');

            // Cek jika email/username sudah dipakai
            if (insertErr.code === 'ER_DUP_ENTRY') {
                if (insertErr.sqlMessage.includes('email')) {
                    return res.status(409).json({ success: false, message: 'Email sudah terdaftar.' });
                }
                if (insertErr.sqlMessage.includes('username')) {
                    return res.status(409).json({ success: false, message: 'Username sudah digunakan.' });
                }
            }

            return res.status(500).json({ success: false, message: 'Gagal menyimpan data ke database.' });
        }

    } catch (error) {
        console.error('Server error:', error);
        return res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server.' });
    }
});

// 3. Endpoint API untuk Login
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    console.log("Percobaan login untuk:", email);

    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Email dan password wajib diisi.' });
    }

    try {
        // Cari user berdasarkan email
        const query = "SELECT id, username, full_name, email, password_hash FROM users WHERE email = ?";

        db.query(query, [email], async (err, results) => {
            if (err) {
                console.error('DB Error:', err);
                return res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server.' });
            }

            if (results.length === 0) {
                return res.status(401).json({ success: false, message: 'Email tidak ditemukan.' });
            }

            const user = results[0];

            // Verifikasi password dengan bcrypt
            const isPasswordValid = await bcrypt.compare(password, user.password_hash);

            if (!isPasswordValid) {
                return res.status(401).json({ success: false, message: 'Password salah.' });
            }

            console.log('✅ Login berhasil untuk user:', user.email);

            // Kirim data user (tanpa password_hash)
            return res.status(200).json({
                success: true,
                message: 'Login berhasil!',
                user: {
                    id: user.id,
                    username: user.username,
                    fullName: user.full_name,
                    email: user.email
                }
            });
        });
    } catch (error) {
        console.error('Server error:', error);
        return res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server.' });
    }
});

// Jalankan backend di port 3000
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server backend berjalan di http://localhost:${PORT}`);
});