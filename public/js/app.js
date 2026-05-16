import { db } from './firebase-config.js';
import {
  collection, doc, getDocs, addDoc, setDoc, deleteDoc,
  query, where, orderBy, Timestamp, writeBatch, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ─── State ───────────────────────────────────────────────────────────────────
let currentDate   = todayStr();
let allUsers      = [];
let bookingsCache = {};          // date → [booking docs]
let selectedUser  = null;
let clickedHour   = null;
let selectedSlots = [];          // hours selected in slot picker
let seriesType    = null;        // null | 'daily' | 'weekly'
let reportData    = [];
let reportType    = 'weekly';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function fmtHour(h) {
  const ampm = h < 12 ? 'AM' : 'PM';
  const disp  = h % 12 === 0 ? 12 : h % 12;
  return `${String(disp).padStart(2, '0')}:00 ${ampm}`;
}

function fmtRange(slots) {
  if (!slots || slots.length === 0) return '';
  const s = Math.min(...slots);
  const e = Math.max(...slots) + 1;
  return `${fmtHour(s)} – ${fmtHour(e)}`;
}

function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast show ${type}`;
  setTimeout(() => t.className = 'toast', 2800);
}

function dateAdd(str, days) {
  const d = new Date(str); d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function getDatesInRange(start, end, step = 'daily') {
  const dates = []; let cur = start;
  while (cur <= end) {
    dates.push(cur);
    cur = dateAdd(cur, step === 'weekly' ? 7 : 1);
  }
  return dates;
}

// ─── Page navigation ─────────────────────────────────────────────────────────
window.showPage = function(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(`page-${name}`).classList.add('active');
  if (name === 'users') loadUsers();
};

// ─── Date navigation ─────────────────────────────────────────────────────────
window.changeDate = function(delta) {
  currentDate = dateAdd(currentDate, delta);
  document.getElementById('slotDate').value = currentDate;
  loadSlots();
};

// ─── LOAD SLOTS ───────────────────────────────────────────────────────────────
window.loadSlots = async function() {
  const dateInput = document.getElementById('slotDate');
  if (dateInput.value) currentDate = dateInput.value;
  else dateInput.value = currentDate;

  const grid = document.getElementById('slotsGrid');
  grid.innerHTML = '<div class="loading-slots">Loading slots…</div>';

  // Fetch bookings for this date
  const q = query(collection(db, 'bookings'), where('date', '==', currentDate));
  const snap = await getDocs(q);
  const bookings = [];
  snap.forEach(d => bookings.push({ id: d.id, ...d.data() }));
  bookingsCache[currentDate] = bookings;

  // Build hour → booking map
  const hourMap = {};
  for (const b of bookings) {
    for (const h of (b.slots || [])) {
      hourMap[h] = b;
    }
  }

  grid.innerHTML = '';
  for (let h = 0; h < 24; h++) {
    const booking = hourMap[h];
    const tile = document.createElement('div');
    let cls = 'slot-tile available';
    if (booking) cls = `slot-tile ${booking.seriesId ? 'series' : 'booked'}`;
    tile.className = cls;

    tile.innerHTML = `
      <div class="slot-time">${fmtHour(h)}</div>
      <div class="slot-status">${booking ? (booking.seriesId ? 'Series' : 'Booked') : 'Available'}</div>
      ${booking ? `<div class="slot-name">${booking.userName || ''}</div>` : ''}
    `;

    if (!booking) {
      tile.onclick = () => openBookingModal(h);
    } else {
      tile.onclick = () => openDetailModal(booking);
      tile.style.cursor = 'pointer';
    }
    grid.appendChild(tile);
  }
};

// ─── BOOKING MODAL ────────────────────────────────────────────────────────────
window.openBookingModal = function(hour) {
  clickedHour = hour;
  selectedUser = null;
  selectedSlots = [hour];
  document.getElementById('newUserForm').classList.add('hidden');
  document.getElementById('selectedUserBadge').classList.add('hidden');
  document.getElementById('userSelect').value = '';
  document.getElementById('bookingAmount').value = '';
  document.getElementById('bookingNotes').value = '';
  document.getElementById('seriesOptions').classList.add('hidden');
  document.querySelector('input[name="bookType"][value="single"]').checked = true;
  seriesType = null;

  document.getElementById('slotInfoBar').textContent =
    `📅 ${currentDate}  ·  ⏰ ${fmtHour(hour)}`;
  document.getElementById('modalTitle').textContent = 'New Booking';

  populateUserDropdown();
  renderSlotPicker();
  document.getElementById('bookingModal').classList.add('open');
};

window.closeModal = function() {
  document.getElementById('bookingModal').classList.remove('open');
};
window.closeModalOutside = function(e) {
  if (e.target.id === 'bookingModal') closeModal();
};

function populateUserDropdown() {
  const sel = document.getElementById('userSelect');
  sel.innerHTML = '<option value="">— Select existing user —</option>';
  allUsers.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.id;
    opt.textContent = `${u.name} (${u.phone})`;
    sel.appendChild(opt);
  });
}

window.onUserSelect = function() {
  const id = document.getElementById('userSelect').value;
  if (!id) { selectedUser = null; document.getElementById('selectedUserBadge').classList.add('hidden'); return; }
  selectedUser = allUsers.find(u => u.id === id);
  const badge = document.getElementById('selectedUserBadge');
  badge.textContent = `✓ ${selectedUser.name}  ·  ${selectedUser.phone}`;
  badge.classList.remove('hidden');
  document.getElementById('newUserForm').classList.add('hidden');
};

window.toggleNewUser = function() {
  document.getElementById('newUserForm').classList.toggle('hidden');
  document.getElementById('newUserName').value = '';
  document.getElementById('newUserPhone').value = '';
};

window.createNewUser = async function() {
  const name  = document.getElementById('newUserName').value.trim();
  const phone = document.getElementById('newUserPhone').value.trim();
  if (!name || !phone) return showToast('Name and phone required', 'error');
  if (!/^\d{10}$/.test(phone)) return showToast('Enter a valid 10-digit mobile', 'error');
  if (allUsers.find(u => u.phone === phone)) return showToast('Mobile already registered', 'error');

  const ref = await addDoc(collection(db, 'users'), { name, phone, createdAt: Timestamp.now() });
  const newU = { id: ref.id, name, phone };
  allUsers.push(newU);
  selectedUser = newU;
  populateUserDropdown();
  document.getElementById('userSelect').value = ref.id;
  document.getElementById('selectedUserBadge').textContent = `✓ ${name}  ·  ${phone}`;
  document.getElementById('selectedUserBadge').classList.remove('hidden');
  document.getElementById('newUserForm').classList.add('hidden');
  showToast('User created', 'success');
};

// ─── SLOT PICKER ─────────────────────────────────────────────────────────────
function renderSlotPicker() {
  const existing = new Set();
  const bks = bookingsCache[currentDate] || [];
  bks.forEach(b => (b.slots || []).forEach(s => existing.add(s)));

  const container = document.getElementById('slotPicker');
  container.innerHTML = '';
  for (let h = 0; h < 24; h++) {
    const btn = document.createElement('div');
    const taken = existing.has(h);
    btn.className = `sp-slot ${taken ? 'taken' : ''} ${selectedSlots.includes(h) ? 'selected' : ''}`;
    btn.textContent = fmtHour(h);
    btn.dataset.hour = h;
    if (!taken) {
      btn.onclick = () => toggleSlot(h);
    }
    container.appendChild(btn);
  }
}

function toggleSlot(h) {
  if (selectedSlots.includes(h)) {
    selectedSlots = selectedSlots.filter(s => s !== h);
  } else {
    selectedSlots.push(h);
    selectedSlots.sort((a, b) => a - b);
    // enforce adjacency
    const mn = Math.min(...selectedSlots), mx = Math.max(...selectedSlots);
    selectedSlots = [];
    for (let i = mn; i <= mx; i++) selectedSlots.push(i);
  }
  document.getElementById('slotInfoBar').textContent =
    `📅 ${currentDate}  ·  ⏰ ${fmtRange(selectedSlots)}`;
  renderSlotPicker();
}

// ─── SERIES ───────────────────────────────────────────────────────────────────
window.toggleSeries = function(show, type) {
  seriesType = show ? type : null;
  document.getElementById('seriesOptions').classList.toggle('hidden', !show);
  if (show) {
    const minDate = dateAdd(currentDate, type === 'weekly' ? 7 : 1);
    document.getElementById('seriesEndDate').min = minDate;
    document.getElementById('seriesEndDate').value = minDate;
  }
};

// ─── SAVE BOOKING ─────────────────────────────────────────────────────────────
window.saveBooking = async function() {
  if (!selectedUser) return showToast('Please select or create a user', 'error');
  if (!selectedSlots.length) return showToast('Select at least one slot', 'error');

  const amount = parseFloat(document.getElementById('bookingAmount').value) || 0;
  const notes  = document.getElementById('bookingNotes').value.trim();

  let dates = [currentDate];
  if (seriesType) {
    const endDate = document.getElementById('seriesEndDate').value;
    if (!endDate) return showToast('Set a series end date', 'error');
    dates = getDatesInRange(currentDate, endDate, seriesType);
  }

  // Check conflicts
  for (const date of dates) {
    const q = query(collection(db, 'bookings'), where('date', '==', date));
    const snap = await getDocs(q);
    const taken = new Set();
    snap.forEach(d => (d.data().slots || []).forEach(s => taken.add(s)));
    const conflict = selectedSlots.some(s => taken.has(s));
    if (conflict) return showToast(`Conflict on ${date} – slot already booked`, 'error');
  }

  const seriesId = seriesType ? `series_${Date.now()}` : null;
  const batch = writeBatch(db);

  for (const date of dates) {
    const ref = doc(collection(db, 'bookings'));
    batch.set(ref, {
      date,
      slots: selectedSlots,
      userId:   selectedUser.id,
      userName: selectedUser.name,
      userPhone: selectedUser.phone,
      amount,
      notes,
      seriesId,
      seriesType: seriesType || null,
      createdAt: Timestamp.now()
    });
  }

  await batch.commit();
  closeModal();
  showToast(`Booking confirmed for ${dates.length} day(s)!`, 'success');
  loadSlots();
};

// ─── DETAIL MODAL ─────────────────────────────────────────────────────────────
window.openDetailModal = function(booking) {
  const body = document.getElementById('detailBody');
  body.innerHTML = `
    <div class="detail-row"><span class="detail-label">Date</span><span class="detail-value">${booking.date}</span></div>
    <div class="detail-row"><span class="detail-label">Slot</span><span class="detail-value">${fmtRange(booking.slots)}</span></div>
    <div class="detail-row"><span class="detail-label">Customer</span><span class="detail-value">${booking.userName}</span></div>
    <div class="detail-row"><span class="detail-label">Mobile</span><span class="detail-value">${booking.userPhone || '—'}</span></div>
    <div class="detail-row"><span class="detail-label">Amount</span><span class="detail-value">₹${booking.amount || 0}</span></div>
    <div class="detail-row"><span class="detail-label">Type</span><span class="detail-value">${booking.seriesType ? booking.seriesType + ' series' : 'Single'}</span></div>
    ${booking.notes ? `<div class="detail-row"><span class="detail-label">Notes</span><span class="detail-value">${booking.notes}</span></div>` : ''}
    <button class="cancel-btn" onclick="cancelBooking('${booking.id}', '${booking.seriesId || ''}')">Cancel This Booking</button>
    ${booking.seriesId ? `<button class="cancel-btn" style="margin-top:8px;opacity:0.7;" onclick="cancelSeries('${booking.seriesId}')">Cancel Entire Series</button>` : ''}
  `;
  document.getElementById('detailModal').classList.add('open');
};

window.closeDetailModal = function() {
  document.getElementById('detailModal').classList.remove('open');
};
window.closeDetailOutside = function(e) {
  if (e.target.id === 'detailModal') closeDetailModal();
};

window.cancelBooking = async function(id) {
  if (!confirm('Cancel this booking?')) return;
  await deleteDoc(doc(db, 'bookings', id));
  closeDetailModal();
  showToast('Booking cancelled', 'success');
  loadSlots();
};

window.cancelSeries = async function(seriesId) {
  if (!confirm('Cancel the entire series?')) return;
  const q = query(collection(db, 'bookings'), where('seriesId', '==', seriesId));
  const snap = await getDocs(q);
  const batch = writeBatch(db);
  snap.forEach(d => batch.delete(d.ref));
  await batch.commit();
  closeDetailModal();
  showToast('Series cancelled', 'success');
  loadSlots();
};

// ─── USERS PAGE ───────────────────────────────────────────────────────────────
async function loadUsers() {
  const snap = await getDocs(query(collection(db, 'users'), orderBy('name')));
  allUsers = [];
  snap.forEach(d => allUsers.push({ id: d.id, ...d.data() }));
  renderUsers(allUsers);
}

function renderUsers(users) {
  const list = document.getElementById('usersList');
  if (!users.length) { list.innerHTML = '<p style="color:var(--text-dim);padding:20px 0">No users found.</p>'; return; }
  list.innerHTML = users.map(u => `
    <div class="user-card">
      <div class="user-card-info">
        <div class="user-card-name">${u.name}</div>
        <div class="user-card-phone">📞 ${u.phone}</div>
        ${u.notes ? `<div class="user-card-note">${u.notes}</div>` : ''}
      </div>
    </div>
  `).join('');
}

window.filterUsers = function() {
  const q = document.getElementById('userSearch').value.toLowerCase();
  renderUsers(allUsers.filter(u =>
    u.name.toLowerCase().includes(q) || (u.phone || '').includes(q)
  ));
};

window.openAddUser = function() {
  document.getElementById('auName').value = '';
  document.getElementById('auPhone').value = '';
  document.getElementById('auNotes').value = '';
  document.getElementById('addUserModal').classList.add('open');
};
window.closeAddUserModal = function() {
  document.getElementById('addUserModal').classList.remove('open');
};
window.closeAddUserOutside = function(e) {
  if (e.target.id === 'addUserModal') closeAddUserModal();
};

window.saveNewUser = async function() {
  const name  = document.getElementById('auName').value.trim();
  const phone = document.getElementById('auPhone').value.trim();
  const notes = document.getElementById('auNotes').value.trim();
  if (!name || !phone) return showToast('Name and phone required', 'error');
  if (!/^\d{10}$/.test(phone)) return showToast('Enter a valid 10-digit mobile', 'error');

  const snap = await getDocs(query(collection(db, 'users'), where('phone', '==', phone)));
  if (!snap.empty) return showToast('Mobile already registered', 'error');

  const ref = await addDoc(collection(db, 'users'), { name, phone, notes, createdAt: Timestamp.now() });
  allUsers.push({ id: ref.id, name, phone, notes });
  closeAddUserModal();
  renderUsers(allUsers);
  showToast('User added', 'success');
};

// ─── REPORTS PAGE ─────────────────────────────────────────────────────────────
window.setReportType = function(type) {
  reportType = type;
  document.getElementById('weeklyFilter').classList.toggle('hidden',  type !== 'weekly');
  document.getElementById('monthlyFilter').classList.toggle('hidden', type !== 'monthly');
  document.getElementById('customFilter').classList.toggle('hidden',  type !== 'custom');
};

window.generateReport = async function() {
  let start, end;
  const today = todayStr();

  if (reportType === 'weekly') {
    start = document.getElementById('weekStart').value || dateAdd(today, -6);
    end   = dateAdd(start, 6);
  } else if (reportType === 'monthly') {
    const m = document.getElementById('monthPicker').value || today.slice(0, 7);
    start = `${m}-01`;
    const last = new Date(m.split('-')[0], m.split('-')[1], 0);
    end   = `${m}-${String(last.getDate()).padStart(2, '0')}`;
  } else {
    start = document.getElementById('customFrom').value;
    end   = document.getElementById('customTo').value;
    if (!start || !end) return showToast('Set both dates', 'error');
  }

  const q = query(
    collection(db, 'bookings'),
    where('date', '>=', start),
    where('date', '<=', end),
    orderBy('date')
  );
  const snap = await getDocs(q);
  reportData = [];
  snap.forEach(d => reportData.push({ id: d.id, ...d.data() }));

  renderReport(start, end);
};

function renderReport(start, end) {
  const out = document.getElementById('reportOutput');
  out.classList.remove('hidden');

  const totalRev   = reportData.reduce((s, b) => s + (b.amount || 0), 0);
  const totalSlots = reportData.reduce((s, b) => s + (b.slots || []).length, 0);
  const unique     = new Set(reportData.map(b => b.userId)).size;

  document.getElementById('reportSummary').innerHTML = `
    <div class="summary-card"><div class="sc-val">${reportData.length}</div><div class="sc-label">Bookings</div></div>
    <div class="summary-card"><div class="sc-val">${totalSlots}</div><div class="sc-label">Slots Booked</div></div>
    <div class="summary-card"><div class="sc-val">₹${totalRev.toLocaleString()}</div><div class="sc-label">Revenue</div></div>
    <div class="summary-card"><div class="sc-val">${unique}</div><div class="sc-label">Customers</div></div>
  `;

  const tbody = document.getElementById('reportBody');
  tbody.innerHTML = reportData.map(b => `
    <tr>
      <td>${b.date}</td>
      <td>${fmtRange(b.slots)}</td>
      <td>${b.userName || '—'}</td>
      <td>${b.userPhone || '—'}</td>
      <td>₹${b.amount || 0}</td>
      <td>${b.seriesType ? b.seriesType : 'Single'}</td>
      <td>${b.notes || '—'}</td>
    </tr>
  `).join('');
}

window.downloadCSV = function() {
  const header = ['Date', 'Slots', 'Customer', 'Mobile', 'Amount', 'Type', 'Notes'];
  const rows = reportData.map(b => [
    b.date, fmtRange(b.slots), b.userName, b.userPhone, b.amount || 0,
    b.seriesType || 'Single', b.notes || ''
  ]);
  const csv = [header, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `turf-report-${todayStr()}.csv`;
  a.click();
};

// ─── INIT ─────────────────────────────────────────────────────────────────────
async function init() {
  // Load users globally
  const snap = await getDocs(query(collection(db, 'users'), orderBy('name')));
  snap.forEach(d => allUsers.push({ id: d.id, ...d.data() }));

  // Set date input to today
  document.getElementById('slotDate').value = currentDate;
  // Set week start default
  document.getElementById('weekStart').value = dateAdd(currentDate, -6);
  // Set month default
  document.getElementById('monthPicker').value = currentDate.slice(0, 7);

  loadSlots();
}

init().catch(e => {
  console.error(e);
  document.getElementById('slotsGrid').innerHTML =
    '<div class="loading-slots" style="color:#ff5252">⚠️ Firebase connection failed. Check your config in js/firebase-config.js</div>';
});
