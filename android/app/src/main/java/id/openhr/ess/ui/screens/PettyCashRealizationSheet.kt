package id.openhr.ess.ui.screens

import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
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
import id.openhr.ess.ui.components.AppDatePickerDialog
import id.openhr.ess.ui.components.CameraCaptureDialog
import id.openhr.ess.ui.components.ListSkeletonCards
import id.openhr.ess.ui.components.StatusPill
import id.openhr.ess.ui.components.pressScale
import id.openhr.ess.ui.components.tr
import id.openhr.ess.ui.theme.LocalEssPalette
import id.openhr.ess.util.Formatters
import kotlinx.coroutines.launch

private val PETTY_CASH_CATEGORIES = listOf(
    "transport",
    "meals",
    "office_supplies",
    "utilities",
    "maintenance",
    "travel",
    "other"
)

private fun categoryLabel(code: String, lang: String): String = when (code) {
    "transport" -> "Transport"
    "meals" -> if (lang == "id") "Makan & Minum" else "Meals"
    "office_supplies" -> if (lang == "id") "ATK / Kantor" else "Office Supplies"
    "utilities" -> if (lang == "id") "Utilitas" else "Utilities"
    "maintenance" -> if (lang == "id") "Perbaikan" else "Maintenance"
    "travel" -> if (lang == "id") "Perjalanan" else "Travel"
    else -> if (lang == "id") "Lainnya" else "Other"
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PettyCashRealizationSheet(
    requestId: String,
    repository: EssRepository,
    sessionStore: SessionStore,
    apiClient: ApiClient,
    onDismiss: () -> Unit,
    onMutated: () -> Unit,
    onFeedback: (String, Boolean) -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val palette = LocalEssPalette.current
    val lang by sessionStore.langFlow.collectAsState()
    val baseUrl by sessionStore.baseUrlFlow.collectAsState()
    val token by sessionStore.tokenFlow.collectAsState()

    var detail by remember { mutableStateOf<PettyCashDetailResponse?>(null) }
    var loading by remember { mutableStateOf(true) }
    var busy by remember { mutableStateOf(false) }

    // Add Expense Dialog State
    var showAddExpense by remember { mutableStateOf(false) }
    var expDate by remember { mutableStateOf(Formatters.localDateString()) }
    var expCategory by remember { mutableStateOf("transport") }
    var expAmount by remember { mutableStateOf("") }
    var expDesc by remember { mutableStateOf("") }
    var expVendor by remember { mutableStateOf("") }
    var expNotes by remember { mutableStateOf("") }
    var expReceiptBase64 by remember { mutableStateOf<String?>(null) }
    var expReceiptMime by remember { mutableStateOf("image/jpeg") }
    var expReceiptName by remember { mutableStateOf("receipt.jpg") }
    var showDatePicker by remember { mutableStateOf(false) }

    // Camera / Gallery / Reject / Preview state
    var cameraTargetExpenseId by remember { mutableStateOf<String?>(null) } // null = new expense, non-null = existing expense
    var cameraOpen by remember { mutableStateOf(false) }
    var galleryTargetExpenseId by remember { mutableStateOf<String?>(null) }
    var previewImageUrl by remember { mutableStateOf<String?>(null) }
    var rejectMode by remember { mutableStateOf<String?>(null) } // "request" or "report"
    var rejectNote by remember { mutableStateOf("") }

    val imageLoader = remember(apiClient.okHttpClient) {
        ImageLoader.Builder(context).okHttpClient(apiClient.okHttpClient).build()
    }

    fun loadDetail() {
        scope.launch {
            if (detail == null) loading = true
            repository.getPettyCashDetail(requestId)
                .onSuccess { detail = it }
                .onFailure { onFeedback(it.message ?: "Error", true) }
            loading = false
        }
    }

    LaunchedEffect(requestId) { loadDetail() }

    val galleryPicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        uri ?: return@rememberLauncherForActivityResult
        val rawMime = context.contentResolver.getType(uri) ?: "image/jpeg"
        val b64 = Formatters.uriToBase64DataUrl(context, uri)
        if (b64 == null) {
            onFeedback(tr(lang, "Gagal membaca lampiran.", "Failed to read attachment."), true)
            return@rememberLauncherForActivityResult
        }
        val mime = if (rawMime.startsWith("image/")) "image/jpeg" else rawMime
        val queriedName = context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
            if (c.moveToFirst()) c.getString(0) else null
        }
        val baseName = queriedName ?: uri.lastPathSegment?.substringAfterLast('/') ?: "receipt"
        val fileName = if (rawMime.startsWith("image/") && !baseName.lowercase().matches(Regex(".*\\.(png|jpe?g|webp)$"))) {
            "$baseName.jpg"
        } else {
            baseName
        }
        val targetExp = galleryTargetExpenseId
        if (targetExp == null) {
            expReceiptBase64 = b64
            expReceiptMime = mime
            expReceiptName = fileName
        } else {
            scope.launch {
                busy = true
                repository.uploadPettyCashReceipt(
                    requestId,
                    targetExp,
                    UploadPettyCashReceiptRequest(b64, mime, fileName)
                ).onSuccess { msg ->
                    onFeedback(msg, false)
                    loadDetail()
                    onMutated()
                }.onFailure { onFeedback(it.message ?: "Error", true) }
                busy = false
            }
        }
    }

    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(
        onDismissRequest = onDismiss,
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
            if (loading || detail == null) {
                Text(
                    tr(lang, "Realisasi Petty Cash", "Petty Cash Realization"),
                    fontWeight = FontWeight.ExtraBold,
                    fontSize = 18.sp
                )
                ListSkeletonCards(count = 3)
            } else {
                val d = detail!!
                val req = d.request
                val rights = d.rights
                val totals = d.totals
                val missingReceiptCount = d.expenses.count { it.receipts.isEmpty() }

                // Header
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(req.reference_no, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = palette.accent)
                        Text(
                            req.purpose,
                            fontWeight = FontWeight.ExtraBold,
                            fontSize = 17.sp,
                            color = palette.textPrimary
                        )
                        if (!req.full_name.isNullOrBlank()) {
                            Text(
                                listOfNotNull(req.full_name, req.department_name ?: req.department_label).joinToString(" · "),
                                fontSize = 11.sp,
                                color = palette.textSecondary
                            )
                        }
                    }
                    StatusPill(status = req.status, lang = lang)
                }

                // Rejection / Revision Notes
                val alertNote = req.report_note?.ifBlank { null } ?: req.rejection_note?.ifBlank { null }
                if (alertNote != null) {
                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = palette.dangerSurface,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(
                            "${tr(lang, "Catatan Reviewer", "Reviewer Note")}: $alertNote",
                            color = palette.danger,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.padding(10.dp)
                        )
                    }
                }

                // 3 Financial Totals Tiles
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    TotalMiniTile(
                        label = tr(lang, "Dicairkan", "Disbursed"),
                        amount = totals.disbursed_amount,
                        color = palette.accent,
                        modifier = Modifier.weight(1f)
                    )
                    TotalMiniTile(
                        label = tr(lang, "Realisasi", "Realized"),
                        amount = totals.total_realized,
                        color = palette.textPrimary,
                        modifier = Modifier.weight(1f)
                    )
                    TotalMiniTile(
                        label = tr(lang, "Selisih", "Variance"),
                        amount = totals.variance,
                        color = if (totals.variance < 0) palette.danger else palette.success,
                        modifier = Modifier.weight(1f)
                    )
                }

                // Finance Initial Disbursement Controls
                if (rights.canApprove || rights.canReject) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                        if (rights.canReject) {
                            OutlinedButton(
                                onClick = { rejectNote = ""; rejectMode = "request" },
                                enabled = !busy,
                                shape = RoundedCornerShape(12.dp),
                                border = BorderStroke(1.dp, palette.danger.copy(alpha = 0.45f)),
                                colors = ButtonDefaults.outlinedButtonColors(contentColor = palette.danger),
                                modifier = Modifier.weight(1f).height(42.dp)
                            ) {
                                Text(tr(lang, "Tolak", "Reject"), fontWeight = FontWeight.Bold, fontSize = 12.sp)
                            }
                        }
                        if (rights.canApprove) {
                            Button(
                                onClick = {
                                    scope.launch {
                                        busy = true
                                        repository.approvePettyCash(req.id)
                                            .onSuccess { msg ->
                                                onFeedback(msg, false)
                                                loadDetail()
                                                onMutated()
                                            }
                                            .onFailure { onFeedback(it.message ?: "Error", true) }
                                        busy = false
                                    }
                                },
                                enabled = !busy,
                                shape = RoundedCornerShape(12.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = palette.success, contentColor = Color.White),
                                modifier = Modifier.weight(1f).height(42.dp)
                            ) {
                                Text(tr(lang, "Setujui & Cairkan", "Approve & Disburse"), fontWeight = FontWeight.Bold, fontSize = 12.sp)
                            }
                        }
                    }
                }

                // Expenses Section Header + Add Button
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        "${tr(lang, "RINCIAN PENGELUARAN", "EXPENSES")} (${d.expenses.size})",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = palette.textMuted,
                        letterSpacing = 0.6.sp
                    )
                    if (rights.canEditExpenses) {
                        FilledTonalButton(
                            onClick = {
                                expDate = Formatters.localDateString()
                                expCategory = "transport"
                                expAmount = ""
                                expDesc = ""
                                expVendor = ""
                                expNotes = ""
                                expReceiptBase64 = null
                                showAddExpense = true
                            },
                            shape = RoundedCornerShape(10.dp),
                            colors = ButtonDefaults.filledTonalButtonColors(
                                containerColor = palette.accentSurface,
                                contentColor = palette.accent
                            ),
                            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp),
                            modifier = Modifier.height(32.dp)
                        ) {
                            Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(15.dp))
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(tr(lang, "Tambah", "Add Expense"), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }

                if (d.expenses.isEmpty()) {
                    Surface(
                        shape = RoundedCornerShape(14.dp),
                        color = palette.subtleSurface,
                        border = BorderStroke(1.dp, palette.cardBorder),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(
                            text = if (rights.canEditExpenses) {
                                tr(lang, "Belum ada pengeluaran. Tap Tambah untuk mencatat belanja + foto struk.", "No expenses yet. Tap Add Expense to record spending & attach receipt.")
                            } else {
                                tr(lang, "Belum ada catatan pengeluaran.", "No expenses recorded.")
                            },
                            fontSize = 12.sp,
                            color = palette.textSecondary,
                            modifier = Modifier.padding(16.dp)
                        )
                    }
                } else {
                    d.expenses.forEach { exp ->
                        Surface(
                            shape = RoundedCornerShape(16.dp),
                            color = palette.subtleSurface,
                            border = BorderStroke(1.dp, palette.cardBorder),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(
                                modifier = Modifier.padding(12.dp),
                                verticalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.Top
                                ) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            "${Formatters.formatDisplayDate(exp.expense_date, lang)} · ${categoryLabel(exp.category, lang)}",
                                            fontSize = 10.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = palette.accent
                                        )
                                        Text(exp.description, fontWeight = FontWeight.Bold, fontSize = 13.sp, color = palette.textPrimary)
                                        val meta = listOfNotNull(
                                            exp.vendor?.ifBlank { null },
                                            exp.notes?.ifBlank { null }
                                        ).joinToString(" · ")
                                        if (meta.isNotBlank()) {
                                            Text(meta, fontSize = 11.sp, color = palette.textSecondary)
                                        }
                                    }
                                    Column(horizontalAlignment = Alignment.End) {
                                        Text(
                                            Formatters.formatRupiah(exp.amount),
                                            fontWeight = FontWeight.Black,
                                            fontSize = 13.sp,
                                            color = palette.textPrimary,
                                            style = TextStyle(fontFeatureSettings = "tnum")
                                        )
                                        if (rights.canEditExpenses) {
                                            IconButton(
                                                onClick = {
                                                    scope.launch {
                                                        busy = true
                                                        repository.deletePettyCashExpense(req.id, exp.id)
                                                            .onSuccess { msg ->
                                                                onFeedback(msg, false)
                                                                loadDetail()
                                                                onMutated()
                                                            }
                                                            .onFailure { onFeedback(it.message ?: "Error", true) }
                                                        busy = false
                                                    }
                                                },
                                                modifier = Modifier.size(28.dp)
                                            ) {
                                                Icon(Icons.Default.DeleteOutline, contentDescription = "Delete expense", tint = palette.danger, modifier = Modifier.size(16.dp))
                                            }
                                        }
                                    }
                                }

                                // Receipt Thumbnails + Attach buttons
                                if (exp.receipts.isNotEmpty()) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                                    ) {
                                        exp.receipts.forEach { rec ->
                                            val isImg = (rec.mime_type ?: "").startsWith("image/") ||
                                                rec.file_name.lowercase().matches(Regex(".*\\.(png|jpe?g|webp|heic|heif)$"))
                                            val url = "$baseUrl${rec.url}?token=$token"
                                            Surface(
                                                shape = RoundedCornerShape(10.dp),
                                                color = palette.card,
                                                border = BorderStroke(1.dp, palette.cardBorder),
                                                modifier = Modifier.clickable {
                                                    if (isImg) {
                                                        previewImageUrl = url
                                                    } else {
                                                        runCatching {
                                                            context.startActivity(
                                                                Intent(Intent.ACTION_VIEW, Uri.parse(url))
                                                                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                                                            )
                                                        }
                                                    }
                                                }
                                            ) {
                                                Row(
                                                    modifier = Modifier.padding(4.dp).padding(end = if (rights.canEditExpenses) 2.dp else 6.dp),
                                                    verticalAlignment = Alignment.CenterVertically,
                                                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                                                ) {
                                                    if (isImg) {
                                                        AsyncImage(
                                                            model = ImageRequest.Builder(context).data(url).crossfade(true).build(),
                                                            imageLoader = imageLoader,
                                                            contentDescription = rec.file_name,
                                                            contentScale = ContentScale.Crop,
                                                            modifier = Modifier.size(30.dp).clip(RoundedCornerShape(6.dp))
                                                        )
                                                    } else {
                                                        Icon(Icons.Default.AttachFile, contentDescription = null, tint = palette.accent, modifier = Modifier.size(16.dp))
                                                    }
                                                    Text(
                                                        rec.file_name.take(14),
                                                        fontSize = 10.sp,
                                                        color = palette.textSecondary,
                                                        maxLines = 1,
                                                        overflow = TextOverflow.Ellipsis
                                                    )
                                                    if (rights.canEditExpenses) {
                                                        IconButton(
                                                            onClick = {
                                                                scope.launch {
                                                                    busy = true
                                                                    repository.deletePettyCashReceipt(req.id, exp.id, rec.id)
                                                                        .onSuccess { loadDetail(); onMutated() }
                                                                        .onFailure { onFeedback(it.message ?: "Error", true) }
                                                                    busy = false
                                                                }
                                                            },
                                                            modifier = Modifier.size(20.dp)
                                                        ) {
                                                            Icon(Icons.Default.Close, contentDescription = "Remove receipt", tint = palette.danger, modifier = Modifier.size(13.dp))
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                } else {
                                    Text(
                                        tr(lang, "Belum ada struk bukti (wajib sebelum kirim laporan)", "No receipt uploaded (required to submit)"),
                                        fontSize = 10.sp,
                                        color = palette.warning,
                                        fontWeight = FontWeight.Medium
                                    )
                                }

                                if (rights.canEditExpenses) {
                                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                        TextButton(
                                            onClick = {
                                                cameraTargetExpenseId = exp.id
                                                cameraOpen = true
                                            },
                                            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 2.dp),
                                            modifier = Modifier.height(28.dp)
                                        ) {
                                            Icon(Icons.Default.PhotoCamera, contentDescription = null, modifier = Modifier.size(14.dp))
                                            Spacer(modifier = Modifier.width(4.dp))
                                            Text(tr(lang, "Kamera", "Camera"), fontSize = 11.sp)
                                        }
                                        TextButton(
                                            onClick = {
                                                galleryTargetExpenseId = exp.id
                                                galleryPicker.launch("*/*")
                                            },
                                            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 2.dp),
                                            modifier = Modifier.height(28.dp)
                                        ) {
                                            Icon(Icons.Default.UploadFile, contentDescription = null, modifier = Modifier.size(14.dp))
                                            Spacer(modifier = Modifier.width(4.dp))
                                            Text(tr(lang, "Galeri / File", "File"), fontSize = 11.sp)
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                // Submit Realization Report Button (Employee)
                if (rights.canSubmitReport) {
                    val canSubmit = d.expenses.isNotEmpty() && missingReceiptCount == 0 && !busy
                    if (d.expenses.isNotEmpty() && missingReceiptCount > 0) {
                        Text(
                            tr(lang, "Unggah bukti struk pada semua pengeluaran ($missingReceiptCount tersisa) sebelum mengirim.", "Attach receipts to all expenses ($missingReceiptCount missing) before submitting."),
                            fontSize = 11.sp,
                            color = palette.warning,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                    Button(
                        onClick = {
                            scope.launch {
                                busy = true
                                repository.submitPettyCashReport(req.id)
                                    .onSuccess { msg ->
                                        onFeedback(msg, false)
                                        loadDetail()
                                        onMutated()
                                    }
                                    .onFailure { onFeedback(it.message ?: "Error", true) }
                                busy = false
                            }
                        },
                        enabled = canSubmit,
                        shape = RoundedCornerShape(14.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = palette.success, contentColor = Color.White),
                        modifier = Modifier.fillMaxWidth().height(48.dp).pressScale()
                    ) {
                        Icon(Icons.Default.Send, contentDescription = null, modifier = Modifier.size(17.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(tr(lang, "Kirim Laporan Realisasi", "Submit Realization Report"), fontWeight = FontWeight.Bold)
                    }
                }

                // Finance Review of Realization Report
                if (rights.canReviewReport) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                        OutlinedButton(
                            onClick = { rejectNote = ""; rejectMode = "report" },
                            enabled = !busy,
                            shape = RoundedCornerShape(12.dp),
                            border = BorderStroke(1.dp, palette.danger.copy(alpha = 0.45f)),
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = palette.danger),
                            modifier = Modifier.weight(1f).height(44.dp)
                        ) {
                            Text(tr(lang, "Kembalikan", "Return"), fontWeight = FontWeight.Bold, fontSize = 12.sp)
                        }
                        Button(
                            onClick = {
                                scope.launch {
                                    busy = true
                                    repository.approvePettyCashReport(req.id)
                                        .onSuccess { msg ->
                                            onFeedback(msg, false)
                                            loadDetail()
                                            onMutated()
                                        }
                                        .onFailure { onFeedback(it.message ?: "Error", true) }
                                    busy = false
                                }
                            },
                            enabled = !busy,
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = palette.success, contentColor = Color.White),
                            modifier = Modifier.weight(1f).height(44.dp)
                        ) {
                            Text(tr(lang, "Setujui Realisasi", "Approve Report"), fontWeight = FontWeight.Bold, fontSize = 12.sp)
                        }
                    }
                }

                if (rights.canCancel) {
                    OutlinedButton(
                        onClick = {
                            scope.launch {
                                busy = true
                                repository.cancelPettyCash(req.id)
                                    .onSuccess { msg ->
                                        onFeedback(msg, false)
                                        onMutated()
                                        onDismiss()
                                    }
                                    .onFailure { onFeedback(it.message ?: "Error", true) }
                                busy = false
                            }
                        },
                        enabled = !busy,
                        shape = RoundedCornerShape(12.dp),
                        border = BorderStroke(1.dp, palette.danger.copy(alpha = 0.45f)),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = palette.danger),
                        modifier = Modifier.fillMaxWidth().height(42.dp)
                    ) {
                        Text(tr(lang, "Batalkan Pengajuan", "Cancel Request"), fontWeight = FontWeight.Bold, fontSize = 12.sp)
                    }
                }
            }
        }
    }

    // Add Expense Dialog
    if (showAddExpense) {
        AlertDialog(
            onDismissRequest = { showAddExpense = false },
            containerColor = palette.card,
            title = { Text(tr(lang, "Catat Pengeluaran", "Record Expense"), fontWeight = FontWeight.Bold, color = palette.textPrimary) },
            text = {
                Column(
                    modifier = Modifier.verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Surface(
                        onClick = { showDatePicker = true },
                        shape = RoundedCornerShape(12.dp),
                        color = palette.subtleSurface,
                        border = BorderStroke(1.dp, palette.cardBorder),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Icon(Icons.Default.CalendarToday, contentDescription = null, tint = palette.accent, modifier = Modifier.size(16.dp))
                            Text(Formatters.formatDisplayDate(expDate, lang), fontWeight = FontWeight.Bold, fontSize = 13.sp, color = palette.textPrimary)
                        }
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        PETTY_CASH_CATEGORIES.forEach { cat ->
                            FilterChip(
                                selected = expCategory == cat,
                                onClick = { expCategory = cat },
                                label = { Text(categoryLabel(cat, lang), fontSize = 11.sp) }
                            )
                        }
                    }

                    OutlinedTextField(
                        value = expDesc,
                        onValueChange = { expDesc = it },
                        label = { Text(tr(lang, "Deskripsi *", "Description *")) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = expAmount,
                        onValueChange = { expAmount = it },
                        label = { Text(tr(lang, "Nominal (Rp) *", "Amount (IDR) *")) },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = expVendor,
                        onValueChange = { expVendor = it },
                        label = { Text(tr(lang, "Toko / Vendor", "Vendor")) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = expNotes,
                        onValueChange = { expNotes = it },
                        label = { Text(tr(lang, "Catatan", "Notes")) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )

                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(
                            onClick = { cameraTargetExpenseId = null; cameraOpen = true },
                            modifier = Modifier.weight(1f)
                        ) {
                            Icon(Icons.Default.PhotoCamera, contentDescription = null, modifier = Modifier.size(15.dp))
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(tr(lang, "Kamera", "Camera"), fontSize = 11.sp)
                        }
                        OutlinedButton(
                            onClick = { galleryTargetExpenseId = null; galleryPicker.launch("*/*") },
                            modifier = Modifier.weight(1f)
                        ) {
                            Icon(Icons.Default.AttachFile, contentDescription = null, modifier = Modifier.size(15.dp))
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(tr(lang, "File", "File"), fontSize = 11.sp)
                        }
                    }
                    if (expReceiptBase64 != null) {
                        Text(
                            "✓ ${tr(lang, "Lampiran siap", "Receipt ready")}: $expReceiptName",
                            color = palette.success,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }
            },
            confirmButton = {
                Button(
                    enabled = !busy && expDesc.isNotBlank() && (expAmount.toDoubleOrNull() ?: 0.0) > 0,
                    onClick = {
                        scope.launch {
                            busy = true
                            val receipts = expReceiptBase64?.let {
                                listOf(PettyCashReceiptUpload(it, expReceiptMime, expReceiptName))
                            } ?: emptyList()
                            repository.addPettyCashExpense(
                                requestId,
                                AddPettyCashExpenseRequest(
                                    expense_date = expDate,
                                    category = expCategory,
                                    description = expDesc.trim(),
                                    amount = expAmount.toDouble(),
                                    vendor = expVendor.trim().ifBlank { null },
                                    notes = expNotes.trim().ifBlank { null },
                                    receipts = receipts
                                )
                            ).onSuccess { msg ->
                                onFeedback(msg, false)
                                showAddExpense = false
                                loadDetail()
                                onMutated()
                            }.onFailure { onFeedback(it.message ?: "Error", true) }
                            busy = false
                        }
                    }
                ) {
                    Text(tr(lang, "Simpan", "Save"), fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                TextButton(onClick = { showAddExpense = false }) { Text(tr(lang, "Batal", "Cancel")) }
            }
        )
    }

    if (showDatePicker) {
        AppDatePickerDialog(
            initialDate = expDate,
            lang = lang,
            onDismiss = { showDatePicker = false },
            onConfirm = { expDate = it; showDatePicker = false }
        )
    }

    if (cameraOpen) {
        CameraCaptureDialog(
            title = tr(lang, "Foto Bukti Pengeluaran", "Take Receipt Photo"),
            useFrontCamera = false,
            lang = lang,
            onDismiss = { cameraOpen = false },
            onCaptured = { base64 ->
                cameraOpen = false
                val targetExp = cameraTargetExpenseId
                if (targetExp == null) {
                    expReceiptBase64 = base64
                    expReceiptMime = "image/jpeg"
                    expReceiptName = "camera_${System.currentTimeMillis()}.jpg"
                } else {
                    scope.launch {
                        busy = true
                        repository.uploadPettyCashReceipt(
                            requestId,
                            targetExp,
                            UploadPettyCashReceiptRequest(base64, "image/jpeg", "camera_${System.currentTimeMillis()}.jpg")
                        ).onSuccess { msg ->
                            onFeedback(msg, false)
                            loadDetail()
                            onMutated()
                        }.onFailure { onFeedback(it.message ?: "Error", true) }
                        busy = false
                    }
                }
            }
        )
    }

    rejectMode?.let { mode ->
        AlertDialog(
            onDismissRequest = { rejectMode = null },
            containerColor = palette.card,
            title = {
                Text(
                    if (mode == "request") tr(lang, "Tolak Petty Cash", "Reject Petty Cash")
                    else tr(lang, "Kembalikan Realisasi", "Return Realization Report"),
                    fontWeight = FontWeight.Bold
                )
            },
            text = {
                OutlinedTextField(
                    value = rejectNote,
                    onValueChange = { rejectNote = it },
                    label = { Text(tr(lang, "Alasan / Catatan *", "Reason / Note *")) },
                    minLines = 2,
                    modifier = Modifier.fillMaxWidth()
                )
            },
            confirmButton = {
                Button(
                    enabled = rejectNote.isNotBlank() && !busy,
                    onClick = {
                        val note = rejectNote.trim()
                        rejectMode = null
                        scope.launch {
                            busy = true
                            val res = if (mode == "request") repository.rejectPettyCash(requestId, note)
                            else repository.rejectPettyCashReport(requestId, note)
                            res.onSuccess { msg ->
                                onFeedback(msg, false)
                                loadDetail()
                                onMutated()
                            }.onFailure { onFeedback(it.message ?: "Error", true) }
                            busy = false
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = palette.danger, contentColor = Color.White)
                ) {
                    Text(tr(lang, "Kirim", "Submit"), fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                TextButton(onClick = { rejectMode = null }) { Text(tr(lang, "Batal", "Cancel")) }
            }
        )
    }

    previewImageUrl?.let { url ->
        AlertDialog(
            onDismissRequest = { previewImageUrl = null },
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
                TextButton(onClick = { previewImageUrl = null }) { Text(tr(lang, "Tutup", "Close")) }
            }
        )
    }
}

@Composable
private fun TotalMiniTile(
    label: String,
    amount: Double,
    color: Color,
    modifier: Modifier = Modifier
) {
    val palette = LocalEssPalette.current
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(12.dp),
        color = palette.subtleSurface,
        border = BorderStroke(1.dp, palette.cardBorder)
    ) {
        Column(modifier = Modifier.padding(horizontal = 8.dp, vertical = 8.dp)) {
            Text(label, fontSize = 9.5.sp, fontWeight = FontWeight.SemiBold, color = palette.textMuted)
            Text(
                Formatters.formatRupiah(amount),
                fontSize = 11.sp,
                fontWeight = FontWeight.Black,
                color = color,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                style = TextStyle(fontFeatureSettings = "tnum")
            )
        }
    }
}
