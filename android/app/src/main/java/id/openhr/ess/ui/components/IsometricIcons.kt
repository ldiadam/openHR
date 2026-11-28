package id.openhr.ess.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

@Composable
fun IsoAttendanceIcon(size: Dp = 44.dp) {
    Canvas(modifier = Modifier.size(size)) {
        val s = this.size.minDimension / 64f
        // Shadow
        drawOval(Color(0x38F97316), Offset(16f * s, 52f * s), Size(32f * s, 8f * s))
        // Crown
        drawRoundRect(Color(0xFFEA580C), Offset(27f * s, 9f * s), Size(10f * s, 5f * s), CornerRadius(2f * s))
        drawRect(Color(0xFFC2410C), Offset(29f * s, 13f * s), Size(6f * s, 4f * s))
        // 3D bottom rim
        drawOval(Color(0xFFC2410C), Offset(13f * s, 19f * s), Size(38f * s, 36f * s))
        // Main 3D bezel
        drawCircle(
            brush = Brush.linearGradient(listOf(Color(0xFFFFB347), Color(0xFFF97316), Color(0xFFC2410C))),
            radius = 18f * s,
            center = Offset(32f * s, 34f * s)
        )
        // Dial
        drawCircle(
            brush = Brush.linearGradient(listOf(Color(0xFFFFF7ED), Color(0xFFFED7AA))),
            radius = 13.5f * s,
            center = Offset(32f * s, 34f * s)
        )
        // Hands
        drawLine(Color(0xFFEA580C), Offset(32f * s, 34f * s), Offset(32f * s, 25f * s), strokeWidth = 2.8f * s, cap = StrokeCap.Round)
        drawLine(Color(0xFFEA580C), Offset(32f * s, 34f * s), Offset(38f * s, 38f * s), strokeWidth = 2.8f * s, cap = StrokeCap.Round)
        drawCircle(Color(0xFFC2410C), radius = 2.2f * s, center = Offset(32f * s, 34f * s))
    }
}

@Composable
fun IsoLeavePlaneIcon(size: Dp = 44.dp) {
    Canvas(modifier = Modifier.size(size)) {
        val s = this.size.minDimension / 64f
        drawOval(Color(0x330EA5E9), Offset(15f * s, 51f * s), Size(34f * s, 8f * s))
        // Wings 3D depth
        val leftDepth = Path().apply {
            moveTo(12f * s, 35f * s); lineTo(28f * s, 27f * s); lineTo(28f * s, 34f * s); lineTo(12f * s, 40f * s); close()
        }
        val rightDepth = Path().apply {
            moveTo(52f * s, 35f * s); lineTo(36f * s, 27f * s); lineTo(36f * s, 34f * s); lineTo(52f * s, 40f * s); close()
        }
        drawPath(leftDepth, Color(0xFF0284C7))
        drawPath(rightDepth, Color(0xFF0284C7))
        // Top wings
        val wingBrush = Brush.linearGradient(listOf(Color(0xFFBAE6FD), Color(0xFF0EA5E9)))
        val leftWing = Path().apply {
            moveTo(12f * s, 33f * s); lineTo(28f * s, 24f * s); lineTo(28f * s, 32f * s); lineTo(12f * s, 38f * s); close()
        }
        val rightWing = Path().apply {
            moveTo(52f * s, 33f * s); lineTo(36f * s, 24f * s); lineTo(36f * s, 32f * s); lineTo(52f * s, 38f * s); close()
        }
        drawPath(leftWing, wingBrush)
        drawPath(rightWing, wingBrush)
        // Fuselage 3D depth & top
        drawRoundRect(Color(0xFF0369A1), Offset(27.5f * s, 13.5f * s), Size(9f * s, 36f * s), CornerRadius(4.5f * s))
        drawRoundRect(
            brush = Brush.linearGradient(listOf(Color(0xFF7DD3FC), Color(0xFF38BDF8), Color(0xFF0284C7))),
            topLeft = Offset(27.5f * s, 11f * s),
            size = Size(9f * s, 36f * s),
            cornerRadius = CornerRadius(4.5f * s)
        )
        // Tail
        val tail = Path().apply {
            moveTo(32f * s, 43f * s); lineTo(41f * s, 47f * s); lineTo(41f * s, 50f * s); lineTo(32f * s, 47.5f * s)
            lineTo(23f * s, 50f * s); lineTo(23f * s, 47f * s); close()
        }
        drawPath(tail, Color(0xFF0EA5E9))
        drawOval(Color(0xFFE0F2FE), Offset(29.5f * s, 15f * s), Size(5f * s, 3.5f * s))
    }
}

@Composable
fun IsoWalletIcon(size: Dp = 44.dp) {
    Canvas(modifier = Modifier.size(size)) {
        val s = this.size.minDimension / 64f
        drawOval(Color(0x3865A30D), Offset(14f * s, 51f * s), Size(36f * s, 8f * s))
        // Top flap
        drawRoundRect(
            brush = Brush.linearGradient(listOf(Color(0xFFD9F99D), Color(0xFF84CC16))),
            topLeft = Offset(15f * s, 15f * s),
            size = Size(34f * s, 12f * s),
            cornerRadius = CornerRadius(6f * s)
        )
        // Bottom 3D thickness
        drawRoundRect(Color(0xFF3F6212), Offset(13f * s, 23f * s), Size(36f * s, 27f * s), CornerRadius(7f * s))
        // Front wallet body
        drawRoundRect(
            brush = Brush.linearGradient(listOf(Color(0xFFA3E635), Color(0xFF65A30D), Color(0xFF3F6212))),
            topLeft = Offset(13f * s, 20f * s),
            size = Size(36f * s, 27f * s),
            cornerRadius = CornerRadius(7f * s)
        )
        // Clasp
        drawRoundRect(Color(0xFF84CC16), Offset(37f * s, 29f * s), Size(14f * s, 10f * s), CornerRadius(5f * s))
        drawCircle(Color(0xFFECFCCB), radius = 2.2f * s, center = Offset(42.5f * s, 34f * s))
    }
}

@Composable
fun IsoCalendarIcon(size: Dp = 44.dp) {
    Canvas(modifier = Modifier.size(size)) {
        val s = this.size.minDimension / 64f
        drawOval(Color(0x33E11D48), Offset(15f * s, 52f * s), Size(34f * s, 8f * s))
        // 3D bottom slab
        drawRoundRect(Color(0xFFCBD5E1), Offset(14f * s, 20f * s), Size(36f * s, 32f * s), CornerRadius(7f * s))
        // White card
        drawRoundRect(Color.White, Offset(14f * s, 17f * s), Size(36f * s, 32f * s), CornerRadius(7f * s))
        // Red header
        drawRoundRect(
            brush = Brush.linearGradient(listOf(Color(0xFFFB7185), Color(0xFFE11D48))),
            topLeft = Offset(14f * s, 17f * s),
            size = Size(36f * s, 11f * s),
            cornerRadius = CornerRadius(6f * s)
        )
        // Rings
        drawRoundRect(Color(0xFF94A3B8), Offset(21f * s, 12f * s), Size(4f * s, 8f * s), CornerRadius(2f * s))
        drawRoundRect(Color(0xFF94A3B8), Offset(39f * s, 12f * s), Size(4f * s, 8f * s), CornerRadius(2f * s))
        // Grid dots
        for (col in 0..3) {
            for (row in 0..1) {
                val c = if (col == 1 && row == 0) Color(0xFFF43F5E) else Color(0xFFE2E8F0)
                drawRoundRect(c, Offset((19f + col * 7.2f) * s, (32f + row * 7f) * s), Size(4.5f * s, 4.5f * s), CornerRadius(1.2f * s))
            }
        }
    }
}

@Composable
fun IsoClaimReceiptIcon(size: Dp = 44.dp) {
    Canvas(modifier = Modifier.size(size)) {
        val s = this.size.minDimension / 64f
        drawOval(Color(0x38F59E0B), Offset(17f * s, 52f * s), Size(30f * s, 7.6f * s))
        // 3D depth
        drawRoundRect(Color(0xFFB45309), Offset(20f * s, 15f * s), Size(26f * s, 36f * s), CornerRadius(5f * s))
        // Front receipt
        drawRoundRect(
            brush = Brush.linearGradient(listOf(Color(0xFFFBBF24), Color(0xFFF59E0B), Color(0xFFB45309))),
            topLeft = Offset(18f * s, 12f * s),
            size = Size(26f * s, 36f * s),
            cornerRadius = CornerRadius(5f * s)
        )
        drawRoundRect(Color(0xE6FFFBEB), Offset(23f * s, 19f * s), Size(16f * s, 3f * s), CornerRadius(1.5f * s))
        drawRoundRect(Color(0xBFFFFBEB), Offset(23f * s, 26f * s), Size(12f * s, 2.8f * s), CornerRadius(1.4f * s))
        drawRoundRect(Color(0xBFFFFBEB), Offset(23f * s, 33f * s), Size(14f * s, 2.8f * s), CornerRadius(1.4f * s))
    }
}

@Composable
fun IsoOvertimeIcon(size: Dp = 44.dp) {
    Canvas(modifier = Modifier.size(size)) {
        val s = this.size.minDimension / 64f
        drawOval(Color(0x388B5CF6), Offset(15f * s, 51f * s), Size(34f * s, 8f * s))
        drawRoundRect(
            color = Color(0xFF6D28D9),
            topLeft = Offset(25f * s, 13f * s),
            size = Size(14f * s, 10f * s),
            cornerRadius = CornerRadius(3f * s),
            style = Stroke(width = 3.5f * s)
        )
        drawRoundRect(Color(0xFF5B21B6), Offset(13f * s, 22f * s), Size(38f * s, 28f * s), CornerRadius(7f * s))
        drawRoundRect(
            brush = Brush.linearGradient(listOf(Color(0xFFC4B5FD), Color(0xFF8B5CF6), Color(0xFF5B21B6))),
            topLeft = Offset(13f * s, 19f * s),
            size = Size(38f * s, 28f * s),
            cornerRadius = CornerRadius(7f * s)
        )
        drawRoundRect(Color(0xFFA78BFA), Offset(13f * s, 19f * s), Size(38f * s, 13f * s), CornerRadius(7f * s))
        drawRoundRect(Color(0xFFEDE9FE), Offset(28f * s, 30f * s), Size(8f * s, 5f * s), CornerRadius(2.5f * s))
    }
}

@Composable
fun IsoProfileIcon(size: Dp = 44.dp) {
    Canvas(modifier = Modifier.size(size)) {
        val s = this.size.minDimension / 64f
        drawOval(Color(0x3814B8A6), Offset(15f * s, 51f * s), Size(34f * s, 8f * s))
        val bodyBrush = Brush.linearGradient(listOf(Color(0xFF5EEAD4), Color(0xFF14B8A6), Color(0xFF0F766E)))
        drawCircle(Color(0xFF0F766E), radius = 9.5f * s, center = Offset(32f * s, 25f * s))
        drawCircle(bodyBrush, radius = 9.5f * s, center = Offset(32f * s, 23f * s))
        drawRoundRect(Color(0xFF0F766E), Offset(16f * s, 36.5f * s), Size(32f * s, 16f * s), CornerRadius(8f * s))
        drawRoundRect(bodyBrush, Offset(16f * s, 34f * s), Size(32f * s, 16f * s), CornerRadius(8f * s))
    }
}

@Composable
fun IsoRefreshIcon(size: Dp = 44.dp) {
    Canvas(modifier = Modifier.size(size)) {
        val s = this.size.minDimension / 64f
        drawOval(Color(0x333B82F6), Offset(15f * s, 52f * s), Size(34f * s, 8f * s))
        drawCircle(Color(0xFF1D4ED8), radius = 17f * s, center = Offset(32f * s, 35.5f * s))
        drawCircle(
            brush = Brush.linearGradient(listOf(Color(0xFF93C5FD), Color(0xFF3B82F6), Color(0xFF1D4ED8))),
            radius = 17f * s,
            center = Offset(32f * s, 33f * s)
        )
        drawArc(
            color = Color.White,
            startAngle = -45f,
            sweepAngle = 260f,
            useCenter = false,
            topLeft = Offset(23f * s, 24f * s),
            size = Size(18f * s, 18f * s),
            style = Stroke(width = 3.2f * s, cap = StrokeCap.Round)
        )
    }
}

@Composable
fun IsoKasbonIcon(size: Dp = 44.dp) {
    Canvas(modifier = Modifier.size(size)) {
        val s = this.size.minDimension / 64f
        drawOval(Color(0x3810B981), Offset(14f * s, 50f * s), Size(36f * s, 8f * s))
        drawRoundRect(Color(0xFF047857), Offset(13f * s, 23f * s), Size(38f * s, 24f * s), CornerRadius(6f * s))
        drawRoundRect(
            brush = Brush.linearGradient(listOf(Color(0xFF6EE7B7), Color(0xFF10B981), Color(0xFF047857))),
            topLeft = Offset(13f * s, 19f * s),
            size = Size(38f * s, 24f * s),
            cornerRadius = CornerRadius(6f * s)
        )
        drawCircle(Color(0xE6ECFDF5), radius = 6.5f * s, center = Offset(32f * s, 31f * s))
    }
}

@Composable
fun IsoPettyCashIcon(size: Dp = 44.dp) {
    Canvas(modifier = Modifier.size(size)) {
        val s = this.size.minDimension / 64f
        drawOval(Color(0x3806B6D4), Offset(16f * s, 51f * s), Size(32f * s, 8f * s))
        drawCircle(Color(0xFF0E7490), radius = 16f * s, center = Offset(32f * s, 36f * s))
        drawCircle(
            brush = Brush.linearGradient(listOf(Color(0xFF67E8F9), Color(0xFF06B6D4), Color(0xFF0E7490))),
            radius = 16f * s,
            center = Offset(32f * s, 33f * s)
        )
        drawCircle(Color(0xFFCFFAFE), radius = 10f * s, center = Offset(32f * s, 33f * s), style = Stroke(width = 2f * s))
    }
}

@Composable
fun IsoTasksIcon(size: Dp = 44.dp) {
    Canvas(modifier = Modifier.size(size)) {
        val s = this.size.minDimension / 64f
        drawOval(Color(0x336366F1), Offset(16f * s, 51f * s), Size(32f * s, 8f * s))
        drawRoundRect(Color(0xFF3730A3), Offset(17f * s, 15f * s), Size(30f * s, 36f * s), CornerRadius(7f * s))
        drawRoundRect(
            brush = Brush.linearGradient(listOf(Color(0xFFA5B4FC), Color(0xFF6366F1), Color(0xFF3730A3))),
            topLeft = Offset(15f * s, 12f * s),
            size = Size(30f * s, 36f * s),
            cornerRadius = CornerRadius(7f * s)
        )
        drawRoundRect(Color(0xFFE0E7FF), Offset(21f * s, 20f * s), Size(16f * s, 3f * s), CornerRadius(1.5f * s))
        drawRoundRect(Color(0xCCE0E7FF), Offset(21f * s, 27f * s), Size(12f * s, 3f * s), CornerRadius(1.5f * s))
        drawCircle(Color(0xFF818CF8), radius = 9f * s, center = Offset(43f * s, 43f * s))
        drawLine(Color.White, Offset(39f * s, 43f * s), Offset(42f * s, 46f * s), strokeWidth = 2.4f * s, cap = StrokeCap.Round)
        drawLine(Color.White, Offset(42f * s, 46f * s), Offset(47.5f * s, 40.5f * s), strokeWidth = 2.4f * s, cap = StrokeCap.Round)
    }
}

@Composable
fun IsoApprovalIcon(size: Dp = 44.dp) {
    Canvas(modifier = Modifier.size(size)) {
        val s = this.size.minDimension / 64f
        drawOval(Color(0x38F43F5E), Offset(16f * s, 51f * s), Size(32f * s, 8f * s))
        drawCircle(Color(0xFFBE123C), radius = 17f * s, center = Offset(32f * s, 35f * s))
        drawCircle(
            brush = Brush.linearGradient(listOf(Color(0xFFFDA4AF), Color(0xFFF43F5E), Color(0xFFBE123C))),
            radius = 17f * s,
            center = Offset(32f * s, 32f * s)
        )
        drawLine(Color.White, Offset(24.5f * s, 32.5f * s), Offset(29.5f * s, 37.5f * s), strokeWidth = 3.2f * s, cap = StrokeCap.Round)
        drawLine(Color.White, Offset(29.5f * s, 37.5f * s), Offset(40f * s, 27f * s), strokeWidth = 3.2f * s, cap = StrokeCap.Round)
    }
}
