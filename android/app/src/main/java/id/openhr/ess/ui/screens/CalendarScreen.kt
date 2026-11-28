package id.openhr.ess.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import id.openhr.ess.data.local.SessionStore
import id.openhr.ess.data.model.AttendanceHistoryRecord
import id.openhr.ess.data.repository.EssRepository
import id.openhr.ess.ui.components.ListSkeletonCards
import id.openhr.ess.ui.components.tr
import id.openhr.ess.ui.theme.LocalEssPalette
import id.openhr.ess.util.Formatters
import kotlinx.coroutines.launch
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.time.temporal.TemporalAdjusters
import java.util.Locale

@Composable
fun CalendarScreen(
    repository: EssRepository,
    sessionStore: SessionStore,
    onHeroHeightChanged: (Int) -> Unit = {},
    onBackToHome: () -> Unit = {}
) {
    val scope = rememberCoroutineScope()
    val palette = LocalEssPalette.current
    val lang by sessionStore.langFlow.collectAsState()
    val locale = if (lang == "id") Locale("id", "ID") else Locale.US

    var selectedDay by remember { mutableStateOf(LocalDate.now()) }
    val activeMonth = remember(selectedDay) { YearMonth.from(selectedDay) }
    val monthKey = remember(activeMonth) { Formatters.localMonthString(activeMonth) }
    var records by remember(monthKey) {
        mutableStateOf(repository.getCachedMyAttendance(monthKey)?.records ?: emptyList())
    }
    var loading by remember(monthKey) {
        mutableStateOf(repository.getCachedMyAttendance(monthKey) == null)
    }

    LaunchedEffect(monthKey) {
        scope.launch {
            repository.getMyAttendance(monthKey)
                .onSuccess { records = it.records }
            loading = false
        }
    }

    val weekStart = remember(selectedDay) {
        selectedDay.with(TemporalAdjusters.previousOrSame(DayOfWeek.SUNDAY))
    }
    val weekDays = remember(weekStart) { (0L..6L).map { weekStart.plusDays(it) } }
    val dayLabels = if (lang == "id") {
        listOf("MIN", "SEN", "SEL", "RAB", "KAM", "JUM", "SAB")
    } else {
        listOf("SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT")
    }
    val listState = rememberLazyListState()

    LaunchedEffect(selectedDay) {
        val idx = weekDays.indexOf(selectedDay)
        if (idx >= 0) listState.animateScrollToItem(idx)
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
    ) {
        // Colored Hero Header (transparent over shared morphing hero backdrop)
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .onSizeChanged { onHeroHeightChanged(it.height) }
                .statusBarsPadding()
                .padding(horizontal = 16.dp, vertical = 14.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    modifier = Modifier.weight(1f),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    IconButton(
                        onClick = onBackToHome,
                        modifier = Modifier
                            .size(36.dp)
                            .clip(CircleShape)
                            .background(palette.onHero.copy(alpha = 0.16f))
                    ) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Back",
                            tint = palette.onHero,
                            modifier = Modifier.size(18.dp)
                        )
                    }
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            tr(lang, "Kalender Kerja", "Work Calendar"),
                            style = MaterialTheme.typography.titleLarge,
                            color = palette.onHero
                        )
                        Text(
                            tr(lang, "Jadwal shift & hari kerja mingguan", "Weekly work shift & day-off schedule"),
                            style = MaterialTheme.typography.bodySmall,
                            color = palette.onHero.copy(alpha = 0.85f)
                        )
                    }
                }
                Box(
                    modifier = Modifier
                        .size(36.dp)
                        .clip(CircleShape)
                        .background(palette.onHero.copy(alpha = 0.16f)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(Icons.Default.CalendarMonth, contentDescription = null, tint = palette.onHero, modifier = Modifier.size(18.dp))
                }
            }
        }

        // Interactive 7-Day Week Strip
        Surface(
            modifier = Modifier.fillMaxWidth(),
            color = palette.card,
            shadowElevation = 1.dp
        ) {
            Column(modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp)) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp, vertical = 6.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton(
                        onClick = { selectedDay = selectedDay.minusWeeks(1) },
                        modifier = Modifier.size(30.dp)
                    ) {
                        Icon(Icons.Default.ChevronLeft, contentDescription = "Prev week", tint = palette.textSecondary, modifier = Modifier.size(18.dp))
                    }
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Text(
                            text = "${weekDays.first().format(DateTimeFormatter.ofPattern("dd MMM", locale))} – ${weekDays.last().format(DateTimeFormatter.ofPattern("dd MMM yyyy", locale))}",
                            fontSize = 11.5.sp,
                            fontWeight = FontWeight.Bold,
                            color = palette.textPrimary
                        )
                        if (selectedDay != LocalDate.now()) {
                            Surface(
                                onClick = { selectedDay = LocalDate.now() },
                                shape = CircleShape,
                                color = palette.accentSurface
                            ) {
                                Text(
                                    text = tr(lang, "Hari Ini", "Today"),
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = palette.accent,
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                                )
                            }
                        }
                    }
                    IconButton(
                        onClick = { selectedDay = selectedDay.plusWeeks(1) },
                        modifier = Modifier.size(30.dp)
                    ) {
                        Icon(Icons.Default.ChevronRight, contentDescription = "Next week", tint = palette.textSecondary, modifier = Modifier.size(18.dp))
                    }
                }

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    weekDays.forEachIndexed { idx, day ->
                        val isSelected = day == selectedDay
                        val iso = day.toString()
                        val rec: AttendanceHistoryRecord? = records.find { it.date.startsWith(iso) }
                        val isWeekend = idx == 0 || idx == 6
                        val circleColor = when {
                            isWeekend -> palette.accent
                            rec?.status == "late" -> Color(0xFFD97706)
                            else -> Color(0xFF1D4ED8)
                        }
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(5.dp),
                            modifier = Modifier
                                .weight(1f)
                                .clickable { selectedDay = day }
                        ) {
                            Text(
                                dayLabels[idx],
                                fontSize = 10.sp,
                                fontWeight = if (isSelected) FontWeight.ExtraBold else FontWeight.Bold,
                                color = if (isSelected) palette.accent else palette.textMuted
                            )
                            Box(
                                modifier = Modifier
                                    .size(34.dp)
                                    .then(
                                        if (isSelected) Modifier.border(2.dp, circleColor, CircleShape).padding(3.dp) else Modifier
                                    )
                                    .clip(CircleShape)
                                    .background(circleColor),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = day.dayOfMonth.toString().padStart(2, '0'),
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Color.White
                                )
                            }
                        }
                    }
                }
            }
        }

        if (loading && records.isEmpty()) {
            Box(modifier = Modifier.padding(16.dp)) {
                ListSkeletonCards(count = 4)
            }
        } else {
            LazyColumn(
                state = listState,
                verticalArrangement = Arrangement.spacedBy(10.dp),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
                modifier = Modifier.weight(1f)
            ) {
                items(weekDays.size) { idx ->
                    val day = weekDays[idx]
                    val isSelected = day == selectedDay
                    val iso = day.toString()
                    val rec = records.find { it.date.startsWith(iso) }
                    val isOff = (idx == 0 || idx == 6) && rec == null
                    val barColor = if (isOff) palette.accent else Color(0xFF1E40AF)
                    Surface(
                        onClick = { selectedDay = day },
                        shape = RoundedCornerShape(18.dp),
                        color = if (isSelected) palette.card else Color.Transparent,
                        border = if (isSelected) BorderStroke(1.5.dp, barColor.copy(alpha = 0.55f)) else null,
                        shadowElevation = if (isSelected) 2.dp else 0.dp
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(10.dp),
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                            verticalAlignment = Alignment.Top
                        ) {
                            Column(
                                horizontalAlignment = Alignment.CenterHorizontally,
                                modifier = Modifier.width(42.dp).padding(top = 4.dp)
                            ) {
                                Text(
                                    text = day.dayOfMonth.toString().padStart(2, '0'),
                                    fontSize = 20.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = if (isSelected) barColor else palette.textPrimary
                                )
                                Text(
                                    text = dayLabels[idx].lowercase().replaceFirstChar { it.uppercase() },
                                    fontSize = 11.sp,
                                    color = palette.textMuted
                                )
                            }
                            Column(
                                modifier = Modifier.weight(1f),
                                verticalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                Surface(shape = RoundedCornerShape(8.dp), color = barColor) {
                                    Text(
                                        text = day.format(DateTimeFormatter.ofPattern("EEEE, dd/MM/yyyy", locale)),
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = Color.White,
                                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
                                    )
                                }
                                Surface(
                                    shape = RoundedCornerShape(12.dp),
                                    color = barColor,
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Row(
                                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Text(
                                            text = if (isOff) tr(lang, "Day Off / Libur", "Day Off") else tr(lang, "Jadwal Kerja Reguler", "Regular Work Shift"),
                                            fontSize = 12.sp,
                                            fontWeight = FontWeight.SemiBold,
                                            color = Color.White
                                        )
                                        Text(
                                            text = if (isOff) "00:00 - 23:59" else if (rec?.clock_in_time != null) "${rec.clock_in_time} - ${rec.clock_out_time ?: "--:--"}" else "08:00 - 17:00",
                                            fontSize = 11.sp,
                                            color = Color.White.copy(alpha = 0.9f)
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
}
