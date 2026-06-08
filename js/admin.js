// Administrator Portal Controller
import { firebaseConfig } from './firebase-config.js';

// Statically import modular Firebase SDK from standard CDN
import { initializeApp, getApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { 
    getDatabase, 
    ref, 
    set, 
    get,
    onValue 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";

(function () {
    let currentUser = null;
    let statsListenerUnsubscribe = null;

    // --- Toast helper ---
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
        if (!currentUser) return; // Guard in case of routing delays

        renderHeaderAuth();

        const isMockMode = !firebaseConfig.apiKey || firebaseConfig.apiKey.startsWith("YOUR_");

        if (isMockMode) {
            renderAdminDashboard();
            // Listen for storage changes to sync in real time locally
            window.addEventListener('storage', () => {
                renderAdminDashboard();
            });
        } else {
            try {
                let app;
                try { app = getApp(); } catch { app = initializeApp(firebaseConfig); }
                const db = getDatabase(app);
                setupLiveFirebaseStats(db);
            } catch (err) {
                console.error("Firebase admin initialization failed:", err);
                showToast("Connection to live database failed. Falling back.", "error");
                renderAdminDashboard();
            }
        }

        // Capacity update form binding
        const capForm = document.getElementById('capacityForm');
        if (capForm) {
            capForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const newCap = parseInt(document.getElementById('inputCapacity').value);
                
                if (isMockMode) {
                    const res = window.ParkingState.updateCapacity(newCap);
                    if (res.success) {
                        showToast(`Capacity successfully updated to ${newCap} slots.`, 'success');
                        renderAdminDashboard();
                    } else {
                        showToast(res.error, 'error');
                    }
                } else {
                    try {
                        let app;
                        try { app = getApp(); } catch { app = initializeApp(firebaseConfig); }
                        const db = getDatabase(app);

                        // Only write totalSlots to /parking_status/totalSlots
                        await set(ref(db, 'parking_status/totalSlots'), newCap);
                        showToast(`Total Capacity successfully updated to ${newCap} slots.`, 'success');
                    } catch (err) {
                        console.error("Failed to update database capacity:", err);
                        showToast("Failed to update capacity in database.", "error");
                    }
                }
            });
        }



        // Manual Gate Controls
        const btnOpen = document.getElementById('btnOpenGate');
        if (btnOpen) {
            btnOpen.addEventListener('click', () => setGateCommand('open'));
        }

        const btnClose = document.getElementById('btnCloseGate');
        if (btnClose) {
            btnClose.addEventListener('click', () => setGateCommand('closed'));
        }

        // Notify Management Alerts
        const btnNotifyManagement = document.getElementById('btnNotifyManagement');
        if (btnNotifyManagement) {
            btnNotifyManagement.addEventListener('click', () => {
                showToast("Management notified successfully", "success");
            });
        }

        // Alert Broadcasting Bindings (Mock Logs / Management alerts)
        const btnFire = document.getElementById('btnNotifyMaintenance');
        if (btnFire) {
            btnFire.addEventListener('click', () => {
                window.ParkingState.notifyManagement(
                    "Emergency Fire Drill", 
                    "A scheduled evacuation drill is currently active. Avoid parking zones A and B."
                );
                showToast("Fire Drill Alert broadcasted to all users.", "success");
                if (isMockMode) renderAdminDashboard();
            });
        }

        const btnGrid = document.getElementById('btnNotifyGrid');
        if (btnGrid) {
            btnGrid.addEventListener('click', () => {
                window.ParkingState.notifyManagement(
                    "Power Grid Maintenance", 
                    "Charging pods in Zone C are offline for critical maintenance until 4:00 PM."
                );
                showToast("Grid Warning broadcasted to all users.", "success");
                if (isMockMode) renderAdminDashboard();
            });
        }

        const btnCustom = document.getElementById('btnNotifyCustom');
        if (btnCustom) {
            btnCustom.addEventListener('click', () => {
                const modal = document.getElementById('customAlertModal');
                if (modal) modal.classList.add('active');
            });
        }

        // Custom Broadcast Alert Form Submit
        const customAlertForm = document.getElementById('customAlertForm');
        if (customAlertForm) {
            customAlertForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const title = document.getElementById('alertTitle').value;
                const message = document.getElementById('alertMsg').value;

                window.ParkingState.notifyManagement(title, message);
                showToast(`Broadcast sent: "${title}"`, "success");
                
                customAlertForm.reset();
                closeAlertModal();
                if (isMockMode) renderAdminDashboard();
            });
        }
    }

    // Modal closer
    window.closeAlertModal = function () {
        const modal = document.getElementById('customAlertModal');
        if (modal) modal.classList.remove('active');
    };

    // Header Auth rendering
    function renderHeaderAuth() {
        const navActions = document.getElementById('navActions');
        if (!navActions) return;

        navActions.innerHTML = `
            <div style="display: flex; align-items: center; gap: 16px;">
                <span style="font-size: 14px; font-weight: 600; color: var(--text-secondary); display: flex; align-items: center; gap: 6px;">
                    <i data-lucide="shield-check" style="width: 14px; height: 14px; color: var(--color-primary);"></i> Admin: ${currentUser.name}
                </span>
                <button id="btnLogout" class="btn btn-secondary btn-sm">Logout</button>
            </div>
        `;

        document.getElementById('btnLogout').addEventListener('click', () => {
            window.ParkingAuth.logout();
        });

        lucide.createIcons();
    }

    // Live Firebase Realtime Database observers
    function setupLiveFirebaseStats(db) {
        const statusRef = ref(db, 'parking_status');
        
        if (statsListenerUnsubscribe) {
            statsListenerUnsubscribe();
        }

        statsListenerUnsubscribe = onValue(statusRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                
                const total = data.totalSlots !== undefined ? data.totalSlots : '--';
                const available = data.availableSlots !== undefined ? data.availableSlots : '--';
                const occupied = data.occupiedSlots !== undefined ? data.occupiedSlots : '--';
                const gateStatus = data.gateStatus !== undefined ? data.gateStatus : '--';
                const lastEvent = data.lastEvent !== undefined ? data.lastEvent : 'None';

                document.getElementById('adminTotal').innerText = total;
                document.getElementById('adminAvailable').innerText = available;
                document.getElementById('adminOccupied').innerText = occupied;
                
                const gateStatusEl = document.getElementById('adminGateStatus');
                if (gateStatusEl) {
                    gateStatusEl.innerText = String(gateStatus).toUpperCase();
                    
                    // Style based on gateStatus value
                    if (String(gateStatus).toLowerCase() === 'open') {
                        gateStatusEl.style.color = 'var(--color-success)';
                    } else if (String(gateStatus).toLowerCase() === 'closed') {
                        gateStatusEl.style.color = 'var(--color-warning)';
                    } else {
                        gateStatusEl.style.color = 'var(--text-secondary)';
                    }
                }

                const lastEventEl = document.getElementById('adminLastEvent');
                if (lastEventEl) {
                    lastEventEl.innerText = lastEvent;
                }

                // Update input field if not focused
                const inputCap = document.getElementById('inputCapacity');
                if (inputCap && !inputCap.matches(':focus') && data.totalSlots !== undefined) {
                    inputCap.value = data.totalSlots;
                }
            }
        }, (error) => {
            console.error("Firebase admin live tracker connection failed:", error);
            showToast("Failed to sync live status from database.", "error");
        });
    }



    // Render Stats, Logs and Overrides list in Local Storage / Mock mode
    function renderAdminDashboard() {
        const state = window.ParkingState.getState();

        // 1. Stats Counter setup
        const total = state.capacity;
        const reserved = state.slots.filter(s => s.status === 'reserved').length;
        const occupied = state.slots.filter(s => s.status === 'occupied').length;
        const available = state.slots.filter(s => s.status === 'available').length;

        document.getElementById('adminTotal').innerText = total;
        document.getElementById('adminAvailable').innerText = available;
        document.getElementById('adminOccupied').innerText = occupied + reserved;

        // Gate status & event fallback indicators in mock mode
        const gateStatusEl = document.getElementById('adminGateStatus');
        if (gateStatusEl) {
            gateStatusEl.innerText = "CLOSED";
            gateStatusEl.style.color = 'var(--color-warning)';
        }
        const lastEventEl = document.getElementById('adminLastEvent');
        if (lastEventEl) {
            lastEventEl.innerText = state.logs.length > 0 ? state.logs[0].message : "None";
        }

        // Populate capacity input
        const inputCap = document.getElementById('inputCapacity');
        if (inputCap && !inputCap.matches(':focus')) {
            inputCap.value = total;
        }

        // 2. Render Console logs
        const logFeed = document.getElementById('adminLogsFeed');
        if (logFeed) {
            logFeed.innerHTML = '';
            
            if (state.logs.length === 0) {
                logFeed.innerHTML = '<div style="color: var(--text-muted); text-align: center; padding-top: 40px;">No operation events registered.</div>';
                return;
            }

            state.logs.forEach(log => {
                const entry = document.createElement('div');
                entry.className = 'log-entry';
                entry.innerHTML = `
                    <span class="log-time">[${log.time}]</span>
                    <span class="log-msg">${escapeHTML(log.message)}</span>
                `;
                logFeed.appendChild(entry);
            });
        }
    }



    // Manual Gate Control sender
    async function setGateCommand(command) {
        const isMockMode = !firebaseConfig.apiKey || firebaseConfig.apiKey.startsWith("YOUR_");

        if (isMockMode) {
            showToast(`[Mock] Gate command set to: ${command.toUpperCase()}`, 'success');
            const state = window.ParkingState.getState();
            state.logs.unshift({
                time: new Date().toLocaleTimeString(),
                message: `Admin Override: Gate Command ${command.toUpperCase()}`
            });
            window.ParkingState.saveState(state);
            renderAdminDashboard();
        } else {
            try {
                let app;
                try { app = getApp(); } catch { app = initializeApp(firebaseConfig); }
                const db = getDatabase(app);

                await set(ref(db, 'parking_status/gateCommand'), command);
                showToast(`Gate ${command.toUpperCase()} command broadcasted.`, 'success');
            } catch (err) {
                console.error("Failed to set gate command in database:", err);
                showToast("Failed to send gate command.", "error");
            }
        }
    }

    // HTML escape helper
    function escapeHTML(str) {
        return str.replace(/[&<>'"]/g, 
            tag => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                "'": '&#39;',
                '"': '&quot;'
            }[tag] || tag)
        );
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
