import { db, auth } from './firebase-config.js';
import {
  collection,
  doc,
  getDocs,
  addDoc,
  setDoc,
  deleteDoc,
  getDoc,
  query,
  where,
  orderBy,
  Timestamp,
  writeBatch,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// ─── STATE ────────────────────────────────────────────────────────────────────
let currentDate      = todayStr();
let stripStartDate   = getSundayOfWeek(todayStr());
let allUsers         = [];
let bookingsCache    = {};   // date → [booking]
let blockedCache     = {};   // date → [blocked]
let settings         = { weekdayPrice: 500, weekendPrice: 700, weekendDays: [0, 6], turfName: 'Bails Arena', adminPhone: '' };
let selectedUser     = null;
let tempStartSlot    = null;
let tempEndSlot      = null;
let selectedBlockSlots = [];
let currentBookingId = null;
let seriesType       = null;
let reportData       = [];
let reportType       = 'weekly';

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

function pad(n) { return String(n).padStart(2, '0'); }

function to12Hour(h) {
  if (h === 0) return '12 AM';
  if (h < 12) return `${h} AM`;
  if (h === 12) return '12 PM';
  return `${h - 12} PM`;
}

function fmtHour(h) { return to12Hour(h); }

function fmtRange(slots) {
  if (!slots || !slots.length) return '';
  const s = Math.min(...slots);
  const e = Math.max(...slots) + 1;
  return `${fmtHour(s)} – ${e >= 24 ? '12 AM' : fmtHour(e)}`;
}

function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast show ${type}`;
  setTimeout(() => (t.className = 'toast'), 2800);
}

function dateAdd(str, days) {
  const [y, m, d] = str.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}`;
}

function getSundayOfWeek(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - dt.getDay());
  return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}`;
}

function getDatesInRange(start, end, step = 'daily') {
  const dates = []; let cur = start;
  while (cur <= end) {
    dates.push(cur);
    cur = dateAdd(cur, step === 'weekly' ? 7 : 1);
  }
  return dates;
}

function isWeekend(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return (settings.weekendDays || [0, 6]).includes(dow);
}

function getPriceForDate(dateStr, numSlots) {
  const pricePerHour = isWeekend(dateStr) ? (settings.weekendPrice || 500) : (settings.weekdayPrice || 500);
  return pricePerHour * numSlots;
}

function monthName(dateStr) {
  const [y, m] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
}

function dayOfWeek(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleString('default', { weekday: 'short' }).toUpperCase();
}

function dayOfMonth(dateStr) { return dateStr.split('-')[2].replace(/^0/, ''); }

// ─── AUTH ─────────────────────────────────────────────────────────────────────
onAuthStateChanged(auth, user => {
  if (user) {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('mainApp').classList.remove('hidden');
    init();
  } else {
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('mainApp').classList.add('hidden');
  }
});

window.doLogin = async function() {
  const email = document.getElementById('loginEmail').value.trim();
  const pass  = document.getElementById('loginPassword').value;
  const err   = document.getElementById('loginError');
  err.classList.add('hidden');
  if (!email || !pass) { err.textContent = 'Enter email and password.'; err.classList.remove('hidden'); return; }
  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (e) {
    err.textContent = 'Invalid credentials. Please try again.';
    err.classList.remove('hidden');
  }
};

window.doLogout = async function() {
  await signOut(auth);
};

// ─── PAGE NAVIGATION ──────────────────────────────────────────────────────────
window.showPage = function(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(`page-${name}`).classList.add('active');
  document.querySelectorAll('.btn-nav[id^="nav-"]').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById(`nav-${name}`);
  if (btn) btn.classList.add('active');
  if (name === 'users') loadUsers();
};

window.toggleMobileMenu = function () {
  document.getElementById('mobileMenu')
    .classList.toggle('open');
};

window.closeMobileMenu = function () {
  document.getElementById('mobileMenu')
    .classList.remove('open');
};

// ─── DATE STRIP ───────────────────────────────────────────────────────────────
window.shiftWeek = function(direction) {

  stripStartDate = dateAdd(
    stripStartDate,
    direction * 7
  );

  currentDate = stripStartDate;

  renderDateStrip();

  updateMonthLabel();

  loadSlots();
};

function updateMonthLabel() {

  const start = new Date(stripStartDate);

  const end = new Date(start);

  end.setDate(end.getDate() + 6);

  const startMonth =
    start.toLocaleString(
      'default',
      { month:'long' }
    );

  const endMonth =
    end.toLocaleString(
      'default',
      { month:'long' }
    );

  const year = end.getFullYear();

  const label =
    startMonth === endMonth
      ? `${startMonth} ${year}`
      : `${startMonth} / ${endMonth} ${year}`;

  document.getElementById('monthLabel')
    .textContent = label;
}

function renderDateStrip() {
  const strip = document.getElementById('dateStrip');
  const today = todayStr();
  strip.innerHTML = '';
  document.getElementById('monthLabel').textContent = monthName(currentDate);

  for (let i = 0; i < 7; i++) {
    const d = dateAdd(stripStartDate, i);
    const pill = document.createElement('div');
    pill.className = 'date-pill' + (d === currentDate ? ' active' : '') + (d === today ? ' today' : '');
    pill.innerHTML = `<span class="pill-day">${dayOfMonth(d)}</span><span class="pill-dow">${dayOfWeek(d)}</span>`;
    pill.onclick = () => selectDate(d);
    strip.appendChild(pill);
  }
}

function selectDate(date) {
  currentDate = date;
  renderDateStrip();
  updateMonthLabel();
  loadSlots();
}

// ─── SLOTS ────────────────────────────────────────────────────────────────────
window.loadSlots = async function() {
  const grid = document.getElementById('slotsGrid');
  grid.innerHTML = '<div class="loading-slots">Loading slots…</div>';

  try {
    const [bSnap, blSnap] = await Promise.all([
      getDocs(query(collection(db, 'bookings'), where('date', '==', currentDate))),
      getDocs(query(collection(db, 'blockedSlots'), where('date', '==', currentDate)))
    ]);

    const bookings = [];
    bSnap.forEach(d => bookings.push({ id: d.id, ...d.data() }));
    bookingsCache[currentDate] = bookings;

    const blocked = [];
    blSnap.forEach(d => blocked.push({ id: d.id, ...d.data() }));
    blockedCache[currentDate] = blocked;

    renderSlots(bookings, blocked);
  } catch (e) {
    grid.innerHTML = '<div class="loading-slots" style="color:var(--booked-text)">⚠ Failed to load slots. Check Firebase config.</div>';
  }
};

function renderSlots(bookings, blocked) {
  const grid = document.getElementById('slotsGrid');
  grid.innerHTML = '';

  // Build hour → info map
  const hourMap = {};
  for (const b of bookings) {
    for (const h of (b.slots || [])) {
      hourMap[h] = { type: 'booked', data: b };
    }
  }
  for (const bl of blocked) {
    for (const h of (bl.slots || [])) {
      if (!hourMap[h]) hourMap[h] = { type: 'blocked', data: bl };
    }
  }

  for (let h = 0; h < 24; h++) {
    const info   = hourMap[h];
    const tile   = document.createElement('div');
    const endTime = to12Hour(h + 1 > 23 ? 0 : h + 1);

    if (!info) {
      tile.className = 'slot-tile available';
      tile.innerHTML = `
        <div class="slot-time">${fmtHour(h)}</div>
        <div class="slot-status">Available</div>`;
      tile.onclick = () => openEndTimePicker(h);
    } else if (info.type === 'booked') {
      const b = info.data;
      const slotEnd = to12Hour(Math.max(...b.slots) + 1 > 23 ? 0 : Math.max(...b.slots) + 1);
      const isPaid  = b.paymentStatus === 'paid';
      tile.className = 'slot-tile booked';
      tile.innerHTML = `
        ${isPaid
          ? '<span class="slot-paid-badge paid">Paid</span>'
          : '<span class="slot-paid-badge pending">Unpaid</span>'}
        <div class="slot-time">${fmtHour(h)}</div>
        <div class="slot-end-time">– ${slotEnd}</div>
        <div class="slot-name">${b.userName || ''}</div>`;
      tile.onclick = () => openDetailModal(b);
    } else {
      const bl = info.data;
      tile.className = 'slot-tile blocked';
      tile.innerHTML = `
        <div class="slot-time">${fmtHour(h)}</div>
        <div class="slot-end-time">– ${endTime}</div>
        <div class="slot-name">${bl.reason || 'Blocked'}</div>`;
      tile.onclick = () => openBlockDetail(bl);
    }
    grid.appendChild(tile);
  }
}

// ─── END TIME PICKER ──────────────────────────────────────────────────────────
window.openEndTimePicker = function(startHour) {
  tempStartSlot = startHour;
  const taken = new Set();
  const bks = bookingsCache[currentDate] || [];
  const bls = blockedCache[currentDate]  || [];
  bks.forEach(b => (b.slots || []).forEach(s => taken.add(s)));
  bls.forEach(b => (b.slots || []).forEach(s => taken.add(s)));

  // Collect consecutive available hours after startHour
  const options = [];
  for (let h = startHour + 1; h <= 24; h++) {
    if (taken.has(h) || h === 24) break;
    options.push(h);
  }
  // Always allow single-hour even if no multi-hour options
  // For single hour: endHour = startHour+1 (exclusive end)

  const titleEl   = document.getElementById('endSheetTitle');
  const optionsEl = document.getElementById('endTimeOptions');
  titleEl.textContent = `Start: ${fmtHour(startHour)} — Select End Time`;
  optionsEl.innerHTML = '';

  // Include the single-slot option (end = startHour+1)
  const allEndOptions = [startHour + 1, ...options];
  const uniqueEnds = [...new Set(allEndOptions)].filter(h => h <= 24);

  if (!uniqueEnds.length) {
    optionsEl.innerHTML = '<p style="color:var(--text-dim);text-align:center;padding:20px 0">No consecutive slots available.</p>';
  } else {
    uniqueEnds.forEach(endH => {
      const dur  = endH - startHour;
      const btn  = document.createElement('div');
      btn.className = 'end-time-btn';
      btn.innerHTML = `<span class="et-time">${endH >= 24 ? '12 AM' : fmtHour(endH)}</span><span class="et-dur">${dur} hr${dur > 1 ? 's' : ''}</span>`;
      btn.onclick = () => { closeSheet(); openBookingModal(startHour, endH); };
      optionsEl.appendChild(btn);
    });
  }

  document.getElementById('endTimeSheet').classList.add('open');
};

window.closeSheet = function() {
  document.getElementById('endTimeSheet').classList.remove('open');
};

window.closeEndTimeSheet = function(e) {
  if (e.target.id === 'endTimeSheet') closeSheet();
};

// ─── BOOKING MODAL ────────────────────────────────────────────────────────────
window.openBookingModal = function(startH, endH) {
  tempStartSlot = startH;
  tempEndSlot   = endH;
  selectedUser  = null;
  seriesType    = null;

  // Reset form
  document.getElementById('newUserForm').classList.add('hidden');
  document.getElementById('selectedUserBadge').classList.add('hidden');
  document.getElementById('seriesOptions').classList.add('hidden');
  document.getElementById('userSelect').value    = '';
  document.getElementById('bookingNotes').value  = '';
  document.querySelector('input[name="bookType"][value="single"]').checked = true;

  // Auto-fill amount
  const slots    = endH - startH;
  const amount   = getPriceForDate(currentDate, slots);
  document.getElementById('bookingAmount').value = amount;

  const priceHint = document.getElementById('priceHint');
  const priceLabel = isWeekend(currentDate) ? `Weekend rate: ₹${settings.weekendPrice}/hr` : `Weekday rate: ₹${settings.weekdayPrice}/hr`;
  priceHint.textContent = priceLabel;

  document.getElementById('slotInfoBar').textContent =
    `📅 ${currentDate}  ·  ⏰ ${fmtHour(startH)} – ${endH >= 24 ? '12 AM' : fmtHour(endH)}  ·  ${slots} hr${slots > 1 ? 's' : ''}`;

  populateUserDropdown();
  document.getElementById('bookingModal').classList.add('open');
};

window.closeModal = function(id) {
  document.getElementById(id).classList.remove('open');
};

window.closeModalOutside = function(e, id) {
  if (e.target.id === id) closeModal(id);
};

function populateUserDropdown() {
  const sel = document.getElementById('userSelect');
  sel.innerHTML = '<option value="">— Select customer —</option>';
  allUsers.forEach(u => {
    const opt = document.createElement('option');
    opt.value       = u.id;
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
  const form = document.getElementById('newUserForm');
  form.classList.toggle('hidden');
  if (!form.classList.contains('hidden')) {
    document.getElementById('newUserName').value  = '';
    document.getElementById('newUserPhone').value = '';
  }
};

window.createNewUser = async function() {
  const name  = document.getElementById('newUserName').value.trim();
  const phone = document.getElementById('newUserPhone').value.trim();
  if (!name || !phone)            return showToast('Name and phone required', 'error');
  if (!/^\d{10}$/.test(phone))    return showToast('Enter a valid 10-digit mobile', 'error');
  if (allUsers.find(u => u.phone === phone)) return showToast('Mobile already registered', 'error');

  const ref  = await addDoc(collection(db, 'users'), { name, phone, createdAt: Timestamp.now() });
  const newU = { id: ref.id, name, phone };
  allUsers.push(newU);
  selectedUser = newU;
  populateUserDropdown();
  document.getElementById('userSelect').value = ref.id;
  const badge = document.getElementById('selectedUserBadge');
  badge.textContent = `✓ ${name}  ·  ${phone}`;
  badge.classList.remove('hidden');
  document.getElementById('newUserForm').classList.add('hidden');
  showToast('Customer created', 'success');
};

window.toggleSeries = function(show, type) {
  seriesType = show ? type : null;
  document.getElementById('seriesOptions').classList.toggle('hidden', !show);
  if (show) {
    const minDate = dateAdd(currentDate, type === 'weekly' ? 7 : 1);
    document.getElementById('seriesEndDate').min   = minDate;
    document.getElementById('seriesEndDate').value = minDate;
  }
};

window.saveBooking = async function() {
  if (!selectedUser)              return showToast('Please select or create a customer', 'error');
  if (tempStartSlot === null || tempEndSlot === null) return showToast('No slot selected', 'error');

  const slots  = [];
  for (let h = tempStartSlot; h < tempEndSlot; h++) slots.push(h);

  const amount = parseFloat(document.getElementById('bookingAmount').value) || 0;
  const notes  = document.getElementById('bookingNotes').value.trim();

  let dates = [currentDate];
  if (seriesType) {
    const endDate = document.getElementById('seriesEndDate').value;
    if (!endDate) return showToast('Set a series end date', 'error');
    dates = getDatesInRange(currentDate, endDate, seriesType);
  }

  // Conflict check
  for (const date of dates) {
    const [bSnap, blSnap] = await Promise.all([
      getDocs(query(collection(db, 'bookings'),     where('date', '==', date))),
      getDocs(query(collection(db, 'blockedSlots'), where('date', '==', date)))
    ]);
    const taken = new Set();
    bSnap.forEach(d => (d.data().slots || []).forEach(s => taken.add(s)));
    blSnap.forEach(d => (d.data().slots || []).forEach(s => taken.add(s)));
    if (slots.some(s => taken.has(s))) return showToast(`Conflict on ${date} – slot already taken`, 'error');
  }

  const seriesId = seriesType ? `series_${Date.now()}` : null;
  const batch    = writeBatch(db);

  for (const date of dates) {
    const ref = doc(collection(db, 'bookings'));
    batch.set(ref, {
      date, slots,
      userId:        selectedUser.id,
      userName:      selectedUser.name,
      userPhone:     selectedUser.phone,
      amount, notes,
      seriesId,
      seriesType:    seriesType || null,
      paymentStatus: 'pending',
      paymentMode:   null,
      upiAmount:     0,
      cashAmount:    0,
      paymentNotes:  '',
      paidAt:        null,
      createdAt:     Timestamp.now()
    });
  }

  await batch.commit();
  // Send WhatsApp only for single booking
// or first booking in a series
const whatsappBooking = {
  userName: selectedUser.name,
  userPhone: selectedUser.phone,
  date: currentDate,
  slots,
  amount
};

  sendWhatsApp(whatsappBooking);
  closeModal('bookingModal');
  showToast(`Booking confirmed for ${dates.length} day(s)!`, 'success');
  loadSlots();
};

// ─── DETAIL MODAL ─────────────────────────────────────────────────────────────
window.openDetailModal = function(booking) {
  document.getElementById('detailTitle').textContent = 'Booking Details';
  const isPaid = booking.paymentStatus === 'paid';

  let payLine = '';
  if (isPaid) {
    const mode = booking.paymentMode || '';
    const modeLabel = mode === 'combo'
      ? `UPI ₹${booking.upiAmount || 0} + Cash ₹${booking.cashAmount || 0}`
      : mode.toUpperCase();
    payLine = `<div class="detail-row"><span class="detail-label">Payment Mode</span><span class="detail-value">${modeLabel}</span></div>`;
    if (booking.paymentNotes) {
      payLine += `<div class="detail-row"><span class="detail-label">Pay Notes</span><span class="detail-value">${booking.paymentNotes}</span></div>`;
    }
  }

  const body = document.getElementById('detailBody');
  body.innerHTML = `
    <div class="detail-row"><span class="detail-label">Date</span><span class="detail-value">${booking.date}</span></div>
    <div class="detail-row"><span class="detail-label">Slot</span><span class="detail-value">${fmtRange(booking.slots)}</span></div>
    <div class="detail-row"><span class="detail-label">Customer</span><span class="detail-value">${booking.userName}</span></div>
    <div class="detail-row"><span class="detail-label">Mobile</span><span class="detail-value">${booking.userPhone || '—'}</span></div>
    <div class="detail-row"><span class="detail-label">Amount</span><span class="detail-value">₹${booking.amount || 0}</span></div>
    <div class="detail-row"><span class="detail-label">Type</span><span class="detail-value">${booking.seriesType ? booking.seriesType + ' series' : 'Single day'}</span></div>
    <div class="detail-row"><span class="detail-label">Payment</span><span class="detail-value"><span class="payment-badge ${isPaid ? 'paid' : 'pending'}">${isPaid ? '✓ Paid' : '⏳ Pending'}</span></span></div>
    ${payLine}
    ${booking.notes ? `<div class="detail-row"><span class="detail-label">Notes</span><span class="detail-value">${booking.notes}</span></div>` : ''}
    <div class="detail-actions">
      ${!isPaid ? `<button class="btn-pay" onclick="openPaymentModal('${booking.id}')">💳 Update Payment</button>` : ''}
      <button class="btn-whatsapp" onclick="sendWhatsApp(${JSON.stringify(booking).replace(/"/g,'&quot;')})">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
        Send WhatsApp
      </button>
      <button class="btn-danger" onclick="cancelBooking('${booking.id}')">Cancel This Booking</button>
      ${booking.seriesId ? `<button class="btn-danger" style="opacity:.7" onclick="cancelSeries('${booking.seriesId}')">Cancel Entire Series</button>` : ''}
    </div>
  `;
  document.getElementById('detailModal').classList.add('open');
};

window.openBlockDetail = function(blocked) {
  document.getElementById('detailTitle').textContent = 'Blocked Slot';
  const body = document.getElementById('detailBody');
  body.innerHTML = `
    <div class="detail-row"><span class="detail-label">Date</span><span class="detail-value">${blocked.date}</span></div>
    <div class="detail-row"><span class="detail-label">Slots</span><span class="detail-value">${fmtRange(blocked.slots)}</span></div>
    <div class="detail-row"><span class="detail-label">Reason</span><span class="detail-value">${blocked.reason || '—'}</span></div>
    ${blocked.notes ? `<div class="detail-row"><span class="detail-label">Notes</span><span class="detail-value">${blocked.notes}</span></div>` : ''}
    <div class="detail-actions">
      <button class="btn-warning" onclick="unblockSlots('${blocked.id}')">Remove Block</button>
    </div>
  `;
  document.getElementById('detailModal').classList.add('open');
};

window.cancelBooking = async function(id) {
  if (!confirm('Cancel this booking?')) return;
  await deleteDoc(doc(db, 'bookings', id));
  closeModal('detailModal');
  showToast('Booking cancelled', 'success');
  loadSlots();
};

window.cancelSeries = async function(seriesId) {
  if (!confirm('Cancel the entire series?')) return;
  const snap  = await getDocs(query(collection(db, 'bookings'), where('seriesId', '==', seriesId)));
  const batch = writeBatch(db);
  snap.forEach(d => batch.delete(d.ref));
  await batch.commit();
  closeModal('detailModal');
  showToast('Series cancelled', 'success');
  loadSlots();
};

window.unblockSlots = async function(blockId) {
  if (!confirm('Remove this block?')) return;
  await deleteDoc(doc(db, 'blockedSlots', blockId));
  closeModal('detailModal');
  showToast('Block removed', 'success');
  loadSlots();
};

/// ─── WHATSAPP ─────────────────────────────────────────────────────────────────
window.sendWhatsApp = function(booking) {
  const phone  = booking.userPhone;
  const name   = booking.userName;
  const date   = booking.date;
  const slot   = fmtRange(booking.slots);
  const amount = booking.amount || 0;
  const turf   = settings.turfName || 'Bails Arena';

  const msg =
  `Hello ${name}!\n\n` +
  `[BOOKING CONFIRMED]\n\n` +
  `Date : ${date}\n` +
  `Slot : ${slot}\n` +
  `Amount : Rs.${amount}\n\n` +
  `Thank you for choosing ${turf}!`;

  const url =
    `https://wa.me/91${phone}?text=${encodeURIComponent(msg)}`;

  window.open(url, '_blank');
};
// ─── PAYMENT MODAL ────────────────────────────────────────────────────────────
window.openPaymentModal = function(bookingId) {
  currentBookingId = bookingId;
  document.querySelector('input[name="payMode"][value="upi"]').checked = true;
  document.getElementById('comboFields').classList.add('hidden');
  document.getElementById('payUpiAmount').value  = '';
  document.getElementById('payCashAmount').value = '';
  document.getElementById('payNotes').value      = '';
  closeModal('detailModal');
  document.getElementById('paymentModal').classList.add('open');
};

window.onPayModeChange = function(mode) {
  document.getElementById('comboFields').classList.toggle('hidden', mode !== 'combo');
};

window.savePayment = async function() {
  if (!currentBookingId) return;
  const mode     = document.querySelector('input[name="payMode"]:checked')?.value;
  const payNotes = document.getElementById('payNotes').value.trim();
  let upiAmount  = 0, cashAmount = 0;

  if (mode === 'combo') {
    upiAmount  = parseFloat(document.getElementById('payUpiAmount').value)  || 0;
    cashAmount = parseFloat(document.getElementById('payCashAmount').value) || 0;
    if (!upiAmount && !cashAmount) return showToast('Enter at least one amount', 'error');
  }

  await setDoc(doc(db, 'bookings', currentBookingId), {
    paymentStatus: 'paid',
    paymentMode:   mode,
    upiAmount,
    cashAmount,
    paymentNotes:  payNotes,
    paidAt:        Timestamp.now()
  }, { merge: true });

  closeModal('paymentModal');
  showToast('Payment recorded', 'success');
  loadSlots();
};

// ─── BLOCK MODAL ──────────────────────────────────────────────────────────────
window.openBlockModal = function() {
  selectedBlockSlots = [];
  document.getElementById('blockDate').value   = currentDate;
  document.getElementById('blockNotes').value  = '';
  document.getElementById('blockReason').value = 'Tournament';
  renderBlockSlotPicker();
  document.getElementById('blockModal').classList.add('open');
};

window.renderBlockSlotPicker = async function() {
  const date      = document.getElementById('blockDate').value || currentDate;
  const container = document.getElementById('blockSlotPicker');
  container.innerHTML = '<div style="color:var(--text-dim);font-size:.8rem">Loading…</div>';
  selectedBlockSlots = [];

  const [bSnap, blSnap] = await Promise.all([
    getDocs(query(collection(db, 'bookings'),     where('date', '==', date))),
    getDocs(query(collection(db, 'blockedSlots'), where('date', '==', date)))
  ]);
  const taken = new Set();
  bSnap.forEach(d => (d.data().slots || []).forEach(s => taken.add(s)));
  blSnap.forEach(d => (d.data().slots || []).forEach(s => taken.add(s)));

  container.innerHTML = '';
  for (let h = 0; h < 24; h++) {
    const btn   = document.createElement('div');
    const isTaken = taken.has(h);
    btn.className  = `sp-slot${isTaken ? ' taken' : ''}`;
    btn.textContent = fmtHour(h);
    btn.dataset.hour = h;
    if (!isTaken) {
      btn.onclick = () => {
        const idx = selectedBlockSlots.indexOf(h);
        if (idx >= 0) selectedBlockSlots.splice(idx, 1);
        else selectedBlockSlots.push(h);
        btn.classList.toggle('selected', selectedBlockSlots.includes(h));
      };
    }
    container.appendChild(btn);
  }
};

window.saveBlock = async function() {
  if (!selectedBlockSlots.length) return showToast('Select at least one slot to block', 'error');
  const date   = document.getElementById('blockDate').value;
  const reason = document.getElementById('blockReason').value;
  const notes  = document.getElementById('blockNotes').value.trim();

  if (!date) return showToast('Select a date', 'error');

  await addDoc(collection(db, 'blockedSlots'), {
    date,
    slots: selectedBlockSlots.sort((a, b) => a - b),
    reason, notes,
    createdAt: Timestamp.now()
  });

  closeModal('blockModal');
  showToast('Slots blocked', 'success');
  if (date === currentDate) loadSlots();
};

// ─── CUSTOMERS PAGE ───────────────────────────────────────────────────────────
async function loadUsers() {
  const snap = await getDocs(query(collection(db, 'users'), orderBy('name')));
  allUsers = [];
  snap.forEach(d => allUsers.push({ id: d.id, ...d.data() }));
  renderUsers(allUsers);
}

function renderUsers(users) {

  const list =
    document.getElementById('usersList');

  if (!users.length) {

    list.innerHTML =
      '<p style="color:var(--text-dim);padding:20px 0">No customers found.</p>';

    return;
  }

  list.innerHTML = users.map(u => `

    <div class="user-card">

      <div class="user-main">
        <div class="user-card-name">${u.name}</div>
        <div class="user-card-phone">📞  ${u.phone}</div>
        ${u.notes ? `<div class="user-card-note">${u.notes}</div>` : ''}
      </div>

      <div class="user-actions">

        <button class="btn-small"
          onclick="editUser('${u.id}')">
          Edit
        </button>

        <button class="btn-small danger"
          onclick="deleteUser('${u.id}')">
          Delete
        </button>

      </div>

    </div>

  `).join('');
}

window.filterUsers = function() {
  const q = document.getElementById('userSearch').value.toLowerCase();
  renderUsers(allUsers.filter(u => u.name.toLowerCase().includes(q) || (u.phone || '').includes(q)));
};

window.openAddUserModal = function() {
  document.getElementById('auName').value  = '';
  document.getElementById('auPhone').value = '';
  document.getElementById('auNotes').value = '';
  document.getElementById('addUserModal').classList.add('open');
};

window.saveNewUser = async function() {
  const name  = document.getElementById('auName').value.trim();
  const phone = document.getElementById('auPhone').value.trim();
  const notes = document.getElementById('auNotes').value.trim();
  if (!name || !phone)         return showToast('Name and phone required', 'error');
  if (!/^\d{10}$/.test(phone)) return showToast('Enter a valid 10-digit mobile', 'error');

  const snap = await getDocs(query(collection(db, 'users'), where('phone', '==', phone)));
  if (!snap.empty) return showToast('Mobile already registered', 'error');

  const ref = await addDoc(collection(db, 'users'), { name, phone, notes, createdAt: Timestamp.now() });
  allUsers.push({ id: ref.id, name, phone, notes });
  allUsers.sort((a, b) => a.name.localeCompare(b.name));
  closeModal('addUserModal');
  renderUsers(allUsers);
  showToast('Customer added', 'success');
};

window.editUser = async function(id){

  const user = allUsers.find(u => u.id === id);

  if(!user) return;

  const name = prompt('Customer Name', user.name);
  if(name === null) return;

  const phone = prompt('Phone Number', user.phone);
  if(phone === null) return;

  await updateDoc(doc(db,'users',id),{
    name,
    phone
  });

  showToast('Customer updated');

  loadUsers();
};


window.deleteUser = async function(id){

  const ok = confirm(
    'Delete this customer?'
  );

  if(!ok) return;

  await deleteDoc(doc(db,'users',id));

  showToast('Customer deleted');

  loadUsers();
};

// ─── REPORTS ──────────────────────────────────────────────────────────────────
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
    const m   = document.getElementById('monthPicker').value || today.slice(0, 7);
    start     = `${m}-01`;
    const [y, mo] = m.split('-').map(Number);
    const last    = new Date(y, mo, 0).getDate();
    end           = `${m}-${pad(last)}`;
  } else {
    start = document.getElementById('customFrom').value;
    end   = document.getElementById('customTo').value;
    if (!start || !end) return showToast('Set both dates', 'error');
  }

  const snap = await getDocs(query(
    collection(db, 'bookings'),
    where('date', '>=', start),
    where('date', '<=', end),
    orderBy('date')
  ));
  reportData = [];
  snap.forEach(d => reportData.push({ id: d.id, ...d.data() }));
  renderReport(start, end);
};

function renderReport(start, end) {
  const out = document.getElementById('reportOutput');
  out.classList.remove('hidden');

  const totalRev    = reportData.reduce((s, b) => s + (b.amount || 0), 0);
  const totalSlots  = reportData.reduce((s, b) => s + (b.slots || []).length, 0);
  const unique      = new Set(reportData.map(b => b.userId)).size;
  const pending     = reportData.filter(b => b.paymentStatus !== 'paid').reduce((s, b) => s + (b.amount || 0), 0);

  document.getElementById('reportSummary').innerHTML = `
    <div class="summary-card"><div class="sc-val">${reportData.length}</div><div class="sc-label">Bookings</div></div>
    <div class="summary-card"><div class="sc-val">${totalSlots}</div><div class="sc-label">Hours Booked</div></div>
    <div class="summary-card"><div class="sc-val">₹${totalRev.toLocaleString()}</div><div class="sc-label">Revenue</div></div>
    <div class="summary-card"><div class="sc-val">${unique}</div><div class="sc-label">Customers</div></div>
    <div class="summary-card danger"><div class="sc-val">₹${pending.toLocaleString()}</div><div class="sc-label">Pending</div></div>
  `;

  document.getElementById('reportBody').innerHTML = reportData.map(b => {
    const paid = b.paymentStatus === 'paid';
    const modeLabel = !b.paymentMode ? '—' :
      b.paymentMode === 'combo' ? `UPI ₹${b.upiAmount || 0} + Cash ₹${b.cashAmount || 0}` :
      b.paymentMode.toUpperCase();
    return `
      <tr>
        <td>${b.date}</td>
        <td>${fmtRange(b.slots)}</td>
        <td>${b.userName || '—'}</td>
        <td>${b.userPhone || '—'}</td>
        <td>₹${b.amount || 0}</td>
        <td><span class="${paid ? 'tag-paid' : 'tag-pending'}">${paid ? 'Paid' : 'Pending'}</span></td>
        <td>${modeLabel}</td>
        <td>${b.seriesType || 'Single'}</td>
        <td>${b.notes || '—'}</td>
      </tr>`;
  }).join('');
}

window.downloadExcel = function() {
  if (!window.XLSX) return showToast('Excel library not loaded', 'error');
  const rows = [
    ['Date', 'Slot', 'Customer', 'Mobile', 'Amount (₹)', 'Payment Status', 'Payment Mode', 'UPI Amount', 'Cash Amount', 'Type', 'Notes'],
    ...reportData.map(b => [
      b.date,
      fmtRange(b.slots),
      b.userName || '',
      b.userPhone || '',
      b.amount || 0,
      b.paymentStatus || 'pending',
      b.paymentMode || '',
      b.upiAmount || 0,
      b.cashAmount || 0,
      b.seriesType || 'Single',
      b.notes || ''
    ])
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Bookings');
  XLSX.writeFile(wb, `bails-arena-report-${todayStr()}.xlsx`);
};

window.downloadCSV = function() {
  const header = ['Date', 'Slot', 'Customer', 'Mobile', 'Amount', 'Payment Status', 'Mode', 'Type', 'Notes'];
  const rows   = reportData.map(b => [
    b.date, fmtRange(b.slots), b.userName, b.userPhone,
    b.amount || 0, b.paymentStatus || 'pending', b.paymentMode || '',
    b.seriesType || 'Single', b.notes || ''
  ]);
  const csv  = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `bails-arena-report-${todayStr()}.csv`;
  a.click();
};

// ─── SETTINGS ─────────────────────────────────────────────────────────────────
async function loadSettings() {
  try {
    const snap = await getDoc(doc(db, 'settings', 'pricing'));
    if (snap.exists()) {
      settings = { ...settings, ...snap.data() };
    }
  } catch (_) {}

  document.getElementById('settingWeekdayPrice').value  = settings.weekdayPrice || 500;
  document.getElementById('settingWeekendPrice').value  = settings.weekendPrice || 700;
  document.getElementById('settingTurfName').value      = settings.turfName || 'Bails Arena';
  document.getElementById('settingAdminPhone').value    = settings.adminPhone || '';
  const wd = settings.weekendDays || [0, 6];
  document.getElementById('wdSat').checked = wd.includes(6);
  document.getElementById('wdSun').checked = wd.includes(0);
}

window.saveSettings = async function() {
  const weekdayPrice = parseFloat(document.getElementById('settingWeekdayPrice').value) || 500;
  const weekendPrice = parseFloat(document.getElementById('settingWeekendPrice').value) || 700;
  const turfName     = document.getElementById('settingTurfName').value.trim() || 'Bails Arena';
  const adminPhone   = document.getElementById('settingAdminPhone').value.trim();
  const weekendDays  = [];
  if (document.getElementById('wdSat').checked) weekendDays.push(6);
  if (document.getElementById('wdSun').checked) weekendDays.push(0);

  await setDoc(doc(db, 'settings', 'pricing'), { weekdayPrice, weekendPrice, turfName, adminPhone, weekendDays });
  settings = { weekdayPrice, weekendPrice, turfName, adminPhone, weekendDays };
  showToast('Settings saved', 'success');
};

// ─── INIT ─────────────────────────────────────────────────────────────────────
async function init() {
  try {
    await Promise.all([
      loadSettings(),
      getDocs(query(collection(db, 'users'), orderBy('name'))).then(snap => {
        allUsers = [];
        snap.forEach(d => allUsers.push({ id: d.id, ...d.data() }));
      })
    ]);

    stripStartDate = getSundayOfWeek(currentDate);
    renderDateStrip();
    updateMonthLabel();

    // Set report defaults
    document.getElementById('weekStart').value    = dateAdd(currentDate, -6);
    document.getElementById('monthPicker').value  = currentDate.slice(0, 7);

    // Set block date default
    document.getElementById('blockDate').value = currentDate;

    // Set active nav
    document.getElementById('nav-home').classList.add('active');

    loadSlots();
  } catch (e) {
    console.error('Init error:', e);
    document.getElementById('slotsGrid').innerHTML =
      '<div class="loading-slots" style="color:var(--booked-text)">⚠ Firebase connection failed. Check config in js/firebase-config.js</div>';
  }
}
