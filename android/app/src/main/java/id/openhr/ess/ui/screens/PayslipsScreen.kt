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
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import id.openhr.ess.data.local.SessionStore
import id.openhr.ess.data.model.PayslipDetail
import id.openhr.ess.data.model.PayslipSummaryItem
import id.openhr.ess.data.repository.EssRepository
import id.openhr.ess.ui.components.FeedbackBanner
import id.openhr.ess.ui.components.ListSkeletonCards
import id.openhr.ess.ui.components.pressScale
import id.openhr.ess.ui.components.tr
import id.openhr.ess.ui.theme.LocalEssPalette
import id.openhr.ess.util.Formatters
import id.openhr.ess.util.PayslipCalculator
import id.openhr.ess.util.PayslipPdfExporter
import kotlinx.coroutines.launch
import java.time.LocalDate
import kotlin.math.roundToInt

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PayslipsScreen(
    repository: EssRepository,
    sessionStore: SessionStore
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val palette = LocalEssPalette.current
    val lang by sessionStore.langFlow.collectAsState()
    val hideSalary by sessionStore.hideSalaryFlow.collectAsState()

    var selectedYear by remember { mutableStateOf(LocalDate.now().year) }
    var payslips by remember { mutableStateOf(repository.cachedPayslips ?: emptyList()) }
    var selectedDetail by remember { mutableStateOf<PayslipDetail?>(null) }
    var loading by remember { mutableStateOf(repository.cachedPayslips == null) }
    var refreshing by remember { mutableStateOf(false) }
    var feedback by remember { mutableStateOf<Pair<String, Boolean>?>(null) }

    fun loadPayslips(isPullRefresh: Boolean = false) {
        if (isPullRefresh) refreshing = true else if (payslips.isEmpty()) loading = true
        scope.launch {
            repository.getMyPayslips()
                .onSuccess { payslips = it }
                .onFailure { err ->
                    if (payslips.isEmpty() || isPullRefresh) {
                        feedback = (err.message ?: tr(lang, "Gagal memuat slip gaji", "Failed to load payslips")) to true
                    }
                }
            loading = false
            refreshing = false
        }
    }

    LaunchedEffect(Unit) {
        loadPayslips()
    }

    val filtered = remember(payslips, selectedYear) {
        payslips.filter {
            (it.period_end.ifBlank { it.period_start }).startsWith(selectedYear.toString())
        }
    }

    fun maskedMoney(amount: Double): String {
        return if (hideSalary) "Rp •••••••" else Formatters.formatRupiah(amount)
    }

    fun openDetail(id: String, exportPdfImmediately: Boolean = false) {
        scope.launch {
            repository.getPayslipDetail(id)
                .onSuccess { detail ->
                    if (exportPdfImmediately) {
                        runCatching { PayslipPdfExporter.exportAndOpen(context, detail, lang) }
                            .onFailure { err ->
                                feedback = (err.message ?: tr(lang, "Gagal membuat PDF", "Failed to generate PDF")) to true
                            }
                    } else {
                        selectedDetail = detail
                    }
                }
                .onFailure { err ->
                    feedback = (err.message ?: tr(lang, "Gagal membuka slip gaji", "Failed to open payslip")) to true
                }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(palette.canvas)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // Header + Eye Toggle + Year Selector
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(tr(lang, "Slip Gaji", "Payslips"), style = MaterialTheme.typography.titleLarge, color = palette.textPrimary)
                Text("${tr(lang, "Periode Tahun", "Year")} · $selectedYear", style = MaterialTheme.typography.bodySmall, color = palette.textSecondary)
            }

            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Surface(
                    onClick = { sessionStore.setHideSalary(!hideSalary) },
                    shape = RoundedCornerShape(12.dp),
                    color = palette.card,
                    border = BorderStroke(1.dp, palette.cardBorder),
                    modifier = Modifier.size(36.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            imageVector = if (hideSalary) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                            contentDescription = "Toggle salary privacy",
                            tint = palette.accent,
                            modifier = Modifier.size(18.dp)
                        )
                    }
                }

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .clip(RoundedCornerShape(12.dp))
                        .background(palette.card)
                        .border(1.dp, palette.cardBorder, RoundedCornerShape(12.dp))
                ) {
                    IconButton(onClick = { selectedYear -= 1 }, modifier = Modifier.size(34.dp)) {
                        Icon(Icons.Default.ChevronLeft, contentDescription = "Prev year", tint = palette.textPrimary)
                    }
                    Text(
                        text = selectedYear.toString(),
                        fontWeight = FontWeight.Bold,
                        fontSize = 13.sp,
                        color = palette.textPrimary,
                        style = TextStyle(fontFeatureSettings = "tnum"),
                        modifier = Modifier.padding(horizontal = 4.dp)
                    )
                    IconButton(onClick = { selectedYear += 1 }, modifier = Modifier.size(34.dp)) {
                        Icon(Icons.Default.ChevronRight, contentDescription = "Next year", tint = palette.textPrimary)
                    }
                }
            }
        }

        feedback?.let { (msg, isErr) ->
            FeedbackBanner(message = msg, isError = isErr, onDismiss = { feedback = null })
        }

        PullToRefreshBox(
            isRefreshing = refreshing,
            onRefresh = { loadPayslips(isPullRefresh = true) },
            modifier = Modifier.weight(1f)
        ) {
            if (loading) {
                ListSkeletonCards(count = 4)
            } else if (filtered.isEmpty()) {
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(20.dp),
                    color = palette.card,
                    border = BorderStroke(1.dp, palette.cardBorder)
                ) {
                    Column(
                        modifier = Modifier.padding(28.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Icon(Icons.Default.ReceiptLong, contentDescription = null, tint = palette.textMuted, modifier = Modifier.size(28.dp))
                        Text(
                            text = if (payslips.isEmpty()) {
                                tr(lang, "Belum ada slip gaji yang diterbitkan.", "No payslips issued yet.")
                            } else {
                                tr(lang, "Tidak ada slip gaji pada tahun $selectedYear.", "No payslips in $selectedYear.")
                            },
                            color = palette.textSecondary,
                            fontSize = 12.sp
                        )
                    }
                }
            } else {
                val latest = filtered.first()
                val rest = filtered.drop(1)
                LazyColumn(
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                    contentPadding = PaddingValues(bottom = 16.dp),
                    modifier = Modifier.fillMaxSize()
                ) {
                    item(key = "hero_${latest.id}", contentType = "hero_payslip") {
                        HeroLatestPayslipCard(
                            item = latest,
                            hideSalary = hideSalary,
                            lang = lang,
                            onToggleHide = { sessionStore.setHideSalary(!hideSalary) },
                            onOpenDetail = { openDetail(latest.id) },
                            onDownloadPdf = { openDetail(latest.id, exportPdfImmediately = true) }
                        )
                    }

                    if (rest.isNotEmpty()) {
                        item(key = "header_older", contentType = "section_header") {
                            Text(
                                text = tr(lang, "Riwayat Sebelumnya", "Earlier Periods"),
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                color = palette.textMuted,
                                letterSpacing = 0.6.sp,
                                modifier = Modifier.padding(top = 6.dp, start = 4.dp)
                            )
                        }
                    }

                    items(rest, key = { it.id }, contentType = { "payslip_row" }) { item ->
                        Surface(
                            modifier = Modifier
                                .fillMaxWidth()
                                .pressScale()
                                .clickable { openDetail(item.id) },
                            shape = RoundedCornerShape(18.dp),
                            color = palette.card,
                            border = BorderStroke(1.dp, palette.cardBorder),
                            shadowElevation = 0.dp
                        ) {
                            Row(
                                modifier = Modifier.padding(14.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(44.dp)
                                        .clip(RoundedCornerShape(14.dp))
                                        .background(palette.successSurface),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Icon(Icons.Default.AttachMoney, contentDescription = null, tint = palette.success)
                                }
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(item.period_title, fontWeight = FontWeight.Bold, fontSize = 13.sp, color = palette.textPrimary)
                                    Text(
                                        "${Formatters.formatDisplayDate(item.period_start, lang)} – ${Formatters.formatDisplayDate(item.period_end, lang)}",
                                        fontSize = 11.sp,
                                        color = palette.textSecondary
                                    )
                                    Text(
                                        text = maskedMoney(item.take_home_pay),
                                        fontWeight = FontWeight.Black,
                                        fontSize = 15.sp,
                                        color = palette.success,
                                        style = TextStyle(fontFeatureSettings = "tnum")
                                    )
                                }
                                Icon(Icons.Default.ChevronRight, contentDescription = null, tint = palette.accent)
                            }
                        }
                    }
                }
            }
        }
    }

    selectedDetail?.let { detail ->
        PayslipDetailDialog(
            payslip = detail,
            lang = lang,
            onDismiss = { selectedDetail = null },
            onDownloadPdf = {
                runCatching {
                    PayslipPdfExporter.exportAndOpen(context, detail, lang)
                }.onFailure { err ->
                    feedback = (err.message ?: tr(lang, "Gagal membuat PDF", "Failed to generate PDF")) to true
                }
            }
        )
    }
}

@Composable
private fun HeroLatestPayslipCard(
    item: PayslipSummaryItem,
    hideSalary: Boolean,
    lang: String,
    onToggleHide: () -> Unit,
    onOpenDetail: () -> Unit,
    onDownloadPdf: () -> Unit
) {
    val palette = LocalEssPalette.current
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(24.dp))
            .background(Brush.linearGradient(listOf(palette.heroStart, palette.heroEnd)))
            .clickable(onClick = onOpenDetail)
            .padding(18.dp)
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Surface(
                    shape = RoundedCornerShape(50),
                    color = Color.White.copy(alpha = 0.14f)
                ) {
                    Text(
                        text = tr(lang, "SLIP TERBARU", "LATEST PAYSLIP"),
                        color = Color(0xFF93C5FD),
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 0.8.sp,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
                    )
                }
                IconButton(onClick = onToggleHide, modifier = Modifier.size(30.dp)) {
                    Icon(
                        imageVector = if (hideSalary) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                        contentDescription = "Mask salary",
                        tint = Color.White.copy(alpha = 0.85f),
                        modifier = Modifier.size(18.dp)
                    )
                }
            }

            Column {
                Text(
                    text = item.period_title,
                    color = Color.White.copy(alpha = 0.8f),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = if (hideSalary) "Rp •••••••••" else Formatters.formatRupiah(item.take_home_pay),
                    color = Color(0xFF34D399),
                    fontWeight = FontWeight.Black,
                    fontSize = 26.sp,
                    style = TextStyle(fontFeatureSettings = "tnum")
                )
                Text(
                    text = "${Formatters.formatDisplayDate(item.period_start, lang)} – ${Formatters.formatDisplayDate(item.period_end, lang)}",
                    color = Color.White.copy(alpha = 0.65f),
                    fontSize = 11.sp
                )
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Button(
                    onClick = onOpenDetail,
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color.White.copy(alpha = 0.16f),
                        contentColor = Color.White
                    ),
                    modifier = Modifier.weight(1f).height(40.dp),
                    contentPadding = PaddingValues(horizontal = 12.dp)
                ) {
                    Icon(Icons.Default.Description, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(tr(lang, "Lihat Rincian", "View Breakdown"), fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }

                Button(
                    onClick = onDownloadPdf,
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = palette.accent,
                        contentColor = Color.White
                    ),
                    modifier = Modifier.height(40.dp),
                    contentPadding = PaddingValues(horizontal = 14.dp)
                ) {
                    Icon(Icons.Default.Download, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("PDF", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

@Composable
private fun PayslipDetailDialog(
    payslip: PayslipDetail,
    lang: String,
    onDismiss: () -> Unit,
    onDownloadPdf: () -> Unit
) {
    val palette = LocalEssPalette.current
    val breakdown = remember(payslip, lang) { PayslipCalculator.compute(payslip, lang) }
    val paymentDateStr = Formatters.formatDisplayDate(payslip.payment_date ?: payslip.period_end, lang)

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Surface(
            modifier = Modifier
                .fillMaxSize()
                .padding(12.dp),
            shape = RoundedCornerShape(24.dp),
            color = palette.card
        ) {
            Column(modifier = Modifier.fillMaxSize()) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(palette.subtleSurface)
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(tr(lang, "Slip Gaji", "Payslip"), fontWeight = FontWeight.Bold, fontSize = 16.sp, color = palette.textPrimary)
                        Text(payslip.run_title ?: "-", fontSize = 11.sp, color = palette.textSecondary)
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                        Button(
                            onClick = onDownloadPdf,
                            shape = RoundedCornerShape(10.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = palette.accent, contentColor = Color.White),
                            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
                        ) {
                            Icon(Icons.Default.Download, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(tr(lang, "Unduh PDF", "Download PDF"), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                        }
                        IconButton(onClick = onDismiss) {
                            Icon(Icons.Default.Close, contentDescription = "Close", tint = palette.textPrimary)
                        }
                    }
                }

                Column(
                    modifier = Modifier
                        .weight(1f)
                        .verticalScroll(rememberScrollState())
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp)
                ) {
                    // Letterhead (matches Web)
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.Top
                    ) {
                        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text(
                                tr(lang, "SLIP GAJI KARYAWAN", "EMPLOYEE PAYSLIP"),
                                fontSize = 9.sp,
                                fontWeight = FontWeight.Bold,
                                letterSpacing = 1.sp,
                                color = palette.textMuted
                            )
                            Text(payslip.company_name ?: "openHR", fontWeight = FontWeight.Bold, fontSize = 16.sp, color = palette.textPrimary)
                            if (!payslip.company_address.isNullOrBlank()) {
                                Text(payslip.company_address, fontSize = 11.sp, color = palette.textSecondary)
                            }
                            if (!payslip.company_npwp.isNullOrBlank()) {
                                Text("NPWP: ${payslip.company_npwp}", fontSize = 10.sp, color = palette.textSecondary)
                            }
                        }
                        Surface(
                            shape = RoundedCornerShape(6.dp),
                            color = palette.heroStart
                        ) {
                            Text(
                                tr(lang, "RAHASIA", "CONFIDENTIAL"),
                                fontSize = 9.sp,
                                fontWeight = FontWeight.Bold,
                                color = Color.White,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                            )
                        }
                    }

                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(
                            "${tr(lang, "Periode", "Period")}: ${Formatters.formatDisplayDate(payslip.period_start, lang)} – ${Formatters.formatDisplayDate(payslip.period_end, lang)}",
                            fontSize = 11.sp,
                            color = palette.textSecondary,
                            fontWeight = FontWeight.Medium
                        )
                        Text(
                            "${tr(lang, "Tanggal Bayar", "Payment Date")}: $paymentDateStr",
                            fontSize = 11.sp,
                            color = palette.textSecondary
                        )
                    }

                    // Proportional Earnings vs Deductions Stacked Bar
                    val grossDisplay = breakdown.grossEarningsDisplay
                    val totalFlow = (grossDisplay + payslip.total_deductions).coerceAtLeast(1.0)
                    val earnWeight = (grossDisplay / totalFlow).toFloat().coerceIn(0.05f, 0.95f)
                    val dedWeight = (1f - earnWeight).coerceAtLeast(0.05f)
                    val dedPct = ((payslip.total_deductions / grossDisplay.coerceAtLeast(1.0)) * 100.0).roundToInt()

                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(14.dp))
                            .background(palette.subtleSurface)
                            .border(1.dp, palette.cardBorder, RoundedCornerShape(14.dp))
                            .padding(12.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text(
                                "${tr(lang, "Bruto", "Gross")}: ${Formatters.formatRupiah(grossDisplay)}",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                color = palette.success,
                                style = TextStyle(fontFeatureSettings = "tnum")
                            )
                            Text(
                                "${tr(lang, "Potongan", "Deductions")} ($dedPct%): ${Formatters.formatRupiah(payslip.total_deductions)}",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                color = palette.danger,
                                style = TextStyle(fontFeatureSettings = "tnum")
                            )
                        }
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(8.dp)
                                .clip(RoundedCornerShape(50)),
                            horizontalArrangement = Arrangement.spacedBy(2.dp)
                        ) {
                            Box(
                                modifier = Modifier
                                    .weight(earnWeight)
                                    .fillMaxHeight()
                                    .background(palette.success)
                            )
                            if (payslip.total_deductions > 0) {
                                Box(
                                    modifier = Modifier
                                        .weight(dedWeight)
                                        .fillMaxHeight()
                                        .background(palette.danger)
                                )
                            }
                        }
                    }

                    // Employee Details Box (matches Web 9 fields)
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(14.dp))
                            .background(palette.subtleSurface)
                            .border(1.dp, palette.cardBorder, RoundedCornerShape(14.dp))
                            .padding(12.dp),
                        verticalArrangement = Arrangement.spacedBy(5.dp)
                    ) {
                        PayslipLine(tr(lang, "Nama Karyawan", "Employee Name"), payslip.employee_name ?: "-")
                        PayslipLine(tr(lang, "NIK / ID", "Employee ID"), payslip.employee_nik ?: "-")
                        PayslipLine(tr(lang, "Jabatan", "Job Title"), payslip.job_title ?: "-")
                        PayslipLine(tr(lang, "Departemen", "Department"), payslip.department_name ?: "-")
                        PayslipLine(tr(lang, "Status PTKP", "Tax Status"), payslip.ptkp_status ?: "-")
                        PayslipLine(
                            tr(lang, "Rekening Bank", "Bank Account"),
                            when {
                                !payslip.bank_account_number.isNullOrBlank() ->
                                    "${payslip.bank_name ?: "-"} · ${payslip.bank_account_number}"
                                !payslip.bank_name.isNullOrBlank() ->
                                    "${payslip.bank_name} · ${tr(lang, "belum diisi", "not set")}"
                                else -> "-"
                            }
                        )
                        PayslipLine(
                            tr(lang, "Hari Kerja", "Working Days"),
                            "${PayslipCalculator.formatCount(payslip.days_worked)} / ${PayslipCalculator.formatCount(payslip.expected_working_days)} ${tr(lang, "hari", "days")}"
                        )
                        PayslipLine(
                            tr(lang, "Lembur Disetujui", "Approved Overtime"),
                            "${PayslipCalculator.formatCount(payslip.overtime_hours)} ${tr(lang, "jam", "hrs")}"
                        )
                        PayslipLine(tr(lang, "Metode Pajak", "Tax Method"), payslip.pph21_method ?: "-")
                    }

                    // Earnings
                    Text(tr(lang, "PENGHASILAN", "EARNINGS"), fontSize = 11.sp, fontWeight = FontWeight.Bold, color = palette.success)
                    breakdown.earnings.forEach { row ->
                        MoneyRow(row.label, row.amount, subLabel = row.subLabel)
                    }
                    HorizontalDivider(color = palette.cardBorder)
                    MoneyRow(tr(lang, "Total Penghasilan Bruto", "Gross Earnings"), breakdown.grossEarningsDisplay, bold = true)

                    // Deductions
                    Text(tr(lang, "POTONGAN", "DEDUCTIONS"), fontSize = 11.sp, fontWeight = FontWeight.Bold, color = palette.danger)
                    if (breakdown.deductions.isEmpty()) {
                        Text(
                            text = if (payslip.total_deductions > 0) {
                                tr(lang, "Rincian potongan tidak tersedia untuk periode ini", "Deduction breakdown unavailable for this period")
                            } else {
                                tr(lang, "Tidak ada potongan pada periode ini", "No deductions in this period")
                            },
                            fontSize = 11.sp,
                            color = palette.textMuted
                        )
                    } else {
                        breakdown.deductions.forEach { row ->
                            MoneyRow(row.label, row.amount, subLabel = row.subLabel)
                        }
                    }
                    HorizontalDivider(color = palette.cardBorder)
                    MoneyRow(tr(lang, "Total Potongan", "Total Deductions"), payslip.total_deductions, bold = true)

                    // Non-earning Reimbursement Callout (matches Web — separate from Gross Earnings!)
                    if (payslip.reimbursement_amount > 0) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(12.dp))
                                .background(palette.subtleSurface)
                                .border(1.dp, palette.cardBorder, RoundedCornerShape(12.dp))
                                .padding(horizontal = 12.dp, vertical = 10.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    tr(lang, "Reimbursement (Penggantian Biaya)", "Reimbursement (Expense Claim)"),
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = palette.textPrimary
                                )
                                Text(
                                    tr(lang, "Bukan penghasilan · Tidak kena pajak", "Non-earning · Non-taxable"),
                                    fontSize = 10.sp,
                                    color = palette.textSecondary
                                )
                            }
                            Text(
                                text = "+${Formatters.formatRupiah(payslip.reimbursement_amount)}",
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                                color = palette.success,
                                style = TextStyle(fontFeatureSettings = "tnum")
                            )
                        }
                    }

                    // Net Take Home Pay Box (matches Web)
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(16.dp))
                            .background(Brush.linearGradient(listOf(palette.heroStart, palette.heroEnd)))
                            .padding(16.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text(
                                tr(lang, "GAJI BERSIH DITERIMA", "NET TAKE-HOME PAY"),
                                color = Color(0xFFCBD5E1),
                                fontWeight = FontWeight.Bold,
                                fontSize = 10.sp,
                                letterSpacing = 0.8.sp
                            )
                            Text(
                                text = if (!payslip.bank_account_number.isNullOrBlank()) {
                                    "${tr(lang, "Ditransfer ke", "Transferred to")} ${payslip.bank_name ?: "-"} · ${payslip.bank_account_number}"
                                } else {
                                    tr(lang, "Nomor rekening belum diisi", "Bank account number not set")
                                },
                                color = Color(0xFF94A3B8),
                                fontSize = 10.sp
                            )
                        }
                        Text(
                            Formatters.formatRupiah(payslip.take_home_pay),
                            color = Color(0xFF34D399),
                            fontWeight = FontWeight.Black,
                            fontSize = 18.sp,
                            style = TextStyle(fontFeatureSettings = "tnum")
                        )
                    }

                    // Employer BPJS Contributions (matches Web — shows rows + Total Beban Perusahaan)
                    if (breakdown.employerContributions.isNotEmpty()) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(12.dp))
                                .background(palette.subtleSurface)
                                .border(1.dp, palette.cardBorder, RoundedCornerShape(12.dp))
                                .padding(12.dp),
                            verticalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Text(
                                tr(lang, "KONTRIBUSI PERUSAHAAN (BUKAN POTONGAN GAJI)", "EMPLOYER CONTRIBUTIONS (NOT DEDUCTED FROM PAY)"),
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                                color = palette.textSecondary
                            )
                            breakdown.employerContributions.forEach { row ->
                                MoneyRow(row.label, row.amount)
                            }
                            HorizontalDivider(color = palette.cardBorder)
                            MoneyRow(tr(lang, "Total Beban Perusahaan", "Total Employer Cost"), payslip.total_employer_cost, bold = true)
                        }
                    }

                    // Signatures (matches Web)
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(tr(lang, "Diterima oleh", "Received by"), fontSize = 10.sp, color = palette.textMuted)
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(payslip.employee_name ?: "-", fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = palette.textPrimary)
                        }
                        Column(modifier = Modifier.weight(1f), horizontalAlignment = Alignment.End) {
                            Text(tr(lang, "Disahkan oleh", "Authorized by"), fontSize = 10.sp, color = palette.textMuted)
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                payslip.approver_name ?: payslip.company_name ?: "HR / Finance",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = palette.textPrimary
                            )
                            val authSub = payslip.approver_title ?: if (payslip.authorized_by_company) tr(lang, "Perusahaan", "Company") else null
                            if (!authSub.isNullOrBlank()) {
                                Text(authSub, fontSize = 9.sp, color = palette.textMuted)
                            }
                        }
                    }

                    HorizontalDivider(color = palette.cardBorder)
                    Text(
                        text = tr(
                            lang,
                            "Dokumen ini bersifat rahasia dan dihasilkan otomatis oleh sistem penggajian. Tidak memerlukan tanda tangan basah.",
                            "This document is confidential and generated automatically by the payroll system. No wet signature is required."
                        ),
                        fontSize = 9.5.sp,
                        color = palette.textMuted
                    )
                }
            }
        }
    }
}

@Composable
private fun PayslipLine(label: String, value: String) {
    val palette = LocalEssPalette.current
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, fontSize = 11.sp, color = palette.textSecondary)
        Text(value, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = palette.textPrimary)
    }
}

@Composable
private fun MoneyRow(label: String, amount: Double, bold: Boolean = false, subLabel: String? = null) {
    val palette = LocalEssPalette.current
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.Top
    ) {
        Column(modifier = Modifier.weight(1f).padding(end = 8.dp)) {
            Text(
                label,
                fontSize = 12.sp,
                fontWeight = if (bold) FontWeight.Bold else FontWeight.Normal,
                color = if (bold) palette.textPrimary else palette.textSecondary
            )
            if (!subLabel.isNullOrBlank()) {
                Text(
                    subLabel,
                    fontSize = 10.sp,
                    color = palette.textMuted,
                    style = TextStyle(fontFeatureSettings = "tnum")
                )
            }
        }
        Text(
            Formatters.formatRupiah(amount),
            fontSize = 12.sp,
            fontWeight = if (bold) FontWeight.Bold else FontWeight.SemiBold,
            color = palette.textPrimary,
            style = TextStyle(fontFeatureSettings = "tnum")
        )
    }
}
