package id.openhr.ess.ui

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
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
import id.openhr.ess.ui.theme.Blue600
import id.openhr.ess.ui.theme.Slate50
import id.openhr.ess.ui.theme.Slate500
import id.openhr.ess.util.Formatters
import kotlinx.coroutines.launch

private enum class EssTab(val route: String, val icon: ImageVector, val idLabel: String, val enLabel: String) {
    HOME("home", Icons.Default.Home, "Beranda", "Home"),
    ATTENDANCE("attendance", Icons.Default.Schedule, "Presensi", "Attendance"),
    REQUESTS("requests", Icons.Default.AssignmentTurnedIn, "Pengajuan", "Requests"),
    PAYSLIPS("payslips", Icons.Default.Receipt, "Slip Gaji", "Payslips"),
    PROFILE("profile", Icons.Default.Person, "Profil", "Profile")
}

@Composable
fun MainShell(
    repository: EssRepository,
    sessionStore: SessionStore,
    apiClient: ApiClient
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val lang by sessionStore.langFlow.collectAsState()
    val modules by sessionStore.modulesFlow.collectAsState()
    val offlineQueue by sessionStore.offlineQueueFlow.collectAsState()

    val visibleTabs = remember(modules) {
        EssTab.entries.filter { tab ->
            when (tab) {
                EssTab.HOME, EssTab.PROFILE -> true
                EssTab.ATTENDANCE -> modules.attendance
                EssTab.REQUESTS -> modules.leave || modules.attendance || modules.claims
                EssTab.PAYSLIPS -> modules.payroll
            }
        }
    }

    val pagerState = rememberPagerState(initialPage = 0, pageCount = { visibleTabs.size })
    val currentTabIndex = pagerState.currentPage.coerceIn(0, (visibleTabs.size - 1).coerceAtLeast(0))
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
                        repository.syncOfflineQueue()
                        syncing = false
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

    LaunchedEffect(currentTabIndex) {
        repository.getPublicCompany().onSuccess { comp ->
            comp?.modules?.let { sessionStore.saveModules(it) }
        }
    }

    LaunchedEffect(Unit) {
        if (isOnline && offlineQueue.isNotEmpty()) {
            syncing = true
            repository.syncOfflineQueue()
            syncing = false
        }
    }

    Scaffold(
        containerColor = Slate50,
        bottomBar = {
            Column {
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
                NavigationBar(containerColor = Color.White, tonalElevation = 4.dp) {
                    visibleTabs.forEachIndexed { index, tab ->
                        val selected = currentTabIndex == index
                        NavigationBarItem(
                            selected = selected,
                            onClick = {
                                if (!selected) {
                                    scope.launch {
                                        pagerState.scrollToPage(index)
                                    }
                                }
                            },
                            icon = { Icon(tab.icon, contentDescription = null) },
                            label = {
                                Text(
                                    text = tr(lang, tab.idLabel, tab.enLabel),
                                    fontSize = 10.sp,
                                    fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                                    maxLines = 1
                                )
                            },
                            colors = NavigationBarItemDefaults.colors(
                                selectedIconColor = Blue600,
                                selectedTextColor = Blue600,
                                unselectedIconColor = Slate500,
                                unselectedTextColor = Slate500,
                                indicatorColor = Blue600.copy(alpha = 0.1f)
                            )
                        )
                    }
                }
            }
        }
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
            HorizontalPager(
                state = pagerState,
                key = { page -> visibleTabs.getOrElse(page) { EssTab.HOME }.route },
                beyondViewportPageCount = (visibleTabs.size - 1).coerceAtLeast(0),
                userScrollEnabled = false,
                modifier = Modifier.fillMaxSize()
            ) { page ->
                when (visibleTabs.getOrElse(page) { EssTab.HOME }) {
                    EssTab.HOME -> HomeScreen(repository = repository, sessionStore = sessionStore)
                    EssTab.ATTENDANCE -> AttendanceScreen(repository = repository, sessionStore = sessionStore, apiClient = apiClient)
                    EssTab.REQUESTS -> RequestsScreen(repository = repository, sessionStore = sessionStore, apiClient = apiClient)
                    EssTab.PAYSLIPS -> PayslipsScreen(repository = repository, sessionStore = sessionStore)
                    EssTab.PROFILE -> ProfileScreen(repository = repository, sessionStore = sessionStore)
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
                        val remainingPrompts = geofenceSyncQueue.drop(1)
                        geofenceSyncQueue = remainingPrompts
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
