# Android APK Follow-Up Checklist (Employee Levels)

Once the backend `0037_employee_levels.sql` migration is applied (`pnpm migrate:local` / `pnpm migrate:remote`), update the Android ESS app (`android/`) to consume `user.level`:

- [ ] **Deserialize `user.level` in `ApiModels.kt`**:
  - Add `EmployeeLevelDto`, `LevelCapabilities`, and `LevelBypassFlags` to `UserSession` in `android/app/src/main/java/id/openhr/ess/data/model/ApiModels.kt`.
- [ ] **Geofence Bypass in `AttendanceScreen.kt`**:
  - When `user.level?.bypass?.bypass_geofence == true`, show an active `"Geofence Bypass"` badge on the attendance card and allow Clock-In/Out without prompting for an out-of-radius reason.
- [ ] **TMS Task Authority in `WorkspaceSections.kt`**:
  - Gate task creation / assignee picker using `user.level?.capabilities?.can_assign_tasks_to` and show auto-close status when `bypass_task_approval == true`.
- [ ] **Approvals & Profile Badge**:
  - Show the employee's level badge (`code` + `name` + `color`) on `HomeScreen` / `ProfileScreen`.
  - Show `Approvals` / `Team` sections when any `can_approve_*` capability is `true` (in addition to `role == manager | finance | owner_admin`).
- [ ] **Rebuild & Sign Release APK**:
  - Bump `versionCode` / `versionName` in `android/app/build.gradle.kts` and run `./gradlew assembleRelease`.
