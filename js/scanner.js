// Gate Scanner Kiosk Controller
import { firebaseConfig } from './firebase-config.js';

// Statically import modular Firebase SDK from standard CDN
import { initializeApp, getApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { 
    getDatabase, 
    ref, 
    set, 
    get 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";

(function () {
    let currentUser = null;
    let html5QrCode = null;
    let isProcessing = false;
    let lastScannedCode = null;
    let lastScannedTime = 0;

    // --- Toast Notification helper ---
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

        setTimeout(() => {
            toast.style.animation = 'slide-in-toast 0.3s ease-in reverse forwards';
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    }

    // --- Init ---
    function init() {
        currentUser = window.ParkingAuth.getCurrentUser();
        renderHeaderAuth();
        populateActiveTickets();
        startCameraScanner();

        // Bind scan simulate buttons
        const btnEntry = document.getElementById('btnSimulateEntry');
        if (btnEntry) btnEntry.addEventListener('click', () => triggerManualVerify('entry'));

        const btnExit = document.getElementById('btnSimulateExit');
        if (btnExit) btnExit.addEventListener('click', () => triggerManualVerify('exit'));

        const btnGuest = document.getElementById('btnDirectGuestEntry');
        if (btnGuest) btnGuest.addEventListener('click', triggerGuestEntry);

        // Sync dropdown list on storage update
        window.addEventListener('storage', () => {
            populateActiveTickets();
        });
    }

    // Header session rendering
    function renderHeaderAuth() {
        const navActions = document.getElementById('navActions');
        if (!navActions) return;

        if (currentUser) {
            navActions.innerHTML = `
                <div style="display: flex; align-items: center; gap: 12px;">
                    <span style="font-size: 14px; font-weight: 500; color: var(--text-secondary);">
                        <i data-lucide="user" style="display: inline; width: 14px; vertical-align: middle; margin-right: 4px;"></i> ${currentUser.name}
                    </span>
                    <button id="btnLogout" class="btn btn-secondary btn-sm">Logout</button>
                </div>
            `;
            document.getElementById('btnLogout').addEventListener('click', () => {
                window.ParkingAuth.logout();
            });
        } else {
            navActions.innerHTML = `
                <a href="login.html" class="btn btn-secondary btn-sm">Login</a>
                <a href="signup.html" class="btn btn-primary btn-sm">Sign Up</a>
            `;
        }
        lucide.createIcons();
    }

    // Populate active ticket dropdown
    async function populateActiveTickets() {
        const select = document.getElementById('activeTicketSelect');
        if (!select) return;

        const isMockMode = !firebaseConfig.apiKey || firebaseConfig.apiKey.startsWith("YOUR_");

        if (isMockMode) {
            const state = window.ParkingState.getState();
            const activeTickets = state.reservations.filter(r => r.status === 'reserved');

            select.innerHTML = '<option value="">-- Choose Active Ticket --</option>';

            if (activeTickets.length === 0) {
                const opt = document.createElement('option');
                opt.value = "";
                opt.innerText = "No active reservations found";
                select.appendChild(opt);
                return;
            }

            activeTickets.forEach(ticket => {
                const opt = document.createElement('option');
                opt.value = ticket.ticketId;
                opt.innerText = `${ticket.ticketId} (${ticket.username})`;
                select.appendChild(opt);
            });
        } else {
            select.innerHTML = '<option value="">-- Loading Active Tickets... --</option>';
            try {
                let app;
                try { app = getApp(); } catch { app = initializeApp(firebaseConfig); }
                const db = getDatabase(app);

                const now = new Date();
                const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

                const resRef = ref(db, `reservations/${dateStr}`);
                const snapshot = await get(resRef);

                select.innerHTML = '<option value="">-- Choose Active Ticket --</option>';

                if (snapshot.exists()) {
                    const data = snapshot.val();
                    let found = false;
                    for (const uid in data) {
                        const ticket = data[uid];
                        if (ticket.reserved === true && ticket.used === false && ticket.qrCode) {
                            found = true;
                            const opt = document.createElement('option');
                            opt.value = ticket.qrCode;
                            opt.innerText = `${ticket.name} (${ticket.qrCode.substring(0, 18)}...)`;
                            select.appendChild(opt);
                        }
                    }
                    if (!found) {
                        const opt = document.createElement('option');
                        opt.value = "";
                        opt.innerText = "No active reservations found today";
                        select.appendChild(opt);
                    }
                } else {
                    const opt = document.createElement('option');
                    opt.value = "";
                    opt.innerText = "No reservations found today";
                    select.appendChild(opt);
                }
            } catch (err) {
                console.error("Failed to populate active tickets:", err);
                select.innerHTML = '<option value="">-- Error Loading Tickets --</option>';
            }
        }
    }

    // Start Camera Stream Scanner
    function startCameraScanner() {
        const scannerFeedView = document.getElementById('scannerFeedView');
        try {
            html5QrCode = new window.Html5Qrcode("reader");
            html5QrCode.start(
                { facingMode: "environment" },
                {
                    fps: 10,
                    qrbox: { width: 250, height: 250 }
                },
                (decodedText) => {
                    handleScannedCode(decodedText, 'entry');
                },
                () => {
                    // Suppress verbose frame parsing warnings
                }
            )
            .then(() => {
                if (scannerFeedView) {
                    scannerFeedView.style.display = 'none';
                }
            })
            .catch((err) => {
                console.warn("Camera start failed or permissions blocked:", err);
                showToast("Camera block detected. Falling back to manual control.", "info");
            });
        } catch (err) {
            console.error("Failed to initialize Html5Qrcode:", err);
        }
    }

    // Trigger manual verification actions
    function triggerManualVerify(type) {
        const dropdown = document.getElementById('activeTicketSelect');
        const manualInput = document.getElementById('manualCodeVal');

        let ticketId = dropdown.value;
        if (!ticketId) {
            ticketId = manualInput.value.trim();
        }

        if (!ticketId) {
            showToast('Please select a ticket from the dropdown or enter a manual code.', 'error');
            return;
        }

        handleScannedCode(ticketId, type);
        
        // Clear manual input field
        manualInput.value = '';
    }

    // Main QR Check-In Scanner validation engine
    async function handleScannedCode(qrString, type = 'entry') {
        if (isProcessing) return;

        // Prevent double processing in close succession
        if (qrString === lastScannedCode && Date.now() - lastScannedTime < 5000) {
            return;
        }
        
        isProcessing = true;
        lastScannedCode = qrString;
        lastScannedTime = Date.now();

        const feedbackBox = document.getElementById('scannerFeedbackBox');
        const feedbackText = document.getElementById('scannerFeedbackText');
        const driverDetails = document.getElementById('scannerDriverDetails');

        // Speed up laser visual scan
        const laser = document.querySelector('.scanner-sweep-line');
        if (laser) {
            laser.style.animationDuration = '0.8s';
        }

        feedbackBox.className = 'scanner-feedback feedback-idle';
        feedbackText.innerHTML = `
            <i data-lucide="loader" style="animation: spin 1s linear infinite; width: 16px; height: 16px; margin-right: 8px;"></i>
            <span>Verifying ticket code...</span>
        `;
        if (driverDetails) driverDetails.style.display = 'none';
        lucide.createIcons();

        try {
            const isMockMode = !firebaseConfig.apiKey || firebaseConfig.apiKey.startsWith("YOUR_");

            if (isMockMode) {
                // Mock Mode validation logic
                await new Promise(resolve => setTimeout(resolve, 1000));
                const ticketId = qrString.startsWith('mock_') ? qrString.substring(5) : qrString;
                
                const state = window.ParkingState.getState();
                const reservation = state.reservations.find(r => r.ticketId === ticketId);

                if (reservation) {
                    if (type === 'entry') {
                        if (reservation.status === 'completed') {
                            showScanResult({
                                success: false,
                                status: 'QR Already Used',
                                message: 'QR Already Used',
                                driver: reservation.username,
                                date: reservation.createdTime
                            });
                        } else if (reservation.status === 'reserved') {
                            const res = window.ParkingState.simulateScan(ticketId, 'entry');
                            if (res.success) {
                                showScanResult({
                                    success: true,
                                    status: 'Access Granted',
                                    message: 'Access Granted',
                                    driver: reservation.username,
                                    date: reservation.createdTime
                                });
                            } else {
                                showScanResult({
                                    success: false,
                                    status: 'Invalid QR Code',
                                    message: res.error || 'Invalid QR Code'
                                });
                            }
                        } else {
                            showScanResult({
                                success: false,
                                status: 'QR Already Used',
                                message: 'QR Already Used',
                                driver: reservation.username,
                                date: reservation.createdTime
                            });
                        }
                    } else {
                        // Exit Checkout
                        const res = window.ParkingState.simulateScan(ticketId, 'exit');
                        if (res.success) {
                            showScanResult({
                                success: true,
                                status: 'Departure Approved',
                                message: 'Departure Approved',
                                driver: reservation.username,
                                date: reservation.createdTime
                            });
                        } else {
                            showScanResult({
                                success: false,
                                status: 'Invalid Checkout',
                                message: res.error || 'Invalid QR Code'
                            });
                        }
                    }
                } else {
                    showScanResult({
                        success: false,
                        status: 'Invalid QR Code',
                        message: 'Invalid QR Code'
                    });
                }
            } else {
                // Firebase Realtime Database mode validation logic
                let app;
                try { app = getApp(); } catch { app = initializeApp(firebaseConfig); }
                const db = getDatabase(app);

                if (type === 'entry') {
                    // Match regex to ensure pattern PK-YYYY-MM-DD-UID-timestamp
                    const match = qrString.match(/^PK-(\d{4}-\d{2}-\d{2})-(.+)-(\d+)$/);
                    if (!match) {
                        showScanResult({
                            success: false,
                            status: 'Invalid QR Code',
                            message: 'Invalid QR Code'
                        });
                        return;
                    }

                    const dateStr = match[1];
                    const uid = match[2];

                    const resRef = ref(db, `reservations/${dateStr}/${uid}`);
                    const snapshot = await get(resRef);

                    if (!snapshot.exists()) {
                        showScanResult({
                            success: false,
                            status: 'Invalid QR Code',
                            message: 'Invalid QR Code'
                        });
                        return;
                    }

                    const reservation = snapshot.val();

                    // Verification checks
                    if (reservation.qrCode !== qrString || reservation.reserved !== true) {
                        showScanResult({
                            success: false,
                            status: 'Invalid QR Code',
                            message: 'Invalid QR Code'
                        });
                        return;
                    }

                    if (reservation.used === true) {
                        showScanResult({
                            success: false,
                            status: 'QR Already Used',
                            message: 'QR Already Used',
                            driver: reservation.name,
                            date: dateStr
                        });
                        return;
                    }

                    // Check available slots
                    const statusRef = ref(db, 'parking_status');
                    const statusSnap = await get(statusRef);
                    let availableSlots = 0;
                    let occupiedSlots = 0;

                    if (statusSnap.exists()) {
                        const status = statusSnap.val();
                        availableSlots = status.availableSlots !== undefined ? status.availableSlots : 0;
                        occupiedSlots = status.occupiedSlots !== undefined ? status.occupiedSlots : 0;
                    }

                    // Prevent availableSlots from becoming negative
                    const newAvailableSlots = Math.max(0, availableSlots - 1);
                    const newOccupiedSlots = occupiedSlots + 1;

                    // Update reservation check-in
                    const timestamp = new Date().toISOString();
                    await set(ref(db, `reservations/${dateStr}/${uid}/used`), true);
                    await set(ref(db, `reservations/${dateStr}/${uid}/checkInTime`), timestamp);

                    // Update parking status
                    await set(ref(db, `parking_status/gateCommand`), 'open');
                    await set(ref(db, `parking_status/occupiedSlots`), newOccupiedSlots);
                    await set(ref(db, `parking_status/availableSlots`), newAvailableSlots);
                    await set(ref(db, `parking_status/lastEvent`), 'Vehicle Entered');

                    if (window.ParkingState) {
                        window.ParkingState.addLog(`Gate Scanner: Access Granted for ${reservation.name}.`);
                    }

                    showScanResult({
                        success: true,
                        status: 'Access Granted',
                        message: 'Access Granted',
                        driver: reservation.name,
                        date: dateStr
                    });
                } else {
                    // Exit Checkout flow
                    // Look up reservation matching the scanned QR code for the day
                    const match = qrString.match(/^PK-(\d{4}-\d{2}-\d{2})-(.+)-(\d+)$/);
                    if (!match) {
                        showScanResult({
                            success: false,
                            status: 'Invalid QR Code',
                            message: 'Invalid QR Code'
                        });
                        return;
                    }

                    const dateStr = match[1];
                    const uid = match[2];

                    const resRef = ref(db, `reservations/${dateStr}/${uid}`);
                    const snapshot = await get(resRef);

                    if (!snapshot.exists()) {
                        showScanResult({
                            success: false,
                            status: 'Invalid QR Code',
                            message: 'Invalid QR Code'
                        });
                        return;
                    }

                    const reservation = snapshot.val();

                    if (reservation.qrCode !== qrString || reservation.used !== true) {
                        showScanResult({
                            success: false,
                            status: 'Invalid Checkout',
                            message: 'Invalid Checkout: Vehicle not checked in.'
                        });
                        return;
                    }

                    // Release slot
                    const statusRef = ref(db, 'parking_status');
                    const statusSnap = await get(statusRef);
                    let availableSlots = 0;
                    let occupiedSlots = 0;
                    let totalSlots = 24;

                    if (statusSnap.exists()) {
                        const status = statusSnap.val();
                        availableSlots = status.availableSlots !== undefined ? status.availableSlots : 0;
                        occupiedSlots = status.occupiedSlots !== undefined ? status.occupiedSlots : 0;
                        totalSlots = status.totalSlots !== undefined ? status.totalSlots : 24;
                    }

                    const newAvailableSlots = Math.min(totalSlots, availableSlots + 1);
                    const newOccupiedSlots = Math.max(0, occupiedSlots - 1);

                    // Update parking status
                    await set(ref(db, `parking_status/gateCommand`), 'open');
                    await set(ref(db, `parking_status/occupiedSlots`), newOccupiedSlots);
                    await set(ref(db, `parking_status/availableSlots`), newAvailableSlots);
                    await set(ref(db, `parking_status/lastEvent`), 'Vehicle Exited');

                    // Set status to completed locally if we want
                    await set(ref(db, `reservations/${dateStr}/${uid}/used`), 'completed');

                    if (window.ParkingState) {
                        window.ParkingState.addLog(`Gate Scanner: Vehicle Checked-out for ${reservation.name}.`);
                    }

                    showScanResult({
                        success: true,
                        status: 'Departure Approved',
                        message: 'Departure Approved',
                        driver: reservation.name,
                        date: dateStr
                    });
                }
            }
        } catch (err) {
            console.error("Verification failed:", err);
            showScanResult({
                success: false,
                status: 'Invalid QR Code',
                message: 'Failed to verify code.'
            });
        } finally {
            if (laser) {
                laser.style.animationDuration = '3s';
            }
            populateActiveTickets();
        }
    }

    // Render verification scan result to Kiosk DOM UI
    function showScanResult(result) {
        const feedbackBox = document.getElementById('scannerFeedbackBox');
        const feedbackText = document.getElementById('scannerFeedbackText');
        const driverDetails = document.getElementById('scannerDriverDetails');
        const driverNameEl = document.getElementById('scannerDriverName');
        const reservationDateEl = document.getElementById('scannerReservationDate');
        const accessStatusEl = document.getElementById('scannerAccessStatus');

        if (result.success) {
            feedbackBox.className = 'scanner-feedback feedback-success';
            feedbackText.innerText = result.message;
            showToast(result.message, 'success');
        } else {
            feedbackBox.className = 'scanner-feedback feedback-error';
            feedbackText.innerText = result.message;
            showToast(result.message, 'error');
        }

        if (result.driver && result.date) {
            if (driverNameEl) driverNameEl.innerText = result.driver;
            if (reservationDateEl) reservationDateEl.innerText = result.date;
            if (accessStatusEl) {
                accessStatusEl.innerText = result.status;
                accessStatusEl.style.color = result.success ? 'var(--color-success)' : 'var(--color-danger)';
            }
            if (driverDetails) driverDetails.style.display = 'block';
        } else {
            if (driverDetails) driverDetails.style.display = 'none';
        }

        lucide.createIcons();

        // Release the processing lock
        isProcessing = false;

        // Reset back to idle status after 6 seconds to give the user time to read the result
        setTimeout(() => {
            if (!isProcessing && feedbackText.innerText === result.message) {
                feedbackBox.className = 'scanner-feedback feedback-idle';
                feedbackText.innerHTML = `
                    <i data-lucide="loader" style="animation: spin 2s linear infinite; width: 16px; height: 16px; margin-right: 8px;"></i>
                    <span>Awaiting Scan Request...</span>
                `;
                if (driverDetails) driverDetails.style.display = 'none';
                lucide.createIcons();
            }
        }, 6000);
    }

    // Direct Driver guest checkin
    async function triggerGuestEntry() {
        const isMockMode = !firebaseConfig.apiKey || firebaseConfig.apiKey.startsWith("YOUR_");

        if (isMockMode) {
            const state = window.ParkingState.getState();
            const firstAvailable = state.slots.find(s => s.status === 'available');

            if (!firstAvailable) {
                showToast('Simulation aborted: Parking capacity is full!', 'error');
                return;
            }

            const res = window.ParkingState.simulateScan(firstAvailable.id, 'entry');
            if (res.success) {
                showToast(res.message, 'success');
                populateActiveTickets();
            } else {
                showToast(res.error, 'error');
            }
        } else {
            // Firebase Mode guest entry: Increment occupancy directly without reservation record
            try {
                let app;
                try { app = getApp(); } catch { app = initializeApp(firebaseConfig); }
                const db = getDatabase(app);

                const statusRef = ref(db, 'parking_status');
                const statusSnap = await get(statusRef);

                let availableSlots = 0;
                let occupiedSlots = 0;

                if (statusSnap.exists()) {
                    const status = statusSnap.val();
                    availableSlots = status.availableSlots !== undefined ? status.availableSlots : 0;
                    occupiedSlots = status.occupiedSlots !== undefined ? status.occupiedSlots : 0;
                }

                if (availableSlots <= 0) {
                    showToast('Simulation aborted: Parking capacity is full!', 'error');
                    return;
                }

                const newAvailableSlots = Math.max(0, availableSlots - 1);
                const newOccupiedSlots = occupiedSlots + 1;

                await set(ref(db, `parking_status/gateCommand`), 'open');
                await set(ref(db, `parking_status/occupiedSlots`), newOccupiedSlots);
                await set(ref(db, `parking_status/availableSlots`), newAvailableSlots);
                await set(ref(db, `parking_status/lastEvent`), 'Guest Vehicle Entered');

                showToast('Guest entry approved directly. Gate opening...', 'success');

                if (window.ParkingState) {
                    window.ParkingState.addLog(`Gate Scanner: Guest entry approved directly. Gate opened.`);
                }
            } catch (err) {
                console.error("Direct guest entry failed:", err);
                showToast('Failed to complete guest entry.', 'error');
            }
        }
    }

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

    window.addEventListener('DOMContentLoaded', startApp);
})();
