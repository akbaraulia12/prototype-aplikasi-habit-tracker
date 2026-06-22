// ============================================================
// mysql-api.js — Modul Sentral untuk Interaksi API MySQL
// HabitFlow | Backend: Node.js + Express + MySQL (port 3000)
// ============================================================

const MYSQL_API_BASE = 'http://localhost:3000';

// ─────────────────────────────────────────────────────────────
// HELPER: Ambil user_id dari sesi aktif (MySQL localStorage)
// Mengembalikan string user_id atau null jika tidak login.
// ─────────────────────────────────────────────────────────────
function getMysqlUserId() {
    try {
        const raw = localStorage.getItem('currentUser');
        if (!raw) return null;
        const user = JSON.parse(raw);
        return user.id ? String(user.id) : null;
    } catch (e) {
        console.error('getMysqlUserId: parse error', e);
        return null;
    }
}

// ─────────────────────────────────────────────────────────────
// HELPER: Build headers standar dengan user_id untuk auth
// ─────────────────────────────────────────────────────────────
function buildAuthHeaders(userId) {
    return {
        'Content-Type': 'application/json',
        'X-User-Id': userId   // Dikirim sebagai custom header (bukan JWT agar kompatibel)
    };
}

// ============================================================
// FITUR 1: Submit Feedback / Rate App
// POST /api/feedback
//
// @param {number} rating  - Nilai bintang 1 s/d 5
// @param {string} comments - Komentar opsional dari textarea
// @returns {Promise<{success: boolean, message: string}>}
// ============================================================
async function submitFeedback(rating, comments) {
    // 1. Ambil user aktif
    const userId = getMysqlUserId();
    if (!userId) {
        return { success: false, message: 'Kamu harus login untuk memberikan feedback.' };
    }

    // 2. Validasi rating di sisi frontend (defense in depth)
    const ratingNum = parseInt(rating, 10);
    if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
        return { success: false, message: 'Pilih rating bintang terlebih dahulu (1-5).' };
    }

    try {
        // 3. Kirim POST request ke backend
        const response = await fetch(`${MYSQL_API_BASE}/api/feedback`, {
            method: 'POST',
            headers: buildAuthHeaders(userId),
            body: JSON.stringify({
                rating: ratingNum,
                comments: comments || ''
            })
        });

        const result = await response.json();
        return result;

    } catch (networkErr) {
        console.error('submitFeedback: network error', networkErr);
        return { success: false, message: 'Tidak dapat terhubung ke server. Pastikan server backend berjalan.' };
    }
}

// ============================================================
// FITUR 2: Toggle Status Habit (Anti Bug Centang Massal)
// POST /api/habit-logs/toggle
//
// Logika anti-bug:
//  - event.stopPropagation() harus dipanggil di event handler tombol
//    (sudah diimplementasikan di renderCalendarHabits & attachHomeCardListeners)
//  - Backend menggunakan ON DUPLICATE KEY UPDATE sehingga hanya
//    SATU baris per (habit_id, date) yang pernah ada di DB.
//
// @param {number|string} habitId - ID habit yang akan di-toggle
// @param {string} dateStr        - Tanggal format "YYYY-MM-DD"
// @returns {Promise<{success: boolean, status: string, message: string}>}
// ============================================================
async function toggleHabitLogMySQL(habitId, dateStr) {
    // 1. Ambil user aktif
    const userId = getMysqlUserId();
    if (!userId) {
        return { success: false, message: 'Kamu harus login.' };
    }

    // 2. Validasi input lokal
    if (!habitId || !dateStr) {
        return { success: false, message: 'habit_id dan tanggal wajib diisi.' };
    }

    // Validasi format YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return { success: false, message: 'Format tanggal tidak valid.' };
    }

    try {
        // 3. Kirim POST request ke backend
        const response = await fetch(`${MYSQL_API_BASE}/api/habit-logs/toggle`, {
            method: 'POST',
            headers: buildAuthHeaders(userId),
            body: JSON.stringify({
                habit_id: habitId,
                date: dateStr
            })
        });

        const result = await response.json();
        return result;

    } catch (networkErr) {
        console.error('toggleHabitLogMySQL: network error', networkErr);
        return { success: false, message: 'Koneksi ke server gagal.' };
    }
}

// ============================================================
// FITUR 3: Ambil Data Habit + Status Log (Sinkronisasi)
// GET /api/habits-with-logs?date=YYYY-MM-DD
//
// Mengembalikan semua habit milik user aktif beserta status
// habit_log untuk tanggal yang dipilih di UI kalender.
// LEFT JOIN memastikan habit tanpa log tetap muncul (status=Pending).
//
// @param {string} dateStr - Tanggal yang sedang dipilih di UI ("YYYY-MM-DD")
// @returns {Promise<{success: boolean, date: string, habits: Array}>}
//   habits[i]: { habit_id, habit_name, habit_description, habit_category,
//                status ('Completed'|'Pending'), elapsed_time, log_date }
// ============================================================
async function fetchHabitsWithLogs(dateStr) {
    // 1. Ambil user aktif
    const userId = getMysqlUserId();
    if (!userId) {
        return { success: false, message: 'Kamu harus login.', habits: [] };
    }

    // 2. Validasi format tanggal
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return { success: false, message: 'Format tanggal tidak valid.', habits: [] };
    }

    try {
        // 3. Kirim GET request dengan user_id di header
        const response = await fetch(
            `${MYSQL_API_BASE}/api/habits-with-logs?date=${encodeURIComponent(dateStr)}`,
            {
                method: 'GET',
                headers: buildAuthHeaders(userId)
            }
        );

        const result = await response.json();
        return result;

    } catch (networkErr) {
        console.error('fetchHabitsWithLogs: network error', networkErr);
        return { success: false, message: 'Koneksi ke server gagal.', habits: [] };
    }
}

// ============================================================
// RENDER HELPER: Tampilkan data hasil sinkronisasi MySQL
// ke dalam container HTML (Home atau Calendar)
//
// @param {string} containerId - ID elemen HTML target
// @param {Array}  habits      - Array habit dari fetchHabitsWithLogs()
// @param {string} dateStr     - Tanggal yang sedang aktif
// @param {string} context     - 'home' atau 'calendar'
// ============================================================
function renderSyncedHabits(containerId, habits, dateStr, context = 'calendar') {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!habits || habits.length === 0) {
        container.innerHTML = `
            <div class="text-center py-8">
                <p class="text-gray-400 text-sm">Belum ada habit untuk tanggal ini.</p>
            </div>`;
        return;
    }

    let html = '';

    if (context === 'calendar') {
        // Tampilan tabel untuk halaman Calendar
        html = `
        <div class="overflow-x-auto bg-white rounded-xl shadow-sm border border-gray-200">
            <table class="w-full text-left border-collapse">
                <thead>
                    <tr class="bg-gray-50 border-b border-gray-200 text-[10px] text-gray-500 uppercase tracking-wider">
                        <th class="px-4 py-3 font-bold">Habit</th>
                        <th class="px-4 py-3 font-bold hidden sm:table-cell">Kategori</th>
                        <th class="px-4 py-3 font-bold">Status</th>
                        <th class="px-4 py-3 font-bold text-center">Aksi</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">`;

        habits.forEach(h => {
            const isCompleted = h.status === 'Completed';
            const statusClass = isCompleted
                ? 'text-green-600 bg-green-50'
                : 'text-gray-500 bg-gray-50';
            const statusLabel = isCompleted ? 'Completed ✓' : 'Pending';
            const btnClass = isCompleted
                ? 'bg-[var(--primary)] text-white border-[var(--primary)] theme-bg-update'
                : 'border-gray-300 text-gray-300';

            html += `
                <tr class="hover:bg-gray-50/50 transition-colors">
                    <td class="px-4 py-3">
                        <span class="font-bold text-sm text-gray-900">${escapeHtml(h.habit_name)}</span>
                    </td>
                    <td class="px-4 py-3 text-xs text-gray-500 hidden sm:table-cell">
                        ${escapeHtml(h.habit_category || '-')}
                    </td>
                    <td class="px-4 py-3">
                        <span class="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold uppercase ${statusClass}">
                            ${statusLabel}
                        </span>
                    </td>
                    <td class="px-4 py-3 text-center">
                        <button
                            class="w-8 h-8 rounded-full flex items-center justify-center border transition-colors mx-auto ${btnClass}"
                            onclick="event.stopPropagation(); mysqlToggleAndRefresh(${h.habit_id}, '${dateStr}', '${containerId}', '${context}')">
                            <i class="fa-solid fa-check text-xs ${isCompleted ? 'visible' : 'invisible'}"></i>
                        </button>
                    </td>
                </tr>`;
        });

        html += `</tbody></table></div>`;

    } else {
        // Tampilan card untuk halaman Home
        html = `<div class="bg-white rounded-2xl p-4 shadow-sm w-full max-w-md mx-auto">
            <div class="flex flex-col gap-4">`;

        habits.forEach(h => {
            const isCompleted = h.status === 'Completed';
            const btnClass = isCompleted
                ? 'bg-[var(--primary)] border-[var(--primary)] text-white theme-bg-update'
                : 'border-gray-300 text-gray-300';

            html += `
            <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-3 min-w-0 flex-1">
                    <div class="w-10 h-10 rounded-xl bg-gray-100 text-gray-600 flex items-center justify-center text-lg shrink-0">
                        <i class="fa-solid fa-star"></i>
                    </div>
                    <div class="min-w-0">
                        <h3 class="font-bold text-sm text-gray-800 truncate">${escapeHtml(h.habit_name)}</h3>
                        <p class="text-[10px] text-gray-400 mt-0.5">${escapeHtml(h.habit_category || '')}</p>
                    </div>
                </div>
                <div class="shrink-0 pl-1">
                    <button
                        class="w-8 h-8 rounded-full border-2 flex items-center justify-center transition-colors ${btnClass}"
                        onclick="event.stopPropagation(); mysqlToggleAndRefresh(${h.habit_id}, '${dateStr}', '${containerId}', '${context}')">
                        <i class="fa-solid fa-check text-xs ${isCompleted ? 'visible' : 'invisible'}"></i>
                    </button>
                </div>
            </div>`;
        });

        html += `</div></div>`;
    }

    container.innerHTML = html;
}

// ─────────────────────────────────────────────────────────────
// HELPER: Toggle + Re-render otomatis (dipanggil dari HTML inline onclick)
// Menangani event.stopPropagation() secara built-in agar tidak
// terjadi redirect tidak sengaja ke halaman home.
// ─────────────────────────────────────────────────────────────
window.mysqlToggleAndRefresh = async function(habitId, dateStr, containerId, context) {
    // stopPropagation sudah di-handle oleh onclick di renderSyncedHabits
    try {
        const result = await toggleHabitLogMySQL(habitId, dateStr);
        if (result.success) {
            // Re-fetch data terbaru dan render ulang
            const syncData = await fetchHabitsWithLogs(dateStr);
            if (syncData.success) {
                renderSyncedHabits(containerId, syncData.habits, dateStr, context);
            }
            // Tampilkan toast jika tersedia
            if (typeof showToast === 'function') {
                showToast(result.message);
            }
        } else {
            if (typeof showToast === 'function') {
                showToast(result.message, 'error');
            }
        }
    } catch (err) {
        console.error('mysqlToggleAndRefresh error:', err);
    }
};

// ─────────────────────────────────────────────────────────────
// HELPER: Escape HTML untuk mencegah XSS saat render data dari DB
// ─────────────────────────────────────────────────────────────
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ─────────────────────────────────────────────────────────────
// EKSPOR: Semua fungsi tersedia secara global
// ─────────────────────────────────────────────────────────────
window.submitFeedback       = submitFeedback;
window.toggleHabitLogMySQL  = toggleHabitLogMySQL;
window.fetchHabitsWithLogs  = fetchHabitsWithLogs;
window.renderSyncedHabits   = renderSyncedHabits;
window.getMysqlUserId       = getMysqlUserId;
