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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
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
    HUB,
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

private data class RequestCardSpec(
    val section: RequestSection,
    val title: String,
    val subtitle: String,
    val badge: String?,
    val icon: ImageVector,
    val tint: Color,
    val bgTint: Color
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RequestsScreen(
    repository: EssRepository,
    sessionStore: SessionStore,
    apiClient: ApiClient,
    isVisible: Boolean = true
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
    var announcements by remember { mutableStateOf<List<AnnouncementItem>>(emptyList()) }
    var showAnnouncementsSheet by remember { mutableStateOf(false) }

    var section by remember { mutableStateOf(RequestSection.HUB) }
    var showFormSheet by remember { mutableStateOf(false) }
    var statusFilter by remember { mutableStateOf("all") }
    var claimMonth by remember { mutableStateOf(YearMonth.now()) }
    var loading by remember { mutableStateOf(false) }
    var refreshing by remember { mutableStateOf(false) }
    var submitting by remember { mutableStateOf(false) }
    var feedback by remember { mutableStateOf<Pair<String, Boolean>?>(null) }

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

    fun loadHubSummary() {
        scope.launch {
            if (modules.leave) {
                repository.getLeaveBalances().onSuccess { leaveBalances = it }
                repository.getLeaveRequests().onSuccess { leaveRequests = it }
            }
            if (modules.attendance) {
                repository.getOvertimeRequests().onSuccess { overtimeRequests = it }
            }
            if (modules.claims) {
                repository.getReimbursements(Formatters.localMonthString(claimMonth)).onSuccess { reimbursements = it }
                repository.getKasbonRequests().onSuccess { kasbonList = it }
            }
            repository.getTasks("inbox").onSuccess { taskInboxCount = it.counts.inbox }
            repository.getAnnouncements().onSuccess { announcements = it }
            if (isReviewer) {
                var total = 0
                val role = user?.role ?: "employee"
                if (role == "owner_admin" || role == "manager" || user?.level?.capabilities?.can_approve_leave == true || user?.level?.capabilities?.can_approve_overtime == true) {
                    if (modules.leave) repository.getTeamLeaveRequests().onSuccess { total += it.count { r -> r.status == "pending" } }
                    if (modules.attendance) {
                        repository.getTeamOvertimeRequests().onSuccess { total += it.count { r -> r.status == "pending" } }
                        repository.getTeamAttendanceCorrections().onSuccess { total += it.count { r -> r.status == "pending" } }
                    }
                }
                if (modules.claims) {
                    repository.getTeamReimbursements(Formatters.localMonthString(claimMonth))
                        .onSuccess { total += it.count { r -> r.status == "pending" } }
                }
                teamPendingCount = total
            }
        }
    }

    fun loadCurrentSection(isPullRefresh: Boolean = false) {
        val hasCache = when (section) {
            RequestSection.HUB, RequestSection.APPROVALS, RequestSection.PETTY_CASH,
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
            when (section) {
                RequestSection.HUB -> loadHubSummary()
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
        loadHubSummary()
    }

    LaunchedEffect(modules, section, isReviewer) {
        val allowed = when (section) {
            RequestSection.HUB, RequestSection.TASKS, RequestSection.ASSETS, RequestSection.DOCUMENTS -> true
            RequestSection.APPROVALS -> isReviewer
            RequestSection.LEAVE -> modules.leave
            RequestSection.OVERTIME -> modules.attendance
            RequestSection.REIMBURSEMENT, RequestSection.KASBON -> modules.claims
            RequestSection.PETTY_CASH -> modules.petty_cash
        }
        if (!allowed) {
            showFormSheet = false
            section = RequestSection.HUB
        }
    }

    LaunchedEffect(section, claimMonth) {
        if (section != RequestSection.HUB) loadCurrentSection()
    }

    BackHandler(enabled = isVisible && section != RequestSection.HUB && !showFormSheet) {
        feedback = null
        statusFilter = "all"
        section = RequestSection.HUB
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(palette.canvas)
    ) {
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
                    Surface(
                        onClick = {
                            feedback = null
                            statusFilter = "all"
                            section = RequestSection.HUB
                        },
                        shape = RoundedCornerShape(12.dp),
                        color = palette.card,
                        border = BorderStroke(1.dp, palette.cardBorder),
                        modifier = Modifier.size(38.dp)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                Icons.AutoMirrored.Filled.ArrowBack,
                                contentDescription = "Back",
                                tint = palette.textPrimary,
                                modifier = Modifier.size(18.dp)
                            )
                        }
                    }
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = when (section) {
                            RequestSection.HUB -> tr(lang, "Aktivitas & Pengajuan", "Requests & Workspace")
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
                        color = palette.textPrimary
                    )
                    Text(
                        text = when (section) {
                            RequestSection.HUB -> tr(lang, "Pengajuan, tugas, aset & persetujuan", "Requests, tasks, assets & approvals")
                            RequestSection.APPROVALS -> tr(lang, "Tinjau permohonan anggota tim", "Review team requests")
                            RequestSection.TASKS -> tr(lang, "Daftar tugas & progres kerja", "Assigned tasks & progress")
                            RequestSection.ASSETS -> tr(lang, "Inventaris yang dipinjamkan", "Assigned company inventory")
                            RequestSection.DOCUMENTS -> tr(lang, "Kontrak & status tanda tangan", "HR documents & signatures")
                            else -> tr(lang, "Riwayat & status persetujuan", "History & approval status")
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = palette.textSecondary
                    )
                }
                val unackedCount = announcements.count { !it.acknowledged }
                Surface(
                    onClick = { showAnnouncementsSheet = true },
                    shape = RoundedCornerShape(12.dp),
                    color = palette.card,
                    border = BorderStroke(1.dp, palette.cardBorder),
                    modifier = Modifier.size(38.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            imageVector = if (unackedCount > 0) Icons.Default.NotificationsActive else Icons.Default.Notifications,
                            contentDescription = "Announcements",
                            tint = if (unackedCount > 0) palette.accent else palette.textSecondary,
                            modifier = Modifier.size(19.dp)
                        )
                        if (unackedCount > 0) {
                            Box(
                                modifier = Modifier
                                    .align(Alignment.TopEnd)
                                    .padding(7.dp)
                                    .size(8.dp)
                                    .clip(RoundedCornerShape(50))
                                    .background(palette.danger)
                            )
                        }
                    }
                }
            }

            feedback?.let { (msg, isErr) ->
                FeedbackBanner(message = msg, isError = isErr, onDismiss = { feedback = null })
            }

            AnimatedContent(
                targetState = section,
                transitionSpec = { fadeIn(tween(120)) togetherWith fadeOut(tween(90)) },
                modifier = Modifier.weight(1f),
                label = "requests_stage"
            ) { activeSection ->
                if (activeSection == RequestSection.HUB) {
                    val annualRemain = leaveBalances.firstOrNull { it.leave_type_code == "annual" }?.remaining_days
                    val leavePending = leaveRequests.count { it.status == "pending" }
                    val otPending = overtimeRequests.count { it.status == "pending" }
                    val reimbPending = reimbursements.count { it.status == "pending" }
                    val kasbonPending = kasbonList.count { it.status == "pending" }

                    val enabledCards = buildList {
                        if (modules.leave) {
                            val badge = when {
                                leavePending > 0 -> "$leavePending ${tr(lang, "menunggu", "pending")}"
                                annualRemain != null -> "${tr(lang, "Sisa", "Left")} ${annualRemain.toInt()} ${tr(lang, "hari", "d")}"
                                else -> null
                            }
                            add(
                                RequestCardSpec(
                                    section = RequestSection.LEAVE,
                                    title = tr(lang, "Cuti & Izin", "Leave & Absence"),
                                    subtitle = tr(lang, "Cuti tahunan, izin, dan sakit", "Annual leave, sick & permission"),
                                    badge = badge,
                                    icon = Icons.Default.EventAvailable,
                                    tint = palette.accent,
                                    bgTint = palette.accentSurface
                                )
                            )
                        }
                        if (modules.attendance) {
                            add(
                                RequestCardSpec(
                                    section = RequestSection.OVERTIME,
                                    title = tr(lang, "Lembur", "Overtime"),
                                    subtitle = tr(lang, "Pengajuan kerja lembur", "Overtime work requests"),
                                    badge = if (otPending > 0) "$otPending ${tr(lang, "menunggu", "pending")}" else null,
                                    icon = Icons.Default.Schedule,
                                    tint = palette.warning,
                                    bgTint = palette.warningSurface
                                )
                            )
                        }
                        if (modules.claims) {
                            add(
                                RequestCardSpec(
                                    section = RequestSection.REIMBURSEMENT,
                                    title = tr(lang, "Klaim Biaya", "Expense Claims"),
                                    subtitle = tr(lang, "Reimbursement & foto struk", "Expenses & receipt proof"),
                                    badge = if (reimbPending > 0) "$reimbPending ${tr(lang, "menunggu", "pending")}" else null,
                                    icon = Icons.AutoMirrored.Filled.ReceiptLong,
                                    tint = palette.success,
                                    bgTint = palette.successSurface
                                )
                            )
                            add(
                                RequestCardSpec(
                                    section = RequestSection.KASBON,
                                    title = tr(lang, "Kasbon", "Salary Advance"),
                                    subtitle = tr(lang, "Pinjaman potong gaji", "Instalment advance"),
                                    badge = if (kasbonPending > 0) "$kasbonPending ${tr(lang, "menunggu", "pending")}" else null,
                                    icon = Icons.Default.Payments,
                                    tint = Color(0xFF8B5CF6),
                                    bgTint = Color(0xFF8B5CF6).copy(alpha = if (palette.isDark) 0.18f else 0.10f)
                                )
                            )
                        }
                        if (modules.petty_cash) {
                            add(
                                RequestCardSpec(
                                    section = RequestSection.PETTY_CASH,
                                    title = "Petty Cash",
                                    subtitle = tr(lang, "Dana operasional harian", "Operational cash advance"),
                                    badge = null,
                                    icon = Icons.Default.AccountBalanceWallet,
                                    tint = Color(0xFF0EA5E9),
                                    bgTint = Color(0xFF0EA5E9).copy(alpha = if (palette.isDark) 0.18f else 0.10f)
                                )
                            )
                        }
                    }

                    val workspaceCards = listOf(
                        RequestCardSpec(
                            section = RequestSection.TASKS,
                            title = tr(lang, "Tugas (TMS)", "Tasks (TMS)"),
                            subtitle = tr(lang, "Tugas masuk & penyelesaian", "Task inbox & completion"),
                            badge = if (taskInboxCount > 0) "$taskInboxCount ${tr(lang, "aktif", "open")}" else null,
                            icon = Icons.Default.TaskAlt,
                            tint = palette.accent,
                            bgTint = palette.accentSurface
                        ),
                        RequestCardSpec(
                            section = RequestSection.ASSETS,
                            title = tr(lang, "Aset Saya", "My Assets"),
                            subtitle = tr(lang, "Laptop & inventaris kantor", "Assigned equipment"),
                            badge = null,
                            icon = Icons.Default.Devices,
                            tint = palette.success,
                            bgTint = palette.successSurface
                        ),
                        RequestCardSpec(
                            section = RequestSection.DOCUMENTS,
                            title = tr(lang, "Dokumen", "Documents"),
                            subtitle = tr(lang, "Kontrak & tanda tangan", "Contracts & signatures"),
                            badge = null,
                            icon = Icons.Default.Description,
                            tint = palette.warning,
                            bgTint = palette.warningSurface
                        )
                    )

                    Column(
                        modifier = Modifier.verticalScroll(rememberScrollState()),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        if (isReviewer) {
                            Surface(
                                onClick = { section = RequestSection.APPROVALS },
                                shape = RoundedCornerShape(20.dp),
                                color = palette.accentSurface,
                                border = BorderStroke(1.dp, palette.accent.copy(alpha = 0.35f)),
                                modifier = Modifier.fillMaxWidth().pressScale()
                            ) {
                                Row(
                                    modifier = Modifier.padding(16.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .size(44.dp)
                                            .clip(RoundedCornerShape(14.dp))
                                            .background(palette.accent),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Icon(Icons.Default.FactCheck, contentDescription = null, tint = Color.White)
                                    }
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            tr(lang, "Persetujuan Tim", "Team Approvals"),
                                            fontWeight = FontWeight.ExtraBold,
                                            fontSize = 15.sp,
                                            color = palette.textPrimary
                                        )
                                        Text(
                                            tr(lang, "Tinjau cuti, lembur, koreksi & klaim tim", "Review team leave, overtime & claims"),
                                            fontSize = 11.sp,
                                            color = palette.textSecondary
                                        )
                                    }
                                    if (teamPendingCount > 0) {
                                        Surface(shape = RoundedCornerShape(50), color = palette.accent) {
                                            Text(
                                                teamPendingCount.toString(),
                                                color = Color.White,
                                                fontSize = 11.sp,
                                                fontWeight = FontWeight.Bold,
                                                modifier = Modifier.padding(horizontal = 9.dp, vertical = 4.dp)
                                            )
                                        }
                                    }
                                    Icon(Icons.Default.ChevronRight, contentDescription = null, tint = palette.accent)
                                }
                            }
                        }

                        if (enabledCards.isNotEmpty()) {
                            enabledCards.chunked(2).forEach { rowCards ->
                                Row(
                                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    rowCards.forEach { card ->
                                        RequestHubCard(
                                            spec = card,
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

                        Text(
                            tr(lang, "RUANG KERJA & DOKUMEN", "WORKSPACE & DOCUMENTS"),
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = palette.textMuted,
                            letterSpacing = 0.7.sp,
                            modifier = Modifier.padding(top = 4.dp, start = 2.dp)
                        )
                        workspaceCards.chunked(2).forEach { rowCards ->
                            Row(
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                rowCards.forEach { card ->
                                    RequestHubCard(
                                        spec = card,
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
                } else if (activeSection == RequestSection.APPROVALS) {
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

    if (showAnnouncementsSheet) {
        ModalBottomSheet(
            onDismissRequest = { showAnnouncementsSheet = false },
            containerColor = palette.card
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 18.dp)
                    .padding(bottom = 24.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text(
                    tr(lang, "Pengumuman Perusahaan", "Company Announcements"),
                    fontWeight = FontWeight.Bold,
                    fontSize = 17.sp,
                    color = palette.textPrimary
                )
                if (announcements.isEmpty()) {
                    Text(
                        tr(lang, "Belum ada pengumuman.", "No announcements yet."),
                        fontSize = 13.sp,
                        color = palette.textMuted,
                        modifier = Modifier.padding(vertical = 12.dp)
                    )
                } else {
                    announcements.take(8).forEach { item ->
                        Surface(
                            shape = RoundedCornerShape(14.dp),
                            color = palette.subtleSurface,
                            border = BorderStroke(1.dp, palette.cardBorder),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(
                                modifier = Modifier.padding(12.dp),
                                verticalArrangement = Arrangement.spacedBy(4.dp)
                            ) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(item.title, fontWeight = FontWeight.Bold, fontSize = 13.sp, color = palette.textPrimary, modifier = Modifier.weight(1f))
                                    if (item.acknowledged) {
                                        Text(tr(lang, "✓ Dibaca", "✓ Read"), fontSize = 10.sp, fontWeight = FontWeight.Bold, color = palette.success)
                                    }
                                }
                                Text(item.body, fontSize = 12.sp, color = palette.textSecondary)
                                if (!item.acknowledged) {
                                    TextButton(
                                        onClick = {
                                            scope.launch {
                                                repository.acknowledgeAnnouncement(item.id).onSuccess {
                                                    announcements = announcements.map {
                                                        if (it.id == item.id) it.copy(acknowledged = true) else it
                                                    }
                                                }
                                            }
                                        },
                                        contentPadding = PaddingValues(0.dp)
                                    ) {
                                        Text(
                                            if (item.require_ack) tr(lang, "Konfirmasi Dibaca", "Acknowledge")
                                            else tr(lang, "Tandai Dibaca", "Mark Read"),
                                            fontSize = 11.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = palette.accent
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
private fun RequestHubCard(
    spec: RequestCardSpec,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    val palette = LocalEssPalette.current
    Surface(
        onClick = onClick,
        modifier = modifier
            .height(142.dp)
            .pressScale(),
        shape = RoundedCornerShape(20.dp),
        color = palette.card,
        border = BorderStroke(1.dp, palette.cardBorder),
        shadowElevation = 0.dp
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.SpaceBetween
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top
            ) {
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(spec.bgTint),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(spec.icon, contentDescription = null, tint = spec.tint, modifier = Modifier.size(20.dp))
                }

                if (!spec.badge.isNullOrBlank()) {
                    Surface(
                        shape = RoundedCornerShape(50),
                        color = spec.bgTint
                    ) {
                        Text(
                            text = spec.badge,
                            color = spec.tint,
                            fontSize = 9.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                        )
                    }
                }
            }

            Column {
                Text(spec.title, fontWeight = FontWeight.Bold, fontSize = 14.sp, color = palette.textPrimary)
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    spec.subtitle,
                    fontSize = 10.sp,
                    color = palette.textSecondary,
                    lineHeight = 13.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
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
