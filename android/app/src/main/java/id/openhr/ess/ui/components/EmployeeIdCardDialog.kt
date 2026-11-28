package id.openhr.ess.ui.components

import android.graphics.Bitmap
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Apartment
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Flip
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
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
import id.openhr.ess.data.model.EmployeeProfile
import id.openhr.ess.ui.theme.LocalEssPalette
import id.openhr.ess.util.Formatters
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

@Composable
fun EmployeeIdCardDialog(
    profile: EmployeeProfile,
    companyName: String?,
    companyLogoUrl: String?,
    baseUrl: String,
    token: String?,
    lang: String,
    onDismiss: () -> Unit
) {
    val context = LocalContext.current
    val palette = LocalEssPalette.current
    var showBack by remember { mutableStateOf(false) }

    val verifyUrl = remember(baseUrl, profile.id, profile.badge_token) {
        val cleanBase = baseUrl.trimEnd('/')
        val qs = profile.badge_token?.let { "?token=${URLEncoder.encode(it, "UTF-8")}" }.orEmpty()
        "$cleanBase/verify/id-card/${URLEncoder.encode(profile.id, "UTF-8")}$qs"
    }
    val qrBitmap = remember(verifyUrl) { generateQrBitmap(verifyUrl) }
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
                        Column {
                            Text(
                                text = tr(lang, "Kartu ID Karyawan", "Employee ID Card"),
                                fontWeight = FontWeight.Black,
                                fontSize = 15.sp,
                                color = palette.textPrimary
                            )
                            Text(
                                text = if (showBack) tr(lang, "Tampak Belakang", "Back Side") else tr(lang, "Tampak Depan", "Front Side"),
                                fontSize = 11.sp,
                                color = palette.textMuted
                            )
                        }
                        IconButton(onClick = onDismiss, modifier = Modifier.size(32.dp)) {
                            Icon(Icons.Default.Close, contentDescription = "Close", tint = palette.textMuted, modifier = Modifier.size(18.dp))
                        }
                    }

                    HorizontalDivider(color = palette.cardBorder)

                    // Card Preview Area
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(palette.subtleSurface)
                            .verticalScroll(rememberScrollState())
                            .padding(20.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Surface(
                            modifier = Modifier.width(270.dp),
                            shape = RoundedCornerShape(24.dp),
                            color = Color.White,
                            border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                            shadowElevation = 8.dp
                        ) {
                            if (!showBack) {
                                Column(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalAlignment = Alignment.CenterHorizontally
                                ) {
                                    // Brand Header + Lanyard Punch Slot
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

                                    // Employee Avatar overlapping header
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
                                            .offset(y = (-30).dp)
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
                                                Surface(
                                                    shape = CircleShape,
                                                    color = palette.accentSurface
                                                ) {
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
                                                    contentDescription = "ID Card QR",
                                                    modifier = Modifier
                                                        .size(86.dp)
                                                        .padding(6.dp)
                                                )
                                            }
                                            Spacer(modifier = Modifier.height(4.dp))
                                            Text(
                                                text = tr(lang, "PINDAI UNTUK VERIFIKASI", "SCAN TO VERIFY"),
                                                fontSize = 9.sp,
                                                fontWeight = FontWeight.Bold,
                                                letterSpacing = 1.sp,
                                                color = Color(0xFF94A3B8)
                                            )
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
                                Column(
                                    modifier = Modifier.fillMaxWidth(),
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
                                                contentDescription = "ID Card QR",
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

                    HorizontalDivider(color = palette.cardBorder)

                    // Bottom Action Bar
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 12.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        OutlinedButton(
                            onClick = { showBack = !showBack },
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Icon(Icons.Default.Flip, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(
                                text = if (showBack) tr(lang, "Lihat Depan", "Front Side") else tr(lang, "Lihat Belakang", "Back Side"),
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold
                            )
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
