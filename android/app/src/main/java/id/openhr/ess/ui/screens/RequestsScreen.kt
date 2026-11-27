package id.openhr.ess.ui.screens

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ReceiptLong
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.ImageLoader
import coil.compose.AsyncImage
import coil.request.ImageRequest
import id.openhr.ess.data.local.SessionStore
import id.openhr.ess.data.model.*
import id.openhr.ess.data.remote.ApiClient
import id.openhr.ess.data.repository.EssRepository
import id.openhr.ess.ui.components.CameraCaptureDialog
import id.openhr.ess.ui.components.FeedbackBanner
import id.openhr.ess.ui.components.StatusPill
import id.openhr.ess.ui.components.tr
import id.openhr.ess.ui.theme.*
import id.openhr.ess.util.Formatters
import kotlinx.coroutines.launch
import java.time.YearMonth

private enum class RequestSection { HUB, LEAVE, OVERTIME, REIMBURSEMENT, KASBON }

private data class RequestCardSpec(
    val section: RequestSection,
    val title: String,
    val subtitle: String,
    val icon: ImageVector,
    val tint: Color,
    val bgTint: Color
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RequestsScreen(
    repository: EssRepository,
    sessionStore: SessionStore,
    apiClient: ApiClient
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val lang by sessionStore.langFlow.collectAsState()
    val modules by sessionStore.modulesFlow.collectAsState()
    val baseUrl by sessionStore.baseUrlFlow.collectAsState()
    val token by sessionStore.tokenFlow.collectAsState()

    var section by remember { mutableStateOf(RequestSection.HUB) }
    var showForm by remember { mutableStateOf(false) }
    var statusFilter by remember { mutableStateOf("all") }
    var claimMonth by remember { mutableStateOf(YearMonth.now()) }
    var loading by remember { mutableStateOf(false) }
    var submitting by remember { mutableStateOf(false) }
    var feedback by remember { mutableStateOf<Pair<String, Boolean>?>(null) }

    // Data
    var leaveTypes by remember { mutableStateOf<List<LeaveTypeItem>>(emptyList()) }
    var leaveBalances by remember { mutableStateOf<List<LeaveBalanceItem>>(emptyList()) }
    var leaveRequests by remember { mutableStateOf<List<LeaveRequestItem>>(emptyList()) }
    var overtimeRequests by remember { mutableStateOf<List<OvertimeRequestItem>>(emptyList()) }
    var reimbursements by remember { mutableStateOf<List<ReimbursementItem>>(emptyList()) }
    var kasbonList by remember { mutableStateOf<List<KasbonItem>>(emptyList()) }

    // Leave Form
    var leaveTypeId by remember { mutableStateOf("") }
    var leaveStart by remember { mutableStateOf(Formatters.localDateString()) }
    var leaveEnd by remember { mutableStateOf(Formatters.localDateString()) }
    var leaveDays by remember { mutableStateOf("1") }
    var leaveReason by remember { mutableStateOf("") }
    var leaveAttachmentBase64 by remember { mutableStateOf<String?>(null) }
    var leaveAttachmentMime by remember { mutableStateOf<String?>(null) }
    var leaveAttachmentName by remember { mutableStateOf<String?>(null) }

    // Overtime Form
    var otDate by remember { mutableStateOf(Formatters.localDateString()) }
    var otStart by remember { mutableStateOf("18:00") }
    var otEnd by remember { mutableStateOf("20:00") }
    var otHours by remember { mutableStateOf("2") }
    var otHoliday by remember { mutableStateOf(false) }
    var otReason by remember { mutableStateOf("") }

    // Reimbursement Form
    var reimbDate by remember { mutableStateOf(Formatters.localDateString()) }
    var reimbCategory by remember { mutableStateOf("Transport") }
    var reimbAmount by remember { mutableStateOf("") }
    var reimbDesc by remember { mutableStateOf("") }
    var reimbCostCentre by remember { mutableStateOf("") }
    var reimbProjectRef by remember { mutableStateOf("") }
    var reimbRemarks by remember { mutableStateOf("") }
    var receiptPhotoBase64 by remember { mutableStateOf<String?>(null) }
    var receiptCameraOpen by remember { mutableStateOf(false) }

    // Kasbon Form
    var kasbonAmount by remember { mutableStateOf("") }
    var kasbonInstalments by remember { mutableStateOf("1") }
    var kasbonReason by remember { mutableStateOf("") }

    var previewImageUrl by remember { mutableStateOf<String?>(null) }

    val imageLoader = remember(apiClient.okHttpClient) {
        ImageLoader.Builder(context).okHttpClient(apiClient.okHttpClient).build()
    }

    val leaveFilePicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        uri?.let {
            val mime = context.contentResolver.getType(it) ?: "image/jpeg"
            leaveAttachmentBase64 = Formatters.uriToBase64DataUrl(context, it)
            leaveAttachmentMime = mime
            leaveAttachmentName = it.lastPathSegment ?: "attachment"
        }
    }

    val receiptGalleryPicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        uri?.let {
            receiptPhotoBase64 = Formatters.uriToBase64DataUrl(context, it)
        }
    }

    fun loadCurrentSection() {
        scope.launch {
            loading = true
            when (section) {
                RequestSection.HUB -> Unit
                RequestSection.LEAVE -> {
                    repository.getLeaveTypes().onSuccess { list ->
                        leaveTypes = list
                        if (leaveTypeId.isBlank() && list.isNotEmpty()) leaveTypeId = list.first().id
                    }
                    repository.getLeaveBalances().onSuccess { leaveBalances = it }
                    repository.getLeaveRequests().onSuccess { leaveRequests = it }
                }
                RequestSection.OVERTIME -> {
                    repository.getOvertimeRequests().onSuccess { overtimeRequests = it }
                }
                RequestSection.REIMBURSEMENT -> {
                    repository.getReimbursements(Formatters.localMonthString(claimMonth))
                        .onSuccess { reimbursements = it }
                }
                RequestSection.KASBON -> {
                    repository.getKasbonRequests().onSuccess { kasbonList = it }
                }
            }
            loading = false
        }
    }

    LaunchedEffect(Unit) {
        repository.getPublicCompany().onSuccess { comp ->
            comp?.modules?.let { sessionStore.saveModules(it) }
        }
    }

    LaunchedEffect(modules, section) {
        val allowed = when (section) {
            RequestSection.HUB -> true
            RequestSection.LEAVE -> modules.leave
            RequestSection.OVERTIME -> modules.attendance
            RequestSection.REIMBURSEMENT, RequestSection.KASBON -> modules.claims
        }
        if (!allowed) {
            showForm = false
            section = RequestSection.HUB
        }
    }

    LaunchedEffect(section, claimMonth) {
        if (section != RequestSection.HUB) loadCurrentSection()
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // Header
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            if (section != RequestSection.HUB) {
                IconButton(
                    onClick = {
                        feedback = null
                        if (showForm) {
                            showForm = false
                        } else {
                            statusFilter = "all"
                            section = RequestSection.HUB
                        }
                    },
                    modifier = Modifier
                        .size(36.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(Color.White)
                        .border(1.dp, Slate200, RoundedCornerShape(10.dp))
                ) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", modifier = Modifier.size(18.dp))
                }
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = when (section) {
                        RequestSection.HUB -> tr(lang, "Pengajuan Saya", "My Requests")
                        RequestSection.LEAVE -> tr(lang, "Cuti & Izin", "Leave & Absence")
                        RequestSection.OVERTIME -> tr(lang, "Pengajuan Lembur", "Overtime Requests")
                        RequestSection.REIMBURSEMENT -> tr(lang, "Klaim Biaya", "Expense Claims")
                        RequestSection.KASBON -> tr(lang, "Kasbon / Pinjaman", "Salary Advance")
                    },
                    style = MaterialTheme.typography.titleLarge
                )
                Text(
                    text = if (section == RequestSection.HUB) {
                        tr(lang, "Pilih jenis permohonan yang ingin dibuat", "Choose the type of request")
                    } else if (showForm) {
                        tr(lang, "Formulir pengajuan baru", "New request form")
                    } else {
                        tr(lang, "Riwayat & status persetujuan", "History & approval status")
                    },
                    style = MaterialTheme.typography.bodySmall
                )
            }

            if (section != RequestSection.HUB && !showForm) {
                Button(
                    onClick = { feedback = null; showForm = true },
                    shape = RoundedCornerShape(12.dp),
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
                ) {
                    Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(tr(lang, "Buat", "New"), fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
            }
        }

        feedback?.let { (msg, isErr) ->
            FeedbackBanner(message = msg, isError = isErr, onDismiss = { feedback = null })
        }

        val stageKey = when {
            section == RequestSection.HUB -> 0
            !showForm -> 1
            else -> 2
        }

        AnimatedContent(
            targetState = Triple(section, showForm, stageKey),
            transitionSpec = {
                fadeIn(tween(120)) togetherWith fadeOut(tween(90))
            },
            modifier = Modifier.weight(1f),
            label = "requests_stage"
        ) { (activeSection, activeForm, _) ->
        if (activeSection == RequestSection.HUB) {
            val enabledCards = buildList {
                if (modules.leave) {
                    add(
                        RequestCardSpec(
                            section = RequestSection.LEAVE,
                            title = tr(lang, "Cuti & Izin", "Leave & Absence"),
                            subtitle = tr(lang, "Cuti tahunan, izin, dan sakit", "Annual leave, sick & permission"),
                            icon = Icons.Default.EventAvailable,
                            tint = Blue600,
                            bgTint = Blue50
                        )
                    )
                }
                if (modules.attendance) {
                    add(
                        RequestCardSpec(
                            section = RequestSection.OVERTIME,
                            title = tr(lang, "Lembur", "Overtime"),
                            subtitle = tr(lang, "Pengajuan kerja lembur", "Overtime work requests"),
                            icon = Icons.Default.Schedule,
                            tint = Amber600,
                            bgTint = Amber50
                        )
                    )
                }
                if (modules.claims) {
                    add(
                        RequestCardSpec(
                            section = RequestSection.REIMBURSEMENT,
                            title = tr(lang, "Klaim Biaya", "Expense Claims"),
                            subtitle = tr(lang, "Reimbursement & foto struk", "Expenses & receipt proof"),
                            icon = Icons.AutoMirrored.Filled.ReceiptLong,
                            tint = Emerald600,
                            bgTint = Emerald50
                        )
                    )
                    add(
                        RequestCardSpec(
                            section = RequestSection.KASBON,
                            title = tr(lang, "Kasbon", "Salary Advance"),
                            subtitle = tr(lang, "Pinjaman potong gaji", "Instalment advance"),
                            icon = Icons.Default.Payments,
                            tint = Color(0xFF7C3AED),
                            bgTint = Color(0xFFF5F3FF)
                        )
                    )
                }
            }

            if (enabledCards.isEmpty()) {
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(18.dp),
                    color = Color.White
                ) {
                    Text(
                        text = tr(
                            lang,
                            "Semua modul pengajuan sedang dinonaktifkan oleh admin.",
                            "All request modules are currently disabled by admin."
                        ),
                        color = Slate500,
                        fontSize = 12.sp,
                        modifier = Modifier.padding(24.dp)
                    )
                }
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    enabledCards.chunked(2).forEach { rowCards ->
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            rowCards.forEach { card ->
                                RequestHubCard(
                                    title = card.title,
                                    subtitle = card.subtitle,
                                    icon = card.icon,
                                    tint = card.tint,
                                    bgTint = card.bgTint,
                                    modifier = Modifier.weight(1f),
                                    onClick = { section = card.section }
                                )
                            }
                            if (rowCards.size == 1) {
                                Spacer(modifier = Modifier.weight(1f))
                            }
                        }
                    }
                }
            }
        } else if (activeForm) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(20.dp),
                    color = Color.White,
                    shadowElevation = 1.dp
                ) {
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        when (section) {
                            RequestSection.LEAVE -> {
                                val annualRemain = leaveBalances.firstOrNull { it.leave_type_code == "annual" }?.remaining_days ?: 12.0
                                Text(
                                    text = tr(lang, "Sisa cuti tahunan: $annualRemain hari", "Annual leave balance: $annualRemain days"),
                                    color = Blue600,
                                    fontWeight = FontWeight.SemiBold,
                                    fontSize = 12.sp
                                )

                                var expanded by remember { mutableStateOf(false) }
                                val selectedType = leaveTypes.firstOrNull { it.id == leaveTypeId }
                                ExposedDropdownMenuBox(
                                    expanded = expanded,
                                    onExpandedChange = { expanded = !expanded }
                                ) {
                                    OutlinedTextField(
                                        value = selectedType?.name ?: tr(lang, "Pilih jenis cuti", "Select leave type"),
                                        onValueChange = {},
                                        readOnly = true,
                                        label = { Text(tr(lang, "Jenis Cuti", "Leave Type")) },
                                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
                                        modifier = Modifier
                                            .menuAnchor(MenuAnchorType.PrimaryNotEditable)
                                            .fillMaxWidth()
                                    )
                                    ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                                        leaveTypes.forEach { lt ->
                                            DropdownMenuItem(
                                                text = {
                                                    val tag = if (lt.is_paid) tr(lang, "Dibayar", "Paid") else tr(lang, "Tanpa Gaji", "Unpaid")
                                                    Text("${lt.name} ($tag)")
                                                },
                                                onClick = {
                                                    leaveTypeId = lt.id
                                                    expanded = false
                                                }
                                            )
                                        }
                                    }
                                }

                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    OutlinedTextField(
                                        value = leaveStart,
                                        onValueChange = { leaveStart = it },
                                        label = { Text(tr(lang, "Tgl Mulai", "Start Date")) },
                                        singleLine = true,
                                        modifier = Modifier.weight(1f)
                                    )
                                    OutlinedTextField(
                                        value = leaveEnd,
                                        onValueChange = { leaveEnd = it },
                                        label = { Text(tr(lang, "Tgl Selesai", "End Date")) },
                                        singleLine = true,
                                        modifier = Modifier.weight(1f)
                                    )
                                }

                                OutlinedTextField(
                                    value = leaveDays,
                                    onValueChange = { leaveDays = it },
                                    label = { Text(tr(lang, "Total Hari Kerja", "Total Working Days")) },
                                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                                    singleLine = true,
                                    modifier = Modifier.fillMaxWidth()
                                )

                                OutlinedTextField(
                                    value = leaveReason,
                                    onValueChange = { leaveReason = it },
                                    label = { Text(tr(lang, "Alasan Cuti / Izin *", "Reason *")) },
                                    minLines = 2,
                                    modifier = Modifier.fillMaxWidth()
                                )

                                OutlinedButton(
                                    onClick = { leaveFilePicker.launch("*/*") },
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Icon(Icons.Default.AttachFile, contentDescription = null, modifier = Modifier.size(16.dp))
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text(
                                        leaveAttachmentName ?: tr(lang, "Lampiran (opsional)", "Attachment (optional)"),
                                        fontSize = 12.sp
                                    )
                                }

                                Button(
                                    enabled = !submitting && leaveTypeId.isNotBlank() && leaveReason.isNotBlank(),
                                    onClick = {
                                        val days = leaveDays.toDoubleOrNull() ?: 0.0
                                        if (days <= 0 || leaveEnd < leaveStart) {
                                            feedback = tr(lang, "Periksa tanggal dan jumlah hari cuti.", "Check leave dates and total days.") to true
                                            return@Button
                                        }
                                        scope.launch {
                                            submitting = true
                                            repository.createLeaveRequest(
                                                CreateLeaveRequest(
                                                    leave_type_id = leaveTypeId,
                                                    start_date = leaveStart.trim(),
                                                    end_date = leaveEnd.trim(),
                                                    total_days = days,
                                                    reason = leaveReason.trim(),
                                                    attachment_base64 = leaveAttachmentBase64,
                                                    attachment_mime = leaveAttachmentMime
                                                )
                                            ).onSuccess { msg ->
                                                feedback = msg to false
                                                showForm = false
                                                leaveReason = ""
                                                leaveAttachmentBase64 = null
                                                leaveAttachmentName = null
                                                loadCurrentSection()
                                            }.onFailure { err ->
                                                feedback = (err.message ?: "Error") to true
                                            }
                                            submitting = false
                                        }
                                    },
                                    modifier = Modifier.fillMaxWidth().height(46.dp),
                                    shape = RoundedCornerShape(12.dp)
                                ) {
                                    Text(tr(lang, "Kirim Pengajuan Cuti", "Submit Leave Request"), fontWeight = FontWeight.Bold)
                                }
                            }

                            RequestSection.OVERTIME -> {
                                OutlinedTextField(
                                    value = otDate,
                                    onValueChange = { otDate = it },
                                    label = { Text(tr(lang, "Tanggal Lembur (YYYY-MM-DD)", "Overtime Date")) },
                                    singleLine = true,
                                    modifier = Modifier.fillMaxWidth()
                                )
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    OutlinedTextField(
                                        value = otStart,
                                        onValueChange = { otStart = it },
                                        label = { Text(tr(lang, "Mulai (HH:mm)", "Start")) },
                                        singleLine = true,
                                        modifier = Modifier.weight(1f)
                                    )
                                    OutlinedTextField(
                                        value = otEnd,
                                        onValueChange = { otEnd = it },
                                        label = { Text(tr(lang, "Selesai (HH:mm)", "End")) },
                                        singleLine = true,
                                        modifier = Modifier.weight(1f)
                                    )
                                }
                                OutlinedTextField(
                                    value = otHours,
                                    onValueChange = { otHours = it },
                                    label = { Text(tr(lang, "Durasi Rencana (Jam)", "Planned Hours")) },
                                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                                    singleLine = true,
                                    modifier = Modifier.fillMaxWidth()
                                )
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Checkbox(checked = otHoliday, onCheckedChange = { otHoliday = it })
                                    Text(
                                        tr(lang, "Hari Libur / Akhir Pekan (Tarif 2x–4x)", "Public Holiday / Rest Day (2x–4x Rate)"),
                                        fontSize = 12.sp
                                    )
                                }
                                OutlinedTextField(
                                    value = otReason,
                                    onValueChange = { otReason = it },
                                    label = { Text(tr(lang, "Uraian Tugas Lembur *", "Task Description *")) },
                                    minLines = 2,
                                    modifier = Modifier.fillMaxWidth()
                                )
                                Button(
                                    enabled = !submitting && otReason.isNotBlank(),
                                    onClick = {
                                        val hrs = otHours.toDoubleOrNull() ?: 0.0
                                        if (hrs <= 0) {
                                            feedback = tr(lang, "Durasi lembur harus > 0.", "Planned hours must be > 0.") to true
                                            return@Button
                                        }
                                        scope.launch {
                                            submitting = true
                                            repository.createOvertimeRequest(
                                                CreateOvertimeRequest(
                                                    date = otDate.trim(),
                                                    start_time = otStart.trim(),
                                                    end_time = otEnd.trim(),
                                                    planned_hours = hrs,
                                                    reason = otReason.trim(),
                                                    is_holiday_or_rest_day = otHoliday
                                                )
                                            ).onSuccess { msg ->
                                                feedback = msg to false
                                                showForm = false
                                                otReason = ""
                                                loadCurrentSection()
                                            }.onFailure { err ->
                                                feedback = (err.message ?: "Error") to true
                                            }
                                            submitting = false
                                        }
                                    },
                                    modifier = Modifier.fillMaxWidth().height(46.dp),
                                    shape = RoundedCornerShape(12.dp)
                                ) {
                                    Text(tr(lang, "Kirim Pengajuan Lembur", "Submit Overtime Request"), fontWeight = FontWeight.Bold)
                                }
                            }

                            RequestSection.REIMBURSEMENT -> {
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    OutlinedTextField(
                                        value = reimbDate,
                                        onValueChange = { reimbDate = it },
                                        label = { Text(tr(lang, "Tgl Pengeluaran", "Expense Date")) },
                                        singleLine = true,
                                        modifier = Modifier.weight(1f)
                                    )

                                    var catExpanded by remember { mutableStateOf(false) }
                                    val categories = listOf("Transport", "Food", "Hotel", "UNPAID", "OTHERS")
                                    ExposedDropdownMenuBox(
                                        expanded = catExpanded,
                                        onExpandedChange = { catExpanded = !catExpanded },
                                        modifier = Modifier.weight(1f)
                                    ) {
                                        OutlinedTextField(
                                            value = reimbCategory,
                                            onValueChange = {},
                                            readOnly = true,
                                            label = { Text(tr(lang, "Kategori", "Category")) },
                                            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = catExpanded) },
                                            modifier = Modifier
                                                .menuAnchor(MenuAnchorType.PrimaryNotEditable)
                                                .fillMaxWidth()
                                        )
                                        ExposedDropdownMenu(expanded = catExpanded, onDismissRequest = { catExpanded = false }) {
                                            categories.forEach { cat ->
                                                DropdownMenuItem(
                                                    text = { Text(cat) },
                                                    onClick = {
                                                        reimbCategory = cat
                                                        catExpanded = false
                                                    }
                                                )
                                            }
                                        }
                                    }
                                }

                                OutlinedTextField(
                                    value = reimbDesc,
                                    onValueChange = { reimbDesc = it },
                                    label = { Text(tr(lang, "Deskripsi Klaim *", "Description *")) },
                                    singleLine = true,
                                    modifier = Modifier.fillMaxWidth()
                                )
                                OutlinedTextField(
                                    value = reimbAmount,
                                    onValueChange = { reimbAmount = it },
                                    label = { Text(tr(lang, "Nominal (Rp) *", "Amount (IDR) *")) },
                                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                    singleLine = true,
                                    modifier = Modifier.fillMaxWidth()
                                )
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    OutlinedTextField(
                                        value = reimbCostCentre,
                                        onValueChange = { reimbCostCentre = it },
                                        label = { Text("Cost Centre") },
                                        singleLine = true,
                                        modifier = Modifier.weight(1f)
                                    )
                                    OutlinedTextField(
                                        value = reimbProjectRef,
                                        onValueChange = { reimbProjectRef = it },
                                        label = { Text("Project Ref") },
                                        singleLine = true,
                                        modifier = Modifier.weight(1f)
                                    )
                                }
                                OutlinedTextField(
                                    value = reimbRemarks,
                                    onValueChange = { reimbRemarks = it },
                                    label = { Text(tr(lang, "Catatan (Remarks)", "Remarks")) },
                                    singleLine = true,
                                    modifier = Modifier.fillMaxWidth()
                                )

                                Text(tr(lang, "Foto Bukti / Struk", "Receipt Photo"), fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    OutlinedButton(
                                        onClick = { receiptCameraOpen = true },
                                        modifier = Modifier.weight(1f)
                                    ) {
                                        Icon(Icons.Default.PhotoCamera, contentDescription = null, modifier = Modifier.size(16.dp))
                                        Spacer(modifier = Modifier.width(6.dp))
                                        Text(tr(lang, "Kamera", "Camera"), fontSize = 12.sp)
                                    }
                                    OutlinedButton(
                                        onClick = { receiptGalleryPicker.launch("image/*") },
                                        modifier = Modifier.weight(1f)
                                    ) {
                                        Icon(Icons.Default.Image, contentDescription = null, modifier = Modifier.size(16.dp))
                                        Spacer(modifier = Modifier.width(6.dp))
                                        Text(tr(lang, "Galeri", "Gallery"), fontSize = 12.sp)
                                    }
                                }
                                if (receiptPhotoBase64 != null) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .clip(RoundedCornerShape(10.dp))
                                            .background(Emerald50)
                                            .padding(horizontal = 10.dp, vertical = 6.dp)
                                    ) {
                                        Text(tr(lang, "✓ Foto struk siap dikirim", "✓ Receipt photo attached"), color = Emerald600, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                                        TextButton(onClick = { receiptPhotoBase64 = null }) {
                                            Text(tr(lang, "Hapus", "Remove"), color = Rose600, fontSize = 11.sp)
                                        }
                                    }
                                }

                                Button(
                                    enabled = !submitting && reimbDesc.isNotBlank() && (reimbAmount.toDoubleOrNull() ?: 0.0) > 0,
                                    onClick = {
                                        scope.launch {
                                            submitting = true
                                            repository.createReimbursement(
                                                CreateReimbursementRequest(
                                                    expense_date = reimbDate.trim(),
                                                    category = reimbCategory,
                                                    amount = reimbAmount.toDouble(),
                                                    description = reimbDesc.trim(),
                                                    remarks = reimbRemarks.trim().ifBlank { null },
                                                    cost_centre = reimbCostCentre.trim().ifBlank { null },
                                                    project_ref = reimbProjectRef.trim().ifBlank { null },
                                                    receipt_photo_base64 = receiptPhotoBase64
                                                )
                                            ).onSuccess { msg ->
                                                feedback = msg to false
                                                showForm = false
                                                reimbDesc = ""
                                                reimbAmount = ""
                                                reimbRemarks = ""
                                                reimbCostCentre = ""
                                                reimbProjectRef = ""
                                                receiptPhotoBase64 = null
                                                loadCurrentSection()
                                            }.onFailure { err ->
                                                feedback = (err.message ?: "Error") to true
                                            }
                                            submitting = false
                                        }
                                    },
                                    modifier = Modifier.fillMaxWidth().height(46.dp),
                                    shape = RoundedCornerShape(12.dp)
                                ) {
                                    Text(tr(lang, "Kirim Klaim Biaya", "Submit Expense Claim"), fontWeight = FontWeight.Bold)
                                }
                            }

                            RequestSection.KASBON -> {
                                OutlinedTextField(
                                    value = kasbonAmount,
                                    onValueChange = { kasbonAmount = it },
                                    label = { Text(tr(lang, "Nominal Kasbon (Rp) *", "Amount (IDR) *")) },
                                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                    singleLine = true,
                                    modifier = Modifier.fillMaxWidth()
                                )
                                OutlinedTextField(
                                    value = kasbonInstalments,
                                    onValueChange = { kasbonInstalments = it },
                                    label = { Text(tr(lang, "Tenor Cicilan (Bulan)", "Instalments (Months)")) },
                                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                    singleLine = true,
                                    modifier = Modifier.fillMaxWidth()
                                )
                                OutlinedTextField(
                                    value = kasbonReason,
                                    onValueChange = { kasbonReason = it },
                                    label = { Text(tr(lang, "Keperluan *", "Reason *")) },
                                    minLines = 2,
                                    modifier = Modifier.fillMaxWidth()
                                )
                                Button(
                                    enabled = !submitting && kasbonReason.isNotBlank() && (kasbonAmount.toDoubleOrNull() ?: 0.0) > 0,
                                    onClick = {
                                        val instalments = (kasbonInstalments.toIntOrNull() ?: 1).coerceIn(1, 24)
                                        scope.launch {
                                            submitting = true
                                            repository.createKasbonRequest(
                                                CreateKasbonRequest(
                                                    amount = kasbonAmount.toDouble(),
                                                    reason = kasbonReason.trim(),
                                                    total_instalments = instalments
                                                )
                                            ).onSuccess { msg ->
                                                feedback = msg to false
                                                showForm = false
                                                kasbonAmount = ""
                                                kasbonReason = ""
                                                loadCurrentSection()
                                            }.onFailure { err ->
                                                feedback = (err.message ?: "Error") to true
                                            }
                                            submitting = false
                                        }
                                    },
                                    modifier = Modifier.fillMaxWidth().height(46.dp),
                                    shape = RoundedCornerShape(12.dp)
                                ) {
                                    Text(tr(lang, "Kirim Pengajuan Kasbon", "Submit Advance Request"), fontWeight = FontWeight.Bold)
                                }
                            }

                            RequestSection.HUB -> Unit
                        }
                    }
                }
            }
        } else {
            // Status Filter Chips
            val filters = listOf(
                "all" to tr(lang, "Semua", "All"),
                "pending" to tr(lang, "Menunggu", "Pending"),
                "approved" to tr(lang, "Disetujui", "Approved"),
                "paid" to tr(lang, "Dibayar", "Paid"),
                "rejected" to tr(lang, "Ditolak", "Rejected")
            )
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                filters.forEach { (key, label) ->
                    FilterChip(
                        selected = statusFilter == key,
                        onClick = { statusFilter = key },
                        label = { Text(label, fontSize = 11.sp) }
                    )
                }
            }

            if (section == RequestSection.REIMBURSEMENT) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .background(Color.White)
                        .border(1.dp, Slate200, RoundedCornerShape(12.dp))
                        .padding(horizontal = 12.dp, vertical = 4.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(tr(lang, "Periode Klaim", "Claim Period"), fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = Slate600)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        IconButton(onClick = { claimMonth = claimMonth.minusMonths(1) }, modifier = Modifier.size(30.dp)) {
                            Icon(Icons.Default.ChevronLeft, contentDescription = null)
                        }
                        Text(Formatters.formatMonthLabel(Formatters.localMonthString(claimMonth), lang), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                        IconButton(onClick = { claimMonth = claimMonth.plusMonths(1) }, modifier = Modifier.size(30.dp)) {
                            Icon(Icons.Default.ChevronRight, contentDescription = null)
                        }
                    }
                }
            }

            if (loading) {
                Box(modifier = Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            } else {
                LazyColumn(
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                    contentPadding = PaddingValues(bottom = 16.dp),
                    modifier = Modifier.fillMaxSize()
                ) {
                    when (section) {
                        RequestSection.LEAVE -> {
                            val filtered = if (statusFilter == "all") leaveRequests else leaveRequests.filter { it.status == statusFilter }
                            if (filtered.isEmpty()) {
                                item { EmptyHistoryCard(lang) }
                            } else {
                                items(filtered, key = { it.id }) { item ->
                                    HistoryItemCard(
                                        title = item.leave_type_name ?: "Cuti",
                                        subtitle = "${Formatters.formatDisplayDate(item.start_date, lang)} – ${Formatters.formatDisplayDate(item.end_date, lang)} (${item.total_days} ${tr(lang, "hari", "days")})",
                                        status = item.status,
                                        reason = item.reason,
                                        rejectionNote = item.rejection_note,
                                        lang = lang
                                    )
                                }
                            }
                        }

                        RequestSection.OVERTIME -> {
                            val filtered = if (statusFilter == "all") overtimeRequests else overtimeRequests.filter { it.status == statusFilter }
                            if (filtered.isEmpty()) {
                                item { EmptyHistoryCard(lang) }
                            } else {
                                items(filtered, key = { it.id }) { item ->
                                    HistoryItemCard(
                                        title = "${item.actual_hours ?: item.planned_hours} ${tr(lang, "jam", "hrs")}",
                                        subtitle = "${Formatters.formatDisplayDate(item.date, lang)} · ${item.start_time ?: ""}–${item.end_time ?: ""}",
                                        status = item.status,
                                        reason = item.reason,
                                        rejectionNote = item.reviewer_note,
                                        lang = lang
                                    )
                                }
                            }
                        }

                        RequestSection.REIMBURSEMENT -> {
                            val filtered = if (statusFilter == "all") reimbursements else reimbursements.filter { it.status == statusFilter }
                            if (filtered.isEmpty()) {
                                item { EmptyHistoryCard(lang) }
                            } else {
                                items(filtered, key = { it.id }) { item ->
                                    HistoryItemCard(
                                        title = Formatters.formatRupiah(item.amount),
                                        subtitle = "${Formatters.formatDisplayDate(item.expense_date ?: item.created_at, lang)} · ${item.category}",
                                        status = item.status,
                                        reason = item.description,
                                        extraLine = item.remarks,
                                        rejectionNote = item.rejection_note,
                                        actionLabel = if (item.has_receipt && !item.receipt_url.isNullOrBlank()) tr(lang, "Lihat Foto Struk", "View Receipt") else null,
                                        onAction = {
                                            previewImageUrl = "$baseUrl${item.receipt_url}?token=$token"
                                        },
                                        lang = lang
                                    )
                                }
                            }
                        }

                        RequestSection.KASBON -> {
                            val filtered = if (statusFilter == "all") kasbonList else kasbonList.filter { it.status == statusFilter }
                            if (filtered.isEmpty()) {
                                item { EmptyHistoryCard(lang) }
                            } else {
                                items(filtered, key = { it.id }) { item ->
                                    HistoryItemCard(
                                        title = Formatters.formatRupiah(item.amount),
                                        subtitle = "${item.total_instalments}x · ${tr(lang, "Sisa", "Remaining")}: ${Formatters.formatRupiah(item.remaining_amount)}",
                                        status = item.status,
                                        reason = item.reason,
                                        rejectionNote = item.rejection_note,
                                        lang = lang
                                    )
                                }
                            }
                        }

                        RequestSection.HUB -> Unit
                    }
                }
            }
        }
        }
    }

    if (receiptCameraOpen) {
        CameraCaptureDialog(
            title = tr(lang, "Ambil Foto Nota / Struk", "Take Receipt Photo"),
            useFrontCamera = false,
            lang = lang,
            onDismiss = { receiptCameraOpen = false },
            onCaptured = { base64 ->
                receiptCameraOpen = false
                receiptPhotoBase64 = base64
            }
        )
    }

    previewImageUrl?.let { url ->
        AlertDialog(
            onDismissRequest = { previewImageUrl = null },
            title = { Text(tr(lang, "Bukti Struk Pembayaran", "Receipt Proof"), fontWeight = FontWeight.Bold) },
            text = {
                AsyncImage(
                    model = ImageRequest.Builder(context).data(url).crossfade(true).build(),
                    imageLoader = imageLoader,
                    contentDescription = "Receipt",
                    contentScale = ContentScale.Fit,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(320.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(Slate900)
                )
            },
            confirmButton = {
                TextButton(onClick = { previewImageUrl = null }) {
                    Text(tr(lang, "Tutup", "Close"))
                }
            }
        )
    }
}

@Composable
private fun RequestHubCard(
    title: String,
    subtitle: String,
    icon: ImageVector,
    tint: Color,
    bgTint: Color,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    Surface(
        modifier = modifier
            .height(128.dp)
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(20.dp),
        color = Color.White,
        shadowElevation = 1.dp
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.SpaceBetween
        ) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(bgTint),
                contentAlignment = Alignment.Center
            ) {
                Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(20.dp))
            }
            Column {
                Text(title, fontWeight = FontWeight.Bold, fontSize = 13.sp, color = Slate900)
                Text(subtitle, fontSize = 10.sp, color = Slate500, lineHeight = 13.sp)
            }
        }
    }
}

@Composable
private fun EmptyHistoryCard(lang: String) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        color = Color.White
    ) {
        Text(
            text = tr(lang, "Belum ada riwayat pengajuan.", "No request history yet."),
            color = Slate500,
            fontSize = 12.sp,
            modifier = Modifier.padding(28.dp)
        )
    }
}

@Composable
private fun HistoryItemCard(
    title: String,
    subtitle: String,
    status: String,
    reason: String? = null,
    extraLine: String? = null,
    rejectionNote: String? = null,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
    lang: String
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        color = Color.White,
        shadowElevation = 1.dp
    ) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(title, fontWeight = FontWeight.Bold, fontSize = 14.sp, color = Slate900)
                    Text(subtitle, fontSize = 11.sp, color = Slate500)
                }
                StatusPill(status = status, lang = lang)
            }
            if (!reason.isNullOrBlank()) {
                Text(reason, fontSize = 12.sp, color = Slate800)
            }
            if (!extraLine.isNullOrBlank()) {
                Text(extraLine, fontSize = 11.sp, color = Blue600)
            }
            if (!rejectionNote.isNullOrBlank()) {
                Text("${tr(lang, "Catatan", "Note")}: $rejectionNote", fontSize = 11.sp, color = Rose600, fontWeight = FontWeight.Medium)
            }
            if (actionLabel != null && onAction != null) {
                TextButton(onClick = onAction, contentPadding = PaddingValues(0.dp)) {
                    Icon(Icons.Default.Visibility, contentDescription = null, modifier = Modifier.size(14.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(actionLabel, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}
