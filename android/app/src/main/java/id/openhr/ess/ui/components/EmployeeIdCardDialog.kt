package id.openhr.ess.ui.components

import android.graphics.Bitmap
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.google.zxing.BarcodeFormat
import com.google.zxing.MultiFormatWriter
import id.openhr.ess.data.model.CardLinkItem
import id.openhr.ess.data.model.EmployeeProfile
import id.openhr.ess.data.repository.EssRepository
import id.openhr.ess.ui.theme.LocalEssPalette
import id.openhr.ess.util.Formatters
import kotlinx.coroutines.launch
import java.net.URLEncoder

private fun generateQrBitmap(content: String, sizePx: Int = 420): Bitmap? {
    return runCatching {
        val bitMatrix = MultiFormatWriter().encode(content, BarcodeFormat.QR_CODE, sizePx, sizePx)
        val bmp = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
        for (x in 0 until sizePx) {
            for (y in 0 until sizePx) {
                bmp.setPixel(x, y, if (bitMatrix[x, y]) android.graphics.Color.BLACK else android.graphics.Color.WHITE)
            }
        }
        bmp
    }.getOrNull()
}

private val LINK_PRESETS = listOf(
    "whatsapp" to "WhatsApp",
    "email" to "Email",
    "phone" to "Phone",
    "linkedin" to "LinkedIn",
    "instagram" to "Instagram",
    "website" to "Website",
    "custom" to "Custom"
)

@Composable
fun EmployeeIdCardDialog(
    profile: EmployeeProfile,
    companyName: String?,
    companyLogoUrl: String?,
    baseUrl: String,
    token: String?,
    lang: String,
    repository: EssRepository,
    onLinksUpdated: (String?, List<CardLinkItem>) -> Unit = { _, _ -> },
    onDismiss: () -> Unit
) {
    val context = LocalContext.current
    val palette = LocalEssPalette.current
    val density = LocalDensity.current.density
    val scope = rememberCoroutineScope()

    var showBack by remember { mutableStateOf(false) }
    var editingLinks by remember { mutableStateOf(false) }
    var savingLinks by remember { mutableStateOf(false) }
    var linkBio by remember(profile.id, profile.card_bio) { mutableStateOf(profile.card_bio.orEmpty()) }
    var links by remember(profile.id, profile.card_links) { mutableStateOf(profile.card_links) }

    val flipRotation by animateFloatAsState(
        targetValue = if (showBack) 180f else 0f,
        animationSpec = tween(durationMillis = 550, easing = FastOutSlowInEasing),
        label = "idCardFlip"
    )

    val cardUrl = remember(baseUrl, profile.id, profile.card_uuid, profile.badge_token) {
        val cleanBase = baseUrl.trimEnd('/')
        val uuid = profile.card_uuid?.takeIf { it.isNotBlank() }
        if (uuid != null) {
            "$cleanBase/card/${URLEncoder.encode(uuid, "UTF-8")}"
        } else {
            val qs = profile.badge_token?.let { "?token=${URLEncoder.encode(it, "UTF-8")}" }.orEmpty()
            "$cleanBase/card/${URLEncoder.encode(profile.id, "UTF-8")}$qs"
        }
    }
    val qrBitmap = remember(cardUrl) { generateQrBitmap(cardUrl) }
    val isActive = (profile.lifecycle_status ?: "active").lowercase() in listOf("active", "probation", "on_leave")
    val initials = (profile.full_name ?: "U")
        .split(Regex("\\s+"))
        .filter { it.isNotBlank() }
        .take(2)
        .joinToString("") { it.first().uppercase() }
        .ifBlank { "U" }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.65f))
                .padding(horizontal = 20.dp, vertical = 24.dp),
            contentAlignment = Alignment.Center
        ) {
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .widthIn(max = 360.dp),
                shape = RoundedCornerShape(28.dp),
                color = palette.card,
                shadowElevation = 16.dp
            ) {
                Column(modifier = Modifier.fillMaxWidth()) {
                    // Top Modal Header
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 18.dp, vertical = 14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = if (editingLinks) {
                                    tr(lang, "Tautan Kartu (Linktree)", "Card Links (Linktree)")
                                } else {
                                    tr(lang, "Kartu ID Karyawan", "Employee ID Card")
                                },
                                fontWeight = FontWeight.Black,
                                fontSize = 15.sp,
                                color = palette.textPrimary
                            )
                            Text(
                                text = if (editingLinks) {
                                    tr(lang, "Muncul saat QR dipindai", "Shown when QR is scanned")
                                } else if (showBack) {
                                    tr(lang, "Tampak Belakang", "Back Side")
                                } else {
                                    tr(lang, "Tampak Depan · ketuk kartu untuk membalik", "Front Side · tap card to flip")
                                },
                                fontSize = 11.sp,
                                color = palette.textMuted
                            )
                        }
                        IconButton(onClick = onDismiss, modifier = Modifier.size(32.dp)) {
                            Icon(Icons.Default.Close, contentDescription = "Close", tint = palette.textMuted, modifier = Modifier.size(18.dp))
                        }
                    }

                    HorizontalDivider(color = palette.cardBorder)

                    // Body
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(max = 520.dp)
                            .background(palette.subtleSurface)
                            .verticalScroll(rememberScrollState())
                            .padding(20.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        if (editingLinks) {
                            Column(
                                modifier = Modifier.fillMaxWidth(),
                                verticalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                OutlinedTextField(
                                    value = linkBio,
                                    onValueChange = { linkBio = it },
                                    label = { Text(tr(lang, "Bio / Headline Singkat", "Short Bio / Headline"), fontSize = 12.sp) },
                                    singleLine = true,
                                    modifier = Modifier.fillMaxWidth(),
                                    shape = RoundedCornerShape(14.dp)
                                )

                                Text(
                                    text = tr(lang, "Tambah Cepat", "Quick Add"),
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = palette.textSecondary
                                )

                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .horizontalScroll(rememberScrollState()),
                                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                                ) {
                                    LINK_PRESETS.forEach { (type, label) ->
                                        AssistChip(
                                            onClick = {
                                                val defaultVal = when (type) {
                                                    "email" -> profile.company_email.orEmpty()
                                                    "phone", "whatsapp" -> profile.phone.orEmpty()
                                                    else -> ""
                                                }
                                                links = links + CardLinkItem(type = type, label = label, value = defaultVal)
                                            },
                                            label = { Text("+ $label", fontSize = 11.sp) }
                                        )
                                    }
                                }

                                if (links.isEmpty()) {
                                    Text(
                                        text = tr(lang, "Belum ada tautan. Ketuk preset di atas untuk menambahkan.", "No links yet. Tap a preset above to add."),
                                        fontSize = 11.sp,
                                        color = palette.textMuted,
                                        textAlign = TextAlign.Center,
                                        modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp)
                                    )
                                } else {
                                    links.forEachIndexed { idx, item ->
                                        Surface(
                                            modifier = Modifier.fillMaxWidth(),
                                            shape = RoundedCornerShape(14.dp),
                                            color = palette.card,
                                            border = BorderStroke(1.dp, palette.cardBorder)
                                        ) {
                                            Column(
                                                modifier = Modifier.padding(10.dp),
                                                verticalArrangement = Arrangement.spacedBy(6.dp)
                                            ) {
                                                Row(
                                                    verticalAlignment = Alignment.CenterVertically,
                                                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                                                ) {
                                                    OutlinedTextField(
                                                        value = item.label,
                                                        onValueChange = { v ->
                                                            links = links.mapIndexed { i, x -> if (i == idx) x.copy(label = v) else x }
                                                        },
                                                        label = { Text(tr(lang, "Label", "Label"), fontSize = 11.sp) },
                                                        singleLine = true,
                                                        modifier = Modifier.weight(1f),
                                                        shape = RoundedCornerShape(10.dp)
                                                    )
                                                    IconButton(
                                                        onClick = { links = links.filterIndexed { i, _ -> i != idx } },
                                                        modifier = Modifier.size(32.dp)
                                                    ) {
                                                        Icon(Icons.Default.DeleteOutline, contentDescription = "Delete", tint = palette.danger, modifier = Modifier.size(18.dp))
                                                    }
                                                }
                                                OutlinedTextField(
                                                    value = item.value,
                                                    onValueChange = { v ->
                                                        links = links.mapIndexed { i, x -> if (i == idx) x.copy(value = v) else x }
                                                    },
                                                    label = {
                                                        val hint = when (item.type) {
                                                            "whatsapp", "phone" -> "+62812..."
                                                            "email" -> "name@company.com"
                                                            else -> "https://..."
                                                        }
                                                        Text(hint, fontSize = 11.sp)
                                                    },
                                                    singleLine = true,
                                                    modifier = Modifier.fillMaxWidth(),
                                                    shape = RoundedCornerShape(10.dp)
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        } else {
                            // 3D Flip Animated Badge
                            Surface(
                                modifier = Modifier
                                    .width(270.dp)
                                    .graphicsLayer {
                                        rotationY = flipRotation
                                        cameraDistance = 12f * density
                                    }
                                    .clickable { showBack = !showBack },
                                shape = RoundedCornerShape(24.dp),
                                color = Color.White,
                                border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                                shadowElevation = 8.dp
                            ) {
                                if (flipRotation <= 90f) {
                                    // FRONT FACE
                                    Column(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalAlignment = Alignment.CenterHorizontally
                                    ) {
                                        Box(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .background(Brush.linearGradient(listOf(palette.heroStart, palette.heroEnd)))
                                                .padding(top = 12.dp, bottom = 52.dp, start = 16.dp, end = 16.dp),
                                            contentAlignment = Alignment.TopCenter
                                        ) {
                                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                                Box(
                                                    modifier = Modifier
                                                        .width(44.dp)
                                                        .height(7.dp)
                                                        .clip(CircleShape)
                                                        .background(Color.White.copy(alpha = 0.85f))
                                                )
                                                Spacer(modifier = Modifier.height(10.dp))
                                                Row(
                                                    verticalAlignment = Alignment.CenterVertically,
                                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                                ) {
                                                    if (!companyLogoUrl.isNullOrBlank()) {
                                                        Surface(
                                                            shape = RoundedCornerShape(8.dp),
                                                            color = Color.White,
                                                            modifier = Modifier.size(26.dp)
                                                        ) {
                                                            AsyncImage(
                                                                model = ImageRequest.Builder(context)
                                                                    .data(if (companyLogoUrl.startsWith("http")) companyLogoUrl else "${baseUrl.trimEnd('/')}$companyLogoUrl")
                                                                    .crossfade(true)
                                                                    .build(),
                                                                contentDescription = companyName,
                                                                contentScale = ContentScale.Fit,
                                                                modifier = Modifier.padding(3.dp).fillMaxSize()
                                                            )
                                                        }
                                                    }
                                                    Text(
                                                        text = (companyName ?: "openHR").uppercase(),
                                                        color = Color.White,
                                                        fontWeight = FontWeight.Black,
                                                        fontSize = 12.sp,
                                                        maxLines = 1,
                                                        overflow = TextOverflow.Ellipsis
                                                    )
                                                }
                                            }
                                        }

                                        Box(
                                            modifier = Modifier
                                                .offset(y = (-42).dp)
                                                .size(92.dp)
                                                .clip(RoundedCornerShape(22.dp))
                                                .background(Color(0xFFF1F5F9))
                                                .border(4.dp, Color.White, RoundedCornerShape(22.dp)),
                                            contentAlignment = Alignment.Center
                                        ) {
                                            if (!profile.photo_url.isNullOrBlank()) {
                                                AsyncImage(
                                                    model = ImageRequest.Builder(context)
                                                        .data("${baseUrl.trimEnd('/')}${profile.photo_url}&token=${token.orEmpty()}")
                                                        .crossfade(true)
                                                        .build(),
                                                    contentDescription = profile.full_name,
                                                    contentScale = ContentScale.Crop,
                                                    modifier = Modifier.fillMaxSize()
                                                )
                                            } else {
                                                Text(
                                                    text = initials,
                                                    color = palette.accent,
                                                    fontWeight = FontWeight.Black,
                                                    fontSize = 26.sp
                                                )
                                            }
                                        }

                                        Column(
                                            modifier = Modifier
                                                .offset(y = (-28).dp)
                                                .padding(horizontal = 16.dp),
                                            horizontalAlignment = Alignment.CenterHorizontally
                                        ) {
                                            Text(
                                                text = profile.full_name ?: "-",
                                                fontWeight = FontWeight.Black,
                                                fontSize = 16.sp,
                                                color = Color(0xFF0F172A),
                                                textAlign = TextAlign.Center,
                                                maxLines = 2
                                            )
                                            Text(
                                                text = profile.job_title ?: tr(lang, "Karyawan", "Employee"),
                                                fontSize = 12.sp,
                                                fontWeight = FontWeight.Medium,
                                                color = Color(0xFF64748B),
                                                textAlign = TextAlign.Center
                                            )
                                            Spacer(modifier = Modifier.height(6.dp))
                                            Row(
                                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                                                verticalAlignment = Alignment.CenterVertically
                                            ) {
                                                if (!profile.level_code.isNullOrBlank()) {
                                                    Surface(shape = CircleShape, color = palette.accentSurface) {
                                                        Text(
                                                            text = profile.level_code,
                                                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                                                            fontSize = 10.sp,
                                                            fontWeight = FontWeight.Bold,
                                                            color = palette.accent
                                                        )
                                                    }
                                                }
                                                Surface(
                                                    shape = CircleShape,
                                                    color = if (isActive) Color(0xFFECFDF5) else Color(0xFFFFF1F2)
                                                ) {
                                                    Row(
                                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                                                        verticalAlignment = Alignment.CenterVertically,
                                                        horizontalArrangement = Arrangement.spacedBy(3.dp)
                                                    ) {
                                                        Icon(
                                                            Icons.Default.Verified,
                                                            contentDescription = null,
                                                            tint = if (isActive) Color(0xFF059669) else Color(0xFFE11D48),
                                                            modifier = Modifier.size(11.dp)
                                                        )
                                                        Text(
                                                            text = if (isActive) tr(lang, "Aktif", "Active") else tr(lang, "Nonaktif", "Inactive"),
                                                            fontSize = 10.sp,
                                                            fontWeight = FontWeight.Bold,
                                                            color = if (isActive) Color(0xFF059669) else Color(0xFFE11D48)
                                                        )
                                                    }
                                                }
                                            }

                                            Spacer(modifier = Modifier.height(10.dp))
                                            Surface(
                                                modifier = Modifier.fillMaxWidth(),
                                                shape = RoundedCornerShape(14.dp),
                                                color = Color(0xFFF8FAFC),
                                                border = BorderStroke(1.dp, Color(0xFFE2E8F0))
                                            ) {
                                                Column(
                                                    modifier = Modifier.padding(vertical = 7.dp, horizontal = 10.dp),
                                                    horizontalAlignment = Alignment.CenterHorizontally
                                                ) {
                                                    Text(
                                                        text = profile.nik ?: "-",
                                                        fontFamily = FontFamily.Monospace,
                                                        fontWeight = FontWeight.Black,
                                                        fontSize = 12.sp,
                                                        color = Color(0xFF0F172A)
                                                    )
                                                    Text(
                                                        text = profile.department_name ?: profile.branch_name ?: "-",
                                                        fontSize = 10.sp,
                                                        color = Color(0xFF64748B),
                                                        maxLines = 1,
                                                        overflow = TextOverflow.Ellipsis
                                                    )
                                                }
                                            }

                                            if (qrBitmap != null) {
                                                Spacer(modifier = Modifier.height(12.dp))
                                                Surface(
                                                    shape = RoundedCornerShape(12.dp),
                                                    color = Color.White,
                                                    border = BorderStroke(1.dp, Color(0xFFE2E8F0))
                                                ) {
                                                    Image(
                                                        bitmap = qrBitmap.asImageBitmap(),
                                                        contentDescription = "Employee Linktree QR",
                                                        modifier = Modifier
                                                            .size(88.dp)
                                                            .padding(6.dp)
                                                    )
                                                }
                                            }
                                        }

                                        Box(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .height(6.dp)
                                                .background(Brush.linearGradient(listOf(palette.heroStart, palette.heroEnd)))
                                        )
                                    }
                                } else {
                                    // BACK FACE (counter-rotated 180deg so text is upright)
                                    Column(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .graphicsLayer { rotationY = 180f },
                                        horizontalAlignment = Alignment.CenterHorizontally
                                    ) {
                                        Box(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .background(Brush.linearGradient(listOf(palette.heroStart, palette.heroEnd)))
                                                .padding(vertical = 12.dp),
                                            contentAlignment = Alignment.Center
                                        ) {
                                            Text(
                                                text = tr(lang, "INFORMASI KARYAWAN", "EMPLOYEE CREDENTIALS"),
                                                color = Color.White,
                                                fontWeight = FontWeight.Black,
                                                fontSize = 11.sp,
                                                letterSpacing = 0.8.sp
                                            )
                                        }

                                        Column(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .padding(16.dp),
                                            verticalArrangement = Arrangement.spacedBy(10.dp)
                                        ) {
                                            IdCardBackField(Icons.Default.Apartment, tr(lang, "Departemen", "Department"), profile.department_name ?: "-")
                                            IdCardBackField(Icons.Default.LocationOn, tr(lang, "Kantor / Cabang", "Office / Branch"), profile.branch_name ?: "-")
                                            IdCardBackField(Icons.Default.CalendarMonth, tr(lang, "Tanggal Bergabung", "Join Date"), Formatters.formatDisplayDate(profile.join_date, lang))
                                        }

                                        if (qrBitmap != null) {
                                            Surface(
                                                shape = RoundedCornerShape(14.dp),
                                                color = Color.White,
                                                border = BorderStroke(1.dp, Color(0xFFE2E8F0))
                                            ) {
                                                Image(
                                                    bitmap = qrBitmap.asImageBitmap(),
                                                    contentDescription = "Employee Linktree QR",
                                                    modifier = Modifier
                                                        .size(108.dp)
                                                        .padding(6.dp)
                                                )
                                            }
                                        }

                                        Text(
                                            text = tr(
                                                lang,
                                                "Kartu ini milik ${companyName ?: "Perusahaan"}. Jika ditemukan, harap kembalikan ke kantor kami.",
                                                "Property of ${companyName ?: "Company"}. If found, please return to our office."
                                            ),
                                            fontSize = 10.sp,
                                            color = Color(0xFF64748B),
                                            textAlign = TextAlign.Center,
                                            modifier = Modifier.padding(horizontal = 18.dp, vertical = 14.dp)
                                        )

                                        Box(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .height(6.dp)
                                                .background(Brush.linearGradient(listOf(palette.heroStart, palette.heroEnd)))
                                        )
                                    }
                                }
                            }
                        }
                    }

                    HorizontalDivider(color = palette.cardBorder)

                    // Bottom Action Bar
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 12.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        if (editingLinks) {
                            OutlinedButton(
                                onClick = { editingLinks = false },
                                shape = RoundedCornerShape(12.dp)
                            ) {
                                Text(tr(lang, "Batal", "Cancel"), fontSize = 12.sp, fontWeight = FontWeight.Bold)
                            }
                            Button(
                                enabled = !savingLinks,
                                onClick = {
                                    savingLinks = true
                                    scope.launch {
                                        val cleaned = links.filter { it.value.isNotBlank() }
                                        repository.updateCardLinks(profile.id, linkBio.trim().ifBlank { null }, cleaned)
                                            .onSuccess { res ->
                                                onLinksUpdated(res.card_bio, res.card_links)
                                                editingLinks = false
                                            }
                                        savingLinks = false
                                    }
                                },
                                shape = RoundedCornerShape(12.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = palette.accent)
                            ) {
                                Text(
                                    if (savingLinks) tr(lang, "Menyimpan...", "Saving...") else tr(lang, "Simpan Tautan", "Save Links"),
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        } else {
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                OutlinedButton(
                                    onClick = { showBack = !showBack },
                                    shape = RoundedCornerShape(12.dp),
                                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp)
                                ) {
                                    Icon(Icons.Default.Flip, contentDescription = null, modifier = Modifier.size(16.dp))
                                    Spacer(modifier = Modifier.width(5.dp))
                                    Text(tr(lang, "Balik", "Flip"), fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                }
                                OutlinedButton(
                                    onClick = { editingLinks = true },
                                    shape = RoundedCornerShape(12.dp),
                                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp)
                                ) {
                                    Icon(Icons.Default.Link, contentDescription = null, modifier = Modifier.size(16.dp))
                                    Spacer(modifier = Modifier.width(5.dp))
                                    Text(tr(lang, "Tautan QR", "QR Links"), fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                }
                            }
                            Button(
                                onClick = onDismiss,
                                shape = RoundedCornerShape(12.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = palette.accent)
                            ) {
                                Text(tr(lang, "Tutup", "Close"), fontSize = 12.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun IdCardBackField(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    value: String
) {
    Row(
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Icon(icon, contentDescription = null, tint = Color(0xFF94A3B8), modifier = Modifier.size(16.dp).padding(top = 2.dp))
        Column {
            Text(label, fontSize = 10.sp, color = Color(0xFF94A3B8))
            Text(value, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color(0xFF0F172A))
        }
    }
}
