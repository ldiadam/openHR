package id.openhr.ess.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
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
import id.openhr.ess.ui.components.tr
import id.openhr.ess.ui.theme.*
import id.openhr.ess.util.Formatters
import id.openhr.ess.util.PayslipPdfExporter
import kotlinx.coroutines.launch
import java.time.LocalDate

@Composable
fun PayslipsScreen(
    repository: EssRepository,
    sessionStore: SessionStore
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val lang by sessionStore.langFlow.collectAsState()

    var selectedYear by remember { mutableStateOf(LocalDate.now().year) }
    var payslips by remember { mutableStateOf<List<PayslipSummaryItem>>(emptyList()) }
    var selectedDetail by remember { mutableStateOf<PayslipDetail?>(null) }
    var loading by remember { mutableStateOf(true) }
    var feedback by remember { mutableStateOf<Pair<String, Boolean>?>(null) }

    LaunchedEffect(Unit) {
        loading = true
        repository.getMyPayslips()
            .onSuccess { payslips = it }
            .onFailure { err ->
                feedback = (err.message ?: tr(lang, "Gagal memuat slip gaji", "Failed to load payslips")) to true
            }
        loading = false
    }

    val filtered = remember(payslips, selectedYear) {
        payslips.filter {
            (it.period_end.ifBlank { it.period_start }).startsWith(selectedYear.toString())
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(tr(lang, "Slip Gaji", "Payslips"), style = MaterialTheme.typography.titleLarge)
                Text("${tr(lang, "Slip Gaji", "Payslips")} · $selectedYear", style = MaterialTheme.typography.bodySmall)
            }
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .clip(RoundedCornerShape(12.dp))
                    .background(Color.White)
                    .border(1.dp, Slate200, RoundedCornerShape(12.dp))
            ) {
                IconButton(onClick = { selectedYear -= 1 }, modifier = Modifier.size(34.dp)) {
                    Icon(Icons.Default.ChevronLeft, contentDescription = "Prev year")
                }
                Text(
                    text = selectedYear.toString(),
                    fontWeight = FontWeight.Bold,
                    fontSize = 13.sp,
                    modifier = Modifier.padding(horizontal = 6.dp)
                )
                IconButton(onClick = { selectedYear += 1 }, modifier = Modifier.size(34.dp)) {
                    Icon(Icons.Default.ChevronRight, contentDescription = "Next year")
                }
            }
        }

        feedback?.let { (msg, isErr) ->
            FeedbackBanner(message = msg, isError = isErr, onDismiss = { feedback = null })
        }

        if (loading) {
            Box(modifier = Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        } else if (filtered.isEmpty()) {
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(20.dp),
                color = Color.White
            ) {
                Text(
                    text = if (payslips.isEmpty()) {
                        tr(lang, "Belum ada slip gaji yang diterbitkan.", "No payslips issued yet.")
                    } else {
                        tr(lang, "Tidak ada slip gaji pada tahun $selectedYear.", "No payslips in $selectedYear.")
                    },
                    color = Slate500,
                    fontSize = 12.sp,
                    modifier = Modifier.padding(28.dp)
                )
            }
        } else {
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(10.dp),
                contentPadding = PaddingValues(bottom = 16.dp),
                modifier = Modifier.fillMaxSize()
            ) {
                items(filtered, key = { it.id }) { item ->
                    Surface(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable {
                                scope.launch {
                                    repository.getPayslipDetail(item.id)
                                        .onSuccess { selectedDetail = it }
                                        .onFailure { err ->
                                            feedback = (err.message ?: tr(lang, "Gagal membuka slip gaji", "Failed to open payslip")) to true
                                        }
                                }
                            },
                        shape = RoundedCornerShape(20.dp),
                        color = Color.White,
                        shadowElevation = 1.dp
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
                                    .background(Emerald50),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(Icons.Default.AttachMoney, contentDescription = null, tint = Emerald600)
                            }
                            Column(modifier = Modifier.weight(1f)) {
                                Text(item.period_title, fontWeight = FontWeight.Bold, fontSize = 13.sp, color = Slate900)
                                Text(
                                    "${Formatters.formatDisplayDate(item.period_start, lang)} – ${Formatters.formatDisplayDate(item.period_end, lang)}",
                                    fontSize = 11.sp,
                                    color = Slate500
                                )
                                Text(
                                    text = Formatters.formatRupiah(item.take_home_pay),
                                    fontWeight = FontWeight.Black,
                                    fontSize = 15.sp,
                                    color = Emerald600
                                )
                            }
                            Icon(Icons.Default.ChevronRight, contentDescription = null, tint = Blue600)
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
private fun PayslipDetailDialog(
    payslip: PayslipDetail,
    lang: String,
    onDismiss: () -> Unit,
    onDownloadPdf: () -> Unit
) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Surface(
            modifier = Modifier
                .fillMaxSize()
                .padding(12.dp),
            shape = RoundedCornerShape(24.dp),
            color = Color.White
        ) {
            Column(modifier = Modifier.fillMaxSize()) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Slate50)
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(tr(lang, "Slip Gaji", "Payslip"), fontWeight = FontWeight.Bold, fontSize = 15.sp)
                        Text(payslip.run_title ?: "-", fontSize = 11.sp, color = Slate500)
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                        Button(
                            onClick = onDownloadPdf,
                            shape = RoundedCornerShape(10.dp),
                            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
                        ) {
                            Icon(Icons.Default.Download, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("PDF", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        }
                        IconButton(onClick = onDismiss) {
                            Icon(Icons.Default.Close, contentDescription = "Close")
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
                    // Company & Period
                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(payslip.company_name ?: "openHR", fontWeight = FontWeight.Bold, fontSize = 16.sp, color = Slate900)
                        if (!payslip.company_address.isNullOrBlank()) {
                            Text(payslip.company_address, fontSize = 11.sp, color = Slate500)
                        }
                        Text(
                            "${tr(lang, "Periode", "Period")}: ${Formatters.formatDisplayDate(payslip.period_start, lang)} – ${Formatters.formatDisplayDate(payslip.period_end, lang)}",
                            fontSize = 11.sp,
                            color = Slate600,
                            fontWeight = FontWeight.Medium
                        )
                    }

                    // Employee box
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(14.dp))
                            .background(Slate50)
                            .border(1.dp, Slate200, RoundedCornerShape(14.dp))
                            .padding(12.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        PayslipLine(tr(lang, "Nama", "Name"), payslip.employee_name ?: "-")
                        PayslipLine("NIK", payslip.employee_nik ?: "-")
                        PayslipLine(tr(lang, "Jabatan", "Job Title"), payslip.job_title ?: "-")
                        PayslipLine("PTKP", payslip.ptkp_status ?: "-")
                        PayslipLine(
                            tr(lang, "Rekening", "Bank"),
                            listOfNotNull(payslip.bank_name, payslip.bank_account_number).joinToString(" · ").ifBlank { "-" }
                        )
                    }

                    // Earnings
                    Text(tr(lang, "PENDAPATAN", "EARNINGS"), fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Emerald600)
                    MoneyRow(tr(lang, "Gaji Pokok", "Base Salary"), payslip.base_salary)
                    val prorationDelta = payslip.prorated_salary - payslip.base_salary
                    if (prorationDelta != 0.0) {
                        MoneyRow(tr(lang, "Penyesuaian Prorata", "Proration Adjustment"), prorationDelta)
                    }
                    MoneyRow(tr(lang, "Tunjangan Tetap", "Fixed Allowance"), payslip.fixed_allowance)
                    if (payslip.thr_amount > 0) MoneyRow("THR", payslip.thr_amount)
                    if (payslip.overtime_pay > 0) MoneyRow(tr(lang, "Lembur (${payslip.overtime_hours} jam)", "Overtime (${payslip.overtime_hours} hrs)"), payslip.overtime_pay)
                    if (payslip.attendance_bonus > 0) MoneyRow(tr(lang, "Bonus Kehadiran", "Attendance Bonus"), payslip.attendance_bonus)
                    if (payslip.commission_bonus > 0) MoneyRow(tr(lang, "Komisi / Bonus", "Commission / Bonus"), payslip.commission_bonus)
                    if (payslip.reimbursement_amount > 0) MoneyRow("Reimbursement", payslip.reimbursement_amount)
                    HorizontalDivider(color = Slate200)
                    MoneyRow(tr(lang, "Total Pendapatan", "Gross Earnings"), payslip.gross_earnings, bold = true)

                    // Deductions
                    Text(tr(lang, "POTONGAN", "DEDUCTIONS"), fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Rose600)
                    if (payslip.bpjs_kes_employee > 0) MoneyRow(tr(lang, "BPJS Kesehatan (1%)", "BPJS Health (1%)"), payslip.bpjs_kes_employee)
                    if (payslip.bpjs_jht_employee > 0) MoneyRow("BPJS JHT (2%)", payslip.bpjs_jht_employee)
                    if (payslip.bpjs_jp_employee > 0) MoneyRow("BPJS JP (1%)", payslip.bpjs_jp_employee)
                    if (payslip.pph21_amount > 0) MoneyRow("PPh 21 (${payslip.pph21_method ?: "TER"})", payslip.pph21_amount)
                    if (payslip.kasbon_deduction > 0) MoneyRow(tr(lang, "Cicilan Kasbon", "Salary Advance"), payslip.kasbon_deduction)
                    if (payslip.late_deduction > 0) MoneyRow(tr(lang, "Potongan Terlambat", "Late Deduction"), payslip.late_deduction)
                    if (payslip.unpaid_leave_deduction > 0) MoneyRow(tr(lang, "Cuti Tidak Berbayar", "Unpaid Leave"), payslip.unpaid_leave_deduction)
                    if (payslip.alpha_deduction > 0) MoneyRow(tr(lang, "Alpa / Tanpa Keterangan", "Absence Deduction"), payslip.alpha_deduction)
                    if (payslip.other_deductions > 0) MoneyRow(tr(lang, "Potongan Lainnya", "Other Deductions"), payslip.other_deductions)
                    HorizontalDivider(color = Slate200)
                    MoneyRow(tr(lang, "Total Potongan", "Total Deductions"), payslip.total_deductions, bold = true)

                    // Take Home Pay Box
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(16.dp))
                            .background(Slate900)
                            .padding(16.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(tr(lang, "Gaji Bersih (THP)", "Take Home Pay"), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                        Text(Formatters.formatRupiah(payslip.take_home_pay), color = Color(0xFF34D399), fontWeight = FontWeight.Black, fontSize = 18.sp)
                    }
                }
            }
        }
    }
}

@Composable
private fun PayslipLine(label: String, value: String) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, fontSize = 11.sp, color = Slate500)
        Text(value, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = Slate900)
    }
}

@Composable
private fun MoneyRow(label: String, amount: Double, bold: Boolean = false) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(
            label,
            fontSize = 12.sp,
            fontWeight = if (bold) FontWeight.Bold else FontWeight.Normal,
            color = if (bold) Slate900 else Slate600
        )
        Text(
            Formatters.formatRupiah(amount),
            fontSize = 12.sp,
            fontWeight = if (bold) FontWeight.Bold else FontWeight.SemiBold,
            color = Slate900
        )
    }
}
