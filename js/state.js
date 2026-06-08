// State Management for ParkSmart
(function () {
    const STATE_KEY = 'parksmart_state';
    const DEFAULT_CAPACITY = 24;

    // Helper to generate default slots
    function generateDefaultSlots(capacity) {
        const slots = [];
        const zones = ['A', 'B', 'C', 'D'];
        const slotsPerZone = Math.ceil(capacity / zones.length);
        
        let count = 0;
        for (let z = 0; z < zones.length; z++) {
            for (let s = 1; s <= slotsPerZone; s++) {
                if (count >= capacity) break;
                slots.push({
                    id: `${zones[z]}${s}`,
                    zone: zones[z],
                    status: 'available', // 'available', 'reserved', 'occupied'
                    reservedBy: null,
                    reservedAt: null,
                    ticketId: null
                });
                count++;
            }
        }
        return slots;
    }

    // Initialize State
    function initStore() {
        let state = localStorage.getItem(STATE_KEY);
        if (!state) {
            const initialState = {
                capacity: DEFAULT_CAPACITY,
                slots: generateDefaultSlots(DEFAULT_CAPACITY),
                reservations: [],
                logs: [
                    { time: new Date().toLocaleTimeString(), message: "System initialized with 24 available slots." }
                ],
                notifications: []
            };
            localStorage.setItem(STATE_KEY, JSON.stringify(initialState));
            return initialState;
        }
        return JSON.parse(state);
    }

    const stateEngine = {
        getState() {
            return initStore();
        },

        saveState(state) {
            localStorage.setItem(STATE_KEY, JSON.stringify(state));
            // Trigger storage event for other tabs/pages
            window.dispatchEvent(new Event('storage'));
        },

        addLog(message) {
            const state = this.getState();
            state.logs.unshift({
                time: new Date().toLocaleTimeString(),
                message: message
            });
            // Keep logs capped at 50
            if (state.logs.length > 50) state.logs.pop();
            this.saveState(state);
        },

        reserveSlot(slotId, username) {
            const state = this.getState();
            const slot = state.slots.find(s => s.id === slotId);
            
            if (!slot) return { success: false, error: 'Slot not found' };
            if (slot.status !== 'available') return { success: false, error: 'Slot is already taken' };

            // Check if user already has an active reservation
            const activeRes = state.reservations.find(r => r.username === username && r.status !== 'completed');
            if (activeRes) {
                return { success: false, error: 'You already have an active reservation/ticket: ' + activeRes.slotId };
            }

            const ticketId = 'TX-' + Math.floor(100000 + Math.random() * 900000);
            
            // Update slot status
            slot.status = 'reserved';
            slot.reservedBy = username;
            slot.reservedAt = new Date().toISOString();
            slot.ticketId = ticketId;

            // Create booking ticket
            const reservation = {
                ticketId: ticketId,
                slotId: slotId,
                zone: slot.zone,
                username: username,
                status: 'reserved', // 'reserved', 'active' (occupied), 'completed'
                createdTime: new Date().toLocaleTimeString(),
                entryTime: null,
                exitTime: null
            };

            state.reservations.push(reservation);
            this.saveState(state);
            this.addLog(`User '${username}' reserved slot ${slotId}`);
            
            return { success: true, ticket: reservation };
        },

        cancelReservation(ticketId) {
            const state = this.getState();
            const reservation = state.reservations.find(r => r.ticketId === ticketId);
            if (!reservation) return { success: false, error: 'Reservation not found' };

            const slot = state.slots.find(s => s.id === reservation.slotId);
            if (slot) {
                slot.status = 'available';
                slot.reservedBy = null;
                slot.reservedAt = null;
                slot.ticketId = null;
            }

            reservation.status = 'completed';
            reservation.exitTime = new Date().toLocaleTimeString();

            this.saveState(state);
            this.addLog(`Reservation ${ticketId} for slot ${reservation.slotId} cancelled/released`);
            return { success: true };
        },

        simulateScan(ticketId, type) {
            // type: 'entry' or 'exit'
            const state = this.getState();
            const reservation = state.reservations.find(r => r.ticketId === ticketId);
            
            if (!reservation) {
                // Check if it's a raw slot id instead (direct entry simulation)
                const slot = state.slots.find(s => s.id === ticketId);
                if (slot && type === 'entry' && slot.status === 'available') {
                    // Create simulated guest ticket
                    const guestTicketId = 'GST-' + Math.floor(100000 + Math.random() * 900000);
                    slot.status = 'occupied';
                    slot.ticketId = guestTicketId;
                    
                    state.reservations.push({
                        ticketId: guestTicketId,
                        slotId: slot.id,
                        zone: slot.zone,
                        username: 'Guest Driver',
                        status: 'active',
                        createdTime: new Date().toLocaleTimeString(),
                        entryTime: new Date().toLocaleTimeString(),
                        exitTime: null
                    });
                    this.saveState(state);
                    this.addLog(`Guest vehicle occupied slot ${slot.id} directly via gate scanner.`);
                    return { success: true, message: `Guest Entry Approved. Please proceed to Slot ${slot.id}.` };
                }
                return { success: false, error: 'Invalid QR Code or Slot Number.' };
            }

            const slot = state.slots.find(s => s.id === reservation.slotId);

            if (type === 'entry') {
                if (reservation.status !== 'reserved') {
                    return { success: false, error: `Ticket is not in reserved state (Current: ${reservation.status})` };
                }
                reservation.status = 'active';
                reservation.entryTime = new Date().toLocaleTimeString();
                
                if (slot) {
                    slot.status = 'occupied';
                }

                this.saveState(state);
                this.addLog(`Vehicle checked-in to Slot ${reservation.slotId} using Ticket ${ticketId}`);
                return { success: true, message: `Access Approved. Please park at Slot ${reservation.slotId}.` };
            } else {
                if (reservation.status !== 'active') {
                    return { success: false, error: `Ticket is not in active state (Current: ${reservation.status})` };
                }
                reservation.status = 'completed';
                reservation.exitTime = new Date().toLocaleTimeString();

                if (slot) {
                    slot.status = 'available';
                    slot.reservedBy = null;
                    slot.reservedAt = null;
                    slot.ticketId = null;
                }

                this.saveState(state);
                this.addLog(`Vehicle checked-out from Slot ${reservation.slotId}. Slot released.`);
                return { success: true, message: `Departure approved. Thank you for parking with ParkSmart!` };
            }
        },

        updateCapacity(newCapacity) {
            if (newCapacity < 1 || newCapacity > 100) {
                return { success: false, error: 'Capacity must be between 1 and 100.' };
            }
            const state = this.getState();
            const oldCapacity = state.capacity;
            state.capacity = newCapacity;

            // Generate new slot list but preserve existing allocations if possible
            const newSlots = generateDefaultSlots(newCapacity);
            
            // Copy status of existing slots
            newSlots.forEach(newSlot => {
                const existing = state.slots.find(s => s.id === newSlot.id);
                if (existing) {
                    newSlot.status = existing.status;
                    newSlot.reservedBy = existing.reservedBy;
                    newSlot.reservedAt = existing.reservedAt;
                    newSlot.ticketId = existing.ticketId;
                }
            });

            // For slots that were deleted (if capacity is smaller), release reservations
            state.slots.forEach(oldSlot => {
                const stillExists = newSlots.some(s => s.id === oldSlot.id);
                if (!stillExists && oldSlot.ticketId) {
                    // cancel reservation
                    const res = state.reservations.find(r => r.ticketId === oldSlot.ticketId);
                    if (res) {
                        res.status = 'completed';
                        res.exitTime = new Date().toLocaleTimeString();
                    }
                }
            });

            state.slots = newSlots;
            this.saveState(state);
            this.addLog(`Admin updated total capacity from ${oldCapacity} to ${newCapacity} slots.`);
            return { success: true };
        },

        notifyManagement(title, message) {
            const state = this.getState();
            state.notifications.unshift({
                id: 'NTF-' + Date.now(),
                title: title,
                message: message,
                time: new Date().toLocaleTimeString(),
                read: false
            });
            this.saveState(state);
            this.addLog(`Management alert triggered: "${title}"`);
            return true;
        }
    };

    // Export to global window context
    window.ParkingState = stateEngine;
})();
