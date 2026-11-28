package id.openhr.ess.ui

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateIntAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import id.openhr.ess.data.local.SessionStore
import id.openhr.ess.data.model.OfflineClockRecord
import id.openhr.ess.data.remote.ApiClient
import id.openhr.ess.data.repository.EssRepository
import id.openhr.ess.ui.components.OfflineQueueBanner
import id.openhr.ess.ui.components.tr
import id.openhr.ess.ui.screens.*
import id.openhr.ess.ui.theme.LocalEssPalette
import id.openhr.ess.util.Formatters
import kotlinx.coroutines.launch

private enum class EssTab(
    val route: String,
    val selectedIcon: ImageVector,
    val unselectedIcon: ImageVector,
    val idLabel: String,
    val enLabel: String
) {
    HOME("home", Icons.Filled.Home, Icons.Outlined.Home, "Beranda", "Home"),
    ATTENDANCE("attendance", Icons.Filled.Schedule, Icons.Outlined.Schedule, "Presensi", "Attendance"),
    CALENDAR("calendar", Icons.Filled.CalendarMonth, Icons.Outlined.CalendarMonth, "Kalender", "Calendar"),
    REQUESTS("requests", Icons.Filled.AssignmentTurnedIn, Icons.Outlined.AssignmentTurnedIn, "Pengajuan", "Requests"),
    PAYSLIPS("payslips", Icons.Filled.Receipt, Icons.Outlined.Receipt, "Slip Gaji", "Payslips"),
    PROFILE("profile", Icons.Filled.Person, Icons.Outlined.Person, "Profil", "Profile")
}

@Composable
fun MainShell(
    repository: EssRepository,
    sessionStore: SessionStore,
    apiClient: ApiClient
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val palette = LocalEssPalette.current
    val lang by sessionStore.langFlow.collectAsState()
    val modules by sessionStore.modulesFlow.collectAsState()
    val offlineQueue by sessionStore.offlineQueueFlow.collectAsState()

    val visibleTabs = remember(modules) {
        EssTab.entries.filter { tab ->
            when (tab) {
                EssTab.HOME, EssTab.CALENDAR, EssTab.PROFILE -> true
                EssTab.ATTENDANCE -> modules.attendance
                EssTab.REQUESTS -> modules.leave || modules.attendance || modules.claims
                EssTab.PAYSLIPS -> modules.payroll
            }
        }
    }

    val density = LocalDensity.current
    var activeTab by remember { mutableStateOf(EssTab.HOME) }
    var requestedRequestsSection by remember { mutableStateOf<String?>(null) }
    var targetHeroHeightPx by remember { mutableIntStateOf(0) }
    var heroScrollOffsetPx by remember { mutableIntStateOf(0) }
    val animatedHeroHeightPx by animateIntAsState(
        targetValue = targetHeroHeightPx,
        animationSpec = spring(dampingRatio = 0.88f, stiffness = Spring.StiffnessMediumLow),
        label = "shared_hero_height"
    )

    val navigateToTab: (EssTab) -> Unit = { target ->
        if (target in visibleTabs && target != activeTab) {
            heroScrollOffsetPx = 0
            activeTab = target
        }
    }

    BackHandler(enabled = activeTab != EssTab.HOME) {
        navigateToTab(EssTab.HOME)
    }

    var isOnline by remember { mutableStateOf(Formatters.isNetworkConnected(context)) }
    var syncing by remember { mutableStateOf(false) }
    var geofenceSyncQueue by remember { mutableStateOf<List<OfflineClockRecord>>(emptyList()) }
    var geofenceReasonText by remember { mutableStateOf("") }

    DisposableEffect(context) {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                isOnline = true
                if (sessionStore.offlineQueueFlow.value.isNotEmpty() && !syncing) {
                    scope.launch {
                        syncing = true
                        val result = repository.syncOfflineQueue()
                        syncing = false
                        if (result.geofenceBlockedItems.isNotEmpty()) {
                            geofenceReasonText = ""
                            geofenceSyncQueue = result.geofenceBlockedItems
                        }
                    }
                }
            }

            override fun onLost(network: Network) {
                isOnline = Formatters.isNetworkConnected(context)
            }

            override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) {
                isOnline = caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            }
        }
        cm.registerDefaultNetworkCallback(callback)
        onDispose { runCatching { cm.unregisterNetworkCallback(callback) } }
    }

    LaunchedEffect(Unit) {
        repository.getPublicCompany()
        if (isOnline && offlineQueue.isNotEmpty()) {
            syncing = true
            val result = repository.syncOfflineQueue()
            syncing = false
            if (result.geofenceBlockedItems.isNotEmpty()) {
                geofenceReasonText = ""
                geofenceSyncQueue = result.geofenceBlockedItems
            }
        }
    }

    Scaffold(
        containerColor = palette.canvas,
        bottomBar = {
            Column(modifier = Modifier.navigationBarsPadding()) {
                OfflineQueueBanner(
                    isOnline = isOnline,
                    pendingCount = offlineQueue.size,
                    syncing = syncing,
                    lang = lang,
                    onSyncNow = {
                        scope.launch {
                            syncing = true
                            val result = repository.syncOfflineQueue()
                            syncing = false
                            if (result.geofenceBlockedItems.isNotEmpty()) {
                                geofenceReasonText = ""
                                geofenceSyncQueue = result.geofenceBlockedItems
                            }
                        }
                    }
                )
            }
        }
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(palette.canvas)
                .padding(bottom = innerPadding.calculateBottomPadding())
        ) {
            // Shared Persistent Morphing Hero Backdrop
            if (animatedHeroHeightPx > 0) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(with(density) { animatedHeroHeightPx.toDp() })
                        .graphicsLayer { translationY = -heroScrollOffsetPx.toFloat() }
                        .clip(RoundedCornerShape(bottomStart = 28.dp, bottomEnd = 28.dp))
                        .background(Brush.linearGradient(listOf(palette.heroStart, palette.heroEnd)))
                )
            }

            AnimatedContent(
                targetState = activeTab,
                transitionSpec = {
                    (fadeIn(tween(220)) + slideInVertically(tween(240)) { it / 28 }) togetherWith
                        fadeOut(tween(150))
                },
                modifier = Modifier.fillMaxSize(),
                label = "ess_tab_content"
            ) { tab ->
                when (tab) {
                    EssTab.HOME -> HomeScreen(
                        repository = repository,
                        sessionStore = sessionStore,
                        isVisible = (activeTab == EssTab.HOME),
                        onHeroHeightChanged = { targetHeroHeightPx = it },
                        onHeroScrollChanged = { heroScrollOffsetPx = it },
                        onNavigateToTab = { targetRoute ->
                            when {
                                targetRoute == "calendar" -> navigateToTab(EssTab.CALENDAR)
                                targetRoute == "attendance" -> navigateToTab(EssTab.ATTENDANCE)
                                targetRoute.startsWith("requests:") -> {
                                    requestedRequestsSection = targetRoute.removePrefix("requests:")
                                    navigateToTab(EssTab.REQUESTS)
                                }
                                else -> {
                                    visibleTabs.firstOrNull { it.route == targetRoute }?.let { navigateToTab(it) }
                                }
                            }
                        }
                    )
                    EssTab.ATTENDANCE -> AttendanceScreen(
                        repository = repository,
                        sessionStore = sessionStore,
                        apiClient = apiClient,
                        onHeroHeightChanged = { targetHeroHeightPx = it },
                        onBackToHome = { navigateToTab(EssTab.HOME) },
                        onNavigateToRequests = {
                            requestedRequestsSection = "LEAVE"
                            navigateToTab(EssTab.REQUESTS)
                        }
                    )
                    EssTab.CALENDAR -> CalendarScreen(
                        repository = repository,
                        sessionStore = sessionStore,
                        onHeroHeightChanged = { targetHeroHeightPx = it },
                        onBackToHome = { navigateToTab(EssTab.HOME) }
                    )
                    EssTab.REQUESTS -> RequestsScreen(
                        repository = repository,
                        sessionStore = sessionStore,
                        apiClient = apiClient,
                        isVisible = (activeTab == EssTab.REQUESTS),
                        requestedSectionName = requestedRequestsSection,
                        onConsumedRequestedSection = { requestedRequestsSection = null },
                        onHeroHeightChanged = { targetHeroHeightPx = it },
                        onBackToHome = { navigateToTab(EssTab.HOME) }
                    )
                    EssTab.PAYSLIPS -> PayslipsScreen(
                        repository = repository,
                        sessionStore = sessionStore,
                        onHeroHeightChanged = { targetHeroHeightPx = it },
                        onBackToHome = { navigateToTab(EssTab.HOME) }
                    )
                    EssTab.PROFILE -> ProfileScreen(
                        repository = repository,
                        sessionStore = sessionStore,
                        onHeroHeightChanged = { targetHeroHeightPx = it },
                        onHeroScrollChanged = { heroScrollOffsetPx = it },
                        onBackToHome = { navigateToTab(EssTab.HOME) }
                    )
                }
            }
        }
    }

    geofenceSyncQueue.firstOrNull()?.let { pendingItem ->
        AlertDialog(
            onDismissRequest = { geofenceSyncQueue = emptyList() },
            title = { Text(tr(lang, "Alasan Presensi Luar Kantor", "Out-of-Geofence Reason"), fontWeight = FontWeight.Bold) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        text = tr(
                            lang,
                            "Presensi offline ${pendingItem.local_date} ${pendingItem.local_time} berada di luar radius kantor. Masukkan alasan untuk melanjutkan sinkronisasi.",
                            "Offline punch ${pendingItem.local_date} ${pendingItem.local_time} was outside the office radius. Enter a reason to sync."
                        ),
                        fontSize = 12.sp
                    )
                    OutlinedTextField(
                        value = geofenceReasonText,
                        onValueChange = { geofenceReasonText = it },
                        label = { Text(tr(lang, "Alasan", "Reason")) },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
                Button(
                    enabled = geofenceReasonText.isNotBlank(),
                    onClick = {
                        val reason = geofenceReasonText.trim()
                        geofenceSyncQueue = geofenceSyncQueue.drop(1)
                        scope.launch {
                            syncing = true
                            repository.syncOfflineQueue(mapOf(pendingItem.id to reason))
                            syncing = false
                        }
                    }
                ) {
                    Text(tr(lang, "Sinkronkan", "Sync"))
                }
            },
            dismissButton = {
                TextButton(onClick = { geofenceSyncQueue = emptyList() }) {
                    Text(tr(lang, "Batal", "Cancel"))
                }
            }
        )
    }
}
