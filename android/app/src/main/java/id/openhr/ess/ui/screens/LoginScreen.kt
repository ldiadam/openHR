package id.openhr.ess.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Login
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Mail
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.ImageLoader
import coil.compose.AsyncImage
import coil.request.ImageRequest
import id.openhr.ess.BuildConfig
import id.openhr.ess.data.local.SessionStore
import id.openhr.ess.data.remote.ApiClient
import id.openhr.ess.data.repository.EssRepository
import id.openhr.ess.ui.components.FeedbackBanner
import id.openhr.ess.ui.components.QrScannerDialog
import id.openhr.ess.ui.components.pressScale
import id.openhr.ess.ui.components.tr
import id.openhr.ess.ui.theme.LocalEssPalette
import kotlinx.coroutines.launch

@Composable
fun LoginScreen(
    repository: EssRepository,
    sessionStore: SessionStore,
    apiClient: ApiClient,
    onLoggedIn: () -> Unit = {}
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val palette = LocalEssPalette.current
    val lang by sessionStore.langFlow.collectAsState()
    val savedBaseUrl by sessionStore.baseUrlFlow.collectAsState()
    val companyName by sessionStore.companyNameFlow.collectAsState()
    val logoUrl by sessionStore.companyLogoUrlFlow.collectAsState()

    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var showPassword by remember { mutableStateOf(false) }
    var showQrScanner by remember { mutableStateOf(false) }
    var loading by remember { mutableStateOf(false) }
    var feedback by remember { mutableStateOf<Pair<String, Boolean>?>(null) }

    val imageLoader = remember(apiClient.okHttpClient) {
        ImageLoader.Builder(context).okHttpClient(apiClient.okHttpClient).build()
    }

    LaunchedEffect(savedBaseUrl) {
        if (savedBaseUrl.isNotBlank()) {
            repository.getPublicCompany()
        }
    }

    val isServerConfigured = savedBaseUrl.isNotBlank()

    fun performLogin(targetEmail: String, targetPassword: String) {
        scope.launch {
            feedback = null
            loading = true
            repository.login(targetEmail, targetPassword)
                .onSuccess { onLoggedIn() }
                .onFailure { err ->
                    feedback = (err.message ?: tr(lang, "Login gagal", "Login failed")) to true
                }
            loading = false
        }
    }

    Scaffold(containerColor = palette.canvas) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .verticalScroll(rememberScrollState())
        ) {
            // Modern Hero Brand Header
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Brush.linearGradient(listOf(palette.heroStart, palette.heroEnd)))
                    .padding(horizontal = 22.dp, vertical = 28.dp)
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(18.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        if (!logoUrl.isNullOrBlank()) {
                            Surface(
                                shape = RoundedCornerShape(12.dp),
                                color = Color.White
                            ) {
                                AsyncImage(
                                    model = ImageRequest.Builder(context)
                                        .data("$savedBaseUrl${logoUrl}")
                                        .crossfade(true)
                                        .build(),
                                    imageLoader = imageLoader,
                                    contentDescription = companyName,
                                    contentScale = ContentScale.Fit,
                                    modifier = Modifier
                                        .height(34.dp)
                                        .widthIn(max = 150.dp)
                                        .padding(horizontal = 10.dp, vertical = 5.dp)
                                )
                            }
                        } else {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(40.dp)
                                        .clip(RoundedCornerShape(12.dp))
                                        .background(Color(0xFF2563EB)),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text("HR", color = Color.White, fontWeight = FontWeight.Black, fontSize = 14.sp)
                                }
                                Text(companyName, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                            }
                        }

                        Surface(
                            onClick = { sessionStore.setLanguage(if (lang == "id") "en" else "id") },
                            shape = RoundedCornerShape(50),
                            color = Color.White.copy(alpha = 0.14f)
                        ) {
                            Text(
                                text = lang.uppercase(),
                                color = Color.White,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
                            )
                        }
                    }

                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(
                            text = tr(lang, "Portal Karyawan", "Employee Self-Service"),
                            color = Color(0xFF93C5FD),
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            letterSpacing = 0.8.sp
                        )
                        Text(
                            text = if (isServerConfigured) {
                                tr(lang, "Masuk ke $companyName", "Sign in to $companyName")
                            } else {
                                tr(lang, "Hubungkan Server Anda", "Connect Your Server")
                            },
                            color = Color.White,
                            fontSize = 24.sp,
                            fontWeight = FontWeight.ExtraBold,
                            letterSpacing = (-0.4).sp
                        )
                        Text(
                            text = if (isServerConfigured) {
                                tr(
                                    lang,
                                    "Presensi GPS, pengajuan cuti & klaim, hingga slip gaji.",
                                    "GPS attendance, leave & expense requests, and payslips."
                                )
                            } else {
                                tr(
                                    lang,
                                    "Scan QR Code dari portal web perusahaan untuk memulai.",
                                    "Scan the QR Code from your company web portal to begin."
                                )
                            },
                            color = Color.White.copy(alpha = 0.72f),
                            fontSize = 12.sp
                        )
                    }
                }
            }

            // Auth Card overlapping hero nicely
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 18.dp)
                    .offset(y = (-14).dp),
                shape = RoundedCornerShape(24.dp),
                color = palette.card,
                border = BorderStroke(1.dp, palette.cardBorder),
                shadowElevation = 2.dp
            ) {
                Column(
                    modifier = Modifier.padding(20.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp)
                ) {
                    feedback?.let { (msg, isErr) ->
                        FeedbackBanner(message = msg, isError = isErr, onDismiss = { feedback = null })
                    }

                    if (!isServerConfigured) {
                        Surface(
                            shape = RoundedCornerShape(14.dp),
                            color = palette.accentSurface,
                            border = BorderStroke(1.dp, palette.accent.copy(alpha = 0.25f)),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(
                                modifier = Modifier.padding(14.dp),
                                verticalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                Text(
                                    text = tr(
                                        lang,
                                        "Belum terhubung ke server perusahaan",
                                        "Not connected to a company server"
                                    ),
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 13.sp,
                                    color = palette.textPrimary
                                )
                                Text(
                                    text = tr(
                                        lang,
                                        "Buka menu QR Connect di portal web perusahaan Anda lalu scan QR code di bawah ini.",
                                        "Open QR Connect on your company web portal and scan the QR code below."
                                    ),
                                    fontSize = 12.sp,
                                    color = palette.textSecondary
                                )
                                Button(
                                    onClick = { showQrScanner = true },
                                    enabled = !loading,
                                    shape = RoundedCornerShape(12.dp),
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .height(48.dp)
                                        .pressScale()
                                ) {
                                    Icon(Icons.Default.QrCodeScanner, contentDescription = null, modifier = Modifier.size(18.dp))
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text(
                                        tr(lang, "Scan QR Server", "Scan Server QR"),
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 14.sp
                                    )
                                }
                            }
                        }
                    }

                    OutlinedTextField(
                        value = email,
                        onValueChange = { email = it },
                        enabled = isServerConfigured && !loading,
                        label = { Text(tr(lang, "Email atau NIK", "Email or Employee ID")) },
                        leadingIcon = { Icon(Icons.Default.Mail, contentDescription = null) },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Email,
                            imeAction = ImeAction.Next
                        ),
                        shape = RoundedCornerShape(14.dp),
                        modifier = Modifier.fillMaxWidth()
                    )

                    OutlinedTextField(
                        value = password,
                        onValueChange = { password = it },
                        enabled = isServerConfigured && !loading,
                        label = { Text(tr(lang, "Kata Sandi", "Password")) },
                        leadingIcon = { Icon(Icons.Default.Lock, contentDescription = null) },
                        trailingIcon = {
                            IconButton(onClick = { showPassword = !showPassword }, enabled = isServerConfigured && !loading) {
                                Icon(
                                    imageVector = if (showPassword) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                                    contentDescription = null
                                )
                            }
                        },
                        singleLine = true,
                        visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Password,
                            imeAction = ImeAction.Done
                        ),
                        shape = RoundedCornerShape(14.dp),
                        modifier = Modifier.fillMaxWidth()
                    )

                    Button(
                        onClick = { performLogin(email, password) },
                        enabled = isServerConfigured && !loading && email.isNotBlank() && password.isNotBlank(),
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(52.dp)
                            .pressScale(),
                        shape = RoundedCornerShape(14.dp)
                    ) {
                        if (loading) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(20.dp),
                                color = Color.White,
                                strokeWidth = 2.dp
                            )
                        } else {
                            Icon(Icons.AutoMirrored.Filled.Login, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(tr(lang, "Masuk", "Sign In"), fontWeight = FontWeight.Bold, fontSize = 14.sp)
                        }
                    }

                    if (BuildConfig.DEBUG && isServerConfigured) {
                        OutlinedButton(
                            onClick = {
                                email = "admin@openhr.id"
                                password = "Password123!"
                                performLogin("admin@openhr.id", "Password123!")
                            },
                            enabled = !loading,
                            border = BorderStroke(1.dp, palette.cardBorder),
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Text(
                                tr(lang, "Login Demo · admin@openhr.id", "Dev Login · admin@openhr.id"),
                                fontSize = 12.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = palette.textSecondary
                            )
                        }
                    }
                }
            }
        }
    }

    if (showQrScanner) {
        QrScannerDialog(
            lang = lang,
            onDismiss = { showQrScanner = false },
            onScanned = { scanned ->
                showQrScanner = false
                val normalized = SessionStore.normalizeBaseUrl(scanned.url)
                sessionStore.setBaseUrl(normalized)
                if (!scanned.email.isNullOrBlank()) {
                    email = scanned.email
                }
                scope.launch {
                    repository.getPublicCompany()
                        .onSuccess { comp ->
                            val name = comp?.name?.takeIf { it.isNotBlank() } ?: normalized
                            feedback = tr(
                                lang,
                                "Terhubung ke $name",
                                "Connected to $name"
                            ) to false
                        }
                        .onFailure { err ->
                            feedback = tr(
                                lang,
                                "Gagal menghubungi server: ${err.message}",
                                "Failed to reach server: ${err.message}"
                            ) to true
                        }
                }
            }
        )
    }
}
