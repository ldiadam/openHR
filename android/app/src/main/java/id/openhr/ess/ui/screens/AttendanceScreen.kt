package id.openhr.ess.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddCircleOutline
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material.icons.filled.WarningAmber
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.ImageLoader
import coil.compose.AsyncImage
import coil.request.ImageRequest
import id.openhr.ess.data.local.SessionStore
import id.openhr.ess.data.model.AttendanceCorrectionRequest
import id.openhr.ess.data.model.AttendanceHistoryRecord
import id.openhr.ess.data.model.AttendanceSummary
import id.openhr.ess.data.remote.ApiClient
import id.openhr.ess.data.repository.EssRepository
import id.openhr.ess.ui.components.FeedbackBanner
import id.openhr.ess.ui.components.StatusPill
import id.openhr.ess.ui.components.tr
import id.openhr.ess.ui.theme.*
import id.openhr.ess.util.Formatters
import kotlinx.coroutines.launch
import java.time.YearMonth

@Composable
fun AttendanceScreen(
    repository: EssRepository,
    sessionStore: SessionStore,
    apiClient: ApiClient
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val lang by sessionStore.langFlow.collectAsState()
    val baseUrl by sessionStore.baseUrlFlow.collectAsState()
    val token by sessionStore.tokenFlow.collectAsState()

    var selectedMonth by remember { mutableStateOf(YearMonth.now()) }
    var records by remember { mutableStateOf<List<AttendanceHistoryRecord>>(emptyList()) }
    var summary by remember { mutableStateOf(AttendanceSummary()) }
    var loading by remember { mutableStateOf(true) }
    var feedback by remember { mutableStateOf<Pair<String, Boolean>?>(null) }

    var showCorrectionDialog by remember { mutableStateOf(false) }
    var corrDate by remember { mutableStateOf(Formatters.localDateString()) }
    var corrIn by remember { mutableStateOf("08:30") }
    var corrOut by remember { mutableStateOf("17:30") }
    var corrReason by remember { mutableStateOf("") }
    var submittingCorr by remember { mutableStateOf(false) }

    var previewPhotoUrl by remember { mutableStateOf<String?>(null) }

    val imageLoader = remember(apiClient.okHttpClient) {
        ImageLoader.Builder(context)
            .okHttpClient(apiClient.okHttpClient)
            .build()
    }

    fun loadMonth(ym: YearMonth) {
        scope.launch {
            loading = true
            repository.getMyAttendance(Formatters.localMonthString(ym))
                .onSuccess { res ->
                    records = res.records
                    summary = res.summary
                }
                .onFailure { err ->
                    feedback = (err.message ?: tr(lang, "Gagal memuat presensi", "Failed to load attendance")) to true
                }
            loading = false
        }
    }

    LaunchedEffect(selectedMonth) {
        loadMonth(selectedMonth)
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // Header + Month Picker
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(tr(lang, "Riwayat Presensi", "Attendance History"), style = MaterialTheme.typography.titleLarge)
                Text(
                    tr(lang, "Rekap jam kerja & status bulanan", "Monthly work hours & status"),
                    style = MaterialTheme.typography.bodySmall
                )
            }
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .clip(RoundedCornerShape(12.dp))
                    .background(Color.White)
                    .border(1.dp, Slate200, RoundedCornerShape(12.dp))
            ) {
                IconButton(onClick = { selectedMonth = selectedMonth.minusMonths(1) }, modifier = Modifier.size(34.dp)) {
                    Icon(Icons.Default.ChevronLeft, contentDescription = "Previous month")
                }
                Text(
                    text = Formatters.formatMonthLabel(Formatters.localMonthString(selectedMonth), lang),
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    color = Slate900,
                    modifier = Modifier.padding(horizontal = 4.dp)
                )
                IconButton(onClick = { selectedMonth = selectedMonth.plusMonths(1) }, modifier = Modifier.size(34.dp)) {
                    Icon(Icons.Default.ChevronRight, contentDescription = "Next month")
                }
            }
        }

        feedback?.let { (msg, isErr) ->
            FeedbackBanner(message = msg, isError = isErr, onDismiss = { feedback = null })
        }

        // Summary 3 cards
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            SummaryStatCard(
                label = tr(lang, "Hadir Tepat", "On Time"),
                value = summary.present.toString(),
                valueColor = Emerald600,
                modifier = Modifier.weight(1f)
            )
            SummaryStatCard(
                label = tr(lang, "Terlambat", "Late"),
                value = summary.late.toString(),
                valueColor = Amber600,
                modifier = Modifier.weight(1f)
            )
            SummaryStatCard(
                label = tr(lang, "Total Telat", "Total Late"),
                value = "${summary.totalLateMinutes}m",
                valueColor = Slate900,
                modifier = Modifier.weight(1f)
            )
        }

        OutlinedButton(
            onClick = { showCorrectionDialog = true },
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(14.dp)
        ) {
            Icon(Icons.Default.AddCircleOutline, contentDescription = null, modifier = Modifier.size(16.dp))
            Spacer(modifier = Modifier.width(8.dp))
            Text(tr(lang, "Ajukan Koreksi Presensi", "Request Attendance Correction"), fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
        }

        if (loading) {
            Box(modifier = Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        } else if (records.isEmpty()) {
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(18.dp),
                color = Color.White
            ) {
                Text(
                    text = tr(lang, "Belum ada catatan presensi pada bulan ini.", "No attendance records this month."),
                    color = Slate500,
                    fontSize = 12.sp,
                    modifier = Modifier.padding(28.dp)
                )
            }
        } else {
            val todayStr = Formatters.localDateString()
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(10.dp),
                contentPadding = PaddingValues(bottom = 16.dp),
                modifier = Modifier.fillMaxSize()
            ) {
                items(records, key = { it.id }) { rec ->
                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(18.dp),
                        color = Color.White,
                        shadowElevation = 1.dp
                    ) {
                        Column(
                            modifier = Modifier.padding(14.dp),
                            verticalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = Formatters.formatDisplayDate(rec.date, lang),
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 13.sp,
                                    color = Slate900
                                )
                                StatusPill(status = rec.status, lang = lang, lateMinutes = rec.late_minutes)
                            }

                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                TimeBox(
                                    label = tr(lang, "MASUK", "CLOCK IN"),
                                    time = rec.clock_in_time ?: "--:--",
                                    modifier = Modifier.weight(1f)
                                )
                                TimeBox(
                                    label = tr(lang, "PULANG", "CLOCK OUT"),
                                    time = rec.clock_out_time ?: "--:--",
                                    modifier = Modifier.weight(1f)
                                )
                            }

                            if (!rec.clock_in_time.isNullOrBlank() && rec.clock_out_time.isNullOrBlank() && rec.date < todayStr) {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clip(RoundedCornerShape(8.dp))
                                        .background(Amber50)
                                        .padding(horizontal = 8.dp, vertical = 6.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                                ) {
                                    Icon(Icons.Default.WarningAmber, contentDescription = null, tint = Amber600, modifier = Modifier.size(14.dp))
                                    Text(
                                        text = tr(
                                            lang,
                                            "Presensi pulang belum tercatat. Ajukan koreksi.",
                                            "Missing clock-out. Please request a correction."
                                        ),
                                        color = Amber600,
                                        fontSize = 10.sp,
                                        fontWeight = FontWeight.SemiBold
                                    )
                                }
                            }

                            if (rec.is_offline_sync == 1) {
                                Text(
                                    text = tr(lang, "● Disinkron dari mode offline", "● Synced from offline mode"),
                                    color = Amber600,
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.Medium
                                )
                            }

                            if (!rec.clock_in_photo_key.isNullOrBlank() || !rec.clock_out_photo_key.isNullOrBlank()) {
                                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                    if (!rec.clock_in_photo_key.isNullOrBlank()) {
                                        TextButton(
                                            onClick = {
                                                previewPhotoUrl = "$baseUrl/api/attendance/${rec.id}/photo?type=in&token=$token"
                                            },
                                            contentPadding = PaddingValues(0.dp)
                                        ) {
                                            Icon(Icons.Default.PhotoCamera, contentDescription = null, modifier = Modifier.size(14.dp))
                                            Spacer(modifier = Modifier.width(4.dp))
                                            Text(tr(lang, "Foto Masuk", "In Photo"), fontSize = 11.sp)
                                        }
                                    }
                                    if (!rec.clock_out_photo_key.isNullOrBlank()) {
                                        TextButton(
                                            onClick = {
                                                previewPhotoUrl = "$baseUrl/api/attendance/${rec.id}/photo?type=out&token=$token"
                                            },
                                            contentPadding = PaddingValues(0.dp)
                                        ) {
                                            Icon(Icons.Default.PhotoCamera, contentDescription = null, modifier = Modifier.size(14.dp))
                                            Spacer(modifier = Modifier.width(4.dp))
                                            Text(tr(lang, "Foto Pulang", "Out Photo"), fontSize = 11.sp)
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

    if (showCorrectionDialog) {
        AlertDialog(
            onDismissRequest = { showCorrectionDialog = false },
            title = { Text(tr(lang, "Koreksi Presensi", "Attendance Correction"), fontWeight = FontWeight.Bold) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedTextField(
                        value = corrDate,
                        onValueChange = { corrDate = it },
                        label = { Text(tr(lang, "Tanggal (YYYY-MM-DD)", "Date (YYYY-MM-DD)")) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(
                            value = corrIn,
                            onValueChange = { corrIn = it },
                            label = { Text(tr(lang, "Masuk", "Clock In")) },
                            singleLine = true,
                            modifier = Modifier.weight(1f)
                        )
                        OutlinedTextField(
                            value = corrOut,
                            onValueChange = { corrOut = it },
                            label = { Text(tr(lang, "Pulang", "Clock Out")) },
                            singleLine = true,
                            modifier = Modifier.weight(1f)
                        )
                    }
                    OutlinedTextField(
                        value = corrReason,
                        onValueChange = { corrReason = it },
                        label = { Text(tr(lang, "Alasan koreksi *", "Reason *")) },
                        minLines = 2,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
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
                                showCorrectionDialog = false
                                corrReason = ""
                            }.onFailure { err ->
                                feedback = (err.message ?: tr(lang, "Gagal mengirim koreksi", "Failed to submit correction")) to true
                            }
                            submittingCorr = false
                        }
                    }
                ) {
                    Text(if (submittingCorr) tr(lang, "Mengirim...", "Submitting...") else tr(lang, "Kirim", "Submit"))
                }
            },
            dismissButton = {
                TextButton(onClick = { showCorrectionDialog = false }) {
                    Text(tr(lang, "Batal", "Cancel"))
                }
            }
        )
    }

    previewPhotoUrl?.let { url ->
        AlertDialog(
            onDismissRequest = { previewPhotoUrl = null },
            title = { Text(tr(lang, "Foto Presensi", "Attendance Photo"), fontWeight = FontWeight.Bold) },
            text = {
                AsyncImage(
                    model = ImageRequest.Builder(context).data(url).crossfade(true).build(),
                    imageLoader = imageLoader,
                    contentDescription = "Attendance Photo",
                    contentScale = ContentScale.Fit,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(320.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(Slate900)
                )
            },
            confirmButton = {
                TextButton(onClick = { previewPhotoUrl = null }) {
                    Text(tr(lang, "Tutup", "Close"))
                }
            }
        )
    }
}

@Composable
private fun SummaryStatCard(
    label: String,
    value: String,
    valueColor: Color,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(14.dp),
        color = Color.White,
        shadowElevation = 1.dp
    ) {
        Column(
            modifier = Modifier.padding(10.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(label, fontSize = 10.sp, color = Slate500, fontWeight = FontWeight.Medium)
            Spacer(modifier = Modifier.height(2.dp))
            Text(value, fontSize = 16.sp, fontWeight = FontWeight.Bold, color = valueColor)
        }
    }
}

@Composable
private fun TimeBox(label: String, time: String, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .background(Slate50)
            .border(1.dp, Slate100, RoundedCornerShape(12.dp))
            .padding(10.dp)
    ) {
        Text(label, fontSize = 9.sp, color = Slate500, fontWeight = FontWeight.Bold)
        Text(time, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, color = Slate900)
    }
}
