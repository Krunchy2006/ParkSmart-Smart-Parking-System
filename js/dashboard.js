// Driver Dashboard Controller (Capacity-Based Reservations)
import { firebaseConfig } from './firebase-config.js';
import { initializeApp, getApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getDatabase, ref, onValue, get, set, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";

(function () {
    let currentUser = null;

    // --- Toast System ---
    function showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        let icon = 'info';
        if (type === 'success') icon = 'check-circle';
        if (type === 'error') icon = 'alert-triangle';

        toast.innerHTML = `
            <i data-lucide="${icon}"></i>
            <span class="toast-message">${message}</span>
        `;

        container.appendChild(toast);
        lucide.createIcons();

        // Slide out and remove toast
        setTimeout(() => {
            toast.style.animation = 'slide-in-toast 0.3s ease-in reverse forwards';
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    }

    // --- Main Initializer ---
    function init() {
        currentUser = window.ParkingAuth.getCurrentUser();
        if (!currentUser) return; // Guard in case of routing delays

        // Welcome Header Setup
        const welcomeText = document.getElementById('welcomeUser');
        if (welcomeText) {
            welcomeText.innerText = `Welcome back, ${currentUser.name.split(' ')[0]}`;
        }

        // Setup Header Auth items
        renderHeaderAuth();

        // Setup live Firebase stats
        setupLiveStats();

        // Setup state variables
        renderDashboard();

        // Bind confirmations
        const btnReserve = document.getElementById('btnReserveParking');
        if (btnReserve) btnReserve.addEventListener('click', confirmReservation);

        const btnCancel = document.getElementById('btnCancelReservation');
        if (btnCancel) btnCancel.addEventListener('click', cancelReservation);

        // Listen to storage synchronization
        window.addEventListener('storage', () => {
            setupLiveStats();
            renderDashboard();
        });

        // Listen to custom alert notifications
        checkAlertBroadcasts();
        setInterval(checkAlertBroadcasts, 3000);
    }

    // Render Navigation elements
    function renderHeaderAuth() {
        const navActions = document.getElementById('navActions');
        if (!navActions) return;

        navActions.innerHTML = `
            <div style="display: flex; align-items: center; gap: 16px;">
                <span style="font-size: 14px; font-weight: 600; color: var(--text-secondary); display: flex; align-items: center; gap: 6px;">
                    <i data-lucide="user" style="width: 14px; height: 14px;"></i> ${currentUser.name}
                </span>
                <button id="btnLogout" class="btn btn-secondary btn-sm">Logout</button>
            </div>
        `;

        document.getElementById('btnLogout').addEventListener('click', () => {
            window.ParkingAuth.logout();
        });

        lucide.createIcons();
    }

    // Render stats and components
    function renderDashboard() {
        if (!currentUser) return;
        checkUserReservation();
    }

    // --- Helper to Render QR Code ---
    function renderQRCode(text) {
        const qrEl = document.getElementById('qrcode');
        if (!qrEl) return;
        qrEl.innerHTML = ''; // Clear previous QR Code if any
        try {
            new window.QRCode(qrEl, {
                text: text,
                width: 140,
                height: 140,
                colorDark: "#0f172a",
                colorLight: "#ffffff",
                correctLevel: window.QRCode.CorrectLevel.H
            });
        } catch (err) {
            console.error("Failed to generate QR Code visual:", err);
        }
    }

    // --- Check Daily Reservation Status ---
    async function checkUserReservation() {
        const isMockMode = !firebaseConfig.apiKey || firebaseConfig.apiKey.startsWith("YOUR_");

        const actionPanel = document.getElementById('bookingActionCard');
        const ticketPanel = document.getElementById('bookingTicketCard');

        if (!actionPanel || !ticketPanel) return;

        if (isMockMode) {
            // Mock Mode reservation check
            const state = window.ParkingState.getState();
            const activeTicket = state.reservations.find(r => r.username === currentUser.name && r.status !== 'completed');

            if (activeTicket) {
                actionPanel.style.display = 'none';
                ticketPanel.style.display = 'block';
                document.getElementById('ticketIdVal').innerText = activeTicket.ticketId;
                document.getElementById('ticketUserVal').innerText = activeTicket.username;
                document.getElementById('ticketTimeVal').innerText = activeTicket.createdTime;

                // Render mock QR code using ticketId
                renderQRCode(`mock_${activeTicket.ticketId}`);
            } else {
                ticketPanel.style.display = 'none';
                actionPanel.style.display = 'block';
            }
            return;
        }

        // Firebase Mode reservation check
        try {
            let app;
            try {
                app = getApp();
            } catch {
                app = initializeApp(firebaseConfig);
            }
            const db = getDatabase(app);
            const now = new Date();
            const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

            const resRef = ref(db, `reservations/${dateStr}/${currentUser.uid}`);
            const snapshot = await get(resRef);

            if (snapshot.exists()) {
                const ticket = snapshot.val();
                actionPanel.style.display = 'none';
                ticketPanel.style.display = 'block';

                // Construct a dynamic ticket ref hash
                const ticketRef = ticket.timestamp
                    ? 'TX-' + String(ticket.timestamp).substring(7)
                    : 'TX-' + currentUser.uid.substring(0, 6).toUpperCase();

                document.getElementById('ticketIdVal').innerText = ticketRef;
                document.getElementById('ticketUserVal').innerText = ticket.name || currentUser.name;
                document.getElementById('ticketTimeVal').innerText = ticket.timestamp
                    ? new Date(ticket.timestamp).toLocaleTimeString()
                    : new Date().toLocaleTimeString();

                // Render existing QR code from Firebase
                if (ticket.qrCode) {
                    renderQRCode(ticket.qrCode);
                }
            } else {
                ticketPanel.style.display = 'none';
                actionPanel.style.display = 'block';
            }
        } catch (err) {
            console.error("Failed to check Firebase user reservation:", err);
            // Default show action panel on error
            ticketPanel.style.display = 'none';
            actionPanel.style.display = 'block';
        }
    }

    // Confirm booking
    async function confirmReservation() {
        const isMockMode = !firebaseConfig.apiKey || firebaseConfig.apiKey.startsWith("YOUR_");

        // 1. Time Window Check (6:00 AM - 8:00 AM)
        const hour = new Date().getHours();
        if (hour < 3 || hour >= 11) {
            showToast("Reservation window closed. Reservations are only allowed between 6:00 AM and 8:00 AM.", "error");
            return;
        }

        if (isMockMode) {
            // Mock reservation fallback: Check capacity
            const state = window.ParkingState.getState();
            const availableCount = state.slots.filter(s => s.status === 'available').length;
            if (availableCount <= 0) {
                showToast("Reservation failed: The parking facility is full.", "error");
                return;
            }

            // Verify if duplicate exists locally
            const activeRes = state.reservations.find(r => r.username === currentUser.name && r.status !== 'completed');
            if (activeRes) {
                showToast("Already reserved today. You can only make one reservation per day.", "error");
                return;
            }

            // Reserve first available slot
            const firstAvailable = state.slots.find(s => s.status === 'available');
            const res = window.ParkingState.reserveSlot(firstAvailable.id, currentUser.name);
            if (res.success) {
                renderDashboard();
                const modal = document.getElementById('successModal');
                if (modal) modal.classList.add('active');
            } else {
                showToast(res.error, 'error');
            }
            return;
        }

        // Firebase Mode
        try {
            let app;
            try {
                app = getApp();
            } catch {
                app = initializeApp(firebaseConfig);
            }
            const db = getDatabase(app);

            // 2. Capacity Check (availableSlots > 0)
            const statusRef = ref(db, 'parking_status');
            const statusSnap = await get(statusRef);
            if (statusSnap.exists()) {
                const status = statusSnap.val();
                if (status.availableSlots === undefined || status.availableSlots <= 0) {
                    showToast("Reservation failed: The parking facility is full.", "error");
                    return;
                }
            } else {
                showToast("Failed to verify parking status on server.", "error");
                return;
            }

            // 3. Duplicate check for current date
            const now = new Date();
            const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            const resRef = ref(db, `reservations/${dateStr}/${currentUser.uid}`);
            const resSnap = await get(resRef);

            if (resSnap.exists()) {
                showToast("Already reserved today. You can only make one reservation per day.", "error");
                return;
            }

            // 4. Save reservation record with unique QR string and checkInTime
            const qrString = `PK-${dateStr}-${currentUser.uid}-${Date.now()}`;
            const bookingData = {
                name: currentUser.name,
                email: currentUser.email.toLowerCase(),
                reserved: true,
                used: false,
                timestamp: serverTimestamp(),
                qrCode: qrString,
                checkInTime: null
            };

            await set(resRef, bookingData);

            // Show success confirmation Modal
            const modal = document.getElementById('successModal');
            if (modal) modal.classList.add('active');

            if (window.ParkingState) {
                window.ParkingState.addLog(`User '${currentUser.name}' reserved parking for today via Firebase.`);
            }

            renderDashboard();

        } catch (err) {
            console.error("Firebase Reservation failed:", err);
            showToast("Failed to complete reservation on database.", "error");
        }
    }

    // Cancel active ticket
    async function cancelReservation() {
        const isMockMode = !firebaseConfig.apiKey || firebaseConfig.apiKey.startsWith("YOUR_");

        if (isMockMode) {
            const state = window.ParkingState.getState();
            const activeTicket = state.reservations.find(r => r.username === currentUser.name && r.status !== 'completed');
            if (!activeTicket) return;

            const res = window.ParkingState.cancelReservation(activeTicket.ticketId);
            if (res.success) {
                showToast('Reservation cancelled successfully.', 'success');
                renderDashboard();
            } else {
                showToast(res.error, 'error');
            }
            return;
        }

        // Firebase Mode
        try {
            let app;
            try {
                app = getApp();
            } catch {
                app = initializeApp(firebaseConfig);
            }
            const db = getDatabase(app);
            const now = new Date();
            const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

            const resRef = ref(db, `reservations/${dateStr}/${currentUser.uid}`);
            await set(resRef, null); // Deletes record

            showToast("Reservation cancelled successfully.", "success");
            renderDashboard();
        } catch (err) {
            console.error("Firebase cancel reservation failed:", err);
            showToast("Failed to cancel reservation on server.", "error");
        }
    }

    // --- Live Realtime Database Stats Handler ---
    let statsListenerUnsubscribe = null;

    function setupLiveStats() {
        const isMockMode = !firebaseConfig.apiKey || firebaseConfig.apiKey.startsWith("YOUR_");

        const countAvailableEl = document.getElementById('countAvailable');
        const countTotalEl = document.getElementById('countTotal');
        const countOccupiedEl = document.getElementById('countOccupied');

        if (!countAvailableEl || !countTotalEl || !countOccupiedEl) return;

        if (isMockMode) {
            updateLocalStats();
            window.addEventListener('storage', updateLocalStats);
            return;
        }

        // Show skeleton pulse loading animations while fetching
        countAvailableEl.innerHTML = `<span class="skeleton-pulse"></span>`;
        countTotalEl.innerHTML = `<span class="skeleton-pulse"></span>`;
        countOccupiedEl.innerHTML = `<span class="skeleton-pulse"></span>`;

        try {
            let app;
            try {
                app = getApp();
            } catch {
                app = initializeApp(firebaseConfig);
            }
            const db = getDatabase(app);
            const statusRef = ref(db, 'parking_status');

            if (statsListenerUnsubscribe) {
                statsListenerUnsubscribe();
            }

            // Register live Realtime Database listener
            statsListenerUnsubscribe = onValue(statusRef, (snapshot) => {
                if (snapshot.exists()) {
                    const data = snapshot.val();

                    countAvailableEl.innerText = data.availableSlots !== undefined ? data.availableSlots : '--';
                    countTotalEl.innerText = data.totalSlots !== undefined ? data.totalSlots : '--';
                    countOccupiedEl.innerText = data.occupiedSlots !== undefined ? data.occupiedSlots : '--';
                } else {
                    showToast("No live database status found. Initializing standard slots...", "info");
                    countAvailableEl.innerText = '--';
                    countTotalEl.innerText = '--';
                    countOccupiedEl.innerText = '--';
                }
            }, (error) => {
                console.error("Firebase live status connection error:", error);
                showToast("Database unreachable. presenting offline local indicators.", "error");
                fallbackToLocalStats();
            });

        } catch (err) {
            console.error("Firebase DB initialization failed:", err);
            showToast("Failed to connect to Firebase database. presenting offline stats.", "error");
            fallbackToLocalStats();
        }
    }

    function updateLocalStats() {
        const state = window.ParkingState.getState();
        const available = state.slots.filter(s => s.status === 'available').length;
        const occupied = state.slots.filter(s => s.status === 'occupied').length;
        const total = state.capacity;

        const countAvailableEl = document.getElementById('countAvailable');
        const countTotalEl = document.getElementById('countTotal');
        const countOccupiedEl = document.getElementById('countOccupied');

        if (countAvailableEl) countAvailableEl.innerText = available;
        if (countTotalEl) countTotalEl.innerText = total;
        if (countOccupiedEl) countOccupiedEl.innerText = occupied;
    }

    function fallbackToLocalStats() {
        updateLocalStats();
        window.addEventListener('storage', updateLocalStats);
    }

    // System Notification alerts listeners
    let viewedNotifications = new Set();
    function checkAlertBroadcasts() {
        const state = window.ParkingState.getState();
        if (state.notifications && state.notifications.length > 0) {
            const latest = state.notifications[0];
            if (!viewedNotifications.has(latest.id)) {
                viewedNotifications.add(latest.id);
                showToast(`[ALERT] ${latest.title}: ${latest.message}`, 'error');
            }
        }
    }

    // Modal closer
    window.closeModal = function () {
        const modal = document.getElementById('successModal');
        if (modal) modal.classList.remove('active');
    };

    // Handle async initialization securely
    function startApp() {
        if (window.ParkingAuth && window.ParkingAuth.getCurrentUser()) {
            init();
        } else {
            window.addEventListener('auth-resolved', () => {
                init();
            });
        }
    }

    // Initialize on page load
    window.addEventListener('DOMContentLoaded', startApp);
})();
