package id.openhr.ess.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

val Slate950 = Color(0xFF020617)
val Slate900 = Color(0xFF0F172A)
val Slate800 = Color(0xFF1E293B)
val Slate600 = Color(0xFF475569)
val Slate500 = Color(0xFF64748B)
val Slate200 = Color(0xFFE2E8F0)
val Slate100 = Color(0xFFF1F5F9)
val Slate50 = Color(0xFFF6F7FB)

val Blue600 = Color(0xFF2563EB)
val Blue500 = Color(0xFF3B82F6)
val Blue50 = Color(0xFFEFF6FF)
val Emerald600 = Color(0xFF059669)
val Emerald50 = Color(0xFFECFDF5)
val Amber600 = Color(0xFFD97706)
val Amber50 = Color(0xFFFFFBEB)
val Rose600 = Color(0xFFE11D48)
val Rose50 = Color(0xFFFFF1F2)

@Immutable
data class EssPalette(
    val isDark: Boolean,
    val canvas: Color,
    val card: Color,
    val cardBorder: Color,
    val subtleSurface: Color,
    val textPrimary: Color,
    val textSecondary: Color,
    val textMuted: Color,
    val accent: Color,
    val accentSurface: Color,
    val success: Color,
    val successSurface: Color,
    val warning: Color,
    val warningSurface: Color,
    val danger: Color,
    val dangerSurface: Color,
    val heroStart: Color,
    val heroEnd: Color,
    val dockBackground: Color,
    val shimmerBase: Color,
    val shimmerHighlight: Color
)

val LightEssPalette = EssPalette(
    isDark = false,
    canvas = Color(0xFFF6F7FB),
    card = Color(0xFFFFFFFF),
    cardBorder = Color(0xFFE5E7EB),
    subtleSurface = Color(0xFFF1F5F9),
    textPrimary = Color(0xFF0F172A),
    textSecondary = Color(0xFF475569),
    textMuted = Color(0xFF64748B),
    accent = Color(0xFF2563EB),
    accentSurface = Color(0xFFEFF6FF),
    success = Color(0xFF059669),
    successSurface = Color(0xFFECFDF5),
    warning = Color(0xFFD97706),
    warningSurface = Color(0xFFFFFBEB),
    danger = Color(0xFFE11D48),
    dangerSurface = Color(0xFFFFF1F2),
    heroStart = Color(0xFF0F172A),
    heroEnd = Color(0xFF1E293B),
    dockBackground = Color(0xF7FFFFFF),
    shimmerBase = Color(0xFFE2E8F0),
    shimmerHighlight = Color(0xFFF8FAFC)
)

val DarkEssPalette = EssPalette(
    isDark = true,
    canvas = Color(0xFF090D16),
    card = Color(0xFF111827),
    cardBorder = Color(0xFF1F2937),
    subtleSurface = Color(0xFF1E293B),
    textPrimary = Color(0xFFF8FAFC),
    textSecondary = Color(0xFFCBD5E1),
    textMuted = Color(0xFF94A3B8),
    accent = Color(0xFF60A5FA),
    accentSurface = Color(0xFF172554),
    success = Color(0xFF34D399),
    successSurface = Color(0xFF064E3B),
    warning = Color(0xFFFBBF24),
    warningSurface = Color(0xFF451A03),
    danger = Color(0xFFFB7185),
    dangerSurface = Color(0xFF4C0519),
    heroStart = Color(0xFF1E293B),
    heroEnd = Color(0xFF0F172A),
    dockBackground = Color(0xF5111827),
    shimmerBase = Color(0xFF1F2937),
    shimmerHighlight = Color(0xFF334155)
)

val LocalEssPalette = staticCompositionLocalOf { LightEssPalette }

private val LightColors = lightColorScheme(
    primary = Color(0xFF0F172A),
    onPrimary = Color.White,
    secondary = Blue600,
    onSecondary = Color.White,
    background = Color(0xFFF6F7FB),
    onBackground = Color(0xFF0F172A),
    surface = Color.White,
    onSurface = Color(0xFF0F172A),
    surfaceVariant = Color(0xFFF1F5F9),
    onSurfaceVariant = Color(0xFF475569),
    outline = Color(0xFFE5E7EB),
    error = Rose600,
    onError = Color.White
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFF3B82F6),
    onPrimary = Color.White,
    secondary = Color(0xFF60A5FA),
    onSecondary = Color(0xFF090D16),
    background = Color(0xFF090D16),
    onBackground = Color(0xFFF8FAFC),
    surface = Color(0xFF111827),
    onSurface = Color(0xFFF8FAFC),
    surfaceVariant = Color(0xFF1E293B),
    onSurfaceVariant = Color(0xFFCBD5E1),
    outline = Color(0xFF1F2937),
    error = Color(0xFFFB7185),
    onError = Color(0xFF090D16)
)

private fun buildTypography(palette: EssPalette) = Typography(
    titleLarge = TextStyle(
        fontSize = 22.sp,
        fontWeight = FontWeight.ExtraBold,
        letterSpacing = (-0.4).sp,
        color = palette.textPrimary
    ),
    titleMedium = TextStyle(
        fontSize = 16.sp,
        fontWeight = FontWeight.Bold,
        letterSpacing = (-0.2).sp,
        color = palette.textPrimary
    ),
    titleSmall = TextStyle(
        fontSize = 14.sp,
        fontWeight = FontWeight.SemiBold,
        color = palette.textPrimary
    ),
    bodyMedium = TextStyle(fontSize = 13.sp, color = palette.textPrimary),
    bodySmall = TextStyle(fontSize = 11.5.sp, color = palette.textMuted),
    labelMedium = TextStyle(fontSize = 11.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.2.sp)
)

@Composable
fun OpenHrTheme(
    themeMode: String = "system",
    content: @Composable () -> Unit
) {
    val useDark = when (themeMode) {
        "dark" -> true
        "light" -> false
        else -> isSystemInDarkTheme()
    }
    val palette = if (useDark) DarkEssPalette else LightEssPalette
    val colorScheme = if (useDark) DarkColors else LightColors

    CompositionLocalProvider(LocalEssPalette provides palette) {
        MaterialTheme(
            colorScheme = colorScheme,
            typography = buildTypography(palette),
            content = content
        )
    }
}
