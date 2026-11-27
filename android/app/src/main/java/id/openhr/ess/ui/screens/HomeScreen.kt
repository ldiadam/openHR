package id.openhr.ess.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Login
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import id.openhr.ess.data.local.SessionStore
import id.openhr.ess.data.model.AttendanceSettingsResponse
import id.openhr.ess.data.model.BranchInfo
import id.openhr.ess.data.model.ClockRequest
import id.openhr.ess.data.model.OfflineClockRecord
import id.openhr.ess.data.model.TodayAttendanceRecord
import id.openhr.ess.data.repository.EssRepository
import id.openhr.ess.ui.components.AttendanceMapView
import id.openhr.ess.ui.components.CameraCaptureDialog
import id.openhr.ess.ui.components.FeedbackBanner
import id.openhr.ess.ui.components.tr
import id.openhr.ess.ui.theme.*
import id.openhr.ess.util.Formatters
import id.openhr.ess.util.GpsReading
import id.openhr.ess.util.LocationHelper
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.roundToInt

private data class PendingGeofencePrompt(
    val action: String,
    val photoBase64: String?,
    val distanceMeters: Double
)

@Composable
private fun MapBackgroundLayer(
    gps: GpsReading?,
    branch: BranchInfo?,
    detectingGps: Boolean,
    gpsBlocked: Boolean,
    hasLocationPermission: Boolean,
    lang: String,
    onRequestLocation: () -> Unit
) {
    if (gps != null) {
        Box(modifier = Modifier.fillMaxSize()) {
            AttendanceMapView(
                lat = gps.latitude,
                lng = gps.longitude,
                office = branch,
                modifier = Modifier.fillMaxSize()
            )
            // Subtle top/bottom scrims so floating cards stay crisp over map tiles
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(110.dp)
                    .align(Alignment.TopCenter)
                    .background(
                        Brush.verticalGradient(
                            listOf(Color(0x550F172A), Color.Transparent)
                        )
                    )
            )
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(250.dp)
                    .align(Alignment.BottomCenter)
                    .background(
                        Brush.verticalGradient(
                            listOf(Color.Transparent, Color(0x700F172A))
                        )
                    )
            )
        }
    } else {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        listOf(Color(0xFFE2E8F0), Color(0xFFF1F5F9), Color(0xFFCBD5E1))
                    )
                )
                .padding(24.dp),
            contentAlignment = Alignment.Center
        ) {
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(24.dp),
                color = Color.White.copy(alpha = 0.96f),
                shadowElevation = 6.dp
            ) {
                Column(
                    modifier = Modifier.padding(22.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(54.dp)
                            .clip(CircleShape)
                            .background(if (gpsBlocked) Rose50 else Blue50),
                        contentAlignment = Alignment.Center
                    ) {
                        if (detectingGps) {
                            CircularProgressIndicator(modifier = Modifier.size(24.dp), strokeWidth = 2.5.dp)
                        } else {
                            Icon(
                                imageVector = if (gpsBlocked) Icons.Default.LocationOff else Icons.Default.LocationOn,
                                contentDescription = null,
                                tint = if (gpsBlocked) Rose600 else Blue600,
                                modifier = Modifier.size(26.dp)
                            )
                        }
                    }

                    Text(
                        text = if (gpsBlocked) {
                            tr(lang, "Lokasi Tidak Tersedia", "Location Unavailable")
                        } else {
                            tr(lang, "Mendeteksi Lokasi...", "Detecting Location...")
                        },
                        fontWeight = FontWeight.Bold,
                        fontSize = 15.sp,
                        color = Slate900
                    )

                    Text(
                        text = if (!hasLocationPermission) {
                            tr(
                                lang,
                                "Izinkan akses lokasi GPS agar Anda dapat melihat peta & melakukan presensi.",
                                "Allow GPS location access to load the map and clock in."
                            )
                        } else {
                            tr(
                                lang,
                                "Pastikan GPS perangkat aktif lalu ketuk tombol di bawah untuk mencoba lagi.",
                                "Make sure your device GPS is enabled and tap below to retry."
                            )
                        },
                        fontSize = 12.sp,
                        color = Slate500,
                        textAlign = TextAlign.Center
                    )

                    Button(
                        onClick = onRequestLocation,
                        enabled = !detectingGps,
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = if (detectingGps) {
                                tr(lang, "Mendeteksi...", "Detecting...")
                            } else {
                                tr(lang, "Deteksi Lokasi GPS", "Detect GPS Location")
                            },
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun HomeScreen(
    repository: EssRepository,
    sessionStore: SessionStore
) {
    val context = LocalContext.current
    val haptics = LocalHapticFeedback.current
    val scope = rememberCoroutineScope()

    val user by sessionStore.userFlow.collectAsState()
    val lang by sessionStore.langFlow.collectAsState()

    var currentTime by remember { mutableStateOf(LocalTime.now()) }
    var todayRecord by remember { mutableStateOf<TodayAttendanceRecord?>(null) }
    var branch by remember { mutableStateOf<BranchInfo?>(null) }
    var settings by remember { mutableStateOf(AttendanceSettingsResponse()) }

    var gps by remember { mutableStateOf<GpsReading?>(null) }
    var detectingGps by remember { mutableStateOf(false) }
    var gpsBlocked by remember { mutableStateOf(false) }
    var hasLocationPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ==
                PackageManager.PERMISSION_GRANTED ||
                ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) ==
                PackageManager.PERMISSION_GRANTED
        )
    }

    var submitting by remember { mutableStateOf(false) }
    var cameraOpen by remember { mutableStateOf(false) }
    var geofencePrompt by remember { mutableStateOf<PendingGeofencePrompt?>(null) }
    var geofenceReasonInput by remember { mutableStateOf("") }
    var feedback by remember { mutableStateOf<Pair<String, Boolean>?>(null) }

    LaunchedEffect(Unit) {
        while (true) {
            currentTime = LocalTime.now()
            delay(1000L)
        }
    }

    fun loadDashboard() {
        scope.launch {
            val today = Formatters.localDateString()
            repository.getAttendanceSettings().onSuccess { settings = it }
            repository.getAttendanceBranch().onSuccess { branch = it }
            repository.getTodayAttendance(today).onSuccess { list ->
                todayRecord = list.firstOrNull { it.employee_id == user?.employeeId }
            }
        }
    }

    fun detectLocation() {
        if (!hasLocationPermission) {
            gpsBlocked = true
            gps = null
            return
        }
        scope.launch {
            detectingGps = true
            gpsBlocked = false
            val reading = LocationHelper.getCurrentGps(context)
            if (reading != null) {
                gps = reading
                gpsBlocked = false
            } else {
                gps = null
                gpsBlocked = true
            }
            detectingGps = false
        }
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { results ->
        val granted = results[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
            results[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        hasLocationPermission = granted
        if (granted) {
            detectLocation()
        } else {
            gpsBlocked = true
        }
    }

    LaunchedEffect(user?.employeeId) {
        loadDashboard()
        if (!hasLocationPermission) {
            permissionLauncher.launch(
                arrayOf(
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION
                )
            )
        } else {
            detectLocation()
        }
    }

    val clockAction = if (!todayRecord?.clock_in_time.isNullOrBlank() && todayRecord?.clock_out_time.isNullOrBlank()) {
        "out"
    } else {
        "in"
    }
    val dayComplete = !todayRecord?.clock_in_time.isNullOrBlank() && !todayRecord?.clock_out_time.isNullOrBlank()

    val distanceToOffice = remember(gps, branch) {
        val g = gps
        val b = branch
        if (g != null && b?.latitude != null && b.longitude != null) {
            Formatters.haversineMeters(g.latitude, g.longitude, b.latitude, b.longitude)
        } else {
            null
        }
    }
    val officeRadius = branch?.radius_meters ?: 150
    val withinOffice = distanceToOffice != null && distanceToOffice <= officeRadius

    fun executeClock(action: String, photoBase64: String? = null, geofenceReason: String? = null) {
        val reading = gps
        if (reading == null) {
            feedback = tr(
                lang,
                "Akses GPS belum aktif. Izinkan lokasi untuk melakukan presensi.",
                "GPS is not active yet. Allow location permission to clock in."
            ) to true
            detectLocation()
            return
        }

        if (geofenceReason.isNullOrBlank() && distanceToOffice != null && distanceToOffice > officeRadius) {
            geofenceReasonInput = ""
            geofencePrompt = PendingGeofencePrompt(action, photoBase64, distanceToOffice)
            return
        }

        val localDate = Formatters.localDateString()
        val localTime = Formatters.localTimeString()
        val deviceTs = "${localDate}T$localTime"

        if (!Formatters.isNetworkConnected(context)) {
            sessionStore.enqueueOfflineClock(
                OfflineClockRecord(
                    id = "off-${System.currentTimeMillis()}",
                    type = action,
                    latitude = reading.latitude,
                    longitude = reading.longitude,
                    photo_base64 = photoBase64,
                    geofence_reason = geofenceReason,
                    device_timestamp = deviceTs,
                    local_date = localDate,
                    local_time = localTime
                )
            )
            feedback = tr(
                lang,
                "Offline: Presensi ${if (action == "in") "Masuk" else "Pulang"} disimpan di perangkat dan akan disinkron saat online.",
                "Offline: ${if (action == "in") "Clock In" else "Clock Out"} saved locally and will sync once online."
            ) to false
            return
        }

        scope.launch {
            submitting = true
            feedback = null
            repository.clockAttendance(
                ClockRequest(
                    type = action,
                    latitude = reading.latitude,
                    longitude = reading.longitude,
                    photo_base64 = photoBase64,
                    geofence_reason = geofenceReason,
                    device_timestamp = deviceTs,
                    local_date = localDate,
                    local_time = localTime
                )
            ).onSuccess { res ->
                val lateNote = if (res.lateMinutes > 0) {
                    tr(lang, " (Terlambat ${res.lateMinutes} menit)", " (${res.lateMinutes} min late)")
                } else {
                    ""
                }
                feedback = "${res.message}$lateNote" to false
                loadDashboard()
            }.onFailure { err ->
                val apiErr = err as? id.openhr.ess.data.remote.ApiException
                if (apiErr?.errorCode == "OUT_OF_GEOFENCE" && geofenceReason.isNullOrBlank()) {
                    geofenceReasonInput = ""
                    geofencePrompt = PendingGeofencePrompt(
                        action = action,
                        photoBase64 = photoBase64,
                        distanceMeters = apiErr.distanceMeters ?: distanceToOffice ?: 0.0
                    )
                } else {
                    feedback = (err.message ?: tr(lang, "Presensi gagal diproses", "Clock failed")) to true
                }
            }
            submitting = false
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        // Full-screen Map Background
        MapBackgroundLayer(
            gps = gps,
            branch = branch,
            detectingGps = detectingGps,
            gpsBlocked = gpsBlocked,
            hasLocationPermission = hasLocationPermission,
            lang = lang,
            onRequestLocation = {
                if (!hasLocationPermission) {
                    permissionLauncher.launch(
                        arrayOf(
                            Manifest.permission.ACCESS_FINE_LOCATION,
                            Manifest.permission.ACCESS_COARSE_LOCATION
                        )
                    )
                } else {
                    detectLocation()
                }
            }
        )

        // Floating Top Status & Geofence Pill
        Column(
            modifier = Modifier
                .align(Alignment.TopCenter)
                .fillMaxWidth()
                .padding(horizontal = 14.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(18.dp),
                color = Color.White.copy(alpha = 0.96f),
                shadowElevation = 6.dp
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(38.dp)
                            .clip(CircleShape)
                            .background(Slate900),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = user?.name?.firstOrNull()?.uppercase() ?: "U",
                            color = Color.White,
                            fontWeight = FontWeight.Black,
                            fontSize = 14.sp
                        )
                    }

                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = user?.name ?: "-",
                            fontWeight = FontWeight.Bold,
                            fontSize = 14.sp,
                            color = Slate900,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        Text(
                            text = user?.jobTitle ?: "Staff",
                            fontSize = 10.sp,
                            color = Slate500,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }

                    Column(horizontalAlignment = Alignment.End) {
                        Text(
                            text = currentTime.format(DateTimeFormatter.ofPattern("HH:mm:ss")),
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.Bold,
                            fontSize = 14.sp,
                            color = Slate900
                        )
                        val locale = if (lang == "id") Locale("id", "ID") else Locale.US
                        Text(
                            text = LocalDate.now().format(DateTimeFormatter.ofPattern("EEE, dd MMM", locale)),
                            fontSize = 9.sp,
                            color = Slate500
                        )
                    }

                    IconButton(
                        onClick = {
                            loadDashboard()
                            if (!hasLocationPermission) {
                                permissionLauncher.launch(
                                    arrayOf(
                                        Manifest.permission.ACCESS_FINE_LOCATION,
                                        Manifest.permission.ACCESS_COARSE_LOCATION
                                    )
                                )
                            } else {
                                detectLocation()
                            }
                        },
                        enabled = !detectingGps,
                        modifier = Modifier.size(32.dp)
                    ) {
                        if (detectingGps) {
                            CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                        } else {
                            Icon(Icons.Default.Refresh, contentDescription = "Refresh", tint = Slate600, modifier = Modifier.size(18.dp))
                        }
                    }
                }
            }

            if (gps != null && branch != null) {
                val pillColor = if (withinOffice) Emerald600 else Amber600
                Surface(
                    shape = RoundedCornerShape(50),
                    color = Color.White.copy(alpha = 0.94f),
                    shadowElevation = 4.dp
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(8.dp)
                                .clip(CircleShape)
                                .background(pillColor)
                        )
                        Text(
                            text = "${branch?.name ?: tr(lang, "Kantor", "Office")} · " +
                                if (distanceToOffice != null) {
                                    "${distanceToOffice.roundToInt()}m / ${officeRadius}m"
                                } else {
                                    "${officeRadius}m"
                                },
                            fontSize = 10.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Slate800
                        )
                        Text(
                            text = "· ±${gps!!.accuracyMeters.roundToInt()}m",
                            fontSize = 10.sp,
                            color = Slate500
                        )
                    }
                }
            }

            feedback?.let { (msg, isErr) ->
                FeedbackBanner(message = msg, isError = isErr, onDismiss = { feedback = null })
            }
        }

        // Floating Bottom Clock Action + Today Summary
        Column(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .padding(horizontal = 14.dp, vertical = 14.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            val buttonBrush = when {
                dayComplete -> Brush.verticalGradient(listOf(Color(0xFF10B981), Color(0xFF047857)))
                gps == null -> Brush.verticalGradient(listOf(Color(0xFFCBD5E1), Color(0xFF94A3B8)))
                clockAction == "in" -> Brush.verticalGradient(listOf(Slate800, Color(0xFF020617)))
                else -> Brush.verticalGradient(listOf(Color(0xFFF59E0B), Color(0xFFB45309)))
            }

            Box(
                modifier = Modifier
                    .size(166.dp)
                    .shadow(12.dp, CircleShape)
                    .clip(CircleShape)
                    .background(Color.White.copy(alpha = 0.92f))
                    .border(1.dp, Color.White, CircleShape)
                    .padding(7.dp),
                contentAlignment = Alignment.Center
            ) {
                Button(
                    onClick = {
                        if (dayComplete || submitting) return@Button
                        haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                        if (gps == null) {
                            detectLocation()
                            return@Button
                        }
                        if (clockAction == "in" && settings.require_selfie) {
                            cameraOpen = true
                        } else {
                            executeClock(clockAction)
                        }
                    },
                    enabled = !submitting && !dayComplete,
                    shape = CircleShape,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color.Transparent,
                        disabledContainerColor = Color.Transparent,
                        contentColor = Color.White,
                        disabledContentColor = Color.White
                    ),
                    contentPadding = PaddingValues(0.dp),
                    modifier = Modifier
                        .fillMaxSize()
                        .clip(CircleShape)
                        .background(buttonBrush)
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                        modifier = Modifier.padding(14.dp)
                    ) {
                        when {
                            submitting -> CircularProgressIndicator(color = Color.White, modifier = Modifier.size(30.dp))
                            dayComplete -> Icon(Icons.Default.CheckCircle, contentDescription = null, modifier = Modifier.size(34.dp))
                            gps == null -> Icon(Icons.Default.LocationOn, contentDescription = null, modifier = Modifier.size(32.dp))
                            clockAction == "in" -> Icon(Icons.AutoMirrored.Filled.Login, contentDescription = null, modifier = Modifier.size(32.dp))
                            else -> Icon(Icons.AutoMirrored.Filled.Logout, contentDescription = null, modifier = Modifier.size(32.dp))
                        }
                        Text(
                            text = when {
                                submitting -> tr(lang, "Mengirim...", "Submitting...")
                                dayComplete -> tr(lang, "Presensi Selesai", "Complete")
                                gps == null -> tr(lang, "Deteksi GPS", "Detect GPS")
                                clockAction == "in" && settings.require_selfie -> tr(lang, "Masuk + Selfie", "Clock In + Selfie")
                                clockAction == "in" -> tr(lang, "Presensi Masuk", "Clock In")
                                else -> tr(lang, "Presensi Pulang", "Clock Out")
                            },
                            fontWeight = FontWeight.Bold,
                            fontSize = 12.sp,
                            textAlign = TextAlign.Center
                        )
                    }
                }
            }

            if (gps != null) {
                Surface(
                    shape = RoundedCornerShape(50),
                    color = Slate900.copy(alpha = 0.55f)
                ) {
                    Text(
                        text = when {
                            dayComplete -> tr(lang, "Presensi hari ini selesai.", "Today's attendance is complete.")
                            clockAction == "in" -> tr(lang, "Ketuk untuk presensi masuk", "Tap to clock in")
                            else -> tr(lang, "Ketuk untuk presensi pulang", "Tap to clock out")
                        },
                        color = Color.White,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Medium,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp)
                    )
                }
            }

            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(18.dp),
                color = Color.White.copy(alpha = 0.96f),
                shadowElevation = 6.dp
            ) {
                Column(modifier = Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                        Column(
                            modifier = Modifier
                                .weight(1f)
                                .clip(RoundedCornerShape(12.dp))
                                .background(Slate50)
                                .padding(horizontal = 10.dp, vertical = 8.dp)
                        ) {
                            Text(tr(lang, "JAM MASUK", "CLOCK IN"), fontSize = 9.sp, fontWeight = FontWeight.Bold, color = Slate500)
                            val inTime = todayRecord?.clock_in_time
                            val isLate = (todayRecord?.late_minutes ?: 0) > 0 || todayRecord?.status == "late"
                            Text(
                                text = inTime ?: "--:--",
                                fontFamily = FontFamily.Monospace,
                                fontWeight = FontWeight.Bold,
                                fontSize = 15.sp,
                                color = when {
                                    inTime.isNullOrBlank() -> Slate900
                                    isLate -> Rose600
                                    else -> Emerald600
                                }
                            )
                            if ((todayRecord?.late_minutes ?: 0) > 0) {
                                Text(
                                    text = tr(lang, "Terlambat ${todayRecord!!.late_minutes} mnt", "Late ${todayRecord!!.late_minutes} min"),
                                    fontSize = 9.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = Rose600
                                )
                            }
                        }

                        Column(
                            modifier = Modifier
                                .weight(1f)
                                .clip(RoundedCornerShape(12.dp))
                                .background(Slate50)
                                .padding(horizontal = 10.dp, vertical = 8.dp)
                        ) {
                            Text(tr(lang, "JAM PULANG", "CLOCK OUT"), fontSize = 9.sp, fontWeight = FontWeight.Bold, color = Slate500)
                            val outTime = todayRecord?.clock_out_time
                            val isEarly = (todayRecord?.early_minutes ?: 0) > 0
                            Text(
                                text = outTime ?: "--:--",
                                fontFamily = FontFamily.Monospace,
                                fontWeight = FontWeight.Bold,
                                fontSize = 15.sp,
                                color = when {
                                    outTime.isNullOrBlank() -> Slate900
                                    isEarly -> Rose600
                                    else -> Emerald600
                                }
                            )
                            if ((todayRecord?.early_minutes ?: 0) > 0) {
                                Text(
                                    text = tr(lang, "Pulang awal ${todayRecord!!.early_minutes} mnt", "Early ${todayRecord!!.early_minutes} min"),
                                    fontSize = 9.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = Rose600
                                )
                            }
                        }
                    }

                    if (!todayRecord?.shift_start_time.isNullOrBlank() && !todayRecord?.shift_end_time.isNullOrBlank()) {
                        Text(
                            text = "Shift: ${todayRecord?.shift_start_time} – ${todayRecord?.shift_end_time}" +
                                (todayRecord?.shift_name?.let { " · $it" } ?: ""),
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Medium,
                            color = Slate500,
                            modifier = Modifier.align(Alignment.CenterHorizontally)
                        )
                    }
                }
            }
        }
    }

    if (cameraOpen) {
        CameraCaptureDialog(
            title = tr(
                lang,
                "Foto Selfie Presensi ${if (clockAction == "in") "Masuk" else "Pulang"}",
                "Attendance Selfie ${if (clockAction == "in") "Clock In" else "Clock Out"}"
            ),
            useFrontCamera = true,
            lang = lang,
            onDismiss = { cameraOpen = false },
            onCaptured = { base64 ->
                cameraOpen = false
                executeClock(clockAction, photoBase64 = base64)
            }
        )
    }

    geofencePrompt?.let { prompt ->
        AlertDialog(
            onDismissRequest = { geofencePrompt = null },
            title = { Text(tr(lang, "Di Luar Radius Kantor", "Outside Office Radius"), fontWeight = FontWeight.Bold) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(
                        text = tr(
                            lang,
                            "Anda berada ±${prompt.distanceMeters.roundToInt()} m dari kantor (radius ${officeRadius} m). Mohon isi alasan presensi.",
                            "You are about ${prompt.distanceMeters.roundToInt()} m from the office (radius ${officeRadius} m). Please provide a reason."
                        ),
                        fontSize = 12.sp,
                        color = Slate600
                    )
                    OutlinedTextField(
                        value = geofenceReasonInput,
                        onValueChange = { geofenceReasonInput = it },
                        label = { Text(tr(lang, "Alasan presensi", "Attendance reason")) },
                        placeholder = { Text(tr(lang, "Kunjungan klien, tugas lapangan...", "Client visit, field work...")) },
                        minLines = 2,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        val reason = geofenceReasonInput.trim()
                        if (reason.isNotEmpty()) {
                            geofencePrompt = null
                            executeClock(prompt.action, prompt.photoBase64, reason)
                        }
                    },
                    enabled = geofenceReasonInput.isNotBlank()
                ) {
                    Text(tr(lang, "Lanjutkan", "Continue"))
                }
            },
            dismissButton = {
                TextButton(onClick = { geofencePrompt = null }) {
                    Text(tr(lang, "Batal", "Cancel"))
                }
            }
        )
    }
}
