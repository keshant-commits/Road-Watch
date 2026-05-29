/**
 * admin.js — Admin Dashboard Logic
 *
 * Handles:
 *  - KPI stats (total complaints, pending count, active contractors)
 *  - Road asset registry table
 *  - Budget transparency timeline
 *  - Complaint management table with status updates
 *  - Photo modal (click thumbnail to see full photo)
 */

document.addEventListener('DOMContentLoaded', () => {
    console.log("🛠️ Admin Command Center initializing...");
    initAdminDashboard();
});

/**
 * Loads all dashboard sections in parallel using Promise.all.
 * Faster than loading them one by one.
 */
async function initAdminDashboard() {
    try {
        await Promise.all([
            updateStats(),
            loadRoads(),
            loadBudget(),
            loadComplaintsTable()
        ]);
        console.log("✅ Admin dashboard fully loaded.");
    } catch (e) {
        console.error("❌ Admin dashboard init error:", e);
    }
}

// ============================================================
// KPI STATS
// Counts total complaints, pending complaints, unique contractors
// ============================================================
async function updateStats() {
    try {
        const [compRes, roadRes] = await Promise.all([
            fetch('/complaints'),
            fetch('/roads')
        ]);
        const complaints = await compRes.json();
        const roads      = await roadRes.json();

        // Total complaints count
        const compEl = document.getElementById('stat-total-complaints');
        if (compEl) compEl.innerText = complaints.length;

        // Pending complaints count (status === 'Pending')
        const pendingEl = document.getElementById('stat-pending');
        if (pendingEl) {
            const pendingCount = complaints.filter(c => c.status === 'Pending').length;
            pendingEl.innerText = pendingCount;
        }

        // Count unique contractor names from the roads list
        const contractorEl = document.getElementById('stat-contractors');
        if (contractorEl) {
            const unique = new Set(roads.map(r => r.contractor));
            contractorEl.innerText = unique.size;
        }

    } catch (e) {
        console.error("❌ Stats error:", e);
    }
}

// ============================================================
// ROAD ASSET REGISTRY TABLE
// Shows all roads with type, contractor, last repair, budget
// ============================================================
async function loadRoads() {
    try {
        const res  = await fetch('/roads');
        const data = await res.json();
        const tableBody = document.getElementById('roads-table-body');
        if (!tableBody) return;

        if (data.length === 0) {
            tableBody.innerHTML = `
                <tr><td colspan="5" class="px-6 py-8 text-center text-slate-400 italic">
                    No road records found.
                </td></tr>`;
            return;
        }

        tableBody.innerHTML = data.map(r => `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="px-6 py-4 font-medium text-slate-800">${r.name}</td>
                <td class="px-6 py-4">
                    <span class="px-2 py-1 bg-blue-100 text-blue-700 rounded-md text-xs font-bold">
                        ${r.type}
                    </span>
                </td>
                <td class="px-6 py-4 text-slate-600">${r.contractor}</td>
                <td class="px-6 py-4 text-slate-500 text-sm">${r.last_repair}</td>
                <td class="px-6 py-4 font-mono font-semibold text-green-700">${r.budget}</td>
            </tr>
        `).join('');
    } catch (e) {
        console.error("❌ Roads load error:", e);
    }
}

// ============================================================
// BUDGET TRANSPARENCY TIMELINE
// Shows each budget entry with SHA-256 hash as an immutable log
// ============================================================
async function loadBudget() {
    try {
        const res  = await fetch('/budget');
        const data = await res.json();
        const timeline = document.getElementById('budget-timeline');
        if (!timeline) return;

        if (data.length === 0) {
            timeline.innerHTML = `
                <p class="text-slate-400 text-sm italic text-center">No budget entries yet.</p>`;
            return;
        }

        timeline.innerHTML = data.map(b => {
            const isSpent      = b.type === 'Spent';
            const dotColour    = isSpent ? 'bg-amber-400'  : 'bg-teal-500';
            const amountColour = isSpent ? 'text-amber-400' : 'text-teal-400';
            const typeLabel    = isSpent ? '💸 Spent'       : '✅ Sanctioned';
            // Format number with Indian number system (e.g. 42,00,000)
            const formatted    = Number(b.amount).toLocaleString('en-IN');

            return `
                <div class="relative pl-6 border-l-2 border-slate-700">
                    <!-- Timeline dot -->
                    <div class="absolute -left-[9px] top-1 w-4 h-4 ${dotColour} rounded-full border-4 border-slate-900"></div>
                    <div class="text-xs text-slate-400 mb-1">${b.timestamp}</div>
                    <div class="text-sm font-medium text-slate-200">
                        Road ID: ${b.road_id}
                        <span class="ml-2 text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-300">
                            ${typeLabel}
                        </span>
                    </div>
                    <div class="${amountColour} font-bold text-lg mt-1">₹${formatted}</div>
                    <!-- Show first 20 chars of hash — enough to look tamper-proof -->
                    <div class="mt-2 p-2 bg-slate-800 rounded text-[10px] font-mono text-slate-400 break-all">
                        HASH: ${b.hash.substring(0, 20)}...
                    </div>
                </div>
            `;
        }).join('');
    } catch (e) {
        console.error("❌ Budget load error:", e);
    }
}

// ============================================================
// COMPLAINT MANAGEMENT TABLE
// Shows every complaint with a status dropdown and Update button.
// Admin can change status to: Pending | Work In Progress | Issue Fixed | Dropped
// ============================================================
async function loadComplaintsTable() {
    try {
        const res  = await fetch('/complaints');
        const data = await res.json();
        const tbody = document.getElementById('complaints-table-body');
        if (!tbody) return;

        if (data.length === 0) {
            tbody.innerHTML = `
                <tr><td colspan="6" class="px-6 py-8 text-center text-slate-400 italic">
                    No complaints yet.
                </td></tr>`;
            return;
        }

        tbody.innerHTML = data.map(c => {
            const currentStatus = c.status || 'Pending';
            const badgeClass    = getStatusBadgeClass(currentStatus);

            // Show photo thumbnail if the complaint has a real photo
            // sample_placeholder means it was a pre-filled fake record
            const photoCell = (c.photo_path && c.photo_path !== 'sample_placeholder')
                ? `<img src="/static/uploads/${c.photo_path}"
                        class="w-16 h-12 object-cover rounded-lg shadow cursor-pointer hover:opacity-80 transition"
                        onclick="openPhotoModal('/static/uploads/${c.photo_path}')"
                        onerror="this.outerHTML='<span class=\'text-slate-400 text-xs\'>No photo</span>'">`
                : `<span class="text-slate-400 text-xs italic">No photo</span>`;

            return `
                <tr class="hover:bg-slate-50 transition-colors" id="complaint-row-${c.id}">

                    <!-- Complaint ID -->
                    <td class="px-4 py-4 text-slate-500 text-sm font-mono">#${c.id}</td>

                    <!-- Photo thumbnail — click to open full size modal -->
                    <td class="px-4 py-4">${photoCell}</td>

                    <!-- Description, timestamp, coordinates -->
                    <td class="px-4 py-4">
                        <p class="font-medium text-slate-800 text-sm">${c.description || '—'}</p>
                        <p class="text-xs text-slate-400 mt-1">🕒 ${c.timestamp || ''}</p>
                        <p class="text-xs text-slate-400">
                            📍 ${parseFloat(c.lat).toFixed(4)}, ${parseFloat(c.lng).toFixed(4)}
                        </p>
                    </td>

                    <!-- Current status badge (updated live after status change) -->
                    <td class="px-4 py-4">
                        <span id="status-badge-${c.id}"
                              class="px-3 py-1 rounded-full text-xs font-bold ${badgeClass}">
                            ${currentStatus}
                        </span>
                    </td>

                    <!-- Status dropdown — admin picks new status here -->
                    <td class="px-4 py-4">
                        <select id="status-select-${c.id}"
                            class="text-sm border border-slate-200 rounded-lg px-2 py-1 outline-none
                                   focus:ring-2 focus:ring-teal-500 bg-white text-slate-700">
                            <option value="Pending"          ${currentStatus === 'Pending'          ? 'selected' : ''}>🕐 Pending</option>
                            <option value="Work In Progress" ${currentStatus === 'Work In Progress' ? 'selected' : ''}>🔧 Work In Progress</option>
                            <option value="Issue Fixed"      ${currentStatus === 'Issue Fixed'      ? 'selected' : ''}>✅ Issue Fixed</option>
                            <option value="Dropped"          ${currentStatus === 'Dropped'          ? 'selected' : ''}>❌ Dropped</option>
                        </select>
                    </td>

                    <!-- Update button — triggers updateStatus() -->
                    <td class="px-4 py-4">
                        <button id="update-btn-${c.id}"
                                onclick="updateStatus(${c.id})"
                            class="bg-teal-600 hover:bg-teal-700 text-white text-xs px-4 py-2
                                   rounded-lg font-semibold transition-colors active:scale-95">
                            Update
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

    } catch (e) {
        console.error("❌ Complaints table load error:", e);
    }
}

// ============================================================
// UPDATE STATUS
// Called when admin clicks the "Update" button for a complaint.
// Sends a PATCH request to /complaint/{id}/status
// Also updates the map marker popup via MapManager.updateMarkerStatus()
// ============================================================
async function updateStatus(complaintId) {
    const select = document.getElementById(`status-select-${complaintId}`);
    const btn    = document.getElementById(`update-btn-${complaintId}`); // FIX: get button by ID not DOM traversal

    if (!select || !btn) return;

    const newStatus = select.value;

    // Show loading state on the button while the request is in flight
    const originalText = btn.textContent;
    btn.textContent = 'Saving...';
    btn.disabled    = true;

    try {
        // Build FormData — FastAPI reads 'status' as a Form(...) field
        const formData = new FormData();
        formData.append('status', newStatus);

        const res  = await fetch(`/complaint/${complaintId}/status`, {
            method: 'PATCH',
            body: formData
        });
        const data = await res.json();

        if (data.status === 'success') {

            // --- UPDATE STATUS BADGE in the table row ---
            const badge = document.getElementById(`status-badge-${complaintId}`);
            if (badge) {
                badge.textContent = newStatus;
                badge.className   = `px-3 py-1 rounded-full text-xs font-bold ${getStatusBadgeClass(newStatus)}`;
            }

            // --- UPDATE MAP MARKER POPUP ---
            // FIX: Now connected to MapManager so the map pin shows the new status too
            if (typeof MapManager !== 'undefined') {
                MapManager.updateMarkerStatus(complaintId, newStatus);
            }

            // --- FLASH ROW GREEN briefly to confirm the save ---
            const row = document.getElementById(`complaint-row-${complaintId}`);
            if (row) {
                row.style.background = '#d1fae5'; // Light green flash
                setTimeout(() => { row.style.background = ''; }, 1500);
            }

            // --- REFRESH KPI STATS so pending count updates ---
            updateStats();

        } else {
            alert(`❌ Update failed: ${data.detail || 'Unknown error'}`);
        }

    } catch (e) {
        console.error("❌ Status update error:", e);
        alert("❌ Could not update status. Check that the server is running.");
    } finally {
        // Always re-enable the button regardless of success or failure
        btn.textContent = originalText;
        btn.disabled    = false;
    }
}

// ============================================================
// STATUS BADGE COLOURS
// Returns Tailwind class string for each status value.
// Used in both the table badge and the KPI pending counter.
// ============================================================
function getStatusBadgeClass(status) {
    const colourMap = {
        'Pending':          'bg-amber-100 text-amber-700',
        'Work In Progress': 'bg-blue-100 text-blue-700',
        'Issue Fixed':      'bg-green-100 text-green-700',
        'Dropped':          'bg-slate-200 text-slate-500',
    };
    // Fallback for any unexpected status value
    return colourMap[status] || 'bg-slate-100 text-slate-600';
}

// ============================================================
// PHOTO MODAL
// Creates a full-screen overlay when admin clicks a photo thumbnail.
// Clicking anywhere on the overlay closes it.
// ============================================================
function openPhotoModal(src) {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-black/80 z-[99999] flex items-center justify-center cursor-pointer';
    overlay.innerHTML = `
        <div class="relative max-w-2xl w-full mx-4" onclick="event.stopPropagation()">
            <img src="${src}" class="w-full rounded-2xl shadow-2xl" alt="Complaint photo" />
            <!-- Close button in top-right corner of the photo -->
            <button onclick="document.body.removeChild(document.querySelector('.fixed.inset-0.bg-black\\/80'))"
                class="absolute top-3 right-3 bg-white text-slate-900 w-8 h-8 rounded-full
                       flex items-center justify-center font-bold text-lg shadow-lg hover:bg-slate-100">
                ✕
            </button>
        </div>
    `;
    // Click the dark backdrop to close
    overlay.onclick = () => document.body.removeChild(overlay);
    document.body.appendChild(overlay);
}