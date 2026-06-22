// ===== habits.js — Shared Habit Data Layer (MySQL-first) =====
// Source of truth: MySQL via /api/* endpoints.
// localStorage digunakan sebagai cache/fallback agar UI tetap responsif.

// --- Select mode state ---
let _selectMode = false;
let _selectedIds = new Set();

// --- Date helper for local timezone ---
function getLocalDateString(dateObj = new Date()) {
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// --- Data helpers (localStorage as cache) ---
function getHabits() {
    return JSON.parse(localStorage.getItem('habits') || '[]');
}

function saveHabitsCache(habits) {
    localStorage.setItem('habits', JSON.stringify(habits));
}

// Ensure a "loginDate" is persisted so we know when to start red-dots
function getLoginDate() {
    let d = localStorage.getItem('loginDate');
    if (!d) {
        d = getLocalDateString(); // YYYY-MM-DD in local time
        localStorage.setItem('loginDate', d);
    }
    return d;
}

// --- Completion tracking (per habit per date) ---
// Cache shape: { "2026-04-05": { "<habitId>": true/false } }
function getCompletions() {
    return JSON.parse(localStorage.getItem('completions') || '{}');
}

function setCompletion(habitId, dateStr, value) {
    // Update local cache
    const c = getCompletions();
    if (!c[dateStr]) c[dateStr] = {};
    c[dateStr][habitId] = value;
    localStorage.setItem('completions', JSON.stringify(c));

    // Persist to Supabase habit_logs
    upsertHabitLog(habitId, dateStr, { completed: value });
}

function isHabitCompleted(habitId, dateStr) {
    const c = getCompletions();
    return !!(c[dateStr] && c[dateStr][habitId]);
}

// --- Statistics Helpers ---
function getHabitStreak(habitId, todayStr) {
    const c = getCompletions();
    let streak = 0;
    
    let currentDate = new Date(todayStr);
    
    // Check if completed today
    if (c[todayStr] && c[todayStr][habitId]) {
        streak++;
        currentDate.setDate(currentDate.getDate() - 1);
    } else {
        // If not completed today, maybe the streak is still alive from yesterday
        currentDate.setDate(currentDate.getDate() - 1);
        const yesterdayStr = getLocalDateString(currentDate);
        if (!c[yesterdayStr] || !c[yesterdayStr][habitId]) {
            return 0; // Not completed today or yesterday, streak is 0
        }
    }

    // Traverse backwards
    while (true) {
        const dateStr = getLocalDateString(currentDate);
        if (c[dateStr] && c[dateStr][habitId]) {
            streak++;
            currentDate.setDate(currentDate.getDate() - 1);
        } else {
            break;
        }
    }
    return streak;
}

function getHabitLongestStreak(habitId) {
    const c = getCompletions();
    let longestStreak = 0;
    let currentStreak = 0;
    
    const completedDates = Object.keys(c)
        .filter(dateStr => c[dateStr][habitId])
        .sort((a, b) => new Date(a) - new Date(b));

    if (completedDates.length === 0) return 0;
    
    for (let i = 0; i < completedDates.length; i++) {
        if (i === 0) {
            currentStreak = 1;
            longestStreak = 1;
            continue;
        }
        const d1 = new Date(completedDates[i-1]);
        const d2 = new Date(completedDates[i]);
        // To avoid timezone issues crossing midnight, zero out time before diffing
        d1.setHours(0,0,0,0);
        d2.setHours(0,0,0,0);
        const diffTime = Math.abs(d2 - d1);
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays === 1) {
            currentStreak++;
            if (currentStreak > longestStreak) longestStreak = currentStreak;
        } else if (diffDays > 1) {
            currentStreak = 1;
        }
    }
    return longestStreak;
}

function getMonthlyAccuracy(habitId, todayStr) {
    const c = getCompletions();
    const today = new Date(todayStr);
    const year = today.getFullYear();
    const month = today.getMonth();
    const daysElapsed = today.getDate(); // 1 to 31
    
    let completedDays = 0;
    for (let i = 1; i <= daysElapsed; i++) {
        const d = new Date(year, month, i);
        const dateStr = getLocalDateString(d);
        if (c[dateStr] && c[dateStr][habitId]) {
            completedDays++;
        }
    }
    
    return Math.round((completedDays / daysElapsed) * 100);
}

function getCurrentWeekDates(todayStr) {
    const today = new Date(todayStr);
    let dayOfWeek = today.getDay(); // 0 (Sun) to 6 (Sat)
    // Adjust to make Monday = 0, Sunday = 6
    const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    
    const monday = new Date(today);
    monday.setDate(today.getDate() - diffToMonday);
    
    const weekDates = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        weekDates.push(getLocalDateString(d));
    }
    return weekDates;
}

// --- Numeric value tracking (per habit per date) ---
function getNumericValues() {
    return JSON.parse(localStorage.getItem('numericValues') || '{}');
}

function getNumericValue(habitId, dateStr) {
    const nv = getNumericValues();
    return (nv[dateStr] && nv[dateStr][habitId]) || 0;
}

function setNumericValue(habitId, dateStr, value) {
    // Update local cache
    const nv = getNumericValues();
    if (!nv[dateStr]) nv[dateStr] = {};
    nv[dateStr][habitId] = value;
    localStorage.setItem('numericValues', JSON.stringify(nv));
    // Mark completed if value > 0
    setCompletion(habitId, dateStr, value > 0);
    // Persist numeric value to Supabase
    upsertHabitLog(habitId, dateStr, { numeric_value: value, completed: value > 0 });
}

// --- Timer state tracking ---
// Running state is kept in localStorage only (real-time).
// Elapsed time is persisted to Supabase when timer is paused.
function getTimerStates() {
    return JSON.parse(localStorage.getItem('timerStates') || '{}');
}

function saveTimerStates(ts) {
    localStorage.setItem('timerStates', JSON.stringify(ts));
}

function formatTime(totalSeconds) {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    const pad = n => String(n).padStart(2, '0');
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

// --- MySQL Upsert untuk habit_logs (menggantikan Supabase upsertHabitLog) ---
// Memanggil toggleHabitLogMySQL dari mysql-api.js jika tersedia.
// Dipanggil saat: setCompletion(), setNumericValue(), timer pause.
async function upsertHabitLog(habitId, dateStr, fields) {
    // Jika mysql-api.js belum dimuat, skip (offline mode)
    if (typeof toggleHabitLogMySQL !== 'function') return;
    // Hanya toggle jika field 'completed' ada
    if (fields && typeof fields.completed !== 'undefined') {
        try {
            await toggleHabitLogMySQL(habitId, dateStr);
        } catch (err) {
            console.warn('upsertHabitLog (MySQL) warning:', err);
        }
    }
}

// --- Sync habits dari MySQL (menggantikan syncHabitsFromSupabase) ---
// Mengambil semua habit + log untuk tanggal tertentu via GET /api/habits-with-logs
async function syncHabitsFromSupabase() {
    // Cek apakah mysql-api.js tersedia dan user sudah login MySQL
    if (typeof fetchHabitsWithLogs !== 'function') {
        console.warn('mysql-api.js belum dimuat, skip sync.');
        return;
    }
    if (typeof getMysqlUserId !== 'function' || !getMysqlUserId()) {
        console.warn('User tidak login MySQL, skip sync.');
        return;
    }

    const today = getLocalDateString();
    try {
        const result = await fetchHabitsWithLogs(today);
        if (!result.success) return;

        // Transform ke format cache lokal
        const appHabits = result.habits.map(h => ({
            id         : h.habit_id,
            name       : h.habit_name,
            description: h.habit_description || '',
            category   : h.habit_category || 'other',
            iconHtml   : '<i class="fa-solid fa-star"></i>',
            evaluation : 'checklist',
            unit       : ''
        }));
        saveHabitsCache(appHabits);

        // Build completions dari status log
        const completions = getCompletions();
        result.habits.forEach(h => {
            if (!completions[today]) completions[today] = {};
            completions[today][h.habit_id] = (h.status === 'Completed');
        });
        localStorage.setItem('completions', JSON.stringify(completions));

        return appHabits;
    } catch (err) {
        console.warn('syncHabitsFromSupabase (MySQL mode) error:', err);
    }
}

// --- Tambah habit ke MySQL (menggantikan addHabitToSupabase) ---
async function addHabitToSupabase(habitData) {
    if (typeof getMysqlUserId !== 'function') return null;
    const userId = getMysqlUserId();
    if (!userId) return null;

    try {
        const response = await fetch('http://localhost:3000/api/habits', {
            method : 'POST',
            headers: { 'Content-Type': 'application/json', 'X-User-Id': userId },
            body   : JSON.stringify({
                name       : habitData.name,
                description: habitData.description || '',
                category   : habitData.category || 'other'
            })
        });
        const result = await response.json();
        if (result.success) return result.habitId; // MySQL auto-increment ID
        console.error('addHabitToSupabase (MySQL) error:', result.message);
        return null;
    } catch (err) {
        console.error('addHabitToSupabase error:', err);
        return null;
    }
}

// --- Update habit di MySQL (menggantikan updateHabitInSupabase) ---
async function updateHabitInSupabase(habitId, habitData) {
    if (typeof getMysqlUserId !== 'function') return;
    const userId = getMysqlUserId();
    if (!userId) return;

    try {
        await fetch(`http://localhost:3000/api/habits/${habitId}`, {
            method : 'PUT',
            headers: { 'Content-Type': 'application/json', 'X-User-Id': userId },
            body   : JSON.stringify({
                name       : habitData.name,
                description: habitData.description || '',
                category   : habitData.category || 'other'
            })
        });
    } catch (err) {
        console.error('updateHabitInSupabase error:', err);
    }
}

// --- Hapus habit dari MySQL (menggantikan deleteHabitsFromSupabase) ---
async function deleteHabitsFromSupabase(habitIds) {
    if (typeof getMysqlUserId !== 'function') return;
    const userId = getMysqlUserId();
    if (!userId) return;

    try {
        // Hapus satu per satu (MySQL tidak support batch delete via REST sederhana)
        await Promise.all(habitIds.map(id =>
            fetch(`http://localhost:3000/api/habits/${id}`, {
                method : 'DELETE',
                headers: { 'X-User-Id': userId }
            })
        ));
    } catch (err) {
        console.error('deleteHabitsFromSupabase error:', err);
    }
}

// --- Category color mapping ---
const CATEGORY_COLORS = {
    art:           { bg: 'bg-pink-50',    text: 'text-pink-500',    hex: '#EC4899' },
    study:         { bg: 'bg-blue-50',    text: 'text-blue-500',    hex: '#3B82F6' },
    entertainment: { bg: 'bg-purple-50',  text: 'text-purple-500',  hex: '#8B5CF6' },
    meditation:    { bg: 'bg-indigo-50',  text: 'text-indigo-500',  hex: '#6366F1' },
    meditate:      { bg: 'bg-indigo-50',  text: 'text-indigo-500',  hex: '#6366F1' },
    finance:       { bg: 'bg-green-50',   text: 'text-green-500',   hex: '#10B981' },
    sport:         { bg: 'bg-orange-50',  text: 'text-orange-500',  hex: '#F97316' },
    health:        { bg: 'bg-red-50',     text: 'text-red-500',     hex: '#EF4444' },
    work:          { bg: 'bg-gray-100',   text: 'text-gray-700',    hex: '#374151' },
    entertain:     { bg: 'bg-purple-50',  text: 'text-purple-500',  hex: '#8B5CF6' },
};

function getCategoryColor(catName) {
    const key = catName.toLowerCase().trim();
    return CATEGORY_COLORS[key] || { bg: 'bg-teal-50', text: 'text-teal-500', hex: '#14B8A6' };
}

// =============================================
// HOME PAGE — render habit cards
// =============================================
function renderHomeHabits() {
    const container = document.getElementById('habit-list');
    if (!container) return;

    const habits = getHabits();
    const today = getLocalDateString();

    if (habits.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12">
                <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i class="fa-solid fa-plus text-gray-400 text-xl"></i>
                </div>
                <p class="text-gray-500 text-sm font-medium">No habits yet</p>
                <p class="text-gray-400 text-xs mt-1">Tap the + button to add your first habit</p>
            </div>`;
        return;
    }

    // Calculate stats and sort by streak descending
    const habitsWithStats = habits.map(habit => {
        const streak = getHabitStreak(habit.id, today);
        const accuracy = getMonthlyAccuracy(habit.id, today);
        return { ...habit, streak, accuracy };
    });
    
    habitsWithStats.sort((a, b) => b.streak - a.streak);

    const weekDates = getCurrentWeekDates(today);
    const c = getCompletions();

    let html = `
    <div class="bg-white rounded-2xl p-4 shadow-sm w-full max-w-md mx-auto">
        <div class="flex flex-col gap-4">
    `;

    habitsWithStats.forEach((habit, idx) => {
        const completedToday = isHabitCompleted(habit.id, today);
        const delay = 0.1 + idx * 0.05;
        const catColor = getCategoryColor(habit.category);

        // Build Weekly Dots
        let dotsHtml = '<div class="flex items-center gap-1.5">';
        weekDates.forEach(dateStr => {
            const isDone = !!(c[dateStr] && c[dateStr][habit.id]);
            const dotClass = isDone ? 'bg-emerald-500' : 'bg-gray-200';
            dotsHtml += `<div class="w-2.5 h-2.5 rounded-full ${dotClass}"></div>`;
        });
        dotsHtml += '</div>';

        // Action Button
        const checkedClasses = completedToday ? 'bg-[var(--primary)] text-white border-[var(--primary)]' : 'border-gray-300 text-gray-300';
        const iconVisibility = completedToday ? 'visible' : 'invisible';
        
        const actionHtml = `
            <button class="home-check w-8 h-8 rounded-full border-2 flex items-center justify-center transition-colors ${checkedClasses}" data-id="${habit.id}" data-date="${today}">
                <i class="fa-solid fa-check text-xs ${iconVisibility}"></i>
            </button>
        `;

        html += `
        <div class="flex items-center justify-between gap-2" style="animation: fade-in-up 0.4s ease-out forwards; animation-delay: ${delay}s; opacity: 0;">
            <!-- Left: Info & Streak -->
            <div class="flex items-center gap-3 min-w-0 flex-1">
                <div class="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 ${catColor.bg} ${catColor.text}">
                    ${habit.iconHtml || '<i class="fa-solid fa-star"></i>'}
                </div>
                <div class="min-w-0">
                    <h3 class="font-bold text-sm text-gray-800 truncate">${habit.name}</h3>
                    <div class="flex items-center gap-1.5 text-[10px] font-medium text-gray-500 mt-0.5">
                        <span class="flex items-center gap-1 text-orange-500"><i class="fa-solid fa-fire"></i> ${habit.streak} Days</span>
                        <span class="text-gray-300">|</span>
                        <span>${habit.accuracy}%</span>
                    </div>
                </div>
            </div>
            
            <!-- Center: Weekly History -->
            <div class="shrink-0">
                ${dotsHtml}
            </div>

            <!-- Right: Action Button -->
            <div class="shrink-0 pl-1">
                ${actionHtml}
            </div>
        </div>
        `;
    });

    html += `
        </div>
    </div>
    `;

    container.innerHTML = html;

    // Attach event listeners
    attachHomeCardListeners(today);
}

function attachHomeCardListeners(dateStr) {
    // Checklist toggle
    document.querySelectorAll('.home-check').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            const wasCompleted = isHabitCompleted(id, dateStr);
            setCompletion(id, dateStr, !wasCompleted);

            const icon = btn.querySelector('i');
            if (!wasCompleted) {
                btn.classList.remove('opacity-50');
                btn.classList.add('bg-white', 'text-[var(--primary)]');
                icon.classList.remove('invisible');
                icon.classList.add('visible');
                btn.style.transform = 'scale(1.2)';
                setTimeout(() => btn.style.transform = 'scale(1)', 150);
            } else {
                btn.classList.add('opacity-50');
                btn.classList.remove('bg-white', 'text-[var(--primary)]');
                icon.classList.remove('visible');
                icon.classList.add('invisible');
            }
            // Update red dots on date slider
            renderHomeDateRedDots();
        });
    });

    // Timer play/pause
    document.querySelectorAll('.home-timer-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            const ts = getTimerStates();
            if (!ts[id]) ts[id] = { running: false, elapsed: 0 };

            if (ts[id].running) {
                // Pause
                ts[id].running = false;
                ts[id].lastTick = null;
                btn.innerHTML = '<i class="fa-solid fa-play text-sm"></i>';
                btn.classList.remove('bg-white', 'text-[var(--primary)]');
                // Mark as completed if any time recorded + persist to Supabase
                if (ts[id].elapsed > 0) {
                    setCompletion(id, dateStr, true);
                    upsertHabitLog(id, dateStr, { timer_elapsed: ts[id].elapsed, completed: true });
                }
            } else {
                // Start
                ts[id].running = true;
                ts[id].lastTick = Date.now();
                btn.innerHTML = '<i class="fa-solid fa-pause text-sm"></i>';
                btn.classList.add('bg-white', 'text-[var(--primary)]');
            }
            saveTimerStates(ts);
            startHomeTimerTicks();
            renderHomeDateRedDots();
        });
    });

    // Numeric +/- buttons
    document.querySelectorAll('.numeric-minus').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            const date = btn.dataset.date;
            let val = getNumericValue(id, date);
            if (val > 0) val--;
            setNumericValue(id, date, val);
            renderHomeHabits();
        });
    });
    document.querySelectorAll('.numeric-plus').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            const date = btn.dataset.date;
            let val = getNumericValue(id, date);
            val++;
            setNumericValue(id, date, val);
            renderHomeHabits();
        });
    });
    // Numeric direct input
    document.querySelectorAll('.numeric-input').forEach(input => {
        input.addEventListener('change', () => {
            const id = input.dataset.id;
            const date = input.dataset.date;
            let val = parseInt(input.value) || 0;
            if (val < 0) val = 0;
            setNumericValue(id, date, val);
            renderHomeHabits();
        });
        // Select all on focus for easy editing
        input.addEventListener('focus', () => input.select());
    });

    // 3-dot menu → open edit page
    document.querySelectorAll('.home-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            window.location.href = `edit_habit.html?id=${id}`;
        });
    });
}

// Timer ticking
let _homeTimerInterval = null;
function startHomeTimerTicks() {
    if (_homeTimerInterval) clearInterval(_homeTimerInterval);
    _homeTimerInterval = setInterval(() => {
        const ts = getTimerStates();
        let anyRunning = false;
        Object.keys(ts).forEach(id => {
            if (ts[id].running) {
                anyRunning = true;
                const now = Date.now();
                const delta = Math.floor((now - (ts[id].lastTick || now)) / 1000);
                ts[id].elapsed += delta;
                ts[id].lastTick = now;
                // Update display
                const display = document.querySelector(`.timer-display[data-timer-id="${id}"]`);
                if (display) display.textContent = formatTime(ts[id].elapsed);
            }
        });
        saveTimerStates(ts);
        if (!anyRunning) {
            clearInterval(_homeTimerInterval);
            _homeTimerInterval = null;
        }
    }, 1000);
}

// Red dots on the home date slider
function renderHomeDateRedDots() {
    const habits = getHabits();
    if (habits.length === 0) return;

    const loginDate = getLoginDate();
    const completions = getCompletions();

    // Ensure the date container doesn't clip overflow
    const dateContainer = document.getElementById('mobile-date-selector');
    if (dateContainer) {
        dateContainer.style.overflowY = 'visible';
        dateContainer.style.paddingTop = '8px';
    }

    document.querySelectorAll('.date-card').forEach(card => {
        const dateStr = card.dataset.date;
        if (!dateStr) return;
        // Only for dates >= loginDate and <= today
        const today = getLocalDateString();
        if (dateStr < loginDate || dateStr > today) {
            // Remove dot if exists
            const existingDot = card.querySelector('.red-dot');
            if (existingDot) existingDot.remove();
            return;
        }
        // Check if all habits completed for this date
        const allCompleted = habits.every(h => completions[dateStr] && completions[dateStr][h.id]);
        let dot = card.querySelector('.red-dot');
        if (!allCompleted) {
            if (!dot) {
                dot = document.createElement('span');
                dot.className = 'red-dot';
                card.appendChild(dot);
            }
        } else {
            if (dot) dot.remove();
        }
    });
}

// =============================================
// CALENDAR PAGE — render habit list for selected date & red dots
// =============================================
// Action helper for checking habit in calendar
window.toggleCalendarCompletion = function(habitId, dateStr, newValue) {
    if (!dateStr || dateStr === 'undefined') {
        console.error("Invalid dateStr in toggleCalendarCompletion");
        return;
    }
    setCompletion(habitId, dateStr, newValue);
    // Re-render Calendar to update dots and habit list
    if (typeof renderCalendarFull === 'function') {
        renderCalendarFull();
    }
}

window.deleteHabitFromCalendar = async function(habitId) {
    // Optimistic cache update
    let habits = getHabits();
    habits = habits.filter(h => h.id !== habitId);
    saveHabitsCache(habits);
    
    // Supabase delete
    await deleteHabitsFromSupabase([habitId]);
    
    // Re-render
    if (typeof renderCalendarFull === 'function') {
        renderCalendarFull();
    }
}

function renderCalendarHabits(dateStr) {
    const container = document.getElementById('calendar-habit-list');
    if (!container) return;

    const habits = getHabits();
    const completions = getCompletions();
    const theme = document.documentElement.getAttribute('data-theme') || 'light';
    const primaryColor = theme === 'blue' ? '#5BA4C9' : '#10B981';

    if (habits.length === 0) {
        container.innerHTML = `
            <div class="text-center py-8">
                <p class="text-gray-500 text-sm font-medium">No habits tracked</p>
                <p class="text-gray-400 text-xs mt-1">Add habits using the + button</p>
            </div>`;
        return;
    }

    let html = `
    <div class="overflow-x-auto bg-white rounded-xl shadow-sm border border-gray-200">
        <table class="w-full text-left border-collapse">
            <thead>
                <tr class="bg-gray-50 border-b border-gray-200 text-[10px] text-gray-500 uppercase tracking-wider">
                    <th class="px-4 py-3 font-bold">Habit</th>
                    <th class="px-4 py-3 font-bold hidden sm:table-cell">Deskripsi</th>
                    <th class="px-4 py-3 font-bold">Status</th>
                    <th class="px-4 py-3 font-bold text-center">Aksi</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
    `;

    habits.forEach(habit => {
        const completed = isHabitCompleted(habit.id, dateStr);

        let statusText = '';
        let statusColor = '';

        if (habit.evaluation === 'timer') {
            const ts = getTimerStates();
            const state = ts[habit.id] || { elapsed: 0 };
            const timeStr = formatTime(state.elapsed);
            statusText = completed ? `Done (${timeStr})` : `Pending (${timeStr})`;
            statusColor = completed ? 'text-green-600 bg-green-50' : 'text-yellow-600 bg-yellow-50';
        } else if (habit.evaluation === 'numeric') {
            const numVal = getNumericValue(habit.id, dateStr);
            const isDone = numVal > 0;
            statusText = isDone ? 'Completed' : 'Not completed';
            statusColor = isDone ? 'text-green-600 bg-green-50' : 'text-gray-500 bg-gray-50';
        } else {
            statusText = completed ? 'Completed ✓' : 'Not completed';
            statusColor = completed ? 'text-green-600 bg-green-50' : 'text-gray-500 bg-gray-50';
        }

        let checkAction = `
            <button class="w-8 h-8 rounded-full flex items-center justify-center border transition-colors ${completed ? 'bg-[var(--primary)] text-white border-[var(--primary)] theme-bg-update' : 'border-gray-300 text-gray-300 hover:border-[var(--primary)] hover:text-[var(--primary)] theme-text-update'}"
                onclick="event.stopPropagation(); toggleCalendarCompletion('${habit.id}', '${dateStr}', ${!completed})">
                <i class="fa-solid fa-check text-xs ${completed ? 'visible' : 'invisible'}"></i>
            </button>
        `;

        html += `
            <tr class="hover:bg-gray-50/50 transition-colors group ${completed ? '' : 'opacity-90'}">
                <td class="px-4 py-3">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0 bg-gray-100 text-gray-600">
                            ${habit.iconHtml || '<i class="fa-solid fa-star"></i>'}
                        </div>
                        <span class="font-bold text-sm text-gray-900 w-24 sm:w-auto truncate">${habit.name}</span>
                    </div>
                </td>
                <td class="px-4 py-3 text-xs text-gray-500 max-w-[120px] truncate hidden sm:table-cell">
                    ${habit.description || '-'}
                </td>
                <td class="px-4 py-3">
                    <span class="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${statusColor}">
                        ${statusText}
                    </span>
                </td>
                <td class="px-4 py-3">
                    <div class="flex items-center justify-center gap-2">
                        ${checkAction}
                        <button class="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                            onclick="event.stopPropagation(); showConfirmModal('Hapus Habit', 'Yakin ingin menghapus habit ini?', 'Hapus', 'bg-red-500 hover:bg-red-600', () => deleteHabitFromCalendar('${habit.id}'))">
                            <i class="fa-regular fa-trash-can text-xs"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });

    html += `
            </tbody>
        </table>
    </div>
    `;

    container.innerHTML = html;
}

// Render red dots on calendar grid
function renderCalendarRedDots() {
    const habits = getHabits();
    if (habits.length === 0) return;

    const loginDate = getLoginDate();
    const completions = getCompletions();
    const today = getLocalDateString();

    document.querySelectorAll('.calendar-day[data-date]').forEach(dayEl => {
        const dateStr = dayEl.dataset.date;
        if (!dateStr || dateStr < loginDate || dateStr > today) return;

        const allCompleted = habits.every(h => completions[dateStr] && completions[dateStr][h.id]);
        let dot = dayEl.querySelector('.cal-red-dot');
        if (!allCompleted) {
            if (!dot) {
                dot = document.createElement('span');
                dot.className = 'cal-red-dot absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-red-500 rounded-full';
                dayEl.style.position = 'relative';
                dayEl.appendChild(dot);
            }
        } else {
            if (dot) dot.remove();
        }
    });
}

// =============================================
// STATISTICS PAGE — compute data from real habits
// =============================================
function getStatsData(period) {
    const habits = getHabits();
    const completions = getCompletions();
    const today = new Date();

    // Build category distribution from actual habits
    const catCounts = {};
    habits.forEach(h => {
        const cat = h.category || 'Other';
        catCounts[cat] = (catCounts[cat] || 0) + 1;
    });

    // Activity data — completion rates per time period
    let labels = [];
    let data = [];

    if (period === 'daily') {
        // Last 7 days
        for (let i = 6; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().slice(0, 10);
            const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            labels.push(dayNames[d.getDay()]);

            if (habits.length === 0) {
                data.push(0);
            } else {
                const completed = habits.filter(h => completions[dateStr] && completions[dateStr][h.id]).length;
                data.push(Math.round((completed / habits.length) * 100));
            }
        }
    } else if (period === 'weekly') {
        // Last 4 weeks
        for (let w = 3; w >= 0; w--) {
            labels.push(`Week ${4 - w}`);
            let totalRate = 0;
            let dayCount = 0;
            for (let d = 0; d < 7; d++) {
                const day = new Date(today);
                day.setDate(day.getDate() - (w * 7 + d));
                const dateStr = day.toISOString().slice(0, 10);
                if (habits.length > 0) {
                    const completed = habits.filter(h => completions[dateStr] && completions[dateStr][h.id]).length;
                    totalRate += (completed / habits.length) * 100;
                }
                dayCount++;
            }
            data.push(Math.round(totalRate / dayCount));
        }
    } else {
        // Monthly — last 6 months
        for (let m = 5; m >= 0; m--) {
            const monthDate = new Date(today.getFullYear(), today.getMonth() - m, 1);
            labels.push(monthDate.toLocaleString('default', { month: 'short' }));
            let totalRate = 0;
            let dayCount = 0;
            const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
            for (let d = 1; d <= daysInMonth; d++) {
                const dateStr = new Date(monthDate.getFullYear(), monthDate.getMonth(), d).toISOString().slice(0, 10);
                if (habits.length > 0) {
                    const completed = habits.filter(h => completions[dateStr] && completions[dateStr][h.id]).length;
                    totalRate += (completed / habits.length) * 100;
                }
                dayCount++;
            }
            data.push(Math.round(totalRate / dayCount));
        }
    }

    // Longest streak
    let longestStreak = 0;
    let currentStreak = 0;
    for (let i = 90; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().slice(0, 10);
        const allDone = habits.length > 0 && habits.every(h => completions[dateStr] && completions[dateStr][h.id]);
        if (allDone) {
            currentStreak++;
            if (currentStreak > longestStreak) longestStreak = currentStreak;
        } else {
            currentStreak = 0;
        }
    }

    // Completion rate for today
    let completionRate = 0;
    if (habits.length > 0) {
        const todayStr = today.toISOString().slice(0, 10);
        const completed = habits.filter(h => completions[todayStr] && completions[todayStr][h.id]).length;
        completionRate = Math.round((completed / habits.length) * 100);
    }

    return { labels, data, catCounts, longestStreak, completionRate };
}

// =============================================
// SELECTION MODE LOGIC
// =============================================
function toggleSelectMode() {
    _selectMode = !_selectMode;
    _selectedIds.clear();
    
    const countEl = document.getElementById('selected-count');
    if (countEl) countEl.innerText = '0';
    
    // Update UI elements
    const selectBtn = document.getElementById('select-mode-btn');
    const actionBar = document.getElementById('select-action-bar');
    
    if (selectBtn) {
        selectBtn.innerText = _selectMode ? 'Done' : 'Select Multiple';
    }
    
    if (actionBar) {
        if (_selectMode) {
            actionBar.classList.remove('translate-y-20', 'opacity-0', 'pointer-events-none');
        } else {
            actionBar.classList.add('translate-y-20', 'opacity-0', 'pointer-events-none');
        }
    }
    
    renderHomeHabits(); 
}

function toggleHabitSelection(id) {
    if (!_selectMode) return;
    if (_selectedIds.has(id)) {
        _selectedIds.delete(id);
    } else {
        _selectedIds.add(id);
    }
    
    // Update count
    const countEl = document.getElementById('selected-count');
    if (countEl) countEl.innerText = _selectedIds.size;
    
    // Re-render
    renderHomeHabits();
}

function confirmDeletion() {
    if (_selectedIds.size === 0) return;
    const modal = document.getElementById('delete-confirm-modal');
    if (modal) {
        modal.classList.remove('opacity-0', 'pointer-events-none');
        const content = modal.querySelector('.popup-content');
        if (content) {
            content.classList.remove('scale-95');
            content.classList.add('scale-100');
        }
    }
}

function closeDeleteModal() {
    const modal = document.getElementById('delete-confirm-modal');
    if (modal) {
        modal.classList.add('opacity-0', 'pointer-events-none');
        const content = modal.querySelector('.popup-content');
        if (content) {
            content.classList.remove('scale-100');
            content.classList.add('scale-95');
        }
    }
}

async function executeDeletion() {
    let habits = getHabits();
    
    const idsToDelete = Array.from(_selectedIds);
    
    // Remove from Supabase first
    await deleteHabitsFromSupabase(idsToDelete);
    
    // Remove from local cache
    habits = habits.filter(h => !_selectedIds.has(h.id));
    saveHabitsCache(habits);
    
    closeDeleteModal();
    toggleSelectMode(); // Exit select mode
}

// Expose selection functions for html inline calls
window.toggleSelectMode = toggleSelectMode;
window.toggleHabitSelection = toggleHabitSelection;
window.confirmDeletion = confirmDeletion;
window.closeDeleteModal = closeDeleteModal;
window.executeDeletion = executeDeletion;

// =============================================
// ACHIEVEMENTS LOGIC
// =============================================
function getAchievementsData() {
    const habits = getHabits();
    const completions = getCompletions();
    const stats = getStatsData('daily');
    
    let totalCompletions = 0;
    for (const date in completions) {
        totalCompletions += Object.keys(completions[date]).length;
    }
    
    const achievements = [
        { id: 1, name: 'First Step', description: 'Create your first habit', isUnlocked: habits.length >= 1, progress: Math.min(habits.length, 1), target: 1 },
        { id: 2, name: 'Getting Started', description: 'Complete a habit for the first time', isUnlocked: totalCompletions >= 1, progress: Math.min(totalCompletions, 1), target: 1 },
        { id: 3, name: 'Three\'s a Charm', description: 'Reach a 3-day streak', isUnlocked: stats.longestStreak >= 3, progress: Math.min(stats.longestStreak, 3), target: 3 },
        { id: 4, name: 'Habit Builder', description: 'Create 5 habits', isUnlocked: habits.length >= 5, progress: Math.min(habits.length, 5), target: 5 },
        { id: 5, name: 'One Week Strong', description: 'Reach a 7-day streak', isUnlocked: stats.longestStreak >= 7, progress: Math.min(stats.longestStreak, 7), target: 7 },
        { id: 6, name: 'Consistency', description: 'Complete habits 10 times in total', isUnlocked: totalCompletions >= 10, progress: Math.min(totalCompletions, 10), target: 10 },
        { id: 7, name: 'Dedicated', description: 'Reach a 14-day streak', isUnlocked: stats.longestStreak >= 14, progress: Math.min(stats.longestStreak, 14), target: 14 },
        { id: 8, name: 'Half Century', description: 'Complete habits 50 times in total', isUnlocked: totalCompletions >= 50, progress: Math.min(totalCompletions, 50), target: 50 },
        { id: 9, name: 'True Master', description: 'Reach a 30-day streak', isUnlocked: stats.longestStreak >= 30, progress: Math.min(stats.longestStreak, 30), target: 30 },
        { id: 10, name: 'Century Club', description: 'Complete habits 100 times in total', isUnlocked: totalCompletions >= 100, progress: Math.min(totalCompletions, 100), target: 100 }
    ];
    
    const unlockedCount = achievements.filter(a => a.isUnlocked).length;
    
    return {
        achievements,
        unlockedCount,
        totalCount: achievements.length
    };
}
window.getAchievementsData = getAchievementsData;
