package id.openhr.ess.ui.screens

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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import id.openhr.ess.data.local.SessionStore
import id.openhr.ess.data.repository.EssRepository
import id.openhr.ess.ui.components.FeedbackBanner
import id.openhr.ess.ui.components.QrScannerDialog
import id.openhr.ess.ui.components.tr
import id.openhr.ess.ui.theme.*
import kotlinx.coroutines.launch

@Composable
fun LoginScreen(
    repository: EssRepository,
    sessionStore: SessionStore
) {
    val scope = rememberCoroutineScope()
    val lang by sessionStore.langFlow.collectAsState()
    val savedBaseUrl by sessionStore.baseUrlFlow.collectAsState()

    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var showPassword by remember { mutableStateOf(false) }
    var showQrScanner by remember { mutableStateOf(false) }
    var companyName by remember { mutableStateOf("openHR") }
    var loading by remember { mutableStateOf(false) }
    var feedback by remember { mutableStateOf<Pair<String, Boolean>?>(null) }

    fun testAndLoadCompany() {
        scope.launch {
            repository.getPublicCompany()
                .onSuccess { comp ->
                    val name = comp?.name?.takeIf { it.isNotBlank() } ?: "openHR"
                    companyName = name
                }
        }
    }

    LaunchedEffect(savedBaseUrl) {
        testAndLoadCompany()
    }

    fun performLogin(targetEmail: String, targetPassword: String) {
        scope.launch {
            feedback = null
            loading = true
            repository.login(targetEmail, targetPassword)
                .onFailure { err ->
                    feedback = (err.message ?: tr(lang, "Login gagal", "Login failed")) to true
                }
            loading = false
        }
    }

    Scaffold(containerColor = Slate100) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 24.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(42.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(Slate900),
                        contentAlignment = Alignment.Center
                    ) {
                        Text("HR", color = Color.White, fontWeight = FontWeight.Black, fontSize = 15.sp)
                    }
                    Column {
                        Text(companyName, fontWeight = FontWeight.Bold, fontSize = 16.sp, color = Slate900)
                        Text(
                            tr(lang, "Portal Karyawan (ESS)", "Employee Self-Service"),
                            fontSize = 11.sp,
                            color = Slate500
                        )
                    }
                }

                FilledTonalButton(
                    onClick = { sessionStore.setLanguage(if (lang == "id") "en" else "id") },
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp),
                    modifier = Modifier.height(32.dp)
                ) {
                    Text(lang.uppercase(), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(24.dp),
                color = Color.White,
                shadowElevation = 2.dp
            ) {
                Column(
                    modifier = Modifier.padding(22.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp)
                ) {
                    Text(
                        text = tr(lang, "Masuk ke Akun Anda", "Sign In to Your Account"),
                        style = MaterialTheme.typography.titleLarge
                    )
                    Text(
                        text = tr(
                            lang,
                            "Gunakan email perusahaan atau NIK untuk presensi, cuti, dan slip gaji.",
                            "Use your company email or employee ID for attendance, leave, and payslips."
                        ),
                        style = MaterialTheme.typography.bodySmall
                    )

                    feedback?.let { (msg, isErr) ->
                        FeedbackBanner(message = msg, isError = isErr, onDismiss = { feedback = null })
                    }

                    OutlinedTextField(
                        value = email,
                        onValueChange = { email = it },
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
                        label = { Text(tr(lang, "Kata Sandi", "Password")) },
                        leadingIcon = { Icon(Icons.Default.Lock, contentDescription = null) },
                        trailingIcon = {
                            IconButton(onClick = { showPassword = !showPassword }) {
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
                        enabled = !loading && email.isNotBlank() && password.isNotBlank(),
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(50.dp),
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
                            Text(tr(lang, "Masuk", "Sign In"), fontWeight = FontWeight.Bold)
                        }
                    }

                    HorizontalDivider(color = Slate200)

                    Button(
                        onClick = { showQrScanner = true },
                        enabled = !loading,
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Blue50,
                            contentColor = Blue600
                        ),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Icon(Icons.Default.QrCodeScanner, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            tr(lang, "Scan QR Server", "Scan Server QR"),
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }

                    OutlinedButton(
                        onClick = {
                            email = "admin@openhr.id"
                            password = "Password123!"
                            performLogin("admin@openhr.id", "Password123!")
                        },
                        enabled = !loading,
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Text(
                            tr(lang, "Login Demo · admin@openhr.id", "Dev Login · admin@openhr.id"),
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold
                        )
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
                            companyName = name
                            feedback = tr(
                                lang,
                                "Terhubung ke $name ($normalized)",
                                "Connected to $name ($normalized)"
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
