// Firebase Authentication and Session Manager for ParkSmart
import { firebaseConfig } from './firebase-config.js';

// Statically import modular Firebase SDK from standard CDN
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { 
    getDatabase, 
    ref, 
    set, 
    get 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";

(function () {
    // Check if running in mock mode (credentials are placeholders)
    const isMockMode = !firebaseConfig.apiKey || firebaseConfig.apiKey.startsWith("YOUR_");
    
    let firebaseAuth = null;
    let firebaseDb = null;
    let cachedUser = null; // Caches the resolved user profile (uid, name, email, role)

    // Setup fallback variables for LocalStorage mock mode
    const USERS_KEY = 'parksmart_users';
    const SESSION_KEY = 'parksmart_session';
    const DEFAULT_USERS = [
        { name: "John Admin", email: "admin@parksmart.com", password: "admin123", role: "admin" },
        { name: "Jane Driver", email: "driver@parksmart.com", password: "driver123", role: "user" } // mapped driver to 'user' role
    ];

    if (!isMockMode) {
        try {
            // Initialize Firebase services
            const app = initializeApp(firebaseConfig);
            firebaseAuth = getAuth(app);
            firebaseDb = getDatabase(app);
        } catch (e) {
            console.error("Firebase Initialization Error:", e);
        }
    }

    // --- Dynamic Overlay to prevent Flash of Unauthenticated Content ---
    function injectLoadingOverlay() {
        const overlayId = 'auth-loading-overlay';
        if (document.getElementById(overlayId)) return;

        const overlay = document.createElement('div');
        overlay.id = overlayId;
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: #080c14;
            z-index: 99999;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            color: #f8fafc;
            font-family: 'Outfit', sans-serif;
        `;

        overlay.innerHTML = `
            <div style="
                width: 48px; 
                height: 48px; 
                border: 4px solid rgba(6, 182, 212, 0.1); 
                border-top-color: #06b6d4; 
                border-radius: 50%; 
                animation: auth-spin 1s linear infinite; 
                margin-bottom: 20px;
            "></div>
            <div style="font-size: 15px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase;">Securing Session...</div>
        `;

        const style = document.createElement('style');
        style.innerText = `
            @keyframes auth-spin {
                to { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
        document.body.appendChild(overlay);
    }

    function removeLoadingOverlay() {
        const overlay = document.getElementById('auth-loading-overlay');
        if (overlay) overlay.remove();
    }

    // --- Floating Banner for Mock local mode representation ---
    function injectMockBanner() {
        if (document.getElementById('mock-mode-banner')) return;
        const banner = document.createElement('div');
        banner.id = 'mock-mode-banner';
        banner.style.cssText = `
            position: fixed;
            bottom: 12px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(245, 158, 11, 0.95);
            backdrop-filter: blur(4px);
            color: #000;
            padding: 8px 16px;
            border-radius: 50px;
            font-size: 12px;
            font-weight: 700;
            z-index: 9999;
            box-shadow: 0 4px 12px rgba(0,0,0,0.35);
            display: flex;
            align-items: center;
            gap: 8px;
            border: 1px solid rgba(255,255,255,0.2);
            pointer-events: none;
        `;
        banner.innerHTML = `⚠️ Running in Mock Local Mode (Set config in js/firebase-config.js)`;
        document.body.appendChild(banner);
    }

    // --- Friendly Firebase Auth Error Parser ---
    function parseFirebaseError(error) {
        if (!error || !error.code) return "An unexpected authentication error occurred.";
        
        switch (error.code) {
            case 'auth/email-already-in-use':
                return "This email address is already registered.";
            case 'auth/invalid-email':
                return "Please enter a valid email address.";
            case 'auth/operation-not-allowed':
                return "Email/Password accounts are not enabled for this project.";
            case 'auth/weak-password':
                return "Password is too weak. Must be at least 6 characters.";
            case 'auth/user-disabled':
                return "This account has been disabled.";
            case 'auth/user-not-found':
            case 'auth/wrong-password':
                return "Incorrect email or password.";
            case 'auth/network-request-failed':
                return "Network connection issue. Please try again.";
            default:
                return error.message;
        }
    }

    // --- Session Router Guard ---
    function runRouteGuard(user, userProfile) {
        const path = window.location.pathname;
        const filename = path.substring(path.lastIndexOf('/') + 1) || 'index.html';

        const protectedPages = ['dashboard.html', 'admin.html', 'scanner.html'];
        const authPages = ['login.html', 'signup.html'];

        if (protectedPages.includes(filename)) {
            if (!user) {
                // Not authenticated, redirect to login
                window.location.href = 'login.html';
                return;
            }

            // Role restrictions check
            if (filename === 'admin.html' && userProfile && userProfile.role !== 'admin') {
                window.location.href = 'dashboard.html';
                return;
            }
        } else if (authPages.includes(filename)) {
            if (user) {
                // Authenticated visitor on auth screen, redirect to dashboard
                window.location.href = 'dashboard.html';
                return;
            }
        }

        // Access allowed, clean loader screen
        removeLoadingOverlay();
        // Dispatch completion event for client scripts
        window.dispatchEvent(new CustomEvent('auth-resolved', { detail: userProfile }));
    }

    // --- State Listeners ---
    if (!isMockMode) {
        // Firebase Authentication State Observer
        onAuthStateChanged(firebaseAuth, async (user) => {
            if (user) {
                try {
                    // Fetch user details from Database
                    const userRef = ref(firebaseDb, `users/${user.uid}`);
                    const snapshot = await get(userRef);
                    if (snapshot.exists()) {
                        const profile = snapshot.val();
                        cachedUser = {
                            uid: user.uid,
                            name: profile.name,
                            email: profile.email,
                            role: profile.role || 'user'
                        };
                    } else {
                        // Fallback profile if DB writing had lagged
                        cachedUser = {
                            uid: user.uid,
                            name: user.displayName || 'Driver User',
                            email: user.email,
                            role: 'user'
                        };
                    }
                } catch (dbError) {
                    console.error("Database fetch failed, using auth defaults:", dbError);
                    cachedUser = {
                        uid: user.uid,
                        name: user.displayName || 'Driver User',
                        email: user.email,
                        role: 'user'
                    };
                }
            } else {
                cachedUser = null;
            }

            runRouteGuard(user, cachedUser);
        });
    } else {
        // Local mock session resolver
        setTimeout(() => {
            const session = localStorage.getItem(SESSION_KEY);
            const user = session ? JSON.parse(session) : null;
            cachedUser = user;

            runRouteGuard(user, cachedUser);
            injectMockBanner();
        }, 100);
    }

    // --- Autotrigger loading screen injection on protected pages ---
    (function autoInjectLoader() {
        const path = window.location.pathname;
        const filename = path.substring(path.lastIndexOf('/') + 1) || 'index.html';
        const protectedPages = ['dashboard.html', 'admin.html', 'scanner.html'];
        if (protectedPages.includes(filename)) {
            injectLoadingOverlay();
        }
    })();

    // --- Expose Public API ---
    window.ParkingAuth = {
        getCurrentUser() {
            return cachedUser;
        },

        async login(email, password) {
            if (!isMockMode) {
                try {
                    const result = await signInWithEmailAndPassword(firebaseAuth, email, password);
                    
                    // Fetch profile to verify role
                    const userRef = ref(firebaseDb, `users/${result.user.uid}`);
                    const snapshot = await get(userRef);
                    let profile = { role: 'user' };
                    if (snapshot.exists()) {
                        profile = snapshot.val();
                    }

                    cachedUser = {
                        uid: result.user.uid,
                        name: profile.name || result.user.displayName || 'Driver User',
                        email: result.user.email,
                        role: profile.role || 'user'
                    };

                    if (window.ParkingState) {
                        window.ParkingState.addLog(`User '${cachedUser.name}' authenticated via Firebase.`);
                    }

                    return { success: true, user: cachedUser };
                } catch (error) {
                    console.error("Firebase Login Error:", error);
                    return { success: false, error: parseFirebaseError(error) };
                }
            } else {
                // Mock Authentication fallback
                let users = localStorage.getItem(USERS_KEY);
                if (!users) {
                    localStorage.setItem(USERS_KEY, JSON.stringify(DEFAULT_USERS));
                    users = DEFAULT_USERS;
                } else {
                    users = JSON.parse(users);
                }

                const user = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
                if (!user) {
                    return { success: false, error: 'Incorrect email or password.' };
                }

                cachedUser = {
                    name: user.name,
                    email: user.email,
                    role: user.role
                };
                localStorage.setItem(SESSION_KEY, JSON.stringify(cachedUser));

                if (window.ParkingState) {
                    window.ParkingState.addLog(`[Mock] User '${cachedUser.name}' logged in.`);
                }

                setTimeout(() => {
                    window.location.href = 'dashboard.html';
                }, 100);

                return { success: true, user: cachedUser };
            }
        },

        async signup(name, email, password) {
            if (!isMockMode) {
                try {
                    // 1. Create auth account
                    const result = await createUserWithEmailAndPassword(firebaseAuth, email, password);
                    
                    // 2. Setup user metadata in database (role must be exactly 'user' as per instruction)
                    const userRef = ref(firebaseDb, `users/${result.user.uid}`);
                    const profileData = {
                        name: name,
                        email: email.toLowerCase(),
                        role: 'user' // Every signup role must be exactly 'user'
                    };
                    
                    await set(userRef, profileData);

                    cachedUser = {
                        uid: result.user.uid,
                        ...profileData
                    };

                    if (window.ParkingState) {
                        window.ParkingState.addLog(`New account created for '${name}' via Firebase.`);
                    }

                    return { success: true };
                } catch (error) {
                    console.error("Firebase Signup Error:", error);
                    return { success: false, error: parseFirebaseError(error) };
                }
            } else {
                // Mock Signup fallback
                let users = localStorage.getItem(USERS_KEY);
                users = users ? JSON.parse(users) : DEFAULT_USERS;

                const exists = users.some(u => u.email.toLowerCase() === email.toLowerCase());
                if (exists) {
                    return { success: false, error: 'An account with this email already exists.' };
                }

                const newUser = {
                    name: name,
                    email: email,
                    password: password,
                    role: 'user' // Driver mapped to 'user'
                };

                users.push(newUser);
                localStorage.setItem(USERS_KEY, JSON.stringify(users));

                if (window.ParkingState) {
                    window.ParkingState.addLog(`[Mock] New registration created for '${name}'.`);
                }

                return { success: true };
            }
        },

        async logout() {
            if (!isMockMode) {
                try {
                    await signOut(firebaseAuth);
                    cachedUser = null;
                    window.location.href = 'index.html';
                } catch (error) {
                    console.error("Firebase Signout Error:", error);
                    // Fallback redirect
                    window.location.href = 'index.html';
                }
            } else {
                localStorage.removeItem(SESSION_KEY);
                cachedUser = null;
                window.location.href = 'index.html';
            }
        }
    };
})();
