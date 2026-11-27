package id.openhr.ess.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

val Slate900 = Color(0xFF0F172A)
val Slate800 = Color(0xFF1E293B)
val Slate600 = Color(0xFF475569)
val Slate500 = Color(0xFF64748B)
val Slate200 = Color(0xFFE2E8F0)
val Slate100 = Color(0xFFF1F5F9)
val Slate50 = Color(0xFFF8FAFC)
val Blue600 = Color(0xFF2563EB)
val Blue50 = Color(0xFFEFF6FF)
val Emerald600 = Color(0xFF059669)
val Emerald50 = Color(0xFFECFDF5)
val Amber600 = Color(0xFFD97706)
val Amber50 = Color(0xFFFFFBEB)
val Rose600 = Color(0xFFE11D48)
val Rose50 = Color(0xFFFFF1F2)

private val LightColors = lightColorScheme(
    primary = Slate900,
    onPrimary = Color.White,
    secondary = Blue600,
    onSecondary = Color.White,
    background = Slate50,
    onBackground = Slate900,
    surface = Color.White,
    onSurface = Slate900,
    surfaceVariant = Slate100,
    onSurfaceVariant = Slate600,
    outline = Slate200,
    error = Rose600,
    onError = Color.White
)

private val AppTypography = Typography(
    titleLarge = TextStyle(fontSize = 20.sp, fontWeight = FontWeight.Bold, color = Slate900),
    titleMedium = TextStyle(fontSize = 16.sp, fontWeight = FontWeight.Bold, color = Slate900),
    titleSmall = TextStyle(fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = Slate900),
    bodyMedium = TextStyle(fontSize = 13.sp, color = Slate800),
    bodySmall = TextStyle(fontSize = 11.sp, color = Slate500),
    labelMedium = TextStyle(fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
)

@Composable
fun OpenHrTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = LightColors,
        typography = AppTypography,
        content = content
    )
}
