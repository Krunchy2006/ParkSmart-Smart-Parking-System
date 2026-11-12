
# 🅿️ ParkSmart — IoT-Based Smart Parking System

An IoT-powered smart parking management system that combines **ESP32-based hardware automation**, **Firebase Realtime Database**, and a **web-based dashboard** to streamline parking operations.

ParkSmart enables parking slot monitoring, QR code-based vehicle verification, automated gate control, and remote administration through a connected web interface.

## 📌 Overview

Traditional parking systems often rely on manual vehicle management, making it difficult to monitor parking availability and regulate vehicle entry and exit.

**ParkSmart** addresses these challenges by integrating IoT hardware with cloud-based software.

The system uses an ESP32 microcontroller, IR sensors, a servo motor, and an LCD display to automate physical parking operations. Firebase Realtime Database connects the hardware to a web application, enabling parking status synchronization and remote gate control.

## ✨ Key Features

### 🚗 Smart Parking Management
- Monitor available and occupied parking slots.
- Track vehicle entry and exit.
- Update parking availability through Firebase.
- Display parking status on a physical LCD screen.

### 🔐 QR Code-Based Vehicle Verification
- QR code scanning interface for vehicle verification.
- Camera-based scanning and manual code entry.
- Integrates vehicle verification with parking access.
- Sends gate control commands through Firebase.

### 🚧 Automated Gate Control
- ESP32-controlled servo motor for opening and closing the parking barrier.
- IR sensor-based vehicle detection.
- Automatic gate closing with vehicle detection safeguards.
- Remote gate operation through cloud commands.

### ☁️ Firebase Integration
- Firebase Realtime Database for parking information.
- Synchronization between the ESP32 and web application.
- Remote monitoring of parking occupancy and gate status.
- Periodic synchronization of hardware commands and parking data.

### 🖥️ Web-Based Management
- User login and registration interfaces.
- Parking dashboard for viewing system information.
- QR code scanner interface.
- Administrative dashboard for monitoring and managing parking operations.

## 🛠️ Tech Stack

| Category | Technologies |
|----------|-------------|
| Microcontroller | ESP32 |
| Embedded Programming | Arduino C++ |
| Frontend | HTML, CSS, JavaScript |
| Database | Firebase Realtime Database |
| Connectivity | Wi-Fi |
| Sensors | IR Sensors |
| Actuators | Servo Motor |
| Display | 16×2 I2C LCD |
| Development Tools | Arduino IDE, VS Code |

## 🧩 Hardware Components

| Component | Purpose |
|-----------|---------|
| ESP32 | Main controller and Wi-Fi communication |
| IR Sensors (2) | Vehicle detection at entry/exit |
| Servo Motor | Automated parking barrier |
| 16×2 I2C LCD | Display parking availability |
| Jumper Wires | Hardware connections |
| Power Supply | Powering the circuit |

### ESP32 Pin Configuration

| Component | ESP32 GPIO |
|-----------|------------|
| Entry IR Sensor | GPIO 14 |
| Exit IR Sensor | GPIO 27 |
| Servo Motor | GPIO 13 |
| I2C LCD | ESP32 I2C interface |

The prototype initializes with a parking capacity of **4 slots**, configurable in the firmware.

## 🏗️ System Architecture

The system consists of three interconnected layers:

### 1. Hardware Layer
The ESP32 connects to the IR sensors, servo motor, and LCD display.

It monitors vehicle detection, controls the parking barrier, and displays slot availability.

### 2. Cloud Layer
Firebase Realtime Database acts as the communication layer between the hardware and web application.

It stores information such as:
- Total parking slots
- Available parking slots
- Occupied parking slots
- Gate status
- Gate commands
- Latest parking event

### 3. Application Layer
The web application provides interfaces for users and administrators.

Users can access the parking dashboard and QR scanner, while administrators can monitor parking information and control relevant system operations.

### Communication Flow

```text
          ┌───────────────────────┐
          │    Web Application    │
          │  Dashboard / Scanner  │
          │    Admin Interface    │
          └───────────┬───────────┘
                      │
                      ▼
          ┌───────────────────────┐
          │   Firebase Realtime   │
          │       Database        │
          └───────────┬───────────┘
                      │
                   Wi-Fi
                      │
                      ▼
          ┌───────────────────────┐
          │         ESP32         │
          └───────────┬───────────┘
                      │
          ┌───────────┼───────────┐
          ▼           ▼           ▼
      IR Sensors   Servo Motor  I2C LCD
          │           │           │
      Detection    Gate Control  Slot Display
```

## ⚙️ How It Works

### Vehicle Entry

1. The user accesses the parking web application.
2. The QR scanner interface is used for vehicle verification.
3. The web application communicates the gate command through Firebase.
4. The ESP32 periodically checks Firebase for gate commands.
5. Upon receiving an open command, the ESP32 activates the servo motor.
6. The parking barrier opens to allow vehicle entry.
7. The system closes the barrier after the configured delay, provided the sensors detect no obstruction.

### Vehicle Exit

1. The exit IR sensor detects a vehicle.
2. The ESP32 processes the exit event.
3. The occupied slot count decreases and the available slot count increases.
4. The servo motor opens the parking barrier.
5. The updated occupancy information is synchronized with Firebase.
6. The LCD displays the latest parking availability.

### Cloud Synchronization

The ESP32 checks Firebase approximately every **5 seconds** for parking information and remote gate commands.

This allows the web interface and hardware controller to exchange parking status and control information.

## 📂 Project Structure

```text
ParkSmart-Smart-Parking-System/
│
├── css/                 # Stylesheets
├── js/                  # JavaScript functionality
│
├── index.html           # Landing page
├── login.html           # User login
├── signup.html          # User registration
├── dashboard.html       # Parking dashboard
├── scanner.html         # QR code scanner
├── admin.html           # Administrative interface
│
└── arduino code         # ESP32 firmware
```

## 🚀 Getting Started

### Prerequisites

**Hardware**
- ESP32 development board
- 2 IR sensors
- Servo motor
- 16×2 I2C LCD
- Jumper wires and suitable power supply

**Software**
- Arduino IDE
- ESP32 board support package
- Firebase project with Realtime Database
- Modern web browser
- Local development server (recommended)

### 1. Clone the Repository

```bash
git clone https://github.com/Krunchy2006/ParkSmart-Smart-Parking-System.git
```

```bash
cd ParkSmart-Smart-Parking-System
```

### 2. Configure Firebase

1. Create a Firebase project.
2. Enable Firebase Realtime Database.
3. Configure Firebase Authentication as required by the firmware and web application.
4. Set appropriate database security rules.
5. Update the Firebase configuration in the ESP32 firmware and web application for your project.

### 3. Configure the ESP32

Open the Arduino firmware in Arduino IDE.

Install the required libraries:

- `LiquidCrystal_I2C`
- `ESP32Servo`
- `Firebase Arduino Client Library for ESP8266 and ESP32` by Mobizt

The ESP32 board package supplies the Wi-Fi and I2C functionality.

Configure your own Wi-Fi and Firebase settings:

```cpp
#define WIFI_SSID "YOUR_WIFI_SSID"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"

#define API_KEY "YOUR_FIREBASE_API_KEY"
#define DATABASE_URL "YOUR_FIREBASE_DATABASE_URL"
```

Verify that the GPIO connections match the firmware configuration.

Select the appropriate ESP32 board and serial port, then upload the firmware.

### 4. Run the Web Application

Open the repository in VS Code or another code editor.

Start a local development server, such as the VS Code Live Server extension, and open `index.html`.

Configure the frontend Firebase settings for your own Firebase project before testing cloud-connected features.

### 5. Test the System

1. Connect the ESP32 to Wi-Fi.
2. Confirm its connection to Firebase.
3. Verify that the LCD displays parking information.
4. Open the web dashboard.
5. Test the QR scanner and gate commands.
6. Trigger the exit sensor and verify the occupancy update.
7. Confirm that Firebase and the LCD reflect the updated state.

## 📊 Firebase Data Structure

The ESP32 firmware uses the following parking status fields:

```json
{
  "parking_status": {
    "totalSlots": 4,
    "availableSlots": 4,
    "occupiedSlots": 0,
    "gateStatus": "closed",
    "gateCommand": "closed",
    "lastEvent": "System Initialized"
  }
}
```

These fields support occupancy monitoring, gate commands, and hardware status synchronization.

## 🔒 Security Considerations

ParkSmart is an academic IoT prototype and is not intended for deployment as a production parking access-control system without additional security measures.

Before deployment:

- Remove hardcoded Wi-Fi credentials from public source files.
- Rotate credentials that have previously been exposed.
- Configure restrictive Firebase Realtime Database security rules.
- Require appropriate authentication and authorization for gate commands.
- Validate vehicle access on a trusted backend rather than relying solely on client-side checks.
- Test gate safety and sensor reliability before connecting the system to a physical barrier.

## 🔮 Future Enhancements

- Real-time sensor and database updates using event-driven communication.
- Online parking slot reservations.
- Payment gateway integration.
- Number plate recognition.
- Improved QR verification and access-control security.
- Parking usage analytics and reporting.
- Push notifications for reservations and parking events.
- Support for multiple parking facilities.

## 🎯 Project Objective

ParkSmart was developed as an **Internet of Things (IoT) academic project** to explore the integration of embedded systems, sensor-based automation, cloud databases, and web development.

The project demonstrates how connected hardware and software can work together to automate physical processes and provide centralized monitoring.

---

## 📄 Repository

**GitHub:** [ParkSmart — Smart Parking System](https://github.com/Krunchy2006/ParkSmart-Smart-Parking-System)
