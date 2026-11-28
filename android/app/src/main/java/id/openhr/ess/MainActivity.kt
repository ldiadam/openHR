package id.openhr.ess

import android.os.Bundle
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Fingerprint
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import coil.ImageLoader
import coil.compose.AsyncImage
import coil.request.ImageRequest
import kotlinx.coroutines.delay
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import id.openhr.ess.ui.MainShell
import id.openhr.ess.ui.components.tr
import id.openhr.ess.ui.screens.LoginScreen
import id.openhr.ess.ui.theme.LocalEssPalette
import id.openhr.ess.ui.theme.OpenHrTheme

class MainActivity : FragmentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        val app = application as OpenHrApp

        setContent {
            val user by app.sessionStore.userFlow.collectAsState()
            val token by app.sessionStore.tokenFlow.collectAsState()
            val themeMode by app.sessionStore.themeModeFlow.collectAsState()
            val biometricEnabled by app.sessionStore.biometricEnabledFlow.collectAsState()
            val lang by app.sessionStore.langFlow.collectAsState()
            val baseUrl by app.sessionStore.baseUrlFlow.collectAsState()
            val companyName by app.sessionStore.companyNameFlow.collectAsState()
            val companyLogoUrl by app.sessionStore.companyLogoUrlFlow.collectAsState()
            val primaryColor by app.sessionStore.primaryColorFlow.collectAsState()
            val context = LocalContext.current
            val splashImageLoader = remember(app.apiClient.okHttpClient) {
                ImageLoader.Builder(context).okHttpClient(app.apiClient.okHttpClient).build()
            }
            var showDynamicSplash by remember { mutableStateOf(baseUrl.isNotBlank() && !companyLogoUrl.isNullOrBlank()) }

            LaunchedEffect(baseUrl) {
                if (baseUrl.isNotBlank()) {
                    app.repository.getPublicCompany()
                }
            }
            LaunchedEffect(Unit) {
                if (showDynamicSplash) {
                    delay(650)
                    showDynamicSplash = false
                }
            }

            val isLoggedIn = !token.isNullOrBlank() && user != null
            var biometricUnlocked by remember { mutableStateOf(!biometricEnabled) }

            LaunchedEffect(isLoggedIn, biometricEnabled) {
                if (!isLoggedIn) {
                    biometricUnlocked = false
                } else if (!biometricEnabled) {
                    biometricUnlocked = true
                }
            }

            OpenHrTheme(themeMode = themeMode, primaryColorHex = primaryColor) {
                val palette = LocalEssPalette.current
                var showExitConfirm by remember { mutableStateOf(false) }

                BackHandler(enabled = !showExitConfirm) {
                    showExitConfirm = true
                }

                val screenState = when {
                    !isLoggedIn -> 0
                    biometricEnabled && !biometricUnlocked -> 1
                    else -> 2
                }

                AnimatedContent(
                    targetState = screenState,
                    transitionSpec = {
                        fadeIn(tween(200, easing = FastOutSlowInEasing)) togetherWith
                            fadeOut(tween(150, easing = FastOutSlowInEasing))
                    },
                    label = "auth_transition"
                ) { state ->
                    when (state) {
                        0 -> LoginScreen(
                            repository = app.repository,
                            sessionStore = app.sessionStore,
                            apiClient = app.apiClient,
                            onLoggedIn = { biometricUnlocked = true }
                        )
                        1 -> BiometricLockScreen(
                            userName = user?.name ?: "Employee",
                            lang = lang,
                            onUnlocked = { biometricUnlocked = true },
                            onUsePassword = { app.sessionStore.clearSession() }
                        )
                        else -> MainShell(
                            repository = app.repository,
                            sessionStore = app.sessionStore,
                            apiClient = app.apiClient
                        )
                    }
                }

                AnimatedVisibility(
                    visible = showDynamicSplash && !companyLogoUrl.isNullOrBlank(),
                    enter = fadeIn(tween(150)),
                    exit = fadeOut(tween(260))
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(Color(0xFF0F172A)),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(16.dp)
                        ) {
                            Surface(
                                shape = RoundedCornerShape(20.dp),
                                color = Color.White,
                                shadowElevation = 8.dp
                            ) {
                                AsyncImage(
                                    model = ImageRequest.Builder(context)
                                        .data("$baseUrl$companyLogoUrl")
                                        .crossfade(true)
                                        .build(),
                                    imageLoader = splashImageLoader,
                                    contentDescription = companyName,
                                    contentScale = ContentScale.Fit,
                                    modifier = Modifier
                                        .height(64.dp)
                                        .widthIn(max = 200.dp)
                                        .padding(horizontal = 18.dp, vertical = 10.dp)
                                )
                            }
                            Text(
                                text = companyName,
                                color = Color.White.copy(alpha = 0.85f),
                                fontWeight = FontWeight.Bold,
                                fontSize = 15.sp
                            )
                        }
                    }
                }

                if (showExitConfirm) {
                    AlertDialog(
                        onDismissRequest = { showExitConfirm = false },
                        containerColor = palette.card,
                        title = {
                            Text(
                                tr(lang, "Keluar dari Aplikasi?", "Exit App?"),
                                fontWeight = FontWeight.Bold,
                                color = palette.textPrimary
                            )
                        },
                        text = {
                            Text(
                                tr(lang, "Apakah Anda yakin ingin keluar dari openHR ESS?", "Are you sure you want to exit openHR ESS?"),
                                color = palette.textSecondary
                            )
                        },
                        confirmButton = {
                            Button(
                                onClick = {
                                    showExitConfirm = false
                                    finish()
                                },
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = palette.danger,
                                    contentColor = Color.White
                                )
                            ) {
                                Text(tr(lang, "Keluar", "Exit"), fontWeight = FontWeight.Bold)
                            }
                        },
                        dismissButton = {
                            TextButton(onClick = { showExitConfirm = false }) {
                                Text(tr(lang, "Batal", "Cancel"))
                            }
                        }
                    )
                }
            }
        }
    }
}

@Composable
private fun BiometricLockScreen(
    userName: String,
    lang: String,
    onUnlocked: () -> Unit,
    onUsePassword: () -> Unit
) {
    val context = LocalContext.current
    val palette = LocalEssPalette.current
    var errorMsg by remember { mutableStateOf<String?>(null) }

    fun triggerPrompt() {
        val activity = context as? FragmentActivity ?: return
        val manager = BiometricManager.from(activity)
        val authenticators = BiometricManager.Authenticators.BIOMETRIC_STRONG or
            BiometricManager.Authenticators.BIOMETRIC_WEAK or
            BiometricManager.Authenticators.DEVICE_CREDENTIAL
        if (manager.canAuthenticate(authenticators) != BiometricManager.BIOMETRIC_SUCCESS) {
            onUnlocked()
            return
        }
        val executor = ContextCompat.getMainExecutor(activity)
        val prompt = BiometricPrompt(
            activity,
            executor,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    onUnlocked()
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    errorMsg = errString.toString()
                }
            }
        )
        val info = BiometricPrompt.PromptInfo.Builder()
            .setTitle(tr(lang, "Buka Kunci openHR ESS", "Unlock openHR ESS"))
            .setSubtitle(userName)
            .setAllowedAuthenticators(authenticators)
            .build()
        prompt.authenticate(info)
    }

    LaunchedEffect(Unit) { triggerPrompt() }

    Scaffold(containerColor = palette.canvas) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Box(
                modifier = Modifier
                    .size(76.dp)
                    .clip(CircleShape)
                    .background(palette.accentSurface),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Default.Fingerprint,
                    contentDescription = null,
                    tint = palette.accent,
                    modifier = Modifier.size(40.dp)
                )
            }
            Spacer(modifier = Modifier.height(18.dp))
            Text(tr(lang, "Selamat datang kembali", "Welcome back"), style = MaterialTheme.typography.bodySmall)
            Text(userName, style = MaterialTheme.typography.titleLarge)
            Spacer(modifier = Modifier.height(8.dp))
            errorMsg?.let {
                Text(it, color = palette.danger, fontSize = 12.sp)
                Spacer(modifier = Modifier.height(8.dp))
            }
            Spacer(modifier = Modifier.height(16.dp))
            Button(
                onClick = { triggerPrompt() },
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier.fillMaxWidth().height(50.dp)
            ) {
                Icon(Icons.Default.Fingerprint, contentDescription = null, modifier = Modifier.size(20.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text(tr(lang, "Buka dengan Biometrik", "Unlock with Biometrics"), fontWeight = FontWeight.Bold)
            }
            Spacer(modifier = Modifier.height(8.dp))
            TextButton(onClick = onUsePassword) {
                Text(tr(lang, "Ganti Akun / Kata Sandi", "Switch Account / Use Password"), color = palette.textMuted)
            }
        }
    }
}
