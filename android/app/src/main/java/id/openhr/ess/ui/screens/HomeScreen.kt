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
import androidx.compose.foundation.clickable
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
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import coil.compose.AsyncImage
import coil.request.ImageRequest
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
import id.openhr.ess.data.model.ClientSecurityPayload
import id.openhr.ess.data.model.ClockRequest
import id.openhr.ess.data.model.OfflineClockRecord
import id.openhr.ess.data.model.SecurityPolicyDto
import id.openhr.ess.data.model.TodayAttendanceRecord
import id.openhr.ess.data.repository.EssRepository
import id.openhr.ess.ui.components.AttendanceMapView
import id.openhr.ess.ui.components.CameraCaptureDialog
import id.openhr.ess.ui.components.FeedbackBanner
import id.openhr.ess.ui.components.IsoApprovalIcon
import id.openhr.ess.ui.components.IsoAttendanceIcon
import id.openhr.ess.ui.components.IsoCalendarIcon
import id.openhr.ess.ui.components.IsoClaimReceiptIcon
import id.openhr.ess.ui.components.IsoKasbonIcon
import id.openhr.ess.ui.components.IsoLeavePlaneIcon
import id.openhr.ess.ui.components.IsoOvertimeIcon
import id.openhr.ess.ui.components.IsoPettyCashIcon
import id.openhr.ess.ui.components.IsoProfileIcon
import id.openhr.ess.ui.components.IsoRefreshIcon
import id.openhr.ess.ui.components.IsoTasksIcon
import id.openhr.ess.ui.components.IsoWalletIcon
import id.openhr.ess.ui.components.pressScale
import id.openhr.ess.ui.components.tr
import id.openhr.ess.ui.theme.LocalEssPalette
import id.openhr.ess.util.FaceExtractResult
import id.openhr.ess.util.FaceMath
import id.openhr.ess.util.FaceRecognizer
import id.openhr.ess.util.Formatters
import id.openhr.ess.util.GpsReading
import id.openhr.ess.util.LocationHelper
import id.openhr.ess.util.SecurityGuard
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
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                if (detectingGps) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(28.dp),
                        strokeWidth = 2.5.dp,
                        color = palette.accent
                    )
                    Text(
                        text = tr(lang, "Mendeteksi lokasi...", "Detecting location..."),
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Medium,
                        color = palette.textSecondary
                    )
                } else {
                    Icon(
                        imageVector = if (gpsBlocked) Icons.Default.LocationOff else Icons.Default.LocationOn,
                        contentDescription = null,
                        tint = if (gpsBlocked) palette.danger else palette.accent,
                        modifier = Modifier.size(30.dp)
                    )
                    Text(
                        text = if (gpsBlocked) {
                            tr(lang, "Lokasi GPS belum aktif", "Location unavailable")
                        } else {
                            tr(lang, "Aktifkan lokasi GPS untuk presensi", "Enable GPS location to clock in")
                        },
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = palette.textPrimary,
                        textAlign = TextAlign.Center
                    )
                    FilledTonalButton(
                        onClick = onRequestLocation,
                        shape = RoundedCornerShape(50)
                    ) {
                        Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(tr(lang, "Deteksi Lokasi", "Detect Location"), fontSize = 12.sp, fontWeight = FontWeight.Bold)
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
    isVisible: Boolean = true,
    onHeroHeightChanged: (Int) -> Unit = {},
    onHeroScrollChanged: (Int) -> Unit = {},
    onNavigateToTab: (String) -> Unit = {}
) {
    val context = LocalContext.current
    val haptics = LocalHapticFeedback.current
    val scope = rememberCoroutineScope()
    val palette = LocalEssPalette.current

    val user by sessionStore.userFlow.collectAsState()
    val lang by sessionStore.langFlow.collectAsState()
    val modules by sessionStore.modulesFlow.collectAsState()
    val offlineQueue by sessionStore.offlineQueueFlow.collectAsState()
    var showMapSection by remember { mutableStateOf(false) }
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
    var selectedAnnouncement by remember { mutableStateOf<AnnouncementItem?>(null) }
    var profilePhotoUrl by remember { mutableStateOf(repository.cachedProfile?.photo_url) }
    var securityPolicy by remember { mutableStateOf(SecurityPolicyDto()) }
    val deviceId = remember { sessionStore.getOrCreateDeviceId() }
    val securityReport = remember(gps, securityPolicy) {
        SecurityGuard.evaluate(context, deviceId, gps)
    }
    val securityBlockReason = remember(securityReport, securityPolicy, lang) {
        when {
            securityPolicy.anti_fake_gps_mode == "block" && securityReport.isMockLocation ->
                tr(lang, "Fake GPS / Mock Location terdeteksi. Matikan lokasi palsu untuk presensi.", "Mock Location detected. Disable Fake GPS to clock in.")
            securityPolicy.anti_fake_gps_mode == "block" && securityReport.spoofApps.isNotEmpty() ->
                tr(lang, "Aplikasi Fake GPS terdeteksi di perangkat ini.", "Fake GPS app detected on this device.")
            securityPolicy.block_rooted_devices && securityReport.isRooted ->
                tr(lang, "Perangkat terdeteksi root dan diblokir oleh kebijakan perusahaan.", "Rooted device is blocked by company security policy.")
            else -> null
        }
    }

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
        user?.employeeId?.let { empId ->
            scope.launch {
                repository.getEmployee(empId).onSuccess { emp ->
                    profilePhotoUrl = emp?.photo_url
                }
            }
        }
        scope.launch {
            repository.getPublicCompany().onSuccess { comp ->
                comp?.securityPolicy?.let { securityPolicy = it }
            }
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

        if (user?.hasGeofenceBypass() != true && geofenceReason.isNullOrBlank() && distanceToOffice != null && distanceToOffice > officeRadius) {
            geofenceReasonInput = ""
            geofencePrompt = PendingGeofencePrompt(action, photoBase64, distanceToOffice)
            return
        }

        val localDate = Formatters.localDateString()
        val localTime = Formatters.localTimeString()
        val deviceTs = "${localDate}T$localTime"

        val secPayload = ClientSecurityPayload(
            is_mock_location = securityReport.isMockLocation,
            spoof_apps = securityReport.spoofApps,
            is_rooted = securityReport.isRooted,
            device_id = securityReport.deviceId,
            device_label = securityReport.deviceLabel
        )

        if (securityBlockReason != null) {
            feedback = securityBlockReason to true
            return
        }

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
                    local_time = localTime,
                    security = secPayload
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
                    local_time = localTime,
                    security = secPayload
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

    val scrollState = rememberScrollState()
    val locale = if (lang == "id") Locale("id", "ID") else Locale.US
    val greetingText = when (currentTime.hour) {
        in 0..10 -> tr(lang, "Selamat Pagi!!", "Good Morning!!")
        in 11..14 -> tr(lang, "Selamat Siang!!", "Good Afternoon!!")
        in 15..18 -> tr(lang, "Selamat Sore!!", "Good Evening!!")
        else -> tr(lang, "Selamat Malam!!", "Good Night!!")
    }
    val weekdayText = LocalDate.now().format(DateTimeFormatter.ofPattern("EEEE", locale))
    val fullDateText = LocalDate.now().format(DateTimeFormatter.ofPattern("dd MMMM yyyy", locale))
    val inTime = effectiveTodayRecord?.clock_in_time
    val outTime = effectiveTodayRecord?.clock_out_time
    val hasClockIn = !inTime.isNullOrBlank()
    val hasClockOut = !outTime.isNullOrBlank()

    // Live elapsed timer since clock_in_time
    val elapsedText = remember(inTime, hasClockOut, currentTime) {
        if (!hasClockIn || hasClockOut || inTime == null) null
        else runCatching {
            val parts = inTime.split(":").mapNotNull { it.toIntOrNull() }
            if (parts.size >= 2) {
                val start = LocalTime.of(parts[0], parts[1], parts.getOrElse(2) { 0 })
                val diffSec = java.time.Duration.between(start, currentTime).seconds.coerceAtLeast(0)
                String.format(Locale.US, "%02d:%02d:%02d", diffSec / 3600, (diffSec % 3600) / 60, diffSec % 60)
            } else null
        }.getOrNull()
    }

    val triggerClockAction = {
        if (!dayComplete && !submitting && securityBlockReason == null) {
            haptics.performHapticFeedback(HapticFeedbackType.LongPress)
            if (gps == null) {
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
            } else if (clockAction == "in" && settings.require_selfie) {
                cameraOpen = true
            } else {
                executeClock(clockAction)
            }
        }
    }

    LaunchedEffect(scrollState.value) {
        onHeroScrollChanged(scrollState.value)
    }

    Box(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(scrollState)
                .padding(bottom = 24.dp)
        ) {
            // Colored Hero Header (transparent over MainShell shared morphing hero backdrop)
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .onSizeChanged { onHeroHeightChanged(it.height) }
                    .statusBarsPadding()
                    .padding(start = 18.dp, end = 18.dp, top = 16.dp, bottom = 58.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(48.dp)
                            .clip(CircleShape)
                            .background(palette.onHero.copy(alpha = 0.2f))
                            .border(2.dp, palette.onHero.copy(alpha = 0.45f), CircleShape)
                            .clickable { onNavigateToTab("profile") },
                        contentAlignment = Alignment.Center
                    ) {
                        if (!profilePhotoUrl.isNullOrBlank()) {
                            AsyncImage(
                                model = ImageRequest.Builder(context)
                                    .data("$baseUrl$profilePhotoUrl&token=$token")
                                    .crossfade(true)
                                    .build(),
                                contentDescription = "Profile Photo",
                                contentScale = ContentScale.Crop,
                                modifier = Modifier.fillMaxSize()
                            )
                        } else {
                            Text(
                                text = user?.name?.firstOrNull()?.uppercase() ?: "U",
                                color = palette.onHero,
                                fontWeight = FontWeight.Black,
                                fontSize = 18.sp
                            )
                        }
                    }

                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = greetingText,
                            color = palette.onHero.copy(alpha = 0.88f),
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Medium
                        )
                        Text(
                            text = user?.name ?: "-",
                            color = palette.onHero,
                            fontWeight = FontWeight.Bold,
                            fontSize = 18.sp,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }

                    IconButton(
                        onClick = {
                            loadDashboard()
                            if (hasLocationPermission) detectLocation()
                        },
                        modifier = Modifier
                            .size(40.dp)
                            .clip(CircleShape)
                            .background(palette.onHero.copy(alpha = 0.16f))
                    ) {
                        if (detectingGps) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(16.dp),
                                strokeWidth = 2.dp,
                                color = palette.onHero
                            )
                        } else {
                            Icon(
                                Icons.Default.Refresh,
                                contentDescription = "Refresh",
                                tint = palette.onHero,
                                modifier = Modifier.size(20.dp)
                            )
                        }
                    }
                }
            }

            // Overlapping Today Attendance Card (with Live GPS Map background)
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp)
                    .offset(y = (-42).dp),
                shape = RoundedCornerShape(24.dp),
                color = palette.card,
                border = BorderStroke(1.dp, palette.cardBorder),
                shadowElevation = 6.dp
            ) {
                Box(modifier = Modifier.fillMaxWidth().height(IntrinsicSize.Min)) {
                    if (gps != null) {
                        Box(modifier = Modifier.matchParentSize()) {
                            AttendanceMapView(
                                lat = gps!!.latitude,
                                lng = gps!!.longitude,
                                office = branch,
                                isVisible = isVisible,
                                recenterTrigger = recenterTrigger,
                                modifier = Modifier.fillMaxSize()
                            )
                            Box(
                                modifier = Modifier
                                    .fillMaxSize()
                                    .background(
                                        Brush.verticalGradient(
                                            listOf(
                                                palette.card.copy(alpha = 0.72f),
                                                palette.card.copy(alpha = 0.84f),
                                                palette.card.copy(alpha = 0.90f)
                                            )
                                        )
                                    )
                            )
                        }
                    }
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = weekdayText.replaceFirstChar { it.uppercase() },
                            fontWeight = FontWeight.Bold,
                            fontSize = 14.sp,
                            color = palette.textPrimary
                        )
                        Text(
                            text = fullDateText,
                            fontSize = 12.sp,
                            color = palette.textMuted,
                            fontWeight = FontWeight.Medium
                        )
                    }

                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(16.dp))
                            .background(palette.subtleSurface.copy(alpha = 0.86f))
                            .padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        // Presensi Masuk
                        Column(
                            modifier = Modifier.weight(1f),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(4.dp)
                            ) {
                                Icon(
                                    Icons.AutoMirrored.Filled.Login,
                                    contentDescription = null,
                                    tint = Color(0xFF0284C7),
                                    modifier = Modifier.size(14.dp)
                                )
                                Text(
                                    text = tr(lang, "Presensi Masuk", "Clock In"),
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = palette.textSecondary
                                )
                            }
                            if (hasClockIn) {
                                Text(
                                    text = inTime ?: "--:--",
                                    fontWeight = FontWeight.Black,
                                    fontSize = 22.sp,
                                    color = if ((effectiveTodayRecord?.late_minutes ?: 0) > 0) palette.danger else palette.textPrimary
                                )
                            } else {
                                Button(
                                    onClick = { triggerClockAction() },
                                    enabled = !submitting && securityBlockReason == null,
                                    shape = CircleShape,
                                    colors = ButtonDefaults.buttonColors(
                                        containerColor = if (gps != null) palette.accent else palette.accent.copy(alpha = 0.65f),
                                        contentColor = palette.onHero
                                    ),
                                    contentPadding = PaddingValues(horizontal = 18.dp, vertical = 6.dp),
                                    modifier = Modifier.height(38.dp).pressScale()
                                ) {
                                    if (submitting || (gps == null && detectingGps)) {
                                        CircularProgressIndicator(
                                            modifier = Modifier.size(15.dp),
                                            strokeWidth = 2.dp,
                                            color = palette.onHero
                                        )
                                        Spacer(modifier = Modifier.width(6.dp))
                                    }
                                    Text(
                                        text = when {
                                            submitting -> tr(lang, "Mengirim...", "Sending...")
                                            gps == null && detectingGps -> tr(lang, "GPS...", "GPS...")
                                            gps == null -> tr(lang, "Deteksi GPS", "Detect GPS")
                                            else -> tr(lang, "Masuk", "Clock In")
                                        },
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 12.sp
                                    )
                                }
                            }
                        }

                        Box(
                            modifier = Modifier
                                .width(1.dp)
                                .height(46.dp)
                                .background(palette.cardBorder)
                        )

                        // Presensi Keluar
                        Column(
                            modifier = Modifier.weight(1f),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(4.dp)
                            ) {
                                Icon(
                                    Icons.AutoMirrored.Filled.Logout,
                                    contentDescription = null,
                                    tint = palette.accent,
                                    modifier = Modifier.size(14.dp)
                                )
                                Text(
                                    text = tr(lang, "Presensi Keluar", "Clock Out"),
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = palette.textSecondary
                                )
                            }
                            if (hasClockOut) {
                                Text(
                                    text = outTime ?: "--:--",
                                    fontWeight = FontWeight.Black,
                                    fontSize = 22.sp,
                                    color = palette.textPrimary
                                )
                            } else if (hasClockIn) {
                                Button(
                                    onClick = { triggerClockAction() },
                                    enabled = !submitting && securityBlockReason == null,
                                    shape = CircleShape,
                                    colors = ButtonDefaults.buttonColors(
                                        containerColor = palette.accent,
                                        contentColor = palette.onHero
                                    ),
                                    contentPadding = PaddingValues(horizontal = 18.dp, vertical = 6.dp),
                                    modifier = Modifier.height(36.dp)
                                ) {
                                    Text(
                                        text = if (submitting) "..." else tr(lang, "Keluar", "Clock Out"),
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 12.sp
                                    )
                                }
                            } else {
                                Text(
                                    text = "--:--",
                                    fontWeight = FontWeight.Black,
                                    fontSize = 22.sp,
                                    color = palette.textMuted.copy(alpha = 0.5f)
                                )
                            }
                        }
                    }

                    // Live Status Chip
                    Surface(
                        shape = CircleShape,
                        color = when {
                            dayComplete || elapsedText != null || withinOffice == true -> palette.successSurface
                            else -> palette.warningSurface
                        },
                        modifier = Modifier.align(Alignment.CenterHorizontally),
                        onClick = {
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
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 14.dp, vertical = 7.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            val chipColor = when {
                                dayComplete || elapsedText != null || withinOffice == true -> palette.success
                                else -> palette.warning
                            }
                            Icon(
                                imageVector = if (elapsedText != null || dayComplete) Icons.Default.Schedule else Icons.Default.LocationOn,
                                contentDescription = null,
                                tint = chipColor,
                                modifier = Modifier.size(14.dp)
                            )
                            Text(
                                text = when {
                                    dayComplete -> tr(lang, "Presensi hari ini selesai", "Today's attendance complete")
                                    elapsedText != null -> tr(lang, "Presensi masuk $elapsedText yang lalu", "Clocked in $elapsedText ago")
                                    gps == null -> if (detectingGps) tr(lang, "Mendeteksi GPS...", "Detecting GPS...") else tr(lang, "Tap untuk deteksi GPS", "Tap to detect GPS")
                                    distanceToOffice != null -> if (withinOffice == true) {
                                        tr(lang, "Dalam radius kantor (±${distanceToOffice.roundToInt()}m)", "Inside office (±${distanceToOffice.roundToInt()}m)")
                                    } else {
                                        tr(lang, "Di luar radius (±${distanceToOffice.roundToInt()}m)", "Outside radius (±${distanceToOffice.roundToInt()}m)")
                                    }
                                    else -> tr(lang, "GPS Siap", "GPS Ready")
                                },
                                fontSize = 11.5.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = chipColor
                            )
                        }
                    }
                }
                }
            }

            // Banners
            Column(
                modifier = Modifier
                    .padding(horizontal = 16.dp)
                    .offset(y = (-24).dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                securityBlockReason?.let { reason ->
                    FeedbackBanner(message = reason, isError = true, autoDismiss = false, onDismiss = {})
                }
                feedback?.let { (msg, isErr) ->
                    FeedbackBanner(message = msg, isError = isErr, onDismiss = { feedback = null })
                }
            }

            // 4-Column 3D Isometric Quick Action Grid
            val isReviewer = (user?.role ?: "employee") in setOf("owner_admin", "manager", "finance") ||
                user?.canApproveAny() == true
            val quickItems: List<Pair<Triple<String, Color, @Composable () -> Unit>, () -> Unit>> = listOfNotNull(
                if (modules.attendance) Triple<String, Color, @Composable () -> Unit>(tr(lang, "Kehadiran", "Attendance"), Color(0xFFF97316)) { IsoAttendanceIcon(44.dp) } to { onNavigateToTab("attendance") } else null,
                if (modules.leave) Triple<String, Color, @Composable () -> Unit>(tr(lang, "Izin Cuti", "Leave"), Color(0xFF0EA5E9)) { IsoLeavePlaneIcon(44.dp) } to { onNavigateToTab("requests:LEAVE") } else null,
                if (modules.payroll) Triple<String, Color, @Composable () -> Unit>(tr(lang, "Gaji", "Payslips"), Color(0xFF65A30D)) { IsoWalletIcon(44.dp) } to { onNavigateToTab("payslips") } else null,
                Triple<String, Color, @Composable () -> Unit>(tr(lang, "Kalender", "Calendar"), Color(0xFFF43F5E)) { IsoCalendarIcon(44.dp) } to { onNavigateToTab("calendar") },
                if (modules.claims) Triple<String, Color, @Composable () -> Unit>(tr(lang, "Klaim", "Claims"), Color(0xFFF59E0B)) { IsoClaimReceiptIcon(44.dp) } to { onNavigateToTab("requests:REIMBURSEMENT") } else null,
                if (modules.shifts) Triple<String, Color, @Composable () -> Unit>(tr(lang, "Lembur", "Overtime"), Color(0xFF8B5CF6)) { IsoOvertimeIcon(44.dp) } to { onNavigateToTab("requests:OVERTIME") } else null,
                if (modules.claims) Triple<String, Color, @Composable () -> Unit>(tr(lang, "Kasbon", "Advance"), Color(0xFF10B981)) { IsoKasbonIcon(44.dp) } to { onNavigateToTab("requests:KASBON") } else null,
                if (modules.petty_cash) Triple<String, Color, @Composable () -> Unit>(tr(lang, "Petty Cash", "Petty Cash"), Color(0xFF06B6D4)) { IsoPettyCashIcon(44.dp) } to { onNavigateToTab("requests:PETTY_CASH") } else null,
                Triple<String, Color, @Composable () -> Unit>(tr(lang, "Tugas", "Tasks"), Color(0xFF6366F1)) { IsoTasksIcon(44.dp) } to { onNavigateToTab("requests:TASKS") },
                if (isReviewer) Triple<String, Color, @Composable () -> Unit>(tr(lang, "Persetujuan", "Approvals"), Color(0xFFF43F5E)) { IsoApprovalIcon(44.dp) } to { onNavigateToTab("requests:APPROVALS") } else null,
                Triple<String, Color, @Composable () -> Unit>(tr(lang, "Profil", "Profile"), Color(0xFF14B8A6)) { IsoProfileIcon(44.dp) } to { onNavigateToTab("profile") }
            )

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp)
                    .offset(y = (-12).dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                quickItems.chunked(4).forEach { rowItems ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        rowItems.forEach { (meta, action) ->
                            val (label, tint, isoIcon) = meta
                            Column(
                                modifier = Modifier.weight(1f),
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                Surface(
                                    onClick = action,
                                    shape = RoundedCornerShape(18.dp),
                                    color = tint.copy(alpha = 0.08f),
                                    modifier = Modifier.size(60.dp)
                                ) {
                                    Box(contentAlignment = Alignment.Center) {
                                        isoIcon()
                                    }
                                }
                                Spacer(modifier = Modifier.height(6.dp))
                                Text(
                                    text = label,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = palette.textPrimary,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                    textAlign = TextAlign.Center
                                )
                            }
                        }
                        repeat(4 - rowItems.size) {
                            Spacer(modifier = Modifier.weight(1f))
                        }
                    }
                }

                // Company Announcements Blog Feed (Home only)
                if (modules.announcements && announcements.isNotEmpty()) {
                    val sortedPosts = remember(announcements) {
                        announcements.sortedWith(
                            compareByDescending<AnnouncementItem> { it.pinned }
                                .thenByDescending { it.published_at }
                        )
                    }
                    val unreadCount = sortedPosts.count { !it.acknowledged }
                    Column(
                        modifier = Modifier.padding(top = 6.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = tr(lang, "Pengumuman Perusahaan", "Company Announcements"),
                                fontSize = 14.sp,
                                fontWeight = FontWeight.ExtraBold,
                                color = palette.textPrimary
                            )
                            if (unreadCount > 0) {
                                Surface(shape = RoundedCornerShape(50), color = palette.accentSurface) {
                                    Text(
                                        text = "$unreadCount ${tr(lang, "baru", "new")}",
                                        fontSize = 10.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = palette.accent,
                                        modifier = Modifier.padding(horizontal = 9.dp, vertical = 3.dp)
                                    )
                                }
                            }
                        }

                        sortedPosts.forEach { post ->
                            Surface(
                                onClick = { selectedAnnouncement = post },
                                modifier = Modifier.fillMaxWidth().pressScale(),
                                shape = RoundedCornerShape(20.dp),
                                color = palette.card,
                                border = BorderStroke(
                                    1.dp,
                                    if (post.pinned || !post.acknowledged) palette.accent.copy(alpha = 0.35f) else palette.cardBorder
                                )
                            ) {
                                Column(
                                    modifier = Modifier.padding(16.dp),
                                    verticalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                                            Surface(shape = RoundedCornerShape(50), color = palette.accentSurface) {
                                                Text(
                                                    post.category.uppercase(),
                                                    color = palette.accent,
                                                    fontSize = 9.sp,
                                                    fontWeight = FontWeight.Bold,
                                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                                                )
                                            }
                                            if (post.pinned) {
                                                Surface(shape = RoundedCornerShape(50), color = palette.warningSurface) {
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
                                        Text(
                                            text = Formatters.formatDisplayDate(post.published_at, lang),
                                            fontSize = 10.sp,
                                            color = palette.textMuted
                                        )
                                    }

                                    Text(
                                        text = post.title,
                                        fontSize = 15.sp,
                                        fontWeight = FontWeight.ExtraBold,
                                        color = palette.textPrimary,
                                        maxLines = 2,
                                        overflow = TextOverflow.Ellipsis
                                    )

                                    Text(
                                        text = post.body,
                                        fontSize = 12.5.sp,
                                        color = palette.textSecondary,
                                        lineHeight = 18.sp,
                                        maxLines = 3,
                                        overflow = TextOverflow.Ellipsis
                                    )

                                    HorizontalDivider(color = palette.cardBorder.copy(alpha = 0.6f))

                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Text(
                                            text = "${post.publisher_name ?: "HR"} · ${tr(lang, "Baca selengkapnya →", "Read more →")}",
                                            fontSize = 11.sp,
                                            fontWeight = FontWeight.SemiBold,
                                            color = palette.accent
                                        )
                                        if (post.acknowledged) {
                                            Text(
                                                text = tr(lang, "✓ Dibaca", "✓ Read"),
                                                fontSize = 10.sp,
                                                fontWeight = FontWeight.Bold,
                                                color = palette.success
                                            )
                                        } else if (post.require_ack) {
                                            Text(
                                                text = tr(lang, "Perlu konfirmasi", "Action needed"),
                                                fontSize = 10.sp,
                                                fontWeight = FontWeight.Bold,
                                                color = palette.warning
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

    var pendingFaceMismatch by remember { mutableStateOf<Pair<String, Float?>?>(null) }

    if (cameraOpen) {
        CameraCaptureDialog(
            title = tr(
                lang,
                "Presensi ${if (clockAction == "in") "Masuk" else "Keluar"}",
                "Attendance ${if (clockAction == "in") "Clock In" else "Clock Out"}"
            ),
            useFrontCamera = true,
            lang = lang,
            attendanceTime = "${LocalDate.now().format(DateTimeFormatter.ofPattern("dd/MM/yyyy"))} ${currentTime.format(DateTimeFormatter.ofPattern("HH:mm:ss"))}",
            distanceMeters = distanceToOffice,
            isOutsideOffice = withinOffice == false,
            officeName = branch?.name,
            coordsText = gps?.let { String.format(Locale.US, "%.5f, %.5f", it.latitude, it.longitude) },
            onDismiss = { cameraOpen = false },
            onCaptured = { base64 ->
                cameraOpen = false
                val enrolled = sessionStore.getFaceEmbedding(user?.employeeId)
                if (enrolled == null) {
                    executeClock(clockAction, photoBase64 = base64)
                } else {
                    scope.launch {
                        when (val result = FaceRecognizer.extractFromDataUrl(context, base64)) {
                            is FaceExtractResult.Success -> {
                                val sim = FaceMath.cosineSimilarity(enrolled, result.embedding)
                                if (sim >= FaceMath.DEFAULT_MATCH_THRESHOLD) {
                                    executeClock(clockAction, photoBase64 = base64)
                                } else {
                                    pendingFaceMismatch = base64 to sim
                                }
                            }
                            is FaceExtractResult.NoFace,
                            is FaceExtractResult.Error -> {
                                pendingFaceMismatch = base64 to null
                            }
                        }
                    }
                }
            }
        )
    }

    pendingFaceMismatch?.let { (capturedBase64, score) ->
        AlertDialog(
            onDismissRequest = { pendingFaceMismatch = null },
            title = {
                Text(
                    tr(lang, "Verifikasi Wajah (Opsional)", "Face Check (Optional)"),
                    fontWeight = FontWeight.Bold
                )
            },
            text = {
                Text(
                    text = if (score != null) {
                        tr(
                            lang,
                            "Kemiripan wajah ${(score * 100).roundToInt()}% (di bawah ${(FaceMath.DEFAULT_MATCH_THRESHOLD * 100).roundToInt()}%). Anda tetap dapat melanjutkan presensi.",
                            "Face similarity is ${(score * 100).roundToInt()}% (below ${(FaceMath.DEFAULT_MATCH_THRESHOLD * 100).roundToInt()}%). You can still continue."
                        )
                    } else {
                        tr(
                            lang,
                            "Wajah tidak terdeteksi jelas pada foto. Anda tetap dapat melanjutkan presensi.",
                            "Face was not clearly detected in the photo. You can still continue."
                        )
                    },
                    fontSize = 13.sp,
                    color = palette.textSecondary
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        pendingFaceMismatch = null
                        executeClock(clockAction, photoBase64 = capturedBase64)
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = palette.accent, contentColor = palette.onHero)
                ) {
                    Text(tr(lang, "Tetap Lanjutkan", "Continue Anyway"))
                }
            },
            dismissButton = {
                TextButton(
                    onClick = {
                        pendingFaceMismatch = null
                        cameraOpen = true
                    }
                ) {
                    Text(tr(lang, "Foto Ulang", "Retake"))
                }
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

    selectedAnnouncement?.let { item ->
        val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        ModalBottomSheet(
            onDismissRequest = { selectedAnnouncement = null },
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
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Surface(shape = RoundedCornerShape(50), color = palette.accentSurface) {
                        Text(
                            item.category.uppercase(),
                            color = palette.accent,
                            fontSize = 9.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                        )
                    }
                    if (item.pinned) {
                        Surface(shape = RoundedCornerShape(50), color = palette.warningSurface) {
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

                Text(
                    text = item.title,
                    fontWeight = FontWeight.ExtraBold,
                    fontSize = 19.sp,
                    color = palette.textPrimary
                )

                Text(
                    text = "${item.publisher_name ?: "HR"} · ${Formatters.formatDisplayDate(item.published_at, lang)}",
                    fontSize = 11.sp,
                    color = palette.textMuted
                )

                HorizontalDivider(color = palette.cardBorder)

                Text(
                    text = item.body,
                    fontSize = 13.5.sp,
                    color = palette.textSecondary,
                    lineHeight = 20.sp
                )

                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxWidth().padding(top = 4.dp)
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
                            shape = RoundedCornerShape(12.dp),
                            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
                        ) {
                            Icon(Icons.Default.AttachFile, contentDescription = null, modifier = Modifier.size(14.dp))
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(item.attachment_name ?: tr(lang, "Lampiran", "Attachment"), fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                    }

                    if (!item.acknowledged) {
                        Button(
                            onClick = {
                                scope.launch {
                                    repository.acknowledgeAnnouncement(item.id).onSuccess {
                                        announcements = announcements.map {
                                            if (it.id == item.id) it.copy(acknowledged = true) else it
                                        }
                                        selectedAnnouncement = item.copy(acknowledged = true)
                                    }
                                }
                            },
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = palette.accent, contentColor = palette.onHero)
                        ) {
                            Text(
                                if (item.require_ack) tr(lang, "Konfirmasi Sudah Membaca", "Acknowledge")
                                else tr(lang, "Tandai Sudah Dibaca", "Mark as Read"),
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    } else {
                        Surface(shape = RoundedCornerShape(12.dp), color = palette.successSurface) {
                            Text(
                                text = tr(lang, "✓ Sudah Dibaca", "✓ Acknowledged"),
                                color = palette.success,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp)
                            )
                        }
                    }
                }
            }
        }
    }
}
