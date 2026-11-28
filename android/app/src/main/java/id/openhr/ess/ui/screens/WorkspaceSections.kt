package id.openhr.ess.ui.screens

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
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
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
import id.openhr.ess.ui.components.ListSkeletonCards
import id.openhr.ess.ui.components.StatusPill
import id.openhr.ess.ui.components.pressScale
import id.openhr.ess.ui.components.tr
import id.openhr.ess.ui.theme.LocalEssPalette
import id.openhr.ess.util.Formatters
import kotlinx.coroutines.launch
import java.time.YearMonth

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TeamApprovalsSection(
    repository: EssRepository,
    sessionStore: SessionStore,
    apiClient: ApiClient,
    onFeedback: (String, Boolean) -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val palette = LocalEssPalette.current
    val lang by sessionStore.langFlow.collectAsState()
    val user by sessionStore.userFlow.collectAsState()
    val modules by sessionStore.modulesFlow.collectAsState()
    val baseUrl by sessionStore.baseUrlFlow.collectAsState()
    val token by sessionStore.tokenFlow.collectAsState()

    val role = user?.role ?: "employee"
    val lvlCaps = user?.level?.capabilities
    val canManagePeople = role == "owner_admin" || role == "manager" ||
        lvlCaps?.can_approve_leave == true || lvlCaps?.can_approve_overtime == true
    val canManageFinance = role == "owner_admin" || role == "finance" ||
        lvlCaps?.can_approve_claims == true || lvlCaps?.can_approve_petty_cash == true || lvlCaps?.can_approve_kasbon == true

    val availableTabs = buildList {
        if (canManagePeople && modules.leave) add("leave")
        if (canManagePeople && modules.attendance) {
            add("overtime")
            add("corrections")
        }
        if ((canManagePeople || canManageFinance) && modules.claims) add("claims")
        if (canManageFinance && modules.claims) add("kasbon")
        if (canManageFinance && modules.petty_cash) add("petty_cash")
    }

    var activeTab by remember(availableTabs) { mutableStateOf(availableTabs.firstOrNull() ?: "leave") }
    var loading by remember { mutableStateOf(true) }
    var refreshing by remember { mutableStateOf(false) }

    var leaveItems by remember { mutableStateOf<List<LeaveRequestItem>>(emptyList()) }
    var otItems by remember { mutableStateOf<List<OvertimeRequestItem>>(emptyList()) }
    var corrItems by remember { mutableStateOf<List<AttendanceCorrectionItem>>(emptyList()) }
    var claimItems by remember { mutableStateOf<List<ReimbursementItem>>(emptyList()) }
    var kasbonItems by remember { mutableStateOf<List<KasbonItem>>(emptyList()) }
    var pettyCashItems by remember { mutableStateOf<List<PettyCashRequestItem>>(emptyList()) }

    var rejectDialog by remember { mutableStateOf<Pair<String, String>?>(null) } // tab to id
    var rejectNote by remember { mutableStateOf("") }
    var processingId by remember { mutableStateOf<String?>(null) }
    var previewReceiptUrl by remember { mutableStateOf<String?>(null) }
    var openPettyCashId by remember { mutableStateOf<String?>(null) }

    val imageLoader = remember(apiClient.okHttpClient) {
        ImageLoader.Builder(context).okHttpClient(apiClient.okHttpClient).build()
    }

    fun refreshApprovals(isPull: Boolean = false) {
        if (isPull) refreshing = true else loading = true
        val month = Formatters.localMonthString(YearMonth.now())
        scope.launch {
            if (canManagePeople && modules.leave) {
                repository.getTeamLeaveRequests().onSuccess { leaveItems = it.filter { r -> r.status == "pending" } }
            }
            if (canManagePeople && modules.attendance) {
                repository.getTeamOvertimeRequests().onSuccess { otItems = it.filter { r -> r.status == "pending" } }
                repository.getTeamAttendanceCorrections().onSuccess { corrItems = it.filter { r -> r.status == "pending" } }
            }
            if ((canManagePeople || canManageFinance) && modules.claims) {
                repository.getTeamReimbursements(month).onSuccess { claimItems = it.filter { r -> r.status == "pending" } }
            }
            if (canManageFinance && modules.claims) {
                repository.getKasbonRequests().onSuccess { kasbonItems = it.filter { r -> r.status == "pending" } }
            }
            if (canManageFinance && modules.petty_cash) {
                repository.getTeamPettyCash().onSuccess {
                    pettyCashItems = it.filter { r -> r.status == "pending" || r.status == "report_submitted" }
                }
            }
            loading = false
            refreshing = false
        }
    }

    LaunchedEffect(Unit) { refreshApprovals() }

    fun submitDecision(tab: String, id: String, status: String, note: String? = null) {
        scope.launch {
            processingId = id
            val res = when (tab) {
                "leave" -> repository.reviewLeaveRequest(id, status, note)
                "overtime" -> repository.reviewOvertimeRequest(id, status, note)
                "corrections" -> repository.reviewAttendanceCorrection(id, status, note)
                "claims" -> repository.reviewReimbursement(id, status, note)
                else -> repository.reviewKasbonRequest(id, status, note)
            }
            res.onSuccess { msg ->
                onFeedback(msg, false)
                refreshApprovals()
            }.onFailure { err ->
                onFeedback(err.message ?: "Error", true)
            }
            processingId = null
        }
    }

    Column(modifier = Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(14.dp),
            color = palette.subtleSurface,
            border = BorderStroke(1.dp, palette.cardBorder)
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
                    .padding(4.dp),
                horizontalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                availableTabs.forEach { tab ->
                    val count = when (tab) {
                        "leave" -> leaveItems.size
                        "overtime" -> otItems.size
                        "corrections" -> corrItems.size
                        "claims" -> claimItems.size
                        "kasbon" -> kasbonItems.size
                        else -> pettyCashItems.size
                    }
                    val label = when (tab) {
                        "leave" -> tr(lang, "Cuti", "Leave")
                        "overtime" -> tr(lang, "Lembur", "Overtime")
                        "corrections" -> tr(lang, "Koreksi", "Corrections")
                        "claims" -> tr(lang, "Klaim", "Claims")
                        "kasbon" -> "Kasbon"
                        else -> "Petty Cash"
                    }
                    val selected = activeTab == tab
                    Surface(
                        onClick = { activeTab = tab },
                        shape = RoundedCornerShape(10.dp),
                        color = if (selected) palette.card else Color.Transparent,
                        shadowElevation = if (selected) 1.dp else 0.dp
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 7.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(5.dp)
                        ) {
                            Text(
                                text = label,
                                fontSize = 12.sp,
                                fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                                color = if (selected) palette.textPrimary else palette.textSecondary
                            )
                            if (count > 0) {
                                Box(
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(50))
                                        .background(if (selected) palette.accent else palette.cardBorder)
                                        .padding(horizontal = 6.dp, vertical = 1.dp)
                                ) {
                                    Text(
                                        text = count.toString(),
                                        fontSize = 10.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = if (selected) Color.White else palette.textPrimary
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }

        PullToRefreshBox(
            isRefreshing = refreshing,
            onRefresh = { refreshApprovals(isPull = true) },
            modifier = Modifier.weight(1f)
        ) {
            if (loading) {
                ListSkeletonCards(count = 4)
            } else {
                LazyColumn(
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                    contentPadding = PaddingValues(bottom = 24.dp),
                    modifier = Modifier.fillMaxSize()
                ) {
                    when (activeTab) {
                        "leave" -> {
                            if (leaveItems.isEmpty()) item { EmptyApprovalCard(lang) }
                            items(leaveItems, key = { it.id }, contentType = { "app_leave" }) { item ->
                                ApprovalCard(
                                    employeeName = item.full_name ?: "-",
                                    employeeMeta = listOfNotNull(item.nik, item.department_name).joinToString(" · "),
                                    title = item.leave_type_name ?: tr(lang, "Cuti", "Leave"),
                                    subtitle = "${Formatters.formatDisplayDate(item.start_date, lang)} – ${Formatters.formatDisplayDate(item.end_date, lang)} (${item.total_days} ${tr(lang, "hari", "d")})",
                                    reason = item.reason,
                                    busy = processingId == item.id,
                                    lang = lang,
                                    onApprove = { submitDecision("leave", item.id, "approved") },
                                    onReject = { rejectNote = ""; rejectDialog = "leave" to item.id }
                                )
                            }
                        }

                        "overtime" -> {
                            if (otItems.isEmpty()) item { EmptyApprovalCard(lang) }
                            items(otItems, key = { it.id }, contentType = { "app_ot" }) { item ->
                                ApprovalCard(
                                    employeeName = item.full_name ?: "-",
                                    employeeMeta = listOfNotNull(item.nik, item.department_name).joinToString(" · "),
                                    title = "${item.planned_hours} ${tr(lang, "jam lembur", "hrs overtime")}",
                                    subtitle = "${Formatters.formatDisplayDate(item.date, lang)} · ${item.start_time ?: ""}–${item.end_time ?: ""}",
                                    reason = item.reason,
                                    busy = processingId == item.id,
                                    lang = lang,
                                    onApprove = { submitDecision("overtime", item.id, "approved") },
                                    onReject = { rejectNote = ""; rejectDialog = "overtime" to item.id }
                                )
                            }
                        }

                        "corrections" -> {
                            if (corrItems.isEmpty()) item { EmptyApprovalCard(lang) }
                            items(corrItems, key = { it.id }, contentType = { "app_corr" }) { item ->
                                ApprovalCard(
                                    employeeName = item.full_name ?: "-",
                                    employeeMeta = listOfNotNull(item.nik, item.department_name).joinToString(" · "),
                                    title = Formatters.formatDisplayDate(item.correction_date, lang),
                                    subtitle = "${tr(lang, "Masuk", "In")}: ${item.requested_clock_in ?: "--:--"} → ${tr(lang, "Pulang", "Out")}: ${item.requested_clock_out ?: "--:--"}",
                                    reason = item.reason,
                                    busy = processingId == item.id,
                                    lang = lang,
                                    onApprove = { submitDecision("corrections", item.id, "approved") },
                                    onReject = { rejectNote = ""; rejectDialog = "corrections" to item.id }
                                )
                            }
                        }

                        "claims" -> {
                            if (claimItems.isEmpty()) item { EmptyApprovalCard(lang) }
                            items(claimItems, key = { it.id }, contentType = { "app_claim" }) { item ->
                                val thumbUrl = if (item.has_receipt && !item.receipt_url.isNullOrBlank()) {
                                    "$baseUrl${item.receipt_url}?token=$token"
                                } else null
                                ApprovalCard(
                                    employeeName = item.full_name ?: "-",
                                    employeeMeta = listOfNotNull(item.nik, item.department_name).joinToString(" · "),
                                    title = "${Formatters.formatRupiah(item.amount)} · ${item.category}",
                                    subtitle = Formatters.formatDisplayDate(item.expense_date ?: item.created_at, lang),
                                    reason = item.description,
                                    thumbUrl = thumbUrl,
                                    imageLoader = imageLoader,
                                    onPreviewThumb = { previewReceiptUrl = thumbUrl },
                                    busy = processingId == item.id,
                                    lang = lang,
                                    onApprove = { submitDecision("claims", item.id, "approved") },
                                    onReject = { rejectNote = ""; rejectDialog = "claims" to item.id }
                                )
                            }
                        }

                        "kasbon" -> {
                            if (kasbonItems.isEmpty()) item { EmptyApprovalCard(lang) }
                            items(kasbonItems, key = { it.id }, contentType = { "app_kasbon" }) { item ->
                                ApprovalCard(
                                    employeeName = item.full_name ?: "-",
                                    employeeMeta = listOfNotNull(item.nik, item.department_name).joinToString(" · "),
                                    title = Formatters.formatRupiah(item.amount),
                                    subtitle = "${item.total_instalments}x ${tr(lang, "cicilan", "instalments")}",
                                    reason = item.reason,
                                    busy = processingId == item.id,
                                    lang = lang,
                                    onApprove = { submitDecision("kasbon", item.id, "approved") },
                                    onReject = { rejectNote = ""; rejectDialog = "kasbon" to item.id }
                                )
                            }
                        }

                        else -> {
                            if (pettyCashItems.isEmpty()) item { EmptyApprovalCard(lang) }
                            items(pettyCashItems, key = { it.id }, contentType = { "app_pc" }) { item ->
                                Surface(
                                    onClick = { openPettyCashId = item.id },
                                    modifier = Modifier.fillMaxWidth(),
                                    shape = RoundedCornerShape(18.dp),
                                    color = palette.card,
                                    border = BorderStroke(1.dp, palette.cardBorder),
                                    shadowElevation = 0.dp
                                ) {
                                    Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                            Text(item.reference_no, fontSize = 11.sp, fontWeight = FontWeight.Bold, color = palette.accent)
                                            StatusPill(status = item.status, lang = lang)
                                        }
                                        Text(item.full_name ?: "-", fontWeight = FontWeight.ExtraBold, fontSize = 14.sp, color = palette.textPrimary)
                                        Text(item.purpose, fontSize = 12.sp, color = palette.textSecondary)
                                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                            Text(
                                                "${tr(lang, "Diajukan", "Requested")}: ${Formatters.formatRupiah(item.requested_amount)}",
                                                fontSize = 12.sp,
                                                fontWeight = FontWeight.Bold,
                                                color = palette.textPrimary
                                            )
                                            Text(
                                                "${tr(lang, "Realisasi", "Realized")}: ${Formatters.formatRupiah(item.total_realized)}",
                                                fontSize = 11.sp,
                                                color = palette.accent,
                                                fontWeight = FontWeight.SemiBold
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

    rejectDialog?.let { (tab, id) ->
        AlertDialog(
            onDismissRequest = { rejectDialog = null },
            containerColor = palette.card,
            title = { Text(tr(lang, "Tolak Pengajuan", "Reject Request"), fontWeight = FontWeight.Bold, color = palette.textPrimary) },
            text = {
                OutlinedTextField(
                    value = rejectNote,
                    onValueChange = { rejectNote = it },
                    label = { Text(tr(lang, "Catatan penolakan", "Rejection note")) },
                    minLines = 2,
                    modifier = Modifier.fillMaxWidth()
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        rejectDialog = null
                        submitDecision(tab, id, "rejected", rejectNote.trim().ifBlank { null })
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = palette.danger, contentColor = Color.White)
                ) {
                    Text(tr(lang, "Tolak", "Reject"), fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                TextButton(onClick = { rejectDialog = null }) {
                    Text(tr(lang, "Batal", "Cancel"))
                }
            }
        )
    }

    previewReceiptUrl?.let { url ->
        AlertDialog(
            onDismissRequest = { previewReceiptUrl = null },
            containerColor = palette.card,
            title = { Text(tr(lang, "Bukti Struk", "Receipt Proof"), fontWeight = FontWeight.Bold) },
            text = {
                AsyncImage(
                    model = ImageRequest.Builder(context).data(url).crossfade(true).build(),
                    imageLoader = imageLoader,
                    contentDescription = "Receipt",
                    contentScale = ContentScale.Fit,
                    modifier = Modifier.fillMaxWidth().height(300.dp).clip(RoundedCornerShape(12.dp)).background(Color.Black)
                )
            },
            confirmButton = {
                TextButton(onClick = { previewReceiptUrl = null }) { Text(tr(lang, "Tutup", "Close")) }
            }
        )
    }

    openPettyCashId?.let { pcId ->
        PettyCashRealizationSheet(
            requestId = pcId,
            repository = repository,
            sessionStore = sessionStore,
            apiClient = apiClient,
            onDismiss = { openPettyCashId = null },
            onMutated = { refreshApprovals() },
            onFeedback = onFeedback
        )
    }
}

@Composable
private fun EmptyApprovalCard(lang: String) {
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
            Icon(Icons.Default.DoneAll, contentDescription = null, tint = palette.success, modifier = Modifier.size(28.dp))
            Text(
                tr(lang, "Semua antrean persetujuan sudah bersih.", "No pending approvals left."),
                fontSize = 12.sp,
                color = palette.textSecondary
            )
        }
    }
}

@Composable
private fun ApprovalCard(
    employeeName: String,
    employeeMeta: String,
    title: String,
    subtitle: String,
    reason: String?,
    busy: Boolean,
    lang: String,
    thumbUrl: String? = null,
    imageLoader: ImageLoader? = null,
    onPreviewThumb: (() -> Unit)? = null,
    onApprove: () -> Unit,
    onReject: () -> Unit
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
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(employeeName, fontWeight = FontWeight.ExtraBold, fontSize = 14.sp, color = palette.textPrimary)
                    if (employeeMeta.isNotBlank()) {
                        Text(employeeMeta, fontSize = 10.sp, color = palette.textMuted)
                    }
                }
                if (thumbUrl != null && imageLoader != null) {
                    AsyncImage(
                        model = ImageRequest.Builder(context).data(thumbUrl).crossfade(true).build(),
                        imageLoader = imageLoader,
                        contentDescription = "Receipt",
                        contentScale = ContentScale.Crop,
                        modifier = Modifier
                            .size(40.dp)
                            .clip(RoundedCornerShape(10.dp))
                            .border(1.dp, palette.cardBorder, RoundedCornerShape(10.dp))
                            .clickable { onPreviewThumb?.invoke() }
                    )
                }
            }

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(palette.subtleSurface)
                    .padding(10.dp),
                verticalArrangement = Arrangement.spacedBy(2.dp)
            ) {
                Text(title, fontWeight = FontWeight.Bold, fontSize = 13.sp, color = palette.accent)
                Text(subtitle, fontSize = 11.sp, color = palette.textSecondary)
                if (!reason.isNullOrBlank()) {
                    Text(reason, fontSize = 12.sp, color = palette.textPrimary, modifier = Modifier.padding(top = 2.dp))
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OutlinedButton(
                    onClick = onReject,
                    enabled = !busy,
                    shape = RoundedCornerShape(12.dp),
                    border = BorderStroke(1.dp, palette.danger.copy(alpha = 0.45f)),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = palette.danger),
                    modifier = Modifier.weight(1f).height(38.dp),
                    contentPadding = PaddingValues(0.dp)
                ) {
                    Text(tr(lang, "Tolak", "Reject"), fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
                Button(
                    onClick = onApprove,
                    enabled = !busy,
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = palette.success, contentColor = Color.White),
                    modifier = Modifier.weight(1f).height(38.dp),
                    contentPadding = PaddingValues(0.dp)
                ) {
                    Text(tr(lang, "Setujui", "Approve"), fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TasksSection(
    repository: EssRepository,
    sessionStore: SessionStore,
    onFeedback: (String, Boolean) -> Unit
) {
    val scope = rememberCoroutineScope()
    val palette = LocalEssPalette.current
    val lang by sessionStore.langFlow.collectAsState()
    val user by sessionStore.userFlow.collectAsState()

    var tab by remember { mutableStateOf("inbox") }
    var tasks by remember { mutableStateOf<List<TaskItem>>(emptyList()) }
    var counts by remember { mutableStateOf(TaskCounts()) }
    var loading by remember { mutableStateOf(true) }
    var refreshing by remember { mutableStateOf(false) }

    var actionDialog by remember { mutableStateOf<Pair<TaskItem, String>?>(null) } // task to "action" | "close" | "approve"
    var noteInput by remember { mutableStateOf("") }

    fun loadTasks(isPull: Boolean = false) {
        if (isPull) refreshing = true else loading = true
        scope.launch {
            repository.getTasks(tab)
                .onSuccess { res ->
                    tasks = res.tasks
                    counts = res.counts
                }
                .onFailure { err -> onFeedback(err.message ?: "Error", true) }
            loading = false
            refreshing = false
        }
    }

    LaunchedEffect(tab) { loadTasks() }

    Column(modifier = Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        val tabs = listOf(
            Triple("inbox", tr(lang, "Tugas Saya", "Inbox"), counts.inbox),
            Triple("assigned", tr(lang, "Diberikan", "Assigned"), counts.assigned),
            Triple("approvals", tr(lang, "Approval", "Approvals"), counts.approvals),
            Triple("results", tr(lang, "Selesai", "Done"), counts.results)
        )
        Row(
            modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            tabs.forEach { (key, label, c) ->
                FilterChip(
                    selected = tab == key,
                    onClick = { tab = key },
                    label = { Text(if (c > 0) "$label ($c)" else label, fontSize = 11.sp) }
                )
            }
        }

        PullToRefreshBox(
            isRefreshing = refreshing,
            onRefresh = { loadTasks(isPull = true) },
            modifier = Modifier.weight(1f)
        ) {
            if (loading) {
                ListSkeletonCards(count = 4)
            } else if (tasks.isEmpty()) {
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(18.dp),
                    color = palette.card,
                    border = BorderStroke(1.dp, palette.cardBorder)
                ) {
                    Text(
                        tr(lang, "Belum ada tugas pada tab ini.", "No tasks in this tab."),
                        color = palette.textSecondary,
                        fontSize = 12.sp,
                        modifier = Modifier.padding(24.dp)
                    )
                }
            } else {
                LazyColumn(
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                    contentPadding = PaddingValues(bottom = 24.dp),
                    modifier = Modifier.fillMaxSize()
                ) {
                    items(tasks, key = { it.id }, contentType = { "tms_task" }) { t ->
                        val isAssignee = t.assignee_id == user?.employeeId
                        val canApprove = t.status == "pending_approval" &&
                            (t.assignor_id == user?.employeeId || user?.role == "owner_admin" || user?.role == "manager" || user?.hasTaskApprovalBypass() == true)
                        val isEditable = isAssignee && t.status !in setOf("pending_approval", "approved", "rejected")

                        Surface(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(18.dp),
                            color = palette.card,
                            border = BorderStroke(1.dp, palette.cardBorder)
                        ) {
                            Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(t.reference_no, fontSize = 10.sp, fontWeight = FontWeight.Bold, color = palette.accent)
                                    StatusPill(status = t.status, lang = lang)
                                }
                                Text(t.title, fontWeight = FontWeight.Bold, fontSize = 14.sp, color = palette.textPrimary)
                                if (!t.description.isNullOrBlank()) {
                                    Text(t.description, fontSize = 12.sp, color = palette.textSecondary, maxLines = 3, overflow = TextOverflow.Ellipsis)
                                }
                                Text(
                                    "${tr(lang, "Tenggat", "Due")}: ${t.due_at} · ${t.priority.uppercase()}",
                                    fontSize = 11.sp,
                                    color = palette.textMuted
                                )

                                if (isEditable) {
                                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                        OutlinedButton(
                                            onClick = { noteInput = ""; actionDialog = t to "action" },
                                            shape = RoundedCornerShape(10.dp),
                                            modifier = Modifier.weight(1f).height(36.dp),
                                            contentPadding = PaddingValues(0.dp)
                                        ) {
                                            Text(tr(lang, "Update", "Progress"), fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                                        }
                                        Button(
                                            onClick = { noteInput = ""; actionDialog = t to "close" },
                                            shape = RoundedCornerShape(10.dp),
                                            colors = ButtonDefaults.buttonColors(containerColor = palette.accent, contentColor = Color.White),
                                            modifier = Modifier.weight(1f).height(36.dp),
                                            contentPadding = PaddingValues(0.dp)
                                        ) {
                                            Text(tr(lang, "Selesaikan", "Complete"), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                        }
                                    }
                                } else if (canApprove) {
                                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                        OutlinedButton(
                                            onClick = { noteInput = ""; actionDialog = t to "return" },
                                            shape = RoundedCornerShape(10.dp),
                                            modifier = Modifier.weight(1f).height(36.dp),
                                            contentPadding = PaddingValues(0.dp)
                                        ) {
                                            Text(tr(lang, "Kembalikan", "Return"), fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                                        }
                                        Button(
                                            onClick = {
                                                scope.launch {
                                                    repository.approveTask(t.id, "approve")
                                                        .onSuccess { onFeedback(tr(lang, "Tugas disetujui", "Task approved"), false); loadTasks() }
                                                        .onFailure { onFeedback(it.message ?: "Error", true) }
                                                }
                                            },
                                            shape = RoundedCornerShape(10.dp),
                                            colors = ButtonDefaults.buttonColors(containerColor = palette.success, contentColor = Color.White),
                                            modifier = Modifier.weight(1f).height(36.dp),
                                            contentPadding = PaddingValues(0.dp)
                                        ) {
                                            Text(tr(lang, "Setujui", "Approve"), fontSize = 11.sp, fontWeight = FontWeight.Bold)
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

    actionDialog?.let { (task, mode) ->
        AlertDialog(
            onDismissRequest = { actionDialog = null },
            containerColor = palette.card,
            title = {
                Text(
                    text = when (mode) {
                        "action" -> tr(lang, "Catat Progres Tugas", "Log Task Progress")
                        "close" -> tr(lang, "Selesaikan Tugas", "Complete Task")
                        else -> tr(lang, "Kembalikan Tugas", "Return Task")
                    },
                    fontWeight = FontWeight.Bold
                )
            },
            text = {
                OutlinedTextField(
                    value = noteInput,
                    onValueChange = { noteInput = it },
                    label = { Text(tr(lang, "Catatan *", "Notes *")) },
                    minLines = 2,
                    modifier = Modifier.fillMaxWidth()
                )
            },
            confirmButton = {
                Button(
                    enabled = noteInput.isNotBlank(),
                    onClick = {
                        val txt = noteInput.trim()
                        actionDialog = null
                        scope.launch {
                            val res = when (mode) {
                                "action" -> repository.takeTaskAction(task.id, "in_progress", txt)
                                "close" -> repository.closeTask(task.id, txt)
                                else -> repository.approveTask(task.id, "return", txt)
                            }
                            res.onSuccess {
                                onFeedback(tr(lang, "Tugas diperbarui", "Task updated"), false)
                                loadTasks()
                            }.onFailure { onFeedback(it.message ?: "Error", true) }
                        }
                    }
                ) {
                    Text(tr(lang, "Kirim", "Submit"), fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                TextButton(onClick = { actionDialog = null }) { Text(tr(lang, "Batal", "Cancel")) }
            }
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PettyCashSection(
    repository: EssRepository,
    sessionStore: SessionStore,
    apiClient: ApiClient,
    showNewSheet: Boolean,
    onDismissSheet: () -> Unit,
    onFeedback: (String, Boolean) -> Unit
) {
    val scope = rememberCoroutineScope()
    val palette = LocalEssPalette.current
    val lang by sessionStore.langFlow.collectAsState()
    var items by remember { mutableStateOf<List<PettyCashRequestItem>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var refreshing by remember { mutableStateOf(false) }
    var selectedRequestId by remember { mutableStateOf<String?>(null) }

    var purpose by remember { mutableStateOf("") }
    var amount by remember { mutableStateOf("") }
    var submitting by remember { mutableStateOf(false) }

    fun load(isPull: Boolean = false) {
        if (isPull) refreshing = true else loading = true
        scope.launch {
            repository.getMyPettyCash()
                .onSuccess { items = it }
                .onFailure { onFeedback(it.message ?: "Error", true) }
            loading = false
            refreshing = false
        }
    }

    LaunchedEffect(Unit) { load() }

    PullToRefreshBox(isRefreshing = refreshing, onRefresh = { load(isPull = true) }, modifier = Modifier.fillMaxSize()) {
        if (loading) {
            ListSkeletonCards(count = 4)
        } else if (items.isEmpty()) {
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(18.dp),
                color = palette.card,
                border = BorderStroke(1.dp, palette.cardBorder)
            ) {
                Text(tr(lang, "Belum ada pengajuan petty cash.", "No petty cash requests yet."), fontSize = 12.sp, color = palette.textSecondary, modifier = Modifier.padding(24.dp))
            }
        } else {
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(10.dp),
                contentPadding = PaddingValues(bottom = 84.dp),
                modifier = Modifier.fillMaxSize()
            ) {
                items(items, key = { it.id }, contentType = { "petty_cash" }) { p ->
                    val needsRealization = p.status == "approved" || p.status == "report_rejected"
                    Surface(
                        onClick = { selectedRequestId = p.id },
                        modifier = Modifier.fillMaxWidth().pressScale(),
                        shape = RoundedCornerShape(18.dp),
                        color = palette.card,
                        border = BorderStroke(
                            1.dp,
                            if (needsRealization) palette.accent.copy(alpha = 0.45f) else palette.cardBorder
                        )
                    ) {
                        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text(p.reference_no, fontSize = 11.sp, fontWeight = FontWeight.Bold, color = palette.accent)
                                StatusPill(status = p.status, lang = lang)
                            }
                            Text(
                                Formatters.formatRupiah(p.disbursed_amount ?: p.approved_amount ?: p.requested_amount),
                                fontSize = 15.sp,
                                fontWeight = FontWeight.Black,
                                color = palette.textPrimary,
                                style = TextStyle(fontFeatureSettings = "tnum")
                            )
                            Text(p.purpose, fontSize = 12.sp, color = palette.textSecondary)
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    "${p.expense_count} ${tr(lang, "pengeluaran", "expenses")} · ${p.receipt_count} ${tr(lang, "struk", "receipts")}",
                                    fontSize = 11.sp,
                                    color = palette.textMuted
                                )
                                if (p.total_realized > 0) {
                                    Text(
                                        "${tr(lang, "Realisasi", "Realized")}: ${Formatters.formatRupiah(p.total_realized)}",
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = palette.success,
                                        style = TextStyle(fontFeatureSettings = "tnum")
                                    )
                                }
                            }
                            if (needsRealization) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clip(RoundedCornerShape(10.dp))
                                        .background(palette.accentSurface)
                                        .padding(horizontal = 10.dp, vertical = 6.dp)
                                ) {
                                    Text(
                                        tr(lang, "Ketuk untuk catat pengeluaran & kirim realisasi", "Tap to record expenses & submit realization"),
                                        fontSize = 10.5.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = palette.accent
                                    )
                                    Icon(Icons.Default.ChevronRight, contentDescription = null, tint = palette.accent, modifier = Modifier.size(16.dp))
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    selectedRequestId?.let { pcId ->
        PettyCashRealizationSheet(
            requestId = pcId,
            repository = repository,
            sessionStore = sessionStore,
            apiClient = apiClient,
            onDismiss = { selectedRequestId = null },
            onMutated = { load() },
            onFeedback = onFeedback
        )
    }

    if (showNewSheet) {
        val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        ModalBottomSheet(
            onDismissRequest = onDismissSheet,
            sheetState = sheetState,
            containerColor = palette.card,
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
                Text(tr(lang, "Ajukan Petty Cash", "Request Petty Cash"), fontWeight = FontWeight.ExtraBold, fontSize = 18.sp, color = palette.textPrimary)
                OutlinedTextField(
                    value = amount,
                    onValueChange = { amount = it },
                    label = { Text(tr(lang, "Nominal (Rp) *", "Amount (IDR) *")) },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    singleLine = true,
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = purpose,
                    onValueChange = { purpose = it },
                    label = { Text(tr(lang, "Tujuan penggunaan *", "Purpose *")) },
                    minLines = 2,
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier.fillMaxWidth()
                )
                Button(
                    enabled = !submitting && purpose.isNotBlank() && (amount.toDoubleOrNull() ?: 0.0) > 0,
                    onClick = {
                        scope.launch {
                            submitting = true
                            repository.createPettyCash(purpose.trim(), amount.toDouble())
                                .onSuccess { msg ->
                                    onFeedback(msg, false)
                                    purpose = ""
                                    amount = ""
                                    onDismissSheet()
                                    load()
                                }
                                .onFailure { onFeedback(it.message ?: "Error", true) }
                            submitting = false
                        }
                    },
                    modifier = Modifier.fillMaxWidth().height(48.dp).pressScale(),
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = palette.accent, contentColor = Color.White)
                ) {
                    Text(tr(lang, "Kirim Pengajuan Petty Cash", "Submit Petty Cash Request"), fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MyAssetsSection(
    repository: EssRepository,
    lang: String,
    onFeedback: (String, Boolean) -> Unit
) {
    val scope = rememberCoroutineScope()
    val palette = LocalEssPalette.current
    var assets by remember { mutableStateOf<List<AssignedAssetItem>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var refreshing by remember { mutableStateOf(false) }

    fun load(isPull: Boolean = false) {
        if (isPull) refreshing = true else loading = true
        scope.launch {
            repository.getMyAssets()
                .onSuccess { assets = it }
                .onFailure { onFeedback(it.message ?: "Error", true) }
            loading = false
            refreshing = false
        }
    }

    LaunchedEffect(Unit) { load() }

    PullToRefreshBox(isRefreshing = refreshing, onRefresh = { load(isPull = true) }, modifier = Modifier.fillMaxSize()) {
        if (loading) {
            ListSkeletonCards(count = 3)
        } else if (assets.isEmpty()) {
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(18.dp),
                color = palette.card,
                border = BorderStroke(1.dp, palette.cardBorder)
            ) {
                Text(tr(lang, "Belum ada aset perusahaan yang dipinjamkan.", "No company assets currently assigned."), fontSize = 12.sp, color = palette.textSecondary, modifier = Modifier.padding(24.dp))
            }
        } else {
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(10.dp),
                contentPadding = PaddingValues(bottom = 24.dp),
                modifier = Modifier.fillMaxSize()
            ) {
                items(assets, key = { it.id }, contentType = { "asset_item" }) { a ->
                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(18.dp),
                        color = palette.card,
                        border = BorderStroke(1.dp, palette.cardBorder)
                    ) {
                        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text(a.asset_tag, fontSize = 11.sp, fontWeight = FontWeight.Bold, color = palette.accent)
                                StatusPill(status = a.condition_out ?: a.condition, lang = lang)
                            }
                            Text(a.name, fontWeight = FontWeight.Bold, fontSize = 14.sp, color = palette.textPrimary)
                            Text(
                                listOfNotNull(a.category.uppercase(), a.serial_number?.let { "SN: $it" }).joinToString(" · "),
                                fontSize = 11.sp,
                                color = palette.textSecondary
                            )
                            Text(
                                "${tr(lang, "Diserahkan", "Assigned")}: ${Formatters.formatDisplayDate(a.assigned_at, lang)}" +
                                    (a.expected_return_at?.let { " · ${tr(lang, "Kembali", "Return")}: ${Formatters.formatDisplayDate(it, lang)}" } ?: ""),
                                fontSize = 11.sp,
                                color = palette.textMuted
                            )
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MyDocumentsSection(
    repository: EssRepository,
    lang: String,
    onFeedback: (String, Boolean) -> Unit
) {
    val scope = rememberCoroutineScope()
    val palette = LocalEssPalette.current
    var docs by remember { mutableStateOf<List<SigningRequestItem>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var refreshing by remember { mutableStateOf(false) }

    fun load(isPull: Boolean = false) {
        if (isPull) refreshing = true else loading = true
        scope.launch {
            repository.getMySigningRequests()
                .onSuccess { docs = it }
                .onFailure { onFeedback(it.message ?: "Error", true) }
            loading = false
            refreshing = false
        }
    }

    LaunchedEffect(Unit) { load() }

    PullToRefreshBox(isRefreshing = refreshing, onRefresh = { load(isPull = true) }, modifier = Modifier.fillMaxSize()) {
        if (loading) {
            ListSkeletonCards(count = 3)
        } else if (docs.isEmpty()) {
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(18.dp),
                color = palette.card,
                border = BorderStroke(1.dp, palette.cardBorder)
            ) {
                Text(tr(lang, "Belum ada dokumen atau pengajuan tanda tangan.", "No signing requests or HR documents yet."), fontSize = 12.sp, color = palette.textSecondary, modifier = Modifier.padding(24.dp))
            }
        } else {
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(10.dp),
                contentPadding = PaddingValues(bottom = 24.dp),
                modifier = Modifier.fillMaxSize()
            ) {
                items(docs, key = { it.id }, contentType = { "doc_item" }) { d ->
                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(18.dp),
                        color = palette.card,
                        border = BorderStroke(1.dp, palette.cardBorder)
                    ) {
                        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text(
                                    (d.workflow ?: d.template_code ?: "DOCUMENT").replace("_", " ").uppercase(),
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = palette.accent
                                )
                                StatusPill(status = d.status, lang = lang)
                            }
                            if (!d.employee_name.isNullOrBlank()) {
                                Text(d.employee_name, fontWeight = FontWeight.Bold, fontSize = 13.sp, color = palette.textPrimary)
                            }
                            Text(
                                "${tr(lang, "Penanda tangan", "Signers")}: ${d.signer_signed}/${d.signer_total} · ${d.document_count} ${tr(lang, "berkas", "files")}",
                                fontSize = 11.sp,
                                color = palette.textSecondary
                            )
                            Text(
                                "${tr(lang, "Dibuat", "Created")}: ${Formatters.formatDisplayDate(d.created_at, lang)}",
                                fontSize = 10.sp,
                                color = palette.textMuted
                            )
                        }
                    }
                }
            }
        }
    }
}
