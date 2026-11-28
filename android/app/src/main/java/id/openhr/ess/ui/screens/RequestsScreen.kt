package id.openhr.ess.ui.screens

import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ReceiptLong
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.ImageLoader
import coil.compose.AsyncImage
import coil.request.ImageRequest
import id.openhr.ess.data.local.SessionStore
import id.openhr.ess.data.model.*
import id.openhr.ess.data.remote.ApiClient
import id.openhr.ess.data.repository.EssRepository
import id.openhr.ess.ui.components.AppDatePickerDialog
import id.openhr.ess.ui.components.AppTimePickerDialog
import id.openhr.ess.ui.components.CameraCaptureDialog
import id.openhr.ess.ui.components.FeedbackBanner
import id.openhr.ess.ui.components.ListSkeletonCards
import id.openhr.ess.ui.components.StatusPill
import id.openhr.ess.ui.components.pressScale
import id.openhr.ess.ui.components.tr
import id.openhr.ess.ui.theme.LocalEssPalette
import id.openhr.ess.util.Formatters
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.LocalTime
import java.time.YearMonth
import java.time.temporal.ChronoUnit
import kotlin.math.round

private enum class RequestSection {
    APPROVALS,
    LEAVE,
    OVERTIME,
    REIMBURSEMENT,
    KASBON,
    PETTY_CASH,
    TASKS,
    ASSETS,
    DOCUMENTS
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RequestsScreen(
    repository: EssRepository,
    sessionStore: SessionStore,
    apiClient: ApiClient,
    isVisible: Boolean = true,
    requestedSectionName: String? = null,
    onConsumedRequestedSection: () -> Unit = {},
    onHeroHeightChanged: (Int) -> Unit = {},
    onBackToHome: () -> Unit = {}
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val palette = LocalEssPalette.current
    val lang by sessionStore.langFlow.collectAsState()
    val user by sessionStore.userFlow.collectAsState()
    val modules by sessionStore.modulesFlow.collectAsState()
    val baseUrl by sessionStore.baseUrlFlow.collectAsState()
    val token by sessionStore.tokenFlow.collectAsState()

    val isReviewer = (user?.role ?: "employee") in setOf("owner_admin", "manager", "finance") ||
        user?.canApproveAny() == true
    var taskInboxCount by remember { mutableIntStateOf(0) }
    var teamPendingCount by remember { mutableIntStateOf(0) }

    var section by remember {
        mutableStateOf(
            requestedSectionName?.let { runCatching { RequestSection.valueOf(it) }.getOrNull() }
                ?: RequestSection.LEAVE
        )
    }
    val effectiveSection = remember(requestedSectionName, section) {
        requestedSectionName?.let { runCatching { RequestSection.valueOf(it) }.getOrNull() } ?: section
    }
    var showFormSheet by remember { mutableStateOf(false) }
    var statusFilter by remember { mutableStateOf("all") }
    var claimMonth by remember { mutableStateOf(YearMonth.now()) }
    var loading by remember { mutableStateOf(false) }
    var refreshing by remember { mutableStateOf(false) }
    var submitting by remember { mutableStateOf(false) }
    var feedback by remember { mutableStateOf<Pair<String, Boolean>?>(null) }

    LaunchedEffect(requestedSectionName) {
        if (!requestedSectionName.isNullOrBlank()) {
            runCatching { RequestSection.valueOf(requestedSectionName) }.getOrNull()?.let { target ->
                section = target
                statusFilter = "all"
                feedback = null
            }
            onConsumedRequestedSection()
        }
    }

    // Data backed by repository caches
    var leaveTypes by remember { mutableStateOf<List<LeaveTypeItem>>(emptyList()) }
    var leaveBalances by remember { mutableStateOf(repository.cachedLeaveBalances ?: emptyList()) }
    var leaveRequests by remember { mutableStateOf(repository.cachedLeaveRequests ?: emptyList()) }
    var overtimeRequests by remember { mutableStateOf(repository.cachedOvertimeRequests ?: emptyList()) }
    var reimbursements by remember {
        mutableStateOf(repository.getCachedReimbursements(Formatters.localMonthString(claimMonth)) ?: emptyList())
    }
    var kasbonList by remember { mutableStateOf(repository.cachedKasbonRequests ?: emptyList()) }

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

    // Native Pickers inside sheets
    var activeDatePicker by remember { mutableStateOf<String?>(null) } // "leaveStart", "leaveEnd", "otDate", "reimbDate"
    var activeTimePicker by remember { mutableStateOf<String?>(null) } // "otStart", "otEnd"
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

    fun loadCurrentSection(isPullRefresh: Boolean = false) {
        val hasCache = when (effectiveSection) {
            RequestSection.APPROVALS, RequestSection.PETTY_CASH,
            RequestSection.TASKS, RequestSection.ASSETS, RequestSection.DOCUMENTS -> true
            RequestSection.LEAVE -> repository.cachedLeaveRequests != null
            RequestSection.OVERTIME -> repository.cachedOvertimeRequests != null
            RequestSection.REIMBURSEMENT -> repository.getCachedReimbursements(Formatters.localMonthString(claimMonth)) != null
            RequestSection.KASBON -> repository.cachedKasbonRequests != null
        }
        if (isPullRefresh) {
            refreshing = true
        } else if (!hasCache) {
            loading = true
        }

        scope.launch {
            when (effectiveSection) {
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
                else -> Unit
            }
            loading = false
            refreshing = false
        }
    }

    LaunchedEffect(Unit) {
        repository.getPublicCompany().onSuccess { comp ->
            comp?.modules?.let { sessionStore.saveModules(it) }
        }
    }

    LaunchedEffect(modules, effectiveSection, isReviewer) {
        val allowed = when (effectiveSection) {
            RequestSection.TASKS, RequestSection.ASSETS, RequestSection.DOCUMENTS -> true
            RequestSection.APPROVALS -> isReviewer
            RequestSection.LEAVE -> modules.leave
            RequestSection.OVERTIME -> modules.attendance
            RequestSection.REIMBURSEMENT, RequestSection.KASBON -> modules.claims
            RequestSection.PETTY_CASH -> modules.petty_cash
        }
        if (!allowed) {
            showFormSheet = false
            onBackToHome()
        }
    }

    LaunchedEffect(effectiveSection, claimMonth) {
        loadCurrentSection()
    }

    BackHandler(enabled = isVisible && !showFormSheet) {
        feedback = null
        statusFilter = "all"
        onBackToHome()
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Full-Bleed Colored Hero Header (transparent over shared morphing hero backdrop)
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .onSizeChanged { onHeroHeightChanged(it.height) }
                    .statusBarsPadding()
                    .padding(horizontal = 16.dp, vertical = 14.dp)
            ) {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Surface(
                    onClick = {
                        feedback = null
                        statusFilter = "all"
                        onBackToHome()
                    },
                    shape = RoundedCornerShape(12.dp),
                    color = palette.onHero.copy(alpha = 0.16f),
                    modifier = Modifier.size(38.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Back",
                            tint = palette.onHero,
                            modifier = Modifier.size(18.dp)
                        )
                    }
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = when (effectiveSection) {
                            RequestSection.APPROVALS -> tr(lang, "Persetujuan Tim", "Team Approvals")
                            RequestSection.LEAVE -> tr(lang, "Cuti & Izin", "Leave & Absence")
                            RequestSection.OVERTIME -> tr(lang, "Pengajuan Lembur", "Overtime Requests")
                            RequestSection.REIMBURSEMENT -> tr(lang, "Klaim Biaya", "Expense Claims")
                            RequestSection.KASBON -> tr(lang, "Kasbon / Pinjaman", "Salary Advance")
                            RequestSection.PETTY_CASH -> "Petty Cash"
                            RequestSection.TASKS -> tr(lang, "Tugas (TMS)", "Tasks (TMS)")
                            RequestSection.ASSETS -> tr(lang, "Aset Saya", "My Assets")
                            RequestSection.DOCUMENTS -> tr(lang, "Dokumen & Tanda Tangan", "Documents & Signing")
                        },
                        style = MaterialTheme.typography.titleLarge,
                        color = palette.onHero
                    )
                    Text(
                        text = when (effectiveSection) {
                            RequestSection.APPROVALS -> tr(lang, "Tinjau permohonan anggota tim", "Review team requests")
                            RequestSection.TASKS -> tr(lang, "Daftar tugas & progres kerja", "Assigned tasks & progress")
                            RequestSection.ASSETS -> tr(lang, "Inventaris yang dipinjamkan", "Assigned company inventory")
                            RequestSection.DOCUMENTS -> tr(lang, "Kontrak & status tanda tangan", "HR documents & signatures")
                            else -> tr(lang, "Riwayat & status persetujuan", "History & approval status")
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = palette.onHero.copy(alpha = 0.85f)
                    )
                }
                if (effectiveSection == RequestSection.TASKS) {
                    Surface(
                        onClick = { showFormSheet = true },
                        shape = RoundedCornerShape(12.dp),
                        color = palette.onHero.copy(alpha = 0.16f),
                        modifier = Modifier.size(38.dp)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                imageVector = Icons.Default.Add,
                                contentDescription = "New Task",
                                tint = palette.onHero,
                                modifier = Modifier.size(20.dp)
                            )
                        }
                    }
                }
            }

            // Screen 5: Annual Leave Balance Hero inside colored header
            if (section == RequestSection.LEAVE) {
                val annualBal = leaveBalances.firstOrNull { it.leave_type_code == "annual" } ?: leaveBalances.firstOrNull()
                val remaining = annualBal?.remaining_days ?: 12.0
                val used = annualBal?.used_days ?: 0.0
                val pendingCount = leaveRequests.count { it.status == "pending" }
                val approvedCount = leaveRequests.count { it.status == "approved" }
                Column(
                    modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text(tr(lang, "Total Sisa Cuti", "Remaining Leave Balance"), fontSize = 11.sp, color = palette.onHero.copy(alpha = 0.85f))
                    Text(
                        text = "${if (remaining % 1.0 == 0.0) remaining.toInt() else remaining} ${tr(lang, "hari", "days")}",
                        fontSize = 32.sp,
                        fontWeight = FontWeight.Black,
                        color = palette.onHero
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                        horizontalArrangement = Arrangement.SpaceEvenly
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(tr(lang, "Diambil", "Used"), fontSize = 10.sp, color = palette.onHero.copy(alpha = 0.8f))
                            Text("${if (used % 1.0 == 0.0) used.toInt() else used} ${tr(lang, "hari", "d")}", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = palette.onHero)
                        }
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(tr(lang, "Menunggu", "Pending"), fontSize = 10.sp, color = palette.onHero.copy(alpha = 0.8f))
                            Text(pendingCount.toString(), fontSize = 13.sp, fontWeight = FontWeight.Bold, color = palette.onHero)
                        }
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(tr(lang, "Disetujui", "Approved"), fontSize = 10.sp, color = palette.onHero.copy(alpha = 0.8f))
                            Text(approvedCount.toString(), fontSize = 13.sp, fontWeight = FontWeight.Bold, color = palette.onHero)
                        }
                    }
                }
            }

            // Screen 2: Reimbursement Summary Hero inside colored header
            if (section == RequestSection.REIMBURSEMENT) {
                val totalClaim = reimbursements.sumOf { it.amount }
                val approvedClaim = reimbursements.filter { it.status == "approved" || it.status == "paid" }.sumOf { it.amount }
                val pendingClaim = reimbursements.filter { it.status == "pending" }.sumOf { it.amount }
                val progress = if (totalClaim > 0.0) (approvedClaim / totalClaim).toFloat().coerceIn(0f, 1f) else 0f
                Column(
                    modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text(tr(lang, "Total Klaim Periode Ini", "Total Claims This Period"), fontSize = 11.sp, color = palette.onHero.copy(alpha = 0.85f))
                    Text(
                        text = Formatters.formatRupiah(totalClaim),
                        fontSize = 26.sp,
                        fontWeight = FontWeight.Black,
                        color = palette.onHero
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceEvenly
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(tr(lang, "Disetujui / Dibayar", "Approved / Paid"), fontSize = 10.sp, color = palette.onHero.copy(alpha = 0.8f))
                            Text(Formatters.formatRupiah(approvedClaim), fontSize = 12.sp, fontWeight = FontWeight.Bold, color = palette.onHero)
                        }
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(tr(lang, "Dalam Proses", "In Process"), fontSize = 10.sp, color = palette.onHero.copy(alpha = 0.8f))
                            Text(Formatters.formatRupiah(pendingClaim), fontSize = 12.sp, fontWeight = FontWeight.Bold, color = palette.onHero)
                        }
                    }
                    LinearProgressIndicator(
                        progress = { progress },
                        modifier = Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(50)),
                        color = Color.White,
                        trackColor = palette.onHero.copy(alpha = 0.25f)
                    )
                }
            }
            }
            }

            Column(
                modifier = Modifier
                    .weight(1f)
                    .padding(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {

            feedback?.let { (msg, isErr) ->
                FeedbackBanner(message = msg, isError = isErr, onDismiss = { feedback = null })
            }

            AnimatedContent(
                targetState = effectiveSection,
                transitionSpec = { fadeIn(tween(80)) togetherWith fadeOut(tween(60)) },
                modifier = Modifier.weight(1f),
                label = "requests_stage"
            ) { activeSection ->
                if (activeSection == RequestSection.APPROVALS) {
                    TeamApprovalsSection(
                        repository = repository,
                        sessionStore = sessionStore,
                        apiClient = apiClient,
                        onFeedback = { msg, err -> feedback = msg to err }
                    )
                } else if (activeSection == RequestSection.TASKS) {
                    TasksSection(
                        repository = repository,
                        sessionStore = sessionStore,
                        showNewSheet = showFormSheet,
                        onDismissSheet = { showFormSheet = false },
                        onFeedback = { msg, err -> feedback = msg to err }
                    )
                } else if (activeSection == RequestSection.PETTY_CASH) {
                    PettyCashSection(
                        repository = repository,
                        sessionStore = sessionStore,
                        apiClient = apiClient,
                        showNewSheet = showFormSheet,
                        onDismissSheet = { showFormSheet = false },
                        onFeedback = { msg, err -> feedback = msg to err }
                    )
                } else if (activeSection == RequestSection.ASSETS) {
                    MyAssetsSection(
                        repository = repository,
                        lang = lang,
                        onFeedback = { msg, err -> feedback = msg to err }
                    )
                } else if (activeSection == RequestSection.DOCUMENTS) {
                    MyDocumentsSection(
                        repository = repository,
                        lang = lang,
                        onFeedback = { msg, err -> feedback = msg to err }
                    )
                } else {
                    Column(
                        modifier = Modifier.fillMaxSize(),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        val filters = listOf(
                            Triple("all", tr(lang, "Semua", "All"), palette.accent),
                            Triple("pending", tr(lang, "Menunggu", "Pending"), Color(0xFFF59E0B)),
                            Triple("approved", tr(lang, "Disetujui", "Approved"), Color(0xFF10B981)),
                            Triple("paid", tr(lang, "Dibayar", "Paid"), Color(0xFF2563EB)),
                            Triple("rejected", tr(lang, "Ditolak", "Rejected"), Color(0xFFEF4444))
                        )
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            filters.forEach { (key, label, dotColor) ->
                                val selected = statusFilter == key
                                Surface(
                                    onClick = { statusFilter = key },
                                    shape = CircleShape,
                                    color = if (selected) palette.accentSurface else palette.card,
                                    border = BorderStroke(1.dp, if (selected) palette.accent else palette.cardBorder)
                                ) {
                                    Row(
                                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 7.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                                    ) {
                                        Box(
                                            modifier = Modifier
                                                .size(7.dp)
                                                .clip(CircleShape)
                                                .background(dotColor)
                                        )
                                        Text(
                                            text = label,
                                            fontSize = 11.sp,
                                            fontWeight = if (selected) FontWeight.Bold else FontWeight.SemiBold,
                                            color = if (selected) palette.textPrimary else palette.textSecondary
                                        )
                                    }
                                }
                            }
                        }

                        if (activeSection == RequestSection.REIMBURSEMENT) {
                            Surface(
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(14.dp),
                                color = palette.card,
                                border = BorderStroke(1.dp, palette.cardBorder)
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(
                                        tr(lang, "Periode Klaim", "Claim Period"),
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.SemiBold,
                                        color = palette.textSecondary
                                    )
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        IconButton(onClick = { claimMonth = claimMonth.minusMonths(1) }, modifier = Modifier.size(30.dp)) {
                                            Icon(Icons.Default.ChevronLeft, contentDescription = null, tint = palette.textPrimary)
                                        }
                                        Text(
                                            Formatters.formatMonthLabel(Formatters.localMonthString(claimMonth), lang),
                                            fontSize = 11.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = palette.textPrimary
                                        )
                                        IconButton(onClick = { claimMonth = claimMonth.plusMonths(1) }, modifier = Modifier.size(30.dp)) {
                                            Icon(Icons.Default.ChevronRight, contentDescription = null, tint = palette.textPrimary)
                                        }
                                    }
                                }
                            }
                        }

                        PullToRefreshBox(
                            isRefreshing = refreshing,
                            onRefresh = { loadCurrentSection(isPullRefresh = true) },
                            modifier = Modifier.weight(1f)
                        ) {
                            if (loading) {
                                ListSkeletonCards(count = 4)
                            } else {
                                LazyColumn(
                                    verticalArrangement = Arrangement.spacedBy(10.dp),
                                    contentPadding = PaddingValues(bottom = 84.dp),
                                    modifier = Modifier.fillMaxSize()
                                ) {
                                    when (activeSection) {
                                        RequestSection.LEAVE -> {
                                            val filtered = if (statusFilter == "all") leaveRequests else leaveRequests.filter { it.status == statusFilter }
                                            if (filtered.isEmpty()) {
                                                item(contentType = "empty") { EmptyHistoryCard(lang) }
                                            } else {
                                                items(filtered, key = { it.id }, contentType = { "req_leave" }) { item ->
                                                    HistoryItemCard(
                                                        title = if (lang == "en") (item.leave_type_name_en ?: item.leave_type_name ?: "Leave") else (item.leave_type_name_id ?: item.leave_type_name ?: "Cuti"),
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
                                                item(contentType = "empty") { EmptyHistoryCard(lang) }
                                            } else {
                                                items(filtered, key = { it.id }, contentType = { "req_ot" }) { item ->
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
                                                item(contentType = "empty") { EmptyHistoryCard(lang) }
                                            } else {
                                                items(filtered, key = { it.id }, contentType = { "req_reimb" }) { item ->
                                                    val receiptFullUrl = if (item.has_receipt && !item.receipt_url.isNullOrBlank()) {
                                                        "$baseUrl${item.receipt_url}?token=$token"
                                                    } else null
                                                    HistoryItemCard(
                                                        title = Formatters.formatRupiah(item.amount),
                                                        subtitle = "${Formatters.formatDisplayDate(item.expense_date ?: item.created_at, lang)} · ${item.category}",
                                                        status = item.status,
                                                        reason = item.description,
                                                        extraLine = item.remarks,
                                                        rejectionNote = item.rejection_note,
                                                        receiptThumbUrl = receiptFullUrl,
                                                        imageLoader = imageLoader,
                                                        actionLabel = if (receiptFullUrl != null) tr(lang, "Lihat Foto Struk", "View Receipt") else null,
                                                        onAction = { previewImageUrl = receiptFullUrl },
                                                        lang = lang
                                                    )
                                                }
                                            }
                                        }

                                        RequestSection.KASBON -> {
                                            val filtered = if (statusFilter == "all") kasbonList else kasbonList.filter { it.status == statusFilter }
                                            if (filtered.isEmpty()) {
                                                item(contentType = "empty") { EmptyHistoryCard(lang) }
                                            } else {
                                                items(filtered, key = { it.id }, contentType = { "req_kasbon" }) { item ->
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

                                        else -> Unit
                                    }
                                }
                            }
                        }
                    }
                }
            }
            }
        }

        if (section in setOf(
                RequestSection.LEAVE,
                RequestSection.OVERTIME,
                RequestSection.REIMBURSEMENT,
                RequestSection.KASBON,
                RequestSection.PETTY_CASH
            )
        ) {
            ExtendedFloatingActionButton(
                onClick = {
                    feedback = null
                    showFormSheet = true
                },
                icon = { Icon(Icons.Default.Add, contentDescription = null) },
                text = { Text(tr(lang, "Ajukan Baru", "New Request"), fontWeight = FontWeight.Bold) },
                containerColor = palette.accent,
                contentColor = Color.White,
                shape = RoundedCornerShape(18.dp),
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(16.dp)
                    .pressScale()
            )
        }
    }

    // Creation Modal Bottom Sheet (for Leave, Overtime, Reimbursement, Kasbon)
    if (showFormSheet && section in setOf(
            RequestSection.LEAVE,
            RequestSection.OVERTIME,
            RequestSection.REIMBURSEMENT,
            RequestSection.KASBON
        )
    ) {
        val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        ModalBottomSheet(
            onDismissRequest = { showFormSheet = false },
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
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text(
                    text = when (section) {
                        RequestSection.LEAVE -> tr(lang, "Ajukan Cuti / Izin", "Submit Leave Request")
                        RequestSection.OVERTIME -> tr(lang, "Ajukan Lembur", "Submit Overtime")
                        RequestSection.REIMBURSEMENT -> tr(lang, "Ajukan Klaim Biaya", "Submit Expense Claim")
                        RequestSection.KASBON -> tr(lang, "Ajukan Kasbon", "Submit Salary Advance")
                        else -> ""
                    },
                    fontWeight = FontWeight.ExtraBold,
                    fontSize = 18.sp,
                    color = palette.textPrimary
                )

                when (section) {
                    RequestSection.LEAVE -> {
                        val annualRemain = leaveBalances.firstOrNull { it.leave_type_code == "annual" }?.remaining_days ?: 12.0
                        Surface(
                            shape = RoundedCornerShape(12.dp),
                            color = palette.accentSurface,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(
                                text = tr(lang, "Sisa cuti tahunan: $annualRemain hari", "Annual leave balance: $annualRemain days"),
                                color = palette.accent,
                                fontWeight = FontWeight.Bold,
                                fontSize = 12.sp,
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp)
                            )
                        }

                        var expanded by remember { mutableStateOf(false) }
                        val selectedType = leaveTypes.firstOrNull { it.id == leaveTypeId }
                        ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = !expanded }) {
                            OutlinedTextField(
                                value = selectedType?.name ?: tr(lang, "Pilih jenis cuti", "Select leave type"),
                                onValueChange = {},
                                readOnly = true,
                                label = { Text(tr(lang, "Jenis Cuti", "Leave Type")) },
                                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
                                shape = RoundedCornerShape(14.dp),
                                modifier = Modifier
                                    .menuAnchor(MenuAnchorType.PrimaryNotEditable)
                                    .fillMaxWidth()
                            )
                            ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                                leaveTypes.forEach { lt ->
                                    DropdownMenuItem(
                                        text = {
                                            val tag = if (lt.is_paid) tr(lang, "Dibayar", "Paid") else tr(lang, "Tanpa Gaji", "Unpaid")
                                            Text("${lt.localizedName(lang)} ($tag)")
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
                            SheetDateButton(
                                label = tr(lang, "Tgl Mulai", "Start Date"),
                                dateStr = leaveStart,
                                lang = lang,
                                modifier = Modifier.weight(1f),
                                onClick = { activeDatePicker = "leaveStart" }
                            )
                            SheetDateButton(
                                label = tr(lang, "Tgl Selesai", "End Date"),
                                dateStr = leaveEnd,
                                lang = lang,
                                modifier = Modifier.weight(1f),
                                onClick = { activeDatePicker = "leaveEnd" }
                            )
                        }

                        OutlinedTextField(
                            value = leaveDays,
                            onValueChange = { leaveDays = it },
                            label = { Text(tr(lang, "Total Hari Kerja", "Total Working Days")) },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                            singleLine = true,
                            shape = RoundedCornerShape(14.dp),
                            modifier = Modifier.fillMaxWidth()
                        )

                        OutlinedTextField(
                            value = leaveReason,
                            onValueChange = { leaveReason = it },
                            label = { Text(tr(lang, "Alasan Cuti / Izin *", "Reason *")) },
                            minLines = 2,
                            shape = RoundedCornerShape(14.dp),
                            modifier = Modifier.fillMaxWidth()
                        )

                        OutlinedButton(
                            onClick = { leaveFilePicker.launch("*/*") },
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Icon(Icons.Default.AttachFile, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(leaveAttachmentName ?: tr(lang, "Lampiran (opsional)", "Attachment (optional)"), fontSize = 12.sp)
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
                                        showFormSheet = false
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
                            modifier = Modifier.fillMaxWidth().height(48.dp).pressScale(),
                            shape = RoundedCornerShape(14.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = palette.accent, contentColor = Color.White)
                        ) {
                            Text(tr(lang, "Kirim Pengajuan Cuti", "Submit Leave Request"), fontWeight = FontWeight.Bold)
                        }
                    }

                    RequestSection.OVERTIME -> {
                        SheetDateButton(
                            label = tr(lang, "Tanggal Lembur", "Overtime Date"),
                            dateStr = otDate,
                            lang = lang,
                            modifier = Modifier.fillMaxWidth(),
                            onClick = { activeDatePicker = "otDate" }
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            SheetTimeButton(
                                label = tr(lang, "Jam Mulai", "Start Time"),
                                timeStr = otStart,
                                modifier = Modifier.weight(1f),
                                onClick = { activeTimePicker = "otStart" }
                            )
                            SheetTimeButton(
                                label = tr(lang, "Jam Selesai", "End Time"),
                                timeStr = otEnd,
                                modifier = Modifier.weight(1f),
                                onClick = { activeTimePicker = "otEnd" }
                            )
                        }
                        OutlinedTextField(
                            value = otHours,
                            onValueChange = { otHours = it },
                            label = { Text(tr(lang, "Durasi Rencana (Jam)", "Planned Hours")) },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                            singleLine = true,
                            shape = RoundedCornerShape(14.dp),
                            modifier = Modifier.fillMaxWidth()
                        )
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Checkbox(checked = otHoliday, onCheckedChange = { otHoliday = it })
                            Text(
                                tr(lang, "Hari Libur / Akhir Pekan (Tarif 2x–4x)", "Public Holiday / Rest Day (2x–4x Rate)"),
                                fontSize = 12.sp,
                                color = palette.textPrimary
                            )
                        }
                        OutlinedTextField(
                            value = otReason,
                            onValueChange = { otReason = it },
                            label = { Text(tr(lang, "Uraian Tugas Lembur *", "Task Description *")) },
                            minLines = 2,
                            shape = RoundedCornerShape(14.dp),
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
                                        showFormSheet = false
                                        otReason = ""
                                        loadCurrentSection()
                                    }.onFailure { err ->
                                        feedback = (err.message ?: "Error") to true
                                    }
                                    submitting = false
                                }
                            },
                            modifier = Modifier.fillMaxWidth().height(48.dp).pressScale(),
                            shape = RoundedCornerShape(14.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = palette.accent, contentColor = Color.White)
                        ) {
                            Text(tr(lang, "Kirim Pengajuan Lembur", "Submit Overtime Request"), fontWeight = FontWeight.Bold)
                        }
                    }

                    RequestSection.REIMBURSEMENT -> {
                        SheetDateButton(
                            label = tr(lang, "Tanggal Pengeluaran", "Expense Date"),
                            dateStr = reimbDate,
                            lang = lang,
                            modifier = Modifier.fillMaxWidth(),
                            onClick = { activeDatePicker = "reimbDate" }
                        )

                        Text(tr(lang, "Kategori Klaim", "Category"), fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = palette.textSecondary)
                        val categories = listOf("Transport", "Food", "Hotel", "UNPAID", "OTHERS")
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            categories.forEach { cat ->
                                FilterChip(
                                    selected = reimbCategory == cat,
                                    onClick = { reimbCategory = cat },
                                    label = { Text(cat, fontSize = 12.sp, fontWeight = FontWeight.SemiBold) }
                                )
                            }
                        }

                        OutlinedTextField(
                            value = reimbDesc,
                            onValueChange = { reimbDesc = it },
                            label = { Text(tr(lang, "Deskripsi Klaim *", "Description *")) },
                            singleLine = true,
                            shape = RoundedCornerShape(14.dp),
                            modifier = Modifier.fillMaxWidth()
                        )
                        OutlinedTextField(
                            value = reimbAmount,
                            onValueChange = { reimbAmount = it },
                            label = { Text(tr(lang, "Nominal (Rp) *", "Amount (IDR) *")) },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            singleLine = true,
                            shape = RoundedCornerShape(14.dp),
                            modifier = Modifier.fillMaxWidth()
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedTextField(
                                value = reimbCostCentre,
                                onValueChange = { reimbCostCentre = it },
                                label = { Text("Cost Centre") },
                                singleLine = true,
                                shape = RoundedCornerShape(14.dp),
                                modifier = Modifier.weight(1f)
                            )
                            OutlinedTextField(
                                value = reimbProjectRef,
                                onValueChange = { reimbProjectRef = it },
                                label = { Text("Project Ref") },
                                singleLine = true,
                                shape = RoundedCornerShape(14.dp),
                                modifier = Modifier.weight(1f)
                            )
                        }
                        OutlinedTextField(
                            value = reimbRemarks,
                            onValueChange = { reimbRemarks = it },
                            label = { Text(tr(lang, "Catatan (Remarks)", "Remarks")) },
                            singleLine = true,
                            shape = RoundedCornerShape(14.dp),
                            modifier = Modifier.fillMaxWidth()
                        )

                        Text(tr(lang, "Foto Bukti / Struk", "Receipt Photo"), fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = palette.textSecondary)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedButton(
                                onClick = { receiptCameraOpen = true },
                                shape = RoundedCornerShape(12.dp),
                                modifier = Modifier.weight(1f)
                            ) {
                                Icon(Icons.Default.PhotoCamera, contentDescription = null, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(tr(lang, "Kamera", "Camera"), fontSize = 12.sp)
                            }
                            OutlinedButton(
                                onClick = { receiptGalleryPicker.launch("image/*") },
                                shape = RoundedCornerShape(12.dp),
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
                                    .background(palette.successSurface)
                                    .padding(horizontal = 12.dp, vertical = 6.dp)
                            ) {
                                Text(
                                    tr(lang, "✓ Foto struk siap dikirim", "✓ Receipt photo attached"),
                                    color = palette.success,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.SemiBold
                                )
                                TextButton(onClick = { receiptPhotoBase64 = null }) {
                                    Text(tr(lang, "Hapus", "Remove"), color = palette.danger, fontSize = 11.sp)
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
                                        showFormSheet = false
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
                            modifier = Modifier.fillMaxWidth().height(48.dp).pressScale(),
                            shape = RoundedCornerShape(14.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = palette.accent, contentColor = Color.White)
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
                            shape = RoundedCornerShape(14.dp),
                            modifier = Modifier.fillMaxWidth()
                        )
                        OutlinedTextField(
                            value = kasbonInstalments,
                            onValueChange = { kasbonInstalments = it },
                            label = { Text(tr(lang, "Tenor Cicilan (Bulan)", "Instalments (Months)")) },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            singleLine = true,
                            shape = RoundedCornerShape(14.dp),
                            modifier = Modifier.fillMaxWidth()
                        )
                        OutlinedTextField(
                            value = kasbonReason,
                            onValueChange = { kasbonReason = it },
                            label = { Text(tr(lang, "Keperluan *", "Reason *")) },
                            minLines = 2,
                            shape = RoundedCornerShape(14.dp),
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
                                        showFormSheet = false
                                        kasbonAmount = ""
                                        kasbonReason = ""
                                        loadCurrentSection()
                                    }.onFailure { err ->
                                        feedback = (err.message ?: "Error") to true
                                    }
                                    submitting = false
                                }
                            },
                            modifier = Modifier.fillMaxWidth().height(48.dp).pressScale(),
                            shape = RoundedCornerShape(14.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = palette.accent, contentColor = Color.White)
                        ) {
                            Text(tr(lang, "Kirim Pengajuan Kasbon", "Submit Advance Request"), fontWeight = FontWeight.Bold)
                        }
                    }

                    else -> Unit
                }
            }
        }
    }

    // Native Date Picker Dialog
    activeDatePicker?.let { target ->
        val current = when (target) {
            "leaveStart" -> leaveStart
            "leaveEnd" -> leaveEnd
            "otDate" -> otDate
            else -> reimbDate
        }
        AppDatePickerDialog(
            initialDate = current,
            lang = lang,
            onDismiss = { activeDatePicker = null },
            onConfirm = { picked ->
                when (target) {
                    "leaveStart" -> {
                        leaveStart = picked
                        if (leaveEnd < picked) leaveEnd = picked
                        runCatching {
                            val diff = ChronoUnit.DAYS.between(LocalDate.parse(picked), LocalDate.parse(leaveEnd)) + 1
                            if (diff >= 1) leaveDays = diff.toString()
                        }
                    }
                    "leaveEnd" -> {
                        leaveEnd = picked
                        runCatching {
                            val diff = ChronoUnit.DAYS.between(LocalDate.parse(leaveStart), LocalDate.parse(picked)) + 1
                            if (diff >= 1) leaveDays = diff.toString()
                        }
                    }
                    "otDate" -> otDate = picked
                    "reimbDate" -> reimbDate = picked
                }
                activeDatePicker = null
            }
        )
    }

    // Native Time Picker Dialog
    activeTimePicker?.let { target ->
        AppTimePickerDialog(
            initialTime = if (target == "otStart") otStart else otEnd,
            title = if (target == "otStart") tr(lang, "Pilih Jam Mulai", "Select Start Time")
            else tr(lang, "Pilih Jam Selesai", "Select End Time"),
            lang = lang,
            onDismiss = { activeTimePicker = null },
            onConfirm = { picked ->
                if (target == "otStart") otStart = picked else otEnd = picked
                runCatching {
                    val mins = ChronoUnit.MINUTES.between(LocalTime.parse(otStart), LocalTime.parse(otEnd))
                    if (mins > 0) {
                        val hrs = round((mins / 60.0) * 10.0) / 10.0
                        otHours = if (hrs % 1.0 == 0.0) hrs.toInt().toString() else hrs.toString()
                    }
                }
                activeTimePicker = null
            }
        )
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
            containerColor = palette.card,
            title = { Text(tr(lang, "Bukti Struk Pembayaran", "Receipt Proof"), fontWeight = FontWeight.Bold, color = palette.textPrimary) },
            text = {
                AsyncImage(
                    model = ImageRequest.Builder(context).data(url).crossfade(true).build(),
                    imageLoader = imageLoader,
                    contentDescription = "Receipt",
                    contentScale = ContentScale.Fit,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(320.dp)
                        .clip(RoundedCornerShape(14.dp))
                        .background(Color.Black)
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
private fun SheetDateButton(
    label: String,
    dateStr: String,
    lang: String,
    modifier: Modifier = Modifier,
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
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Icon(Icons.Default.CalendarToday, contentDescription = null, tint = palette.accent, modifier = Modifier.size(16.dp))
            Column {
                Text(label, fontSize = 10.sp, color = palette.textSecondary, fontWeight = FontWeight.SemiBold)
                Text(
                    Formatters.formatDisplayDate(dateStr, lang),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    color = palette.textPrimary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
    }
}

@Composable
private fun SheetTimeButton(
    label: String,
    timeStr: String,
    modifier: Modifier = Modifier,
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
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Icon(Icons.Default.Schedule, contentDescription = null, tint = palette.accent, modifier = Modifier.size(16.dp))
            Column {
                Text(label, fontSize = 10.sp, color = palette.textSecondary, fontWeight = FontWeight.SemiBold)
                Text(
                    timeStr,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                    color = palette.textPrimary,
                    style = TextStyle(fontFeatureSettings = "tnum")
                )
            }
        }
    }
}

@Composable
private fun EmptyHistoryCard(lang: String) {
    val palette = LocalEssPalette.current
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        color = palette.card,
        border = BorderStroke(1.dp, palette.cardBorder),
        shadowElevation = 0.dp
    ) {
        Column(
            modifier = Modifier.padding(28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Icon(Icons.Default.Inbox, contentDescription = null, tint = palette.textMuted, modifier = Modifier.size(28.dp))
            Text(
                text = tr(lang, "Belum ada riwayat pengajuan.", "No request history yet."),
                color = palette.textSecondary,
                fontSize = 12.sp
            )
        }
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
    receiptThumbUrl: String? = null,
    imageLoader: ImageLoader? = null,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
    lang: String
) {
    val palette = LocalEssPalette.current
    val context = LocalContext.current
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        color = palette.card,
        border = BorderStroke(1.dp, palette.cardBorder),
        shadowElevation = 0.dp
    ) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top
            ) {
                Row(
                    modifier = Modifier.weight(1f),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    if (receiptThumbUrl != null && imageLoader != null) {
                        AsyncImage(
                            model = ImageRequest.Builder(context).data(receiptThumbUrl).crossfade(true).build(),
                            imageLoader = imageLoader,
                            contentDescription = "Receipt thumbnail",
                            contentScale = ContentScale.Crop,
                            modifier = Modifier
                                .size(44.dp)
                                .clip(RoundedCornerShape(10.dp))
                                .background(palette.subtleSurface)
                                .border(1.dp, palette.cardBorder, RoundedCornerShape(10.dp))
                                .clickable { onAction?.invoke() }
                        )
                    }
                    Column(modifier = Modifier.weight(1f)) {
                        Text(title, fontWeight = FontWeight.Bold, fontSize = 14.sp, color = palette.textPrimary)
                        Text(subtitle, fontSize = 11.sp, color = palette.textSecondary)
                    }
                }
                StatusPill(status = status, lang = lang)
            }
            if (!reason.isNullOrBlank()) {
                Text(reason, fontSize = 12.sp, color = palette.textPrimary)
            }
            if (!extraLine.isNullOrBlank()) {
                Text(extraLine, fontSize = 11.sp, color = palette.accent)
            }
            if (!rejectionNote.isNullOrBlank()) {
                Text(
                    "${tr(lang, "Catatan", "Note")}: $rejectionNote",
                    fontSize = 11.sp,
                    color = palette.danger,
                    fontWeight = FontWeight.Medium
                )
            }
            if (actionLabel != null && onAction != null) {
                TextButton(onClick = onAction, contentPadding = PaddingValues(0.dp)) {
                    Icon(Icons.Default.Visibility, contentDescription = null, modifier = Modifier.size(14.dp), tint = palette.accent)
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(actionLabel, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = palette.accent)
                }
            }
        }
    }
}
