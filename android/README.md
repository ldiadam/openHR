# openHR ESS Native Android App

Native Kotlin + Jetpack Compose Employee Self-Service (ESS) application for **openHR**, connecting directly to the Hono/Cloudflare Workers REST API.

## Implemented ESS Features
- **Authentication & Server Config**: JWT login (`POST /api/auth/login`), configurable API base URL (defaults to `http://10.0.2.2:8787` for Android Emulator), 1-tap demo login (`admin@openhr.id` / `Password123!`), and bilingual **ID / EN** toggle.
- **Clock In / Out (`HomeScreen`)**:
  - High-accuracy GPS via Google Play Services `FusedLocationProviderClient`
  - Branch geofence Haversine distance & radius validation (`/api/attendance/branch`, `/api/settings/attendance`)
  - Out-of-geofence reason prompt
  - Front-camera **CameraX** selfie capture when `require_selfie` is enabled
  - Offline attendance queue persisted locally and auto-synced when connectivity returns
- **Attendance History (`AttendanceScreen`)**:
  - Monthly attendance summary & daily logs (`/api/attendance/my`)
  - Missing clock-out warning, offline-sync indicator, selfie photo viewer
  - Attendance correction submission (`POST /api/attendance/correction`)
- **Requests Hub (`RequestsScreen`)**:
  - **Leave & Absence**: Balances, leave types, history, and leave application with optional file attachment
  - **Overtime**: History and overtime request submission
  - **Expense Claims (Reimbursement)**: Monthly claim period switcher, receipt photo capture via **CameraX** or Gallery, and receipt preview
  - **Salary Advance (Kasbon)**: Active loans & instalment request submission
- **Payslips (`PayslipsScreen`)**:
  - Yearly filter, payslip list, full breakdown modal (earnings, BPJS, PPh 21, take-home pay)
  - Native on-device **PDF export** via `android.graphics.pdf.PdfDocument` & `FileProvider`
- **Profile (`ProfileScreen`)**:
  - Identity/tax details (KTP/Passport, NPWP, PTKP, Join Date) & BPJS numbers
  - Payroll bank account editor with 22 Indonesian banks + SWIFT/branch prefill
  - Contact phone/address editor, language switch, and server URL config

## Running Against Local openHR Server
1. Ensure the openHR backend is running locally (`pnpm dev` on `http://localhost:8787`).
2. Open the `android/` directory in **Android Studio** (Ladybug or newer, JDK 17, Android SDK 35).
3. Run on an **Android Emulator** (uses `http://10.0.2.2:8787` automatically) or a **physical Android device** on the same Wi-Fi (tap *Configure Server* on the Login screen and enter `http://<YOUR_PC_LAN_IP>:8787`).
