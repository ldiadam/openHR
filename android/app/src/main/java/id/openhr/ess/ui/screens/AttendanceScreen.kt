package id.openhr.ess.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Assignment
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.ImageLoader
import coil.compose.AsyncImage
import coil.request.ImageRequest
import id.openhr.ess.data.local.SessionStore
import id.openhr.ess.data.model.AttendanceCorrectionRequest
import id.openhr.ess.data.model.AttendanceHistoryRecord
import id.openhr.ess.data.model.AttendanceSummary
import id.openhr.ess.data.model.RosterItem
import id.openhr.ess.data.remote.ApiClient
import id.openhr.ess.data.repository.EssRepository
import id.openhr.ess.ui.components.AppDatePickerDialog
import id.openhr.ess.ui.components.AppTimePickerDialog
import id.openhr.ess.ui.components.FeedbackBanner
import id.openhr.ess.ui.components.ListSkeletonCards
import id.openhr.ess.ui.components.StatusPill
import id.openhr.ess.ui.components.pressScale
import id.openhr.ess.ui.components.tr
import id.openhr.ess.ui.theme.LocalEssPalette
import id.openhr.ess.util.Formatters
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.TextStyle as JavaTextStyle
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AttendanceScreen(
    repository: EssRepository,
    sessionStore: SessionStore,
    apiClient: ApiClient,
    onNavigateToRequests: () -> Unit = {}
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val palette = LocalEssPalette.current
    val lang by sessionStore.langFlow.collectAsState()
    val user by sessionStore.userFlow.collectAsState()
    val baseUrl by sessionStore.baseUrlFlow.collectAsState()
    val token by sessionStore.tokenFlow.collectAsState()

    var showRosterSheet by remember { mutableStateOf(false) }
    var rosterWeekStart by remember { mutableStateOf(LocalDate.now().with(java.time.DayOfWeek.MONDAY)) }
    var rosterList by remember { mutableStateOf<List<RosterItem>>(emptyList()) }
    var rosterLoading by remember { mutableStateOf(false) }

    var selectedMonth by remember { mutableStateOf(YearMonth.now()) }
    val initialMonthKey = remember { Formatters.localMonthString(selectedMonth) }
    val initialCached = remember { repository.getCachedMyAttendance(initialMonthKey) }
    var records by remember { mutableStateOf(initialCached?.records ?: emptyList()) }
    var summary by remember { mutableStateOf(initialCached?.summary ?: AttendanceSummary()) }
    var loading by remember { mutableStateOf(initialCached == null) }
    var refreshing by remember { mutableStateOf(false) }
    var feedback by remember { mutableStateOf<Pair<String, Boolean>?>(null) }

    var showCorrectionSheet by remember { mutableStateOf(false) }
    var corrDate by remember { mutableStateOf(Formatters.localDateString()) }
    var corrIn by remember { mutableStateOf("08:30") }
    var corrOut by remember { mutableStateOf("17:30") }
    var corrReason by remember { mutableStateOf("") }
    var submittingCorr by remember { mutableStateOf(false) }

    var showDatePicker by remember { mutableStateOf(false) }
    var activeTimeTarget by remember { mutableStateOf<String?>(null) } // "in" or "out"
    var previewPhotoUrl by remember { mutableStateOf<String?>(null) }

    val imageLoader = remember(apiClient.okHttpClient) {
        ImageLoader.Builder(context)
            .okHttpClient(apiClient.okHttpClient)
            .build()
    }

    fun loadMonth(ym: YearMonth, isPullRefresh: Boolean = false) {
        val monthKey = Formatters.localMonthString(ym)
        val cached = repository.getCachedMyAttendance(monthKey)
        if (isPullRefresh) {
            refreshing = true
        } else if (cached != null) {
            records = cached.records
            summary = cached.summary
            loading = false
        } else {
            loading = true
        }
        scope.launch {
            repository.getMyAttendance(monthKey)
                .onSuccess { res ->
                    records = res.records
                    summary = res.summary
                }
                .onFailure { err ->
                    if (cached == null || isPullRefresh) {
                        feedback = (err.message ?: tr(lang, "Gagal memuat presensi", "Failed to load attendance")) to true
                    }
                }
            loading = false
            refreshing = false
        }
    }

    LaunchedEffect(selectedMonth) {
        loadMonth(selectedMonth)
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(palette.canvas)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // Header + Month Picker Pill
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    tr(lang, "Riwayat Presensi", "Attendance History"),
                    style = MaterialTheme.typography.titleLarge,
                    color = palette.textPrimary
                )
                Text(
                    tr(lang, "Rekap jam kerja & status bulanan", "Monthly work hours & status"),
                    style = MaterialTheme.typography.bodySmall,
                    color = palette.textSecondary
                )
            }
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .clip(RoundedCornerShape(14.dp))
                    .background(palette.card)
                    .border(1.dp, palette.cardBorder, RoundedCornerShape(14.dp))
            ) {
                IconButton(onClick = { selectedMonth = selectedMonth.minusMonths(1) }, modifier = Modifier.size(34.dp)) {
                    Icon(Icons.Default.ChevronLeft, contentDescription = "Previous month", tint = palette.textPrimary)
                }
                Text(
                    text = Formatters.formatMonthLabel(Formatters.localMonthString(selectedMonth), lang),
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    color = palette.textPrimary,
                    modifier = Modifier.padding(horizontal = 4.dp)
                )
                IconButton(onClick = { selectedMonth = selectedMonth.plusMonths(1) }, modifier = Modifier.size(34.dp)) {
                    Icon(Icons.Default.ChevronRight, contentDescription = "Next month", tint = palette.textPrimary)
                }
            }
        }

        feedback?.let { (msg, isErr) ->
            FeedbackBanner(message = msg, isError = isErr, onDismiss = { feedback = null })
        }

        // Summary 3 Metric Tiles
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            SummaryStatTile(
                label = tr(lang, "Hadir Tepat", "On Time"),
                value = summary.present.toString(),
                icon = Icons.Default.CheckCircle,
                tint = palette.success,
                surface = palette.successSurface,
                modifier = Modifier.weight(1f)
            )
            SummaryStatTile(
                label = tr(lang, "Terlambat", "Late"),
                value = summary.late.toString(),
                icon = Icons.Default.Schedule,
                tint = palette.warning,
                surface = palette.warningSurface,
                modifier = Modifier.weight(1f)
            )
            SummaryStatTile(
                label = tr(lang, "Total Telat", "Total Late"),
                value = "${summary.totalLateMinutes}m",
                icon = Icons.Default.Timer,
                tint = palette.accent,
                surface = palette.accentSurface,
                modifier = Modifier.weight(1f)
            )
        }

        // Action Bar: Request Correction + Shift Roster + Requests Shortcut
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            FilledTonalButton(
                onClick = {
                    corrDate = Formatters.localDateString()
                    corrIn = "08:30"
                    corrOut = "17:30"
                    showCorrectionSheet = true
                },
                modifier = Modifier
                    .weight(1f)
                    .height(42.dp)
                    .pressScale(),
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.filledTonalButtonColors(
                    containerColor = palette.accentSurface,
                    contentColor = palette.accent
                )
            ) {
                Icon(Icons.Default.EditCalendar, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    tr(lang, "Koreksi", "Correction"),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }

            Surface(
                onClick = { showRosterSheet = true },
                shape = RoundedCornerShape(14.dp),
                color = palette.card,
                border = BorderStroke(1.dp, palette.cardBorder),
                modifier = Modifier.height(42.dp).pressScale()
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(5.dp)
                ) {
                    Icon(
                        Icons.Default.DateRange,
                        contentDescription = null,
                        tint = palette.accent,
                        modifier = Modifier.size(16.dp)
                    )
                    Text(
                        tr(lang, "Jadwal Shift", "Shifts"),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = palette.textPrimary
                    )
                }
            }

            Surface(
                onClick = onNavigateToRequests,
                shape = RoundedCornerShape(14.dp),
                color = palette.card,
                border = BorderStroke(1.dp, palette.cardBorder),
                modifier = Modifier.height(42.dp).pressScale()
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(5.dp)
                ) {
                    Icon(
                        Icons.AutoMirrored.Filled.Assignment,
                        contentDescription = null,
                        tint = palette.textSecondary,
                        modifier = Modifier.size(16.dp)
                    )
                    Text(
                        tr(lang, "Izin", "Leave"),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = palette.textPrimary
                    )
                }
            }
        }

        PullToRefreshBox(
            isRefreshing = refreshing,
            onRefresh = { loadMonth(selectedMonth, isPullRefresh = true) },
            modifier = Modifier.weight(1f)
        ) {
            if (loading) {
                ListSkeletonCards(count = 4)
            } else if (records.isEmpty()) {
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(18.dp),
                    color = palette.card,
                    border = BorderStroke(1.dp, palette.cardBorder)
                ) {
                    Column(
                        modifier = Modifier.padding(28.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Icon(
                            Icons.Default.EventBusy,
                            contentDescription = null,
                            tint = palette.textMuted,
                            modifier = Modifier.size(28.dp)
                        )
                        Text(
                            text = tr(lang, "Belum ada catatan presensi pada bulan ini.", "No attendance records this month."),
                            color = palette.textSecondary,
                            fontSize = 12.sp
                        )
                    }
                }
            } else {
                val todayStr = remember { Formatters.localDateString() }
                LazyColumn(
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                    contentPadding = PaddingValues(bottom = 16.dp),
                    modifier = Modifier.fillMaxSize()
                ) {
                    items(records, key = { it.id }, contentType = { "attendance_row" }) { rec ->
                        AttendanceTimelineCard(
                            rec = rec,
                            todayStr = todayStr,
                            lang = lang,
                            baseUrl = baseUrl,
                            token = token,
                            imageLoader = imageLoader,
                            onPreviewPhoto = { previewPhotoUrl = it },
                            onRequestMissingOutCorrection = {
                                corrDate = rec.date.take(10)
                                corrIn = rec.clock_in_time?.take(5) ?: "08:30"
                                corrOut = "17:30"
                                corrReason = tr(lang, "Lupa absen pulang", "Forgot to clock out")
                                showCorrectionSheet = true
                            }
                        )
                    }
                }
            }
        }
    }

    if (showCorrectionSheet) {
        val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        ModalBottomSheet(
            onDismissRequest = { showCorrectionSheet = false },
            sheetState = sheetState,
            containerColor = palette.card,
            contentColor = palette.textPrimary,
            shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .navigationBarsPadding()
                    .imePadding()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 20.dp)
                    .padding(bottom = 24.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(
                        tr(lang, "Koreksi Presensi", "Attendance Correction"),
                        fontWeight = FontWeight.ExtraBold,
                        fontSize = 18.sp,
                        color = palette.textPrimary
                    )
                    Text(
                        tr(lang, "Pilih tanggal dan jam koreksi tanpa perlu mengetik manual.", "Tap to pick date and correction times."),
                        fontSize = 12.sp,
                        color = palette.textSecondary
                    )
                }

                // Native Date Picker Row
                PickerFieldRow(
                    label = tr(lang, "Tanggal Presensi", "Attendance Date"),
                    value = Formatters.formatDisplayDate(corrDate, lang),
                    subValue = corrDate,
                    icon = Icons.Default.CalendarToday,
                    onClick = { showDatePicker = true }
                )

                // Native Time Picker Pair
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    PickerFieldRow(
                        label = tr(lang, "Jam Masuk", "Clock In"),
                        value = corrIn,
                        icon = Icons.Default.Login,
                        modifier = Modifier.weight(1f),
                        onClick = { activeTimeTarget = "in" }
                    )
                    PickerFieldRow(
                        label = tr(lang, "Jam Pulang", "Clock Out"),
                        value = corrOut,
                        icon = Icons.Default.Logout,
                        modifier = Modifier.weight(1f),
                        onClick = { activeTimeTarget = "out" }
                    )
                }

                OutlinedTextField(
                    value = corrReason,
                    onValueChange = { corrReason = it },
                    label = { Text(tr(lang, "Alasan koreksi *", "Reason *")) },
                    placeholder = { Text(tr(lang, "Contoh: Lupa tap pulang / kendala sinyal", "e.g. Forgot clock-out / weak signal")) },
                    minLines = 2,
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier.fillMaxWidth()
                )

                Button(
                    enabled = !submittingCorr && corrDate.isNotBlank() && corrReason.isNotBlank(),
                    onClick = {
                        scope.launch {
                            submittingCorr = true
                            repository.requestAttendanceCorrection(
                                AttendanceCorrectionRequest(
                                    date = corrDate.trim(),
                                    requested_clock_in = corrIn.trim().ifBlank { null },
                                    requested_clock_out = corrOut.trim().ifBlank { null },
                                    reason = corrReason.trim()
                                )
                            ).onSuccess { msg ->
                                feedback = msg to false
                                showCorrectionSheet = false
                                corrReason = ""
                            }.onFailure { err ->
                                feedback = (err.message ?: tr(lang, "Gagal mengirim koreksi", "Failed to submit correction")) to true
                            }
                            submittingCorr = false
                        }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp)
                        .pressScale(),
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = palette.accent, contentColor = Color.White)
                ) {
                    Text(
                        if (submittingCorr) tr(lang, "Mengirim...", "Submitting...")
                        else tr(lang, "Kirim Pengajuan Koreksi", "Submit Correction"),
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }
    }

    if (showDatePicker) {
        AppDatePickerDialog(
            initialDate = corrDate,
            lang = lang,
            onDismiss = { showDatePicker = false },
            onConfirm = { picked ->
                corrDate = picked
                showDatePicker = false
            }
        )
    }

    activeTimeTarget?.let { target ->
        AppTimePickerDialog(
            initialTime = if (target == "in") corrIn else corrOut,
            title = if (target == "in") tr(lang, "Pilih Jam Masuk", "Select Clock-In Time")
            else tr(lang, "Pilih Jam Pulang", "Select Clock-Out Time"),
            lang = lang,
            onDismiss = { activeTimeTarget = null },
            onConfirm = { picked ->
                if (target == "in") corrIn = picked else corrOut = picked
                activeTimeTarget = null
            }
        )
    }

    previewPhotoUrl?.let { url ->
        AlertDialog(
            onDismissRequest = { previewPhotoUrl = null },
            containerColor = palette.card,
            title = { Text(tr(lang, "Foto Presensi", "Attendance Photo"), fontWeight = FontWeight.Bold, color = palette.textPrimary) },
            text = {
                AsyncImage(
                    model = ImageRequest.Builder(context).data(url).crossfade(true).build(),
                    imageLoader = imageLoader,
                    contentDescription = "Attendance Photo",
                    contentScale = ContentScale.Fit,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(320.dp)
                        .clip(RoundedCornerShape(14.dp))
                        .background(Color.Black)
                )
            },
            confirmButton = {
                TextButton(onClick = { previewPhotoUrl = null }) {
                    Text(tr(lang, "Tutup", "Close"))
                }
            }
        )
    }

    if (showRosterSheet) {
        LaunchedEffect(showRosterSheet, rosterWeekStart) {
            rosterLoading = true
            val end = rosterWeekStart.plusDays(6)
            repository.getShiftRoster(rosterWeekStart.toString(), end.toString())
                .onSuccess { list ->
                    val myId = user?.employeeId
                    rosterList = if (!myId.isNullOrBlank()) list.filter { it.employee_id == myId } else list
                }
            rosterLoading = false
        }

        val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        ModalBottomSheet(
            onDismissRequest = { showRosterSheet = false },
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
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        tr(lang, "Jadwal Shift Mingguan", "Weekly Shift Schedule"),
                        fontWeight = FontWeight.ExtraBold,
                        fontSize = 18.sp,
                        color = palette.textPrimary
                    )
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        IconButton(onClick = { rosterWeekStart = rosterWeekStart.minusWeeks(1) }, modifier = Modifier.size(32.dp)) {
                            Icon(Icons.Default.ChevronLeft, contentDescription = "Prev week")
                        }
                        IconButton(onClick = { rosterWeekStart = rosterWeekStart.plusWeeks(1) }, modifier = Modifier.size(32.dp)) {
                            Icon(Icons.Default.ChevronRight, contentDescription = "Next week")
                        }
                    }
                }
                Text(
                    "${Formatters.formatDisplayDate(rosterWeekStart.toString(), lang)} – ${Formatters.formatDisplayDate(rosterWeekStart.plusDays(6).toString(), lang)}",
                    fontSize = 12.sp,
                    color = palette.textSecondary
                )

                if (rosterLoading) {
                    ListSkeletonCards(count = 3)
                } else {
                    val byDate = rosterList.associateBy { it.date.take(10) }
                    val locale = if (lang == "id") Locale("id", "ID") else Locale.US
                    (0..6).forEach { offset ->
                        val day = rosterWeekStart.plusDays(offset.toLong())
                        val item = byDate[day.toString()]
                        Surface(
                            shape = RoundedCornerShape(14.dp),
                            color = palette.subtleSurface,
                            border = BorderStroke(1.dp, palette.cardBorder),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column {
                                    Text(
                                        day.dayOfWeek.getDisplayName(JavaTextStyle.FULL, locale),
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 13.sp,
                                        color = palette.textPrimary
                                    )
                                    Text(Formatters.formatDisplayDate(day.toString(), lang), fontSize = 11.sp, color = palette.textMuted)
                                }
                                if (item == null) {
                                    Text(tr(lang, "Default Shift", "Default Shift"), fontSize = 11.sp, color = palette.textSecondary)
                                } else if (item.is_off) {
                                    Surface(shape = RoundedCornerShape(50), color = palette.warningSurface) {
                                        Text(
                                            tr(lang, "Libur", "Day Off"),
                                            color = palette.warning,
                                            fontSize = 11.sp,
                                            fontWeight = FontWeight.Bold,
                                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
                                        )
                                    }
                                } else {
                                    Column(horizontalAlignment = Alignment.End) {
                                        Text(item.shift_name ?: "Shift", fontWeight = FontWeight.Bold, fontSize = 12.sp, color = palette.accent)
                                        Text(
                                            "${item.start_time ?: "08:30"} – ${item.end_time ?: "17:30"}",
                                            fontSize = 11.sp,
                                            color = palette.textSecondary,
                                            style = TextStyle(fontFeatureSettings = "tnum")
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

@Composable
private fun SummaryStatTile(
    label: String,
    value: String,
    icon: ImageVector,
    tint: Color,
    surface: Color,
    modifier: Modifier = Modifier
) {
    val palette = LocalEssPalette.current
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(16.dp),
        color = palette.card,
        border = BorderStroke(1.dp, palette.cardBorder),
        shadowElevation = 0.dp
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(26.dp)
                    .clip(CircleShape)
                    .background(surface),
                contentAlignment = Alignment.Center
            ) {
                Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(14.dp))
            }
            Column {
                Text(
                    value,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Black,
                    color = palette.textPrimary,
                    style = TextStyle(fontFeatureSettings = "tnum")
                )
                Text(
                    label,
                    fontSize = 10.sp,
                    color = palette.textSecondary,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
    }
}

@Composable
private fun AttendanceTimelineCard(
    rec: AttendanceHistoryRecord,
    todayStr: String,
    lang: String,
    baseUrl: String,
    token: String?,
    imageLoader: ImageLoader,
    onPreviewPhoto: (String) -> Unit,
    onRequestMissingOutCorrection: () -> Unit
) {
    val palette = LocalEssPalette.current
    val context = LocalContext.current
    val parsedDate = remember(rec.date) {
        runCatching { LocalDate.parse(rec.date.take(10)) }.getOrNull()
    }
    val dayNumber = remember(parsedDate) {
        parsedDate?.dayOfMonth?.toString()?.padStart(2, '0') ?: rec.date.takeLast(2)
    }
    val monthShort = remember(parsedDate, lang) {
        val locale = if (lang == "id") Locale("id", "ID") else Locale.US
        parsedDate?.month?.getDisplayName(JavaTextStyle.SHORT, locale)?.uppercase() ?: ""
    }
    val weekdayName = remember(parsedDate, lang) {
        val locale = if (lang == "id") Locale("id", "ID") else Locale.US
        parsedDate?.dayOfWeek?.getDisplayName(JavaTextStyle.FULL, locale) ?: rec.date
    }

    val workText = remember(rec.actual_work_minutes, lang) {
        if (rec.actual_work_minutes > 0) {
            val h = rec.actual_work_minutes / 60
            val m = rec.actual_work_minutes % 60
            if (lang == "id") "${h}j ${m}m" else "${h}h ${m}m"
        } else null
    }

    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        color = palette.card,
        border = BorderStroke(1.dp, palette.cardBorder),
        shadowElevation = 0.dp
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            // Top Row: Date Badge + Status Pill + Work Duration
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Column(
                    modifier = Modifier
                        .size(width = 44.dp, height = 44.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(palette.subtleSurface)
                        .border(1.dp, palette.cardBorder, RoundedCornerShape(12.dp)),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center
                ) {
                    Text(
                        dayNumber,
                        fontWeight = FontWeight.Black,
                        fontSize = 15.sp,
                        color = palette.textPrimary,
                        style = TextStyle(fontFeatureSettings = "tnum")
                    )
                    Text(
                        monthShort,
                        fontWeight = FontWeight.Bold,
                        fontSize = 9.sp,
                        color = palette.accent,
                        letterSpacing = 0.5.sp
                    )
                }

                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        weekdayName,
                        fontWeight = FontWeight.Bold,
                        fontSize = 13.sp,
                        color = palette.textPrimary
                    )
                    if (workText != null) {
                        Text(
                            "${tr(lang, "Durasi kerja", "Worked")}: $workText",
                            fontSize = 11.sp,
                            color = palette.textSecondary,
                            style = TextStyle(fontFeatureSettings = "tnum")
                        )
                    } else {
                        Text(rec.date.take(10), fontSize = 11.sp, color = palette.textMuted)
                    }
                }

                StatusPill(status = rec.status, lang = lang, lateMinutes = rec.late_minutes)
            }

            // Timeline Masuk -> Pulang Bar
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(palette.subtleSurface)
                    .padding(horizontal = 12.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Box(
                        modifier = Modifier
                            .size(8.dp)
                            .clip(CircleShape)
                            .background(if (rec.clock_in_time != null) palette.success else palette.textMuted)
                    )
                    Column {
                        Text(tr(lang, "MASUK", "CLOCK IN"), fontSize = 9.sp, fontWeight = FontWeight.Bold, color = palette.textMuted)
                        Text(
                            rec.clock_in_time?.take(5) ?: "--:--",
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.Bold,
                            fontSize = 14.sp,
                            color = palette.textPrimary,
                            style = TextStyle(fontFeatureSettings = "tnum")
                        )
                    }
                }

                Icon(Icons.Default.ArrowForward, contentDescription = null, tint = palette.textMuted, modifier = Modifier.size(16.dp))

                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Column(horizontalAlignment = Alignment.End) {
                        Text(tr(lang, "PULANG", "CLOCK OUT"), fontSize = 9.sp, fontWeight = FontWeight.Bold, color = palette.textMuted)
                        Text(
                            rec.clock_out_time?.take(5) ?: "--:--",
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.Bold,
                            fontSize = 14.sp,
                            color = palette.textPrimary,
                            style = TextStyle(fontFeatureSettings = "tnum")
                        )
                    }
                    Box(
                        modifier = Modifier
                            .size(8.dp)
                            .clip(CircleShape)
                            .background(if (rec.clock_out_time != null) palette.accent else palette.textMuted)
                    )
                }
            }

            // Missing Clock Out Shortcut
            if (!rec.clock_in_time.isNullOrBlank() && rec.clock_out_time.isNullOrBlank() && rec.date < todayStr) {
                Surface(
                    onClick = onRequestMissingOutCorrection,
                    shape = RoundedCornerShape(10.dp),
                    color = palette.warningSurface,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 7.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            modifier = Modifier.weight(1f)
                        ) {
                            Icon(Icons.Default.WarningAmber, contentDescription = null, tint = palette.warning, modifier = Modifier.size(14.dp))
                            Text(
                                text = tr(lang, "Pulang belum tercatat · Ajukan Koreksi", "Missing clock-out · Fix Now"),
                                color = palette.warning,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                        Icon(Icons.Default.ChevronRight, contentDescription = null, tint = palette.warning, modifier = Modifier.size(16.dp))
                    }
                }
            }

            if (rec.is_offline_sync == 1) {
                Text(
                    text = tr(lang, "● Disinkron dari mode offline", "● Synced from offline mode"),
                    color = palette.warning,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Medium
                )
            }

            // Inline Photo Thumbnails
            if (!rec.clock_in_photo_key.isNullOrBlank() || !rec.clock_out_photo_key.isNullOrBlank()) {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    if (!rec.clock_in_photo_key.isNullOrBlank()) {
                        val url = "$baseUrl/api/attendance/${rec.id}/photo?type=in&token=$token"
                        PhotoThumbChip(
                            label = tr(lang, "Foto Masuk", "In Photo"),
                            url = url,
                            imageLoader = imageLoader,
                            onClick = { onPreviewPhoto(url) }
                        )
                    }
                    if (!rec.clock_out_photo_key.isNullOrBlank()) {
                        val url = "$baseUrl/api/attendance/${rec.id}/photo?type=out&token=$token"
                        PhotoThumbChip(
                            label = tr(lang, "Foto Pulang", "Out Photo"),
                            url = url,
                            imageLoader = imageLoader,
                            onClick = { onPreviewPhoto(url) }
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun PhotoThumbChip(
    label: String,
    url: String,
    imageLoader: ImageLoader,
    onClick: () -> Unit
) {
    val palette = LocalEssPalette.current
    val context = LocalContext.current
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(10.dp),
        color = palette.subtleSurface,
        border = BorderStroke(1.dp, palette.cardBorder)
    ) {
        Row(
            modifier = Modifier.padding(4.dp).padding(end = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            AsyncImage(
                model = ImageRequest.Builder(context).data(url).crossfade(true).build(),
                imageLoader = imageLoader,
                contentDescription = label,
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .size(28.dp)
                    .clip(RoundedCornerShape(7.dp))
                    .background(palette.cardBorder)
            )
            Text(label, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = palette.accent)
        }
    }
}

@Composable
private fun PickerFieldRow(
    label: String,
    value: String,
    icon: ImageVector,
    modifier: Modifier = Modifier,
    subValue: String? = null,
    onClick: () -> Unit
) {
    val palette = LocalEssPalette.current
    Surface(
        onClick = onClick,
        modifier = modifier,
        shape = RoundedCornerShape(14.dp),
        color = palette.subtleSurface,
        border = BorderStroke(1.dp, palette.cardBorder)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Icon(icon, contentDescription = null, tint = palette.accent, modifier = Modifier.size(18.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(label, fontSize = 10.sp, color = palette.textSecondary, fontWeight = FontWeight.SemiBold)
                Text(
                    value,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                    color = palette.textPrimary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                if (subValue != null && subValue != value) {
                    Text(subValue, fontSize = 10.sp, color = palette.textMuted)
                }
            }
        }
    }
}
