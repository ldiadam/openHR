package id.openhr.ess.ui.screens

import android.graphics.Bitmap
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
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
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
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
        return if (hideSalary) "Rp \u2022\u2022\u2022\u2022\u2022\u2022\u2022" else Formatters.formatRupiah(amount)
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
                Text("${tr(lang, "Periode Tahun", "Year")} Â· $selectedYear", style = MaterialTheme.typography.bodySmall, color = palette.textSecondary)
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
                                        "${Formatters.formatDisplayDate(item.period_start, lang)} - ${Formatters.formatDisplayDate(item.period_end, lang)}",
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
                    text = if (hideSalary) "Rp \u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" else Formatters.formatRupiah(item.take_home_pay),
                    color = Color(0xFF34D399),
                    fontWeight = FontWeight.Black,
                    fontSize = 26.sp,
                    style = TextStyle(fontFeatureSettings = "tnum")
                )
                Text(
                    text = "${Formatters.formatDisplayDate(item.period_start, lang)} - ${Formatters.formatDisplayDate(item.period_end, lang)}",
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
    val context = LocalContext.current
    var pdfBitmaps by remember(payslip.id, lang) { mutableStateOf<List<Bitmap>>(emptyList()) }
    var rendering by remember(payslip.id, lang) { mutableStateOf(true) }

    LaunchedEffect(payslip.id, lang) {
        rendering = true
        pdfBitmaps = withContext(Dispatchers.IO) {
            runCatching {
                val file = PayslipPdfExporter.generatePdfFile(context, payslip, lang)
                val pages = mutableListOf<Bitmap>()
                ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY).use { pfd ->
                    PdfRenderer(pfd).use { renderer ->
                        for (i in 0 until renderer.pageCount) {
                            renderer.openPage(i).use { page ->
                                val width = (page.width * 2).coerceAtLeast(1080)
                                val height = (width * page.height.toFloat() / page.width.toFloat()).toInt()
                                val bmp = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
                                bmp.eraseColor(android.graphics.Color.WHITE)
                                page.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                                pages.add(bmp)
                            }
                        }
                    }
                }
                pages
            }.getOrDefault(emptyList())
        }
        rendering = false
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Surface(
            modifier = Modifier
                .fillMaxSize()
                .padding(10.dp),
            shape = RoundedCornerShape(22.dp),
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
                        Text(tr(lang, "Pratinjau Slip Gaji (PDF)", "Payslip PDF Preview"), fontWeight = FontWeight.Bold, fontSize = 15.sp, color = palette.textPrimary)
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
                            Text(tr(lang, "Buka / Unduh", "Open / Save"), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                        }
                        IconButton(onClick = onDismiss) {
                            Icon(Icons.Default.Close, contentDescription = "Close", tint = palette.textPrimary)
                        }
                    }
                }

                Box(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth()
                        .background(palette.subtleSurface),
                    contentAlignment = Alignment.Center
                ) {
                    if (rendering) {
                        CircularProgressIndicator(color = palette.accent)
                    } else if (pdfBitmaps.isEmpty()) {
                        Text(
                            tr(lang, "Gagal merender pratinjau PDF", "Unable to render PDF preview"),
                            fontSize = 13.sp,
                            color = palette.textSecondary
                        )
                    } else {
                        Column(
                            modifier = Modifier
                                .fillMaxSize()
                                .verticalScroll(rememberScrollState())
                                .padding(12.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            pdfBitmaps.forEach { bmp ->
                                Surface(
                                    shape = RoundedCornerShape(12.dp),
                                    shadowElevation = 3.dp,
                                    color = Color.White,
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Image(
                                        bitmap = bmp.asImageBitmap(),
                                        contentDescription = "Payslip PDF Page",
                                        contentScale = ContentScale.FillWidth,
                                        modifier = Modifier.fillMaxWidth()
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
