package id.openhr.ess.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import id.openhr.ess.ui.theme.*

fun tr(lang: String, id: String, en: String): String = if (lang == "id") id else en

@Composable
fun StatusPill(status: String, lang: String, lateMinutes: Int = 0) {
    val (bg, fg, label) = when (status.lowercase()) {
        "present" -> Triple(Emerald50, Emerald600, tr(lang, "Hadir", "Present"))
        "late" -> Triple(
            Amber50,
            Amber600,
            tr(lang, "Terlambat", "Late") + if (lateMinutes > 0) " ${lateMinutes}m" else ""
        )
        "early_leave" -> Triple(Color(0xFFF5F3FF), Color(0xFF7C3AED), tr(lang, "Pulang Awal", "Early Leave"))
        "on_leave" -> Triple(Blue50, Blue600, tr(lang, "Cuti", "On Leave"))
        "sick" -> Triple(Color(0xFFEEF2FF), Color(0xFF4F46E5), tr(lang, "Sakit", "Sick"))
        "absent" -> Triple(Rose50, Rose600, tr(lang, "Alpa", "Absent"))
        "approved" -> Triple(Emerald50, Emerald600, tr(lang, "Disetujui", "Approved"))
        "paid" -> Triple(Blue50, Blue600, tr(lang, "Dibayar", "Paid"))
        "rejected" -> Triple(Rose50, Rose600, tr(lang, "Ditolak", "Rejected"))
        "pending" -> Triple(Amber50, Amber600, tr(lang, "Menunggu", "Pending"))
        else -> Triple(Slate100, Slate600, status)
    }

    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .background(bg)
            .border(1.dp, fg.copy(alpha = 0.25f), RoundedCornerShape(8.dp))
            .padding(horizontal = 8.dp, vertical = 3.dp)
    ) {
        Text(
            text = label,
            color = fg,
            fontSize = 10.sp,
            fontWeight = FontWeight.SemiBold
        )
    }
}

@Composable
fun FeedbackBanner(
    message: String,
    isError: Boolean,
    onDismiss: () -> Unit
) {
    val bg = if (isError) Rose50 else Emerald50
    val fg = if (isError) Rose600 else Emerald600
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
            .background(Amber600)
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
                    contentColor = Amber600
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
