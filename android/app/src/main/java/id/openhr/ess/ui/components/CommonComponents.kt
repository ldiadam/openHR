package id.openhr.ess.ui.components

import androidx.compose.animation.core.*
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import id.openhr.ess.ui.theme.LocalEssPalette
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

fun tr(lang: String, id: String, en: String): String = if (lang == "id") id else en

fun Modifier.pressScale(pressedScale: Float = 0.97f): Modifier = composed {
    var pressed by remember { mutableStateOf(false) }
    val scale by animateFloatAsState(
        targetValue = if (pressed) pressedScale else 1f,
        animationSpec = spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessMedium),
        label = "press_scale"
    )
    this
        .graphicsLayer {
            scaleX = scale
            scaleY = scale
        }
        .pointerInput(Unit) {
            detectTapGestures(
                onPress = {
                    pressed = true
                    tryAwaitRelease()
                    pressed = false
                }
            )
        }
}

@Composable
fun ShimmerBox(
    modifier: Modifier = Modifier,
    cornerRadius: Dp = 12.dp
) {
    val palette = LocalEssPalette.current
    val transition = rememberInfiniteTransition(label = "shimmer")
    val translate by transition.animateFloat(
        initialValue = 0f,
        targetValue = 900f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1100, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "shimmer_x"
    )
    val brush = Brush.linearGradient(
        colors = listOf(palette.shimmerBase, palette.shimmerHighlight, palette.shimmerBase),
        start = Offset(translate - 300f, 0f),
        end = Offset(translate, 200f)
    )
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(cornerRadius))
            .background(brush)
    )
}

@Composable
fun ListSkeletonCards(count: Int = 4) {
    val palette = LocalEssPalette.current
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        repeat(count) {
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(18.dp),
                color = palette.card,
                border = BorderStroke(1.dp, palette.cardBorder)
            ) {
                Column(
                    modifier = Modifier.padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        ShimmerBox(modifier = Modifier.width(120.dp).height(14.dp), cornerRadius = 6.dp)
                        ShimmerBox(modifier = Modifier.width(64.dp).height(18.dp), cornerRadius = 8.dp)
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        ShimmerBox(modifier = Modifier.weight(1f).height(44.dp), cornerRadius = 10.dp)
                        ShimmerBox(modifier = Modifier.weight(1f).height(44.dp), cornerRadius = 10.dp)
                    }
                }
            }
        }
    }
}

@Composable
fun StatusPill(status: String, lang: String, lateMinutes: Int = 0) {
    val palette = LocalEssPalette.current
    val (bg, fg, label) = when (status.lowercase()) {
        "present" -> Triple(palette.successSurface, palette.success, tr(lang, "Hadir", "Present"))
        "late" -> Triple(
            palette.warningSurface,
            palette.warning,
            tr(lang, "Terlambat", "Late") + if (lateMinutes > 0) " ${lateMinutes}m" else ""
        )
        "early_leave" -> Triple(
            if (palette.isDark) Color(0xFF2E1065) else Color(0xFFF5F3FF),
            if (palette.isDark) Color(0xFFC4B5FD) else Color(0xFF7C3AED),
            tr(lang, "Pulang Awal", "Early Leave")
        )
        "on_leave" -> Triple(palette.accentSurface, palette.accent, tr(lang, "Cuti", "On Leave"))
        "sick" -> Triple(
            if (palette.isDark) Color(0xFF1E1B4B) else Color(0xFFEEF2FF),
            if (palette.isDark) Color(0xFFA5B4FC) else Color(0xFF4F46E5),
            tr(lang, "Sakit", "Sick")
        )
        "absent" -> Triple(palette.dangerSurface, palette.danger, tr(lang, "Alpa", "Absent"))
        "approved" -> Triple(palette.successSurface, palette.success, tr(lang, "Disetujui", "Approved"))
        "report_submitted" -> Triple(palette.accentSurface, palette.accent, tr(lang, "Realisasi Dikirim", "Report Submitted"))
        "report_approved" -> Triple(palette.successSurface, palette.success, tr(lang, "Realisasi Disetujui", "Report Approved"))
        "report_rejected" -> Triple(palette.dangerSurface, palette.danger, tr(lang, "Perlu Revisi", "Report Returned"))
        "cancelled" -> Triple(palette.subtleSurface, palette.textMuted, tr(lang, "Dibatalkan", "Cancelled"))
        "paid" -> Triple(palette.accentSurface, palette.accent, tr(lang, "Dibayar", "Paid"))
        "rejected" -> Triple(palette.dangerSurface, palette.danger, tr(lang, "Ditolak", "Rejected"))
        "pending" -> Triple(palette.warningSurface, palette.warning, tr(lang, "Menunggu", "Pending"))
        else -> Triple(palette.subtleSurface, palette.textSecondary, status)
    }

    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(50))
            .background(bg)
            .border(1.dp, fg.copy(alpha = 0.25f), RoundedCornerShape(50))
            .padding(horizontal = 9.dp, vertical = 3.dp)
    ) {
        Text(
            text = label,
            color = fg,
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold
        )
    }
}

@Composable
fun FeedbackBanner(
    message: String,
    isError: Boolean,
    onDismiss: () -> Unit
) {
    val palette = LocalEssPalette.current
    val bg = if (isError) palette.dangerSurface else palette.successSurface
    val fg = if (isError) palette.danger else palette.success
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(bg)
            .border(1.dp, fg.copy(alpha = 0.25f), RoundedCornerShape(14.dp))
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Icon(
            imageVector = if (isError) Icons.Default.ErrorOutline else Icons.Default.CheckCircle,
            contentDescription = null,
            tint = fg,
            modifier = Modifier.size(18.dp)
        )
        Text(
            text = message,
            color = fg,
            fontSize = 12.sp,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.weight(1f)
        )
        TextButton(onClick = onDismiss, contentPadding = PaddingValues(horizontal = 6.dp, vertical = 0.dp)) {
            Text("OK", color = fg, fontSize = 11.sp, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
fun OfflineQueueBanner(
    isOnline: Boolean,
    pendingCount: Int,
    syncing: Boolean,
    lang: String,
    onSyncNow: () -> Unit
) {
    if (isOnline && pendingCount == 0) return

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color(0xFFD97706))
            .padding(horizontal = 14.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.weight(1f)
        ) {
            Icon(
                imageVector = if (!isOnline) Icons.Default.CloudOff else Icons.Default.Sync,
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.size(16.dp)
            )
            Text(
                text = if (!isOnline) {
                    tr(
                        lang,
                        "Mode offline · Presensi akan diantrekan ($pendingCount)",
                        "Offline mode · Punches queued ($pendingCount)"
                    )
                } else {
                    tr(
                        lang,
                        "$pendingCount presensi offline siap disinkron",
                        "$pendingCount offline punches ready to sync"
                    )
                },
                color = Color.White,
                fontSize = 11.sp,
                fontWeight = FontWeight.SemiBold
            )
        }

        if (isOnline && pendingCount > 0) {
            TextButton(
                onClick = onSyncNow,
                enabled = !syncing,
                colors = ButtonDefaults.textButtonColors(
                    containerColor = Color.White,
                    contentColor = Color(0xFFD97706)
                ),
                contentPadding = PaddingValues(horizontal = 10.dp, vertical = 2.dp),
                modifier = Modifier.height(28.dp)
            ) {
                Text(
                    text = if (syncing) tr(lang, "Menyinkron...", "Syncing...") else tr(lang, "Sinkron", "Sync"),
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppDatePickerDialog(
    initialDate: String,
    lang: String,
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit
) {
    val initialMillis = remember(initialDate) {
        runCatching {
            LocalDate.parse(initialDate.take(10))
                .atStartOfDay(ZoneOffset.UTC)
                .toInstant()
                .toEpochMilli()
        }.getOrElse { System.currentTimeMillis() }
    }
    val state = rememberDatePickerState(initialSelectedDateMillis = initialMillis)

    DatePickerDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            TextButton(
                onClick = {
                    val millis = state.selectedDateMillis ?: initialMillis
                    val date = Instant.ofEpochMilli(millis).atZone(ZoneOffset.UTC).toLocalDate().toString()
                    onConfirm(date)
                }
            ) {
                Text(tr(lang, "Pilih", "Select"), fontWeight = FontWeight.Bold)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(tr(lang, "Batal", "Cancel"))
            }
        }
    ) {
        DatePicker(state = state)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppTimePickerDialog(
    initialTime: String,
    title: String,
    lang: String,
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit
) {
    val parts = initialTime.split(":")
    val initHour = parts.getOrNull(0)?.toIntOrNull()?.coerceIn(0, 23) ?: 8
    val initMin = parts.getOrNull(1)?.toIntOrNull()?.coerceIn(0, 59) ?: 30
    val state = rememberTimePickerState(initialHour = initHour, initialMinute = initMin, is24Hour = true)

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title, fontWeight = FontWeight.Bold, fontSize = 15.sp) },
        text = {
            Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                TimePicker(state = state)
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    val formatted = "%02d:%02d".format(state.hour, state.minute)
                    onConfirm(formatted)
                }
            ) {
                Text(tr(lang, "Pilih", "Select"), fontWeight = FontWeight.Bold)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(tr(lang, "Batal", "Cancel"))
            }
        }
    )
}
