package id.openhr.ess.ui.screens

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.*
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Login
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import id.openhr.ess.data.local.SessionStore
import id.openhr.ess.data.model.AnnouncementItem
import id.openhr.ess.data.model.AttendanceSettingsResponse
import id.openhr.ess.data.model.BranchInfo
import id.openhr.ess.data.model.ClockRequest
import id.openhr.ess.data.model.OfflineClockRecord
import id.openhr.ess.data.model.TodayAttendanceRecord
import id.openhr.ess.data.repository.EssRepository
import id.openhr.ess.ui.components.AttendanceMapView
import id.openhr.ess.ui.components.CameraCaptureDialog
import id.openhr.ess.ui.components.FeedbackBanner
import id.openhr.ess.ui.components.pressScale
import id.openhr.ess.ui.components.tr
import id.openhr.ess.ui.theme.LocalEssPalette
import id.openhr.ess.util.Formatters
import id.openhr.ess.util.GpsReading
import id.openhr.ess.util.LocationHelper
import id.openhr.ess.util.ShiftReminderScheduler
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
    isVisible: Boolean,
    recenterTrigger: Int,
    detectingGps: Boolean,
    gpsBlocked: Boolean,
    hasLocationPermission: Boolean,
    lang: String,
    onRequestLocation: () -> Unit
) {
    val palette = LocalEssPalette.current
    if (gps != null) {
        Box(modifier = Modifier.fillMaxSize()) {
            AttendanceMapView(
                lat = gps.latitude,
                lng = gps.longitude,
                office = branch,
                isVisible = isVisible,
                recenterTrigger = recenterTrigger,
                modifier = Modifier.fillMaxSize()
            )
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(100.dp)
                    .align(Alignment.TopCenter)
                    .background(Brush.verticalGradient(listOf(Color(0x400F172A), Color.Transparent)))
            )
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(230.dp)
                    .align(Alignment.BottomCenter)
                    .background(Brush.verticalGradient(listOf(Color.Transparent, Color(0x660F172A))))
            )
        }
    } else {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(palette.canvas)
                .padding(24.dp),
            contentAlignment = Alignment.Center
        ) {
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(24.dp),
                color = palette.card,
                border = BorderStroke(1.dp, palette.cardBorder),
                shadowElevation = 3.dp
            ) {
                Column(
                    modifier = Modifier.padding(22.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(56.dp)
                            .clip(CircleShape)
                            .background(if (gpsBlocked) palette.dangerSurface else palette.accentSurface),
                        contentAlignment = Alignment.Center
                    ) {
                        if (detectingGps) {
                            CircularProgressIndicator(modifier = Modifier.size(24.dp), strokeWidth = 2.5.dp)
                        } else {
                            Icon(
                                imageVector = if (gpsBlocked) Icons.Default.LocationOff else Icons.Default.LocationOn,
                                contentDescription = null,
                                tint = if (gpsBlocked) palette.danger else palette.accent,
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
                        color = palette.textPrimary
                    )

                    Text(
                        text = if (!hasLocationPermission) {
                            tr(
                                lang,
                                "Izinkan akses lokasi GPS untuk memuat peta & melakukan presensi.",
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
                        color = palette.textMuted,
                        textAlign = TextAlign.Center
                    )

                    Button(
                        onClick = onRequestLocation,
                        enabled = !detectingGps,
                        shape = RoundedCornerShape(14.dp),
                        modifier = Modifier.fillMaxWidth().height(46.dp)
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    repository: EssRepository,
    sessionStore: SessionStore,
    isVisible: Boolean = true
) {
    val context = LocalContext.current
    val haptics = LocalHapticFeedback.current
    val scope = rememberCoroutineScope()
    val palette = LocalEssPalette.current

    val user by sessionStore.userFlow.collectAsState()
    val lang by sessionStore.langFlow.collectAsState()
    val offlineQueue by sessionStore.offlineQueueFlow.collectAsState()
    val cachedBranch by sessionStore.cachedBranchFlow.collectAsState()
    val cachedSettings by sessionStore.cachedSettingsFlow.collectAsState()

    val initialToday = remember { Formatters.localDateString() }
    var currentTime by remember { mutableStateOf(LocalTime.now()) }
    var todayRecord by remember { mutableStateOf(sessionStore.getCachedTodayRecord(initialToday)) }
    var branch by remember { mutableStateOf(cachedBranch) }
    var settings by remember { mutableStateOf(cachedSettings) }

    var gps by remember { mutableStateOf<GpsReading?>(null) }
    var detectingGps by remember { mutableStateOf(false) }
    var gpsBlocked by remember { mutableStateOf(false) }
    var recenterTrigger by remember { mutableIntStateOf(0) }
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
    val shiftReminderEnabled by sessionStore.shiftReminderEnabledFlow.collectAsState()
    val baseUrl by sessionStore.baseUrlFlow.collectAsState()
    val token by sessionStore.tokenFlow.collectAsState()
    var announcements by remember { mutableStateOf<List<AnnouncementItem>>(repository.cachedAnnouncements ?: emptyList()) }
    var showAnnouncementsSheet by remember { mutableStateOf(false) }

    LaunchedEffect(isVisible) {
        if (!isVisible) return@LaunchedEffect
        while (true) {
            currentTime = LocalTime.now()
            delay(1000L)
        }
    }

    fun loadDashboard() {
        val today = Formatters.localDateString()
        val month = today.substring(0, 7)
        scope.launch {
            repository.getAttendanceSettings().onSuccess { settings = it }
        }
        scope.launch {
            repository.getAttendanceBranch().onSuccess { if (it != null) branch = it }
        }
        scope.launch {
            repository.getAnnouncements().onSuccess { announcements = it }
        }
        scope.launch {
            var matched: TodayAttendanceRecord? = null
            repository.getTodayAttendance(today).onSuccess { list ->
                matched = list.firstOrNull { it.employee_id == user?.employeeId }
                if (matched != null) {
                    todayRecord = matched
                    sessionStore.saveCachedTodayRecord(today, matched)
                    if (shiftReminderEnabled) {
                        ShiftReminderScheduler.schedule(
                            context,
                            matched?.shift_start_time,
                            matched?.shift_end_time,
                            lang
                        )
                    }
                }
            }
            if (matched?.clock_in_time.isNullOrBlank()) {
                repository.getMyAttendance(month).onSuccess { mine ->
                    val todayRec = mine.records.firstOrNull { it.date.take(10) == today }
                    if (todayRec != null && !todayRec.clock_in_time.isNullOrBlank()) {
                        val hydrated = (matched ?: TodayAttendanceRecord(
                            employee_id = user?.employeeId ?: "",
                            full_name = user?.name,
                            job_title = user?.jobTitle
                        )).copy(
                            attendance_id = todayRec.id,
                            clock_in_time = todayRec.clock_in_time,
                            clock_out_time = todayRec.clock_out_time,
                            status = todayRec.status,
                            late_minutes = todayRec.late_minutes,
                            early_minutes = todayRec.early_minutes,
                            is_offline_sync = todayRec.is_offline_sync,
                            clock_in_photo_key = todayRec.clock_in_photo_key,
                            clock_out_photo_key = todayRec.clock_out_photo_key
                        )
                        todayRecord = hydrated
                        sessionStore.saveCachedTodayRecord(today, hydrated)
                    }
                }
            }
        }
    }

    var previousQueueCount by remember { mutableIntStateOf(offlineQueue.size) }
    LaunchedEffect(offlineQueue.size) {
        if (previousQueueCount > 0 && offlineQueue.isEmpty()) {
            loadDashboard()
        }
        previousQueueCount = offlineQueue.size
    }

    fun detectLocation() {
        if (!hasLocationPermission || !LocationHelper.isLocationEnabled(context)) {
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

    val todayDateStr = Formatters.localDateString()
    val pendingTodayIn = offlineQueue.lastOrNull { it.local_date == todayDateStr && it.type == "in" }
    val pendingTodayOut = offlineQueue.lastOrNull { it.local_date == todayDateStr && it.type == "out" }
    val effectiveTodayRecord = remember(todayRecord, pendingTodayIn, pendingTodayOut, user?.employeeId) {
        val base = todayRecord ?: if (pendingTodayIn != null || pendingTodayOut != null) {
            TodayAttendanceRecord(
                employee_id = user?.employeeId ?: "",
                full_name = user?.name,
                job_title = user?.jobTitle
            )
        } else {
            null
        }
        base?.copy(
            clock_in_time = base.clock_in_time ?: pendingTodayIn?.local_time,
            clock_out_time = base.clock_out_time ?: pendingTodayOut?.local_time
        )
    }

    val clockAction = if (!effectiveTodayRecord?.clock_in_time.isNullOrBlank() && effectiveTodayRecord?.clock_out_time.isNullOrBlank()) {
        "out"
    } else {
        "in"
    }
    val dayComplete = !effectiveTodayRecord?.clock_in_time.isNullOrBlank() && !effectiveTodayRecord?.clock_out_time.isNullOrBlank()

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
        if (!hasLocationPermission || !LocationHelper.isLocationEnabled(context)) {
            gps = null
            gpsBlocked = true
            feedback = tr(
                lang,
                "GPS perangkat wajib aktif untuk melakukan presensi (termasuk mode offline).",
                "Device GPS must be turned on to clock in or out (even offline)."
            ) to true
            return
        }

        val reading = gps
        if (reading == null || (reading.latitude == 0.0 && reading.longitude == 0.0)) {
            feedback = tr(
                lang,
                "Koordinat GPS belum terkunci. Tunggu atau ketuk Deteksi GPS terlebih dahulu.",
                "GPS fix not locked yet. Please wait or tap Detect GPS first."
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

        fun queueOfflinePunch() {
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
                "Offline (GPS ±${reading.accuracyMeters.roundToInt()}m tercatat): Presensi ${if (action == "in") "Masuk" else "Pulang"} disimpan & akan disinkron otomatis.",
                "Offline (GPS ±${reading.accuracyMeters.roundToInt()}m locked): ${if (action == "in") "Clock In" else "Clock Out"} queued and will sync automatically."
            ) to false
        }

        if (!Formatters.isNetworkConnected(context)) {
            queueOfflinePunch()
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
                val existing = todayRecord
                val updated = TodayAttendanceRecord(
                    employee_id = existing?.employee_id ?: (user?.employeeId ?: ""),
                    nik = existing?.nik,
                    full_name = existing?.full_name ?: user?.name,
                    job_title = existing?.job_title ?: user?.jobTitle,
                    shift_name = existing?.shift_name,
                    shift_start_time = existing?.shift_start_time,
                    shift_end_time = existing?.shift_end_time,
                    attendance_id = existing?.attendance_id,
                    clock_in_time = if (action == "in") localTime else existing?.clock_in_time,
                    clock_out_time = if (action == "out") localTime else existing?.clock_out_time,
                    status = res.status ?: existing?.status,
                    late_minutes = if (action == "in") res.lateMinutes else (existing?.late_minutes ?: 0),
                    early_minutes = if (action == "out") res.earlyMinutes else (existing?.early_minutes ?: 0),
                    clock_in_status = existing?.clock_in_status,
                    is_offline_sync = existing?.is_offline_sync ?: 0,
                    clock_in_photo_key = existing?.clock_in_photo_key,
                    clock_out_photo_key = existing?.clock_out_photo_key
                )
                todayRecord = updated
                sessionStore.saveCachedTodayRecord(localDate, updated)
                feedback = "${res.message}$lateNote" to false
                loadDashboard()
            }.onFailure { err ->
                val apiErr = err as? id.openhr.ess.data.remote.ApiException
                when {
                    apiErr?.errorCode == "OUT_OF_GEOFENCE" && geofenceReason.isNullOrBlank() -> {
                        geofenceReasonInput = ""
                        geofencePrompt = PendingGeofencePrompt(
                            action = action,
                            photoBase64 = photoBase64,
                            distanceMeters = apiErr.distanceMeters ?: distanceToOffice ?: 0.0
                        )
                    }
                    apiErr == null || apiErr.statusCode == 0 -> {
                        // Network timeout / unreachable server despite Wi-Fi/LTE interface up
                        queueOfflinePunch()
                    }
                    else -> {
                        if (apiErr.errorCode == "ALREADY_CLOCKED_IN" || apiErr.errorCode == "ALREADY_CLOCKED_OUT") {
                            loadDashboard()
                        }
                        feedback = (err.message ?: tr(lang, "Presensi gagal diproses", "Clock failed")) to true
                    }
                }
            }
            submitting = false
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        // Full-screen MapLibre Positron Map
        MapBackgroundLayer(
            gps = gps,
            branch = branch,
            isVisible = isVisible,
            recenterTrigger = recenterTrigger,
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

        // Floating Top HUD
        Column(
            modifier = Modifier
                .align(Alignment.TopCenter)
                .fillMaxWidth()
                .padding(horizontal = 14.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(20.dp),
                color = palette.card.copy(alpha = 0.96f),
                border = BorderStroke(1.dp, palette.cardBorder),
                shadowElevation = 4.dp
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(40.dp)
                            .clip(CircleShape)
                            .background(Brush.linearGradient(listOf(palette.accent, Color(0xFF1D4ED8)))),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = user?.name?.firstOrNull()?.uppercase() ?: "U",
                            color = Color.White,
                            fontWeight = FontWeight.Black,
                            fontSize = 15.sp
                        )
                    }

                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = user?.name ?: "-",
                            fontWeight = FontWeight.Bold,
                            fontSize = 14.sp,
                            color = palette.textPrimary,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        Text(
                            text = user?.jobTitle ?: "Staff",
                            fontSize = 11.sp,
                            color = palette.textMuted,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }

                    Column(horizontalAlignment = Alignment.End) {
                        Text(
                            text = currentTime.format(DateTimeFormatter.ofPattern("HH:mm:ss")),
                            style = TextStyle(
                                fontWeight = FontWeight.ExtraBold,
                                fontSize = 15.sp,
                                color = palette.textPrimary,
                                fontFeatureSettings = "tnum"
                            )
                        )
                        val locale = if (lang == "id") Locale("id", "ID") else Locale.US
                        Text(
                            text = LocalDate.now().format(DateTimeFormatter.ofPattern("EEE, dd MMM", locale)),
                            fontSize = 10.sp,
                            color = palette.textMuted
                        )
                    }

                    val unackedCount = announcements.count { !it.acknowledged }
                    IconButton(
                        onClick = { showAnnouncementsSheet = true },
                        modifier = Modifier.size(34.dp)
                    ) {
                        Box(contentAlignment = Alignment.TopEnd) {
                            Icon(
                                imageVector = if (unackedCount > 0) Icons.Default.NotificationsActive else Icons.Default.Notifications,
                                contentDescription = "Announcements",
                                tint = if (unackedCount > 0) palette.accent else palette.textSecondary,
                                modifier = Modifier.size(19.dp)
                            )
                            if (unackedCount > 0) {
                                Box(
                                    modifier = Modifier
                                        .size(8.dp)
                                        .clip(CircleShape)
                                        .background(palette.danger)
                                )
                            }
                        }
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
                        modifier = Modifier.size(34.dp)
                    ) {
                        if (detectingGps) {
                            CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                        } else {
                            Icon(Icons.Default.Refresh, contentDescription = "Refresh", tint = palette.textSecondary, modifier = Modifier.size(18.dp))
                        }
                    }
                }
            }

            if (gps != null) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    if (branch != null) {
                        val dotColor = if (withinOffice) palette.success else palette.warning
                        Surface(
                            shape = RoundedCornerShape(50),
                            color = palette.card.copy(alpha = 0.95f),
                            border = BorderStroke(1.dp, palette.cardBorder),
                            shadowElevation = 2.dp
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(8.dp)
                                        .clip(CircleShape)
                                        .background(dotColor)
                                )
                                Text(
                                    text = "${branch?.name ?: tr(lang, "Kantor", "Office")} · " +
                                        if (distanceToOffice != null) {
                                            if (withinOffice) {
                                                tr(lang, "Dalam radius (${distanceToOffice.roundToInt()}m)", "In radius (${distanceToOffice.roundToInt()}m)")
                                            } else {
                                                tr(lang, "Luar radius (${distanceToOffice.roundToInt()}m)", "Outside (${distanceToOffice.roundToInt()}m)")
                                            }
                                        } else {
                                            "${officeRadius}m"
                                        },
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = palette.textPrimary
                                )
                            }
                        }
                    } else {
                        Surface(
                            shape = RoundedCornerShape(50),
                            color = palette.card.copy(alpha = 0.95f),
                            border = BorderStroke(1.dp, palette.cardBorder),
                            shadowElevation = 2.dp
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(8.dp)
                                        .clip(CircleShape)
                                        .background(palette.success)
                                )
                                Text(
                                    text = tr(
                                        lang,
                                        "GPS Terkunci (±${gps!!.accuracyMeters.roundToInt()}m)",
                                        "GPS Locked (±${gps!!.accuracyMeters.roundToInt()}m)"
                                    ),
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = palette.textPrimary
                                )
                            }
                        }
                    }

                    SmallFloatingActionButton(
                        onClick = { recenterTrigger++ },
                        containerColor = palette.card.copy(alpha = 0.95f),
                        contentColor = palette.accent,
                        shape = CircleShape
                    ) {
                        Icon(Icons.Default.MyLocation, contentDescription = "Recenter", modifier = Modifier.size(18.dp))
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
                clockAction == "in" -> Brush.verticalGradient(listOf(Color(0xFF1E293B), Color(0xFF020617)))
                else -> Brush.verticalGradient(listOf(Color(0xFFF59E0B), Color(0xFFB45309)))
            }

            val pulseTransition = rememberInfiniteTransition(label = "clock_pulse")
            val pulseScale by pulseTransition.animateFloat(
                initialValue = 1f,
                targetValue = if (isVisible && gps != null && !dayComplete && !submitting) 1.08f else 1f,
                animationSpec = infiniteRepeatable(
                    animation = tween(1400, easing = FastOutSlowInEasing),
                    repeatMode = RepeatMode.Reverse
                ),
                label = "pulse_scale"
            )

            Box(contentAlignment = Alignment.Center) {
                if (gps != null && !dayComplete) {
                    Box(
                        modifier = Modifier
                            .size(172.dp)
                            .scale(pulseScale)
                            .clip(CircleShape)
                            .background(
                                (if (clockAction == "in") Color(0xFF2563EB) else Color(0xFFF59E0B)).copy(alpha = 0.16f)
                            )
                    )
                }

                Box(
                    modifier = Modifier
                        .size(160.dp)
                        .shadow(14.dp, CircleShape)
                        .clip(CircleShape)
                        .background(palette.card.copy(alpha = 0.94f))
                        .border(1.5.dp, Color.White.copy(alpha = 0.7f), CircleShape)
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
                            .pressScale(0.95f)
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
                                    dayComplete -> tr(lang, "Selesai", "Complete")
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
            }

            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(20.dp),
                color = palette.card.copy(alpha = 0.96f),
                border = BorderStroke(1.dp, palette.cardBorder),
                shadowElevation = 4.dp
            ) {
                Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                        Column(
                            modifier = Modifier
                                .weight(1f)
                                .clip(RoundedCornerShape(14.dp))
                                .background(palette.subtleSurface)
                                .padding(horizontal = 12.dp, vertical = 9.dp)
                        ) {
                            Text(tr(lang, "MASUK", "CLOCK IN"), fontSize = 9.5.sp, fontWeight = FontWeight.Bold, color = palette.textMuted)
                            val inTime = effectiveTodayRecord?.clock_in_time
                            val isLate = (effectiveTodayRecord?.late_minutes ?: 0) > 0 || effectiveTodayRecord?.status == "late"
                            Text(
                                text = inTime ?: "--:--",
                                style = TextStyle(
                                    fontWeight = FontWeight.ExtraBold,
                                    fontSize = 16.sp,
                                    fontFeatureSettings = "tnum",
                                    color = when {
                                        inTime.isNullOrBlank() -> palette.textPrimary
                                        isLate -> palette.danger
                                        else -> palette.success
                                    }
                                )
                            )
                            if (pendingTodayIn != null && todayRecord?.clock_in_time.isNullOrBlank()) {
                                Text(
                                    text = tr(lang, "Antrean offline", "Queued offline"),
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = palette.warning
                                )
                            } else if ((effectiveTodayRecord?.late_minutes ?: 0) > 0) {
                                Text(
                                    text = tr(lang, "Terlambat ${effectiveTodayRecord!!.late_minutes}m", "Late ${effectiveTodayRecord!!.late_minutes}m"),
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = palette.danger
                                )
                            }
                        }

                        Column(
                            modifier = Modifier
                                .weight(1f)
                                .clip(RoundedCornerShape(14.dp))
                                .background(palette.subtleSurface)
                                .padding(horizontal = 12.dp, vertical = 9.dp)
                        ) {
                            Text(tr(lang, "PULANG", "CLOCK OUT"), fontSize = 9.5.sp, fontWeight = FontWeight.Bold, color = palette.textMuted)
                            val outTime = effectiveTodayRecord?.clock_out_time
                            val isEarly = (effectiveTodayRecord?.early_minutes ?: 0) > 0
                            Text(
                                text = outTime ?: "--:--",
                                style = TextStyle(
                                    fontWeight = FontWeight.ExtraBold,
                                    fontSize = 16.sp,
                                    fontFeatureSettings = "tnum",
                                    color = when {
                                        outTime.isNullOrBlank() -> palette.textPrimary
                                        isEarly -> palette.danger
                                        else -> palette.success
                                    }
                                )
                            )
                            if (pendingTodayOut != null && todayRecord?.clock_out_time.isNullOrBlank()) {
                                Text(
                                    text = tr(lang, "Antrean offline", "Queued offline"),
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = palette.warning
                                )
                            } else if ((effectiveTodayRecord?.early_minutes ?: 0) > 0) {
                                Text(
                                    text = tr(lang, "Pulang awal ${effectiveTodayRecord!!.early_minutes}m", "Early ${effectiveTodayRecord!!.early_minutes}m"),
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = palette.danger
                                )
                            }
                        }
                    }

                    if (!effectiveTodayRecord?.shift_start_time.isNullOrBlank() && !effectiveTodayRecord?.shift_end_time.isNullOrBlank()) {
                        Text(
                            text = "Shift ${effectiveTodayRecord?.shift_start_time} – ${effectiveTodayRecord?.shift_end_time}" +
                                (effectiveTodayRecord?.shift_name?.let { " · $it" } ?: ""),
                            fontSize = 10.5.sp,
                            fontWeight = FontWeight.Medium,
                            color = palette.textMuted,
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
                        color = palette.textSecondary
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

    if (showAnnouncementsSheet) {
        val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        ModalBottomSheet(
            onDismissRequest = { showAnnouncementsSheet = false },
            sheetState = sheetState,
            containerColor = palette.card,
            contentColor = palette.textPrimary,
            shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .navigationBarsPadding()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 20.dp)
                    .padding(bottom = 24.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text(
                    tr(lang, "Pengumuman & Kebijakan", "Announcements & Policies"),
                    fontWeight = FontWeight.ExtraBold,
                    fontSize = 18.sp,
                    color = palette.textPrimary
                )

                if (announcements.isEmpty()) {
                    Text(
                        tr(lang, "Belum ada pengumuman saat ini.", "No announcements right now."),
                        fontSize = 12.sp,
                        color = palette.textSecondary,
                        modifier = Modifier.padding(vertical = 16.dp)
                    )
                } else {
                    announcements.forEach { item ->
                        Surface(
                            shape = RoundedCornerShape(16.dp),
                            color = palette.subtleSurface,
                            border = BorderStroke(
                                1.dp,
                                if (item.pinned || !item.acknowledged) palette.accent.copy(alpha = 0.45f) else palette.cardBorder
                            ),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(
                                modifier = Modifier.padding(14.dp),
                                verticalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                        Surface(
                                            shape = RoundedCornerShape(50),
                                            color = palette.accentSurface
                                        ) {
                                            Text(
                                                item.category.uppercase(),
                                                color = palette.accent,
                                                fontSize = 9.sp,
                                                fontWeight = FontWeight.Bold,
                                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                                            )
                                        }
                                        if (item.pinned) {
                                            Surface(
                                                shape = RoundedCornerShape(50),
                                                color = palette.warningSurface
                                            ) {
                                                Text(
                                                    "PINNED",
                                                    color = palette.warning,
                                                    fontSize = 9.sp,
                                                    fontWeight = FontWeight.Bold,
                                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                                                )
                                            }
                                        }
                                    }
                                    if (item.acknowledged) {
                                        Text(
                                            tr(lang, "✓ Dibaca", "✓ Read"),
                                            fontSize = 10.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = palette.success
                                        )
                                    }
                                }

                                Text(item.title, fontWeight = FontWeight.Bold, fontSize = 14.sp, color = palette.textPrimary)
                                Text(item.body, fontSize = 12.sp, color = palette.textSecondary, lineHeight = 17.sp)
                                Text(
                                    "${item.publisher_name ?: "HR"} · ${Formatters.formatDisplayDate(item.published_at, lang)}",
                                    fontSize = 10.sp,
                                    color = palette.textMuted
                                )

                                Row(
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    if (!item.attachment_url.isNullOrBlank()) {
                                        OutlinedButton(
                                            onClick = {
                                                val url = "$baseUrl${item.attachment_url}?token=$token"
                                                runCatching {
                                                    context.startActivity(
                                                        Intent(Intent.ACTION_VIEW, Uri.parse(url))
                                                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                                                    )
                                                }
                                            },
                                            shape = RoundedCornerShape(10.dp),
                                            contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp)
                                        ) {
                                            Icon(Icons.Default.AttachFile, contentDescription = null, modifier = Modifier.size(14.dp))
                                            Spacer(modifier = Modifier.width(4.dp))
                                            Text(item.attachment_name ?: tr(lang, "Lampiran", "Attachment"), fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                        }
                                    }

                                    if (!item.acknowledged) {
                                        FilledTonalButton(
                                            onClick = {
                                                scope.launch {
                                                    repository.acknowledgeAnnouncement(item.id).onSuccess {
                                                        announcements = announcements.map {
                                                            if (it.id == item.id) it.copy(acknowledged = true) else it
                                                        }
                                                    }
                                                }
                                            },
                                            shape = RoundedCornerShape(10.dp),
                                            colors = ButtonDefaults.filledTonalButtonColors(
                                                containerColor = palette.accentSurface,
                                                contentColor = palette.accent
                                            ),
                                            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp)
                                        ) {
                                            Text(
                                                if (item.require_ack) tr(lang, "Konfirmasi Dibaca", "Acknowledge")
                                                else tr(lang, "Tandai Dibaca", "Mark Read"),
                                                fontSize = 11.sp,
                                                fontWeight = FontWeight.Bold
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
