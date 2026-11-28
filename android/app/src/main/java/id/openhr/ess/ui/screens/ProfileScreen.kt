package id.openhr.ess.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.biometric.BiometricManager
import androidx.core.content.ContextCompat
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import coil.compose.AsyncImage
import coil.request.ImageRequest
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import id.openhr.ess.data.local.SessionStore
import id.openhr.ess.data.model.EmployeeProfile
import id.openhr.ess.data.model.UpdateBankDetailsRequest
import id.openhr.ess.data.model.UpdateContactRequest
import id.openhr.ess.data.repository.EssRepository
import id.openhr.ess.ui.components.CameraCaptureDialog
import id.openhr.ess.ui.components.EmployeeIdCardDialog
import id.openhr.ess.ui.components.FeedbackBanner
import id.openhr.ess.ui.components.ListSkeletonCards
import id.openhr.ess.ui.components.pressScale
import id.openhr.ess.ui.components.tr
import id.openhr.ess.ui.theme.LocalEssPalette
import id.openhr.ess.util.BankDirectory
import id.openhr.ess.util.FaceExtractResult
import id.openhr.ess.util.FaceRecognizer
import id.openhr.ess.util.Formatters
import id.openhr.ess.util.ShiftReminderScheduler
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(
    repository: EssRepository,
    sessionStore: SessionStore,
    onHeroHeightChanged: (Int) -> Unit = {},
    onHeroScrollChanged: (Int) -> Unit = {},
    onBackToHome: () -> Unit = {}
) {
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current
    val scope = rememberCoroutineScope()
    val palette = LocalEssPalette.current

    val user by sessionStore.userFlow.collectAsState()
    val lang by sessionStore.langFlow.collectAsState()
    val themeMode by sessionStore.themeModeFlow.collectAsState()
    val biometricEnabled by sessionStore.biometricEnabledFlow.collectAsState()
    val shiftReminderEnabled by sessionStore.shiftReminderEnabledFlow.collectAsState()
    val faceEnrolledVersion by sessionStore.faceEnrolledVersionFlow.collectAsState()
    val hasFaceEnrolled = remember(user?.employeeId, faceEnrolledVersion) {
        sessionStore.getFaceEmbedding(user?.employeeId) != null
    }
    var showFaceEnrollCamera by remember { mutableStateOf(false) }
    var enrollingFace by remember { mutableStateOf(false) }
    var showPhotoOptions by remember { mutableStateOf(false) }
    var showProfilePhotoCamera by remember { mutableStateOf(false) }
    var uploadingPhoto by remember { mutableStateOf(false) }
    var showIdCard by remember { mutableStateOf(false) }
    val companyName by sessionStore.companyNameFlow.collectAsState()
    val companyLogoUrl by sessionStore.companyLogoUrlFlow.collectAsState()
    val baseUrl by sessionStore.baseUrlFlow.collectAsState()
    val token by sessionStore.tokenFlow.collectAsState()

    var profile by remember { mutableStateOf(repository.cachedProfile) }
    var loading by remember { mutableStateOf(repository.cachedProfile == null) }
    var refreshing by remember { mutableStateOf(false) }
    var feedback by remember { mutableStateOf<Pair<String, Boolean>?>(null) }

    val profileGalleryPicker = rememberLauncherForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri ->
        val empId = user?.employeeId ?: return@rememberLauncherForActivityResult
        if (uri != null) {
            val b64 = Formatters.uriToBase64DataUrl(context, uri, maxDimension = 512)
            if (b64 != null) {
                uploadingPhoto = true
                scope.launch {
                    repository.updateEmployeePhoto(empId, b64)
                        .onSuccess { res ->
                            profile = profile?.copy(photo_url = res.photo_url)
                            feedback = tr(lang, "Foto profil diperbarui", "Profile photo updated") to false
                        }
                        .onFailure { err ->
                            feedback = (err.message ?: "Error") to true
                        }
                    uploadingPhoto = false
                }
            }
        }
    }

    val notifLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) {
            sessionStore.setShiftReminderEnabled(true)
            ShiftReminderScheduler.schedule(context, null, null, lang)
            Toast.makeText(context, tr(lang, "Pengingat presensi diaktifkan", "Shift reminders enabled"), Toast.LENGTH_SHORT).show()
        } else {
            Toast.makeText(context, tr(lang, "Izin notifikasi diperlukan untuk pengingat shift.", "Notification permission required for reminders."), Toast.LENGTH_SHORT).show()
        }
    }

    // Bank Edit Sheet State
    var showBankSheet by remember { mutableStateOf(false) }
    var bankName by remember { mutableStateOf("") }
    var bankSwift by remember { mutableStateOf("") }
    var bankBranchName by remember { mutableStateOf("") }
    var bankBranchCode by remember { mutableStateOf("") }
    var bankBranchAddress by remember { mutableStateOf("") }
    var bankAccNo by remember { mutableStateOf("") }
    var bankAccHolder by remember { mutableStateOf("") }
    var savingBank by remember { mutableStateOf(false) }

    // Contact Edit Sheet State
    var showContactSheet by remember { mutableStateOf(false) }
    var phone by remember { mutableStateOf("") }
    var address by remember { mutableStateOf("") }
    var savingContact by remember { mutableStateOf(false) }

    fun loadProfile(isPullRefresh: Boolean = false) {
        val empId = user?.employeeId ?: run {
            loading = false
            refreshing = false
            return
        }
        if (isPullRefresh) refreshing = true else if (profile == null) loading = true
        scope.launch {
            repository.getEmployee(empId)
                .onSuccess { profile = it }
                .onFailure { err ->
                    if (profile == null || isPullRefresh) {
                        feedback = (err.message ?: tr(lang, "Gagal memuat profil", "Failed to load profile")) to true
                    }
                }
            loading = false
            refreshing = false
        }
    }

    LaunchedEffect(user?.employeeId) {
        loadProfile()
    }

    fun copyToClipboard(label: String, value: String?) {
        if (value.isNullOrBlank()) return
        clipboard.setText(AnnotatedString(value))
        feedback = "$label ${tr(lang, "disalin", "copied")}" to false
    }

    val scrollState = rememberScrollState()
    LaunchedEffect(scrollState.value) {
        onHeroScrollChanged(scrollState.value)
    }

    PullToRefreshBox(
        isRefreshing = refreshing,
        onRefresh = { loadProfile(isPullRefresh = true) },
        modifier = Modifier
            .fillMaxSize()
    ) {
        if (loading) {
            Box(modifier = Modifier.padding(16.dp)) {
                ListSkeletonCards(count = 4)
            }
        } else {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(scrollState)
                    .padding(bottom = 24.dp)
            ) {
                // Curved Full-Bleed Colored Profile Hero (transparent over shared morphing hero backdrop)
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .onSizeChanged { onHeroHeightChanged(it.height) }
                        .statusBarsPadding()
                        .padding(horizontal = 20.dp, vertical = 22.dp)
                        .padding(bottom = 20.dp),
                    contentAlignment = Alignment.Center
                ) {
                    IconButton(
                        onClick = onBackToHome,
                        modifier = Modifier
                            .align(Alignment.TopStart)
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
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(86.dp)
                                .clickable(enabled = !uploadingPhoto) { showPhotoOptions = true },
                            contentAlignment = Alignment.Center
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(82.dp)
                                    .clip(CircleShape)
                                    .background(palette.onHero.copy(alpha = 0.2f))
                                    .border(3.dp, palette.onHero.copy(alpha = 0.45f), CircleShape),
                                contentAlignment = Alignment.Center
                            ) {
                                val photoUrl = profile?.photo_url
                                if (!photoUrl.isNullOrBlank()) {
                                    AsyncImage(
                                        model = ImageRequest.Builder(context)
                                            .data("$baseUrl$photoUrl&token=${token.orEmpty()}")
                                            .crossfade(true)
                                            .build(),
                                        contentDescription = "Profile Photo",
                                        contentScale = ContentScale.Crop,
                                        modifier = Modifier.fillMaxSize()
                                    )
                                } else {
                                    Text(
                                        text = profile?.full_name?.firstOrNull()?.uppercase() ?: user?.name?.firstOrNull()?.uppercase() ?: "U",
                                        color = palette.onHero,
                                        fontWeight = FontWeight.Black,
                                        fontSize = 32.sp
                                    )
                                }
                            }
                            Surface(
                                shape = CircleShape,
                                color = Color.White,
                                shadowElevation = 3.dp,
                                modifier = Modifier
                                    .align(Alignment.BottomEnd)
                                    .size(26.dp)
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    if (uploadingPhoto) {
                                        CircularProgressIndicator(modifier = Modifier.size(13.dp), strokeWidth = 2.dp, color = palette.accent)
                                    } else {
                                        Icon(
                                            Icons.Default.CameraAlt,
                                            contentDescription = "Update photo",
                                            tint = Color(0xFF0F172A),
                                            modifier = Modifier.size(14.dp)
                                        )
                                    }
                                }
                            }
                        }

                        Spacer(modifier = Modifier.height(4.dp))

                        Text(
                            text = profile?.full_name ?: user?.name ?: "-",
                            color = palette.onHero,
                            fontWeight = FontWeight.Bold,
                            fontSize = 20.sp
                        )

                        Text(
                            text = profile?.job_title ?: user?.jobTitle ?: tr(lang, "Karyawan", "Employee"),
                            color = palette.onHero.copy(alpha = 0.88f),
                            fontSize = 12.sp
                        )

                        Row(
                            modifier = Modifier.padding(top = 4.dp),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Surface(
                                shape = CircleShape,
                                color = palette.onHero.copy(alpha = 0.16f)
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 6.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                                ) {
                                    Text(
                                        text = companyName ?: "openHR",
                                        color = palette.onHero,
                                        fontSize = 11.5.sp,
                                        fontWeight = FontWeight.SemiBold
                                    )
                                    if (!profile?.nik.isNullOrBlank()) {
                                        Text("·", color = palette.onHero.copy(alpha = 0.7f), fontSize = 11.5.sp)
                                        Text(
                                            text = profile?.nik ?: "",
                                            color = palette.onHero,
                                            fontSize = 11.5.sp,
                                            fontWeight = FontWeight.Bold
                                        )
                                    }
                                }
                            }

                            if (profile != null) {
                                Surface(
                                    shape = CircleShape,
                                    color = Color.White,
                                    shadowElevation = 2.dp,
                                    modifier = Modifier.clickable { showIdCard = true }
                                ) {
                                    Row(
                                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(5.dp)
                                    ) {
                                        Icon(
                                            Icons.Default.Badge,
                                            contentDescription = null,
                                            tint = Color(0xFF0F172A),
                                            modifier = Modifier.size(14.dp)
                                        )
                                        Text(
                                            text = tr(lang, "Kartu ID", "ID Card"),
                                            color = Color(0xFF0F172A),
                                            fontSize = 11.5.sp,
                                            fontWeight = FontWeight.Bold
                                        )
                                    }
                                }
                            }
                        }
                    }
                }

                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp)
                        .offset(y = (-18).dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                feedback?.let { (msg, isErr) ->
                    FeedbackBanner(message = msg, isError = isErr, onDismiss = { feedback = null })
                }

                var openSection by remember { mutableStateOf<String?>("profile") }

                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(24.dp),
                    color = palette.card,
                    border = BorderStroke(1.dp, palette.cardBorder),
                    shadowElevation = 4.dp
                ) {
                    Column(modifier = Modifier.fillMaxWidth()) {
                        // 1. Profilku
                        ProfileMenuRow(
                            icon = Icons.Default.Person,
                            title = tr(lang, "Profilku", "My Profile"),
                            subtitle = "${profile?.employment_status ?: "ACTIVE"} · ${profile?.ptkp_status ?: "TK/0"}",
                            expanded = openSection == "profile",
                            onClick = { openSection = if (openSection == "profile") null else "profile" }
                        )
                        if (openSection == "profile") {
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .background(palette.subtleSurface.copy(alpha = 0.6f))
                                    .padding(horizontal = 16.dp, vertical = 10.dp),
                                verticalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                ProfileRow("NIK", profile?.nik)
                                ProfileRow(tr(lang, "Status Kerja", "Status"), profile?.employment_status)
                                ProfileRow(tr(lang, "Tanggal Bergabung", "Join Date"), Formatters.formatDisplayDate(profile?.join_date, lang))
                                ProfileRow("PTKP", profile?.ptkp_status ?: "TK/0")
                            }
                        }
                        HorizontalDivider(color = palette.cardBorder)

                        // 2. Kartu Identitas & Pajak
                        ProfileMenuRow(
                            icon = Icons.Default.VerifiedUser,
                            title = tr(lang, "Kartu Identitas & Pajak", "Identity & Tax ID"),
                            subtitle = if (profile?.is_foreign_worker == true) (profile?.passport_number ?: "-") else (profile?.ktp_number ?: "-"),
                            expanded = openSection == "identity",
                            onClick = { openSection = if (openSection == "identity") null else "identity" }
                        )
                        if (openSection == "identity") {
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .background(palette.subtleSurface.copy(alpha = 0.6f))
                                    .padding(horizontal = 16.dp, vertical = 10.dp),
                                verticalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                ProfileRow(
                                    label = if (profile?.is_foreign_worker == true) tr(lang, "No. Paspor", "Passport No.") else "KTP",
                                    value = if (profile?.is_foreign_worker == true) profile?.passport_number else profile?.ktp_number
                                )
                                ProfileRow("NPWP", profile?.npwp_number)
                                ProfileRow("BPJS Kesehatan", profile?.bpjs_kesehatan_number)
                                ProfileRow("BPJS TK", profile?.bpjs_tk_number)
                            }
                        }
                        HorizontalDivider(color = palette.cardBorder)

                        // 3. Rekening Bank Payroll
                        ProfileMenuRow(
                            icon = Icons.Default.CreditCard,
                            title = tr(lang, "Rekening Bank Payroll", "Payroll Bank Account"),
                            subtitle = profile?.bank_name?.let { "$it · ${profile?.bank_account_number ?: ""}" } ?: tr(lang, "Belum diatur", "Not set"),
                            expanded = openSection == "bank",
                            onClick = { openSection = if (openSection == "bank") null else "bank" }
                        )
                        if (openSection == "bank") {
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .background(palette.subtleSurface.copy(alpha = 0.6f))
                                    .padding(horizontal = 16.dp, vertical = 10.dp),
                                verticalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                ProfileRow("Bank", profile?.bank_name)
                                ProfileRow("SWIFT Code", profile?.bank_swift_code)
                                ProfileRow(tr(lang, "Cabang", "Branch"), profile?.bank_branch_name)
                                ProfileRow(tr(lang, "No. Rekening", "Account Number"), profile?.bank_account_number)
                                ProfileRow(tr(lang, "Atas Nama", "Account Holder"), profile?.bank_account_holder)
                                TextButton(
                                    onClick = {
                                        val p = profile
                                        val prefill = BankDirectory.find(p?.bank_name)
                                        bankName = p?.bank_name ?: ""
                                        bankSwift = p?.bank_swift_code ?: prefill?.swift ?: ""
                                        bankBranchName = p?.bank_branch_name ?: prefill?.branchName ?: ""
                                        bankBranchCode = p?.bank_branch_code ?: prefill?.branchCode ?: ""
                                        bankBranchAddress = p?.bank_branch_address ?: prefill?.branchAddress ?: ""
                                        bankAccNo = p?.bank_account_number ?: ""
                                        bankAccHolder = p?.bank_account_holder ?: ""
                                        showBankSheet = true
                                    },
                                    modifier = Modifier.align(Alignment.End)
                                ) {
                                    Text(tr(lang, "Ubah Rekening", "Edit Account"), color = palette.accent, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                                }
                            }
                        }
                        HorizontalDivider(color = palette.cardBorder)

                        // 4. Akunku & Kontak
                        ProfileMenuRow(
                            icon = Icons.Default.Phone,
                            title = tr(lang, "Akunku & Kontak", "Account & Contact"),
                            subtitle = profile?.company_email ?: user?.email ?: profile?.phone ?: "-",
                            expanded = openSection == "contact",
                            onClick = { openSection = if (openSection == "contact") null else "contact" }
                        )
                        if (openSection == "contact") {
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .background(palette.subtleSurface.copy(alpha = 0.6f))
                                    .padding(horizontal = 16.dp, vertical = 10.dp),
                                verticalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                ProfileRow(tr(lang, "Email Kantor", "Work Email"), profile?.company_email ?: user?.email)
                                if (!profile?.personal_email.isNullOrBlank()) {
                                    ProfileRow(tr(lang, "Email Pribadi", "Personal Email"), profile?.personal_email)
                                }
                                ProfileRow(tr(lang, "Telepon", "Phone"), profile?.phone)
                                ProfileRow(tr(lang, "Alamat", "Address"), profile?.address)
                                TextButton(
                                    onClick = {
                                        val p = profile
                                        phone = p?.phone ?: ""
                                        address = p?.address ?: ""
                                        showContactSheet = true
                                    },
                                    modifier = Modifier.align(Alignment.End)
                                ) {
                                    Text(tr(lang, "Ubah Kontak", "Edit Contact"), color = palette.accent, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                                }
                            }
                        }
                        HorizontalDivider(color = palette.cardBorder)

                        // 5. Preferensi & Keamanan
                        ProfileMenuRow(
                            icon = Icons.Default.Tune,
                            title = tr(lang, "Preferensi & Keamanan", "Preferences & Security"),
                            subtitle = "${if (lang == "id") "Indonesia" else "English"} · ${themeMode.replaceFirstChar { it.uppercase() }}",
                            expanded = openSection == "prefs",
                            onClick = { openSection = if (openSection == "prefs") null else "prefs" }
                        )
                        if (openSection == "prefs") {
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .background(palette.subtleSurface.copy(alpha = 0.6f))
                                    .padding(horizontal = 16.dp, vertical = 12.dp),
                                verticalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    listOf(
                                        "system" to tr(lang, "Sistem", "System"),
                                        "light" to tr(lang, "Terang", "Light"),
                                        "dark" to tr(lang, "Gelap", "Dark")
                                    ).forEach { (mode, label) ->
                                        val selected = themeMode == mode
                                        Surface(
                                            onClick = { sessionStore.setThemeMode(mode) },
                                            shape = RoundedCornerShape(10.dp),
                                            color = if (selected) palette.accentSurface else palette.card,
                                            border = BorderStroke(1.dp, if (selected) palette.accent else palette.cardBorder),
                                            modifier = Modifier.weight(1f)
                                        ) {
                                            Box(modifier = Modifier.padding(vertical = 8.dp), contentAlignment = Alignment.Center) {
                                                Text(label, fontSize = 11.sp, fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium, color = if (selected) palette.accent else palette.textSecondary)
                                            }
                                        }
                                    }
                                }

                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    listOf("id" to "Indonesia", "en" to "English").forEach { (code, label) ->
                                        val selected = lang == code
                                        Surface(
                                            onClick = { sessionStore.setLanguage(code) },
                                            shape = RoundedCornerShape(10.dp),
                                            color = if (selected) palette.accentSurface else palette.card,
                                            border = BorderStroke(1.dp, if (selected) palette.accent else palette.cardBorder),
                                            modifier = Modifier.weight(1f)
                                        ) {
                                            Box(modifier = Modifier.padding(vertical = 8.dp), contentAlignment = Alignment.Center) {
                                                Text(label, fontSize = 11.sp, fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium, color = if (selected) palette.accent else palette.textSecondary)
                                            }
                                        }
                                    }
                                }

                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(tr(lang, "Kunci Biometrik", "Biometric Lock"), fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = palette.textPrimary)
                                    Switch(
                                        checked = biometricEnabled,
                                        onCheckedChange = { enable ->
                                            if (enable) {
                                                val bm = BiometricManager.from(context)
                                                val authStatus = bm.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG or BiometricManager.Authenticators.BIOMETRIC_WEAK)
                                                if (authStatus == BiometricManager.BIOMETRIC_SUCCESS) {
                                                    sessionStore.setBiometricEnabled(true)
                                                } else {
                                                    Toast.makeText(context, tr(lang, "Biometrik belum tersedia.", "No biometrics enrolled."), Toast.LENGTH_SHORT).show()
                                                }
                                            } else {
                                                sessionStore.setBiometricEnabled(false)
                                            }
                                        }
                                    )
                                }

                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(tr(lang, "Pengingat Shift", "Shift Reminders"), fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = palette.textPrimary)
                                    Switch(
                                        checked = shiftReminderEnabled,
                                        onCheckedChange = { enable ->
                                            if (enable) {
                                                if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                                                    notifLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                                                } else {
                                                    sessionStore.setShiftReminderEnabled(true)
                                                    ShiftReminderScheduler.schedule(context, null, null, lang)
                                                }
                                            } else {
                                                sessionStore.setShiftReminderEnabled(false)
                                                ShiftReminderScheduler.cancel(context)
                                            }
                                        }
                                    )
                                }

                                HorizontalDivider(color = palette.cardBorder.copy(alpha = 0.6f))

                                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Column(modifier = Modifier.weight(1f)) {
                                            Text(
                                                tr(lang, "Pengenalan Wajah (Opsional)", "Face Recognition (Optional)"),
                                                fontSize = 12.sp,
                                                fontWeight = FontWeight.SemiBold,
                                                color = palette.textPrimary
                                            )
                                            Text(
                                                text = if (hasFaceEnrolled) {
                                                    tr(lang, "Terdaftar di perangkat ini", "Enrolled on this device")
                                                } else {
                                                    tr(lang, "Belum terdaftar · tidak wajib", "Not enrolled · optional")
                                                },
                                                fontSize = 11.sp,
                                                color = if (hasFaceEnrolled) palette.success else palette.textMuted
                                            )
                                        }
                                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                            if (hasFaceEnrolled) {
                                                TextButton(
                                                    onClick = {
                                                        sessionStore.clearFaceEmbedding(user?.employeeId)
                                                        feedback = tr(lang, "Data wajah dihapus", "Face data removed") to false
                                                    },
                                                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp)
                                                ) {
                                                    Text(tr(lang, "Hapus", "Clear"), fontSize = 11.sp, color = palette.danger)
                                                }
                                            }
                                            OutlinedButton(
                                                enabled = !enrollingFace,
                                                onClick = { showFaceEnrollCamera = true },
                                                contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
                                                shape = RoundedCornerShape(10.dp)
                                            ) {
                                                Text(
                                                    text = if (enrollingFace) {
                                                        tr(lang, "Memproses...", "Processing...")
                                                    } else if (hasFaceEnrolled) {
                                                        tr(lang, "Perbarui", "Update")
                                                    } else {
                                                        tr(lang, "Daftar", "Enroll")
                                                    },
                                                    fontSize = 11.sp,
                                                    fontWeight = FontWeight.SemiBold
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        HorizontalDivider(color = palette.cardBorder)

                        // 6. Keluar
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { scope.launch { repository.logout() } }
                                .padding(horizontal = 16.dp, vertical = 14.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(36.dp)
                                    .clip(CircleShape)
                                    .background(palette.dangerSurface),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(Icons.AutoMirrored.Filled.Logout, contentDescription = null, tint = palette.danger, modifier = Modifier.size(18.dp))
                            }
                            Text(
                                text = tr(lang, "Keluar (Logout)", "Log Out"),
                                fontWeight = FontWeight.SemiBold,
                                fontSize = 14.sp,
                                color = palette.danger,
                                modifier = Modifier.weight(1f)
                            )
                            Icon(Icons.Default.ChevronRight, contentDescription = null, tint = palette.danger.copy(alpha = 0.5f), modifier = Modifier.size(18.dp))
                        }
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))
                }
            }
        }
    }

    // Bank Details ModalBottomSheet
    if (showBankSheet) {
        val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        ModalBottomSheet(
            onDismissRequest = { showBankSheet = false },
            sheetState = sheetState,
            containerColor = palette.card,
            contentColor = palette.textPrimary,
            shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .navigationBarsPadding()
                    .imePadding()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 20.dp)
                    .padding(bottom = 24.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text(
                    tr(lang, "Ubah Rekening Payroll", "Edit Payroll Bank"),
                    fontWeight = FontWeight.ExtraBold,
                    fontSize = 18.sp,
                    color = palette.textPrimary
                )

                var bankDropdownExpanded by remember { mutableStateOf(false) }
                ExposedDropdownMenuBox(
                    expanded = bankDropdownExpanded,
                    onExpandedChange = { bankDropdownExpanded = !bankDropdownExpanded }
                ) {
                    OutlinedTextField(
                        value = bankName,
                        onValueChange = { bankName = it },
                        label = { Text(tr(lang, "Nama Bank", "Bank Name")) },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = bankDropdownExpanded) },
                        shape = RoundedCornerShape(14.dp),
                        modifier = Modifier
                            .menuAnchor(MenuAnchorType.PrimaryEditable)
                            .fillMaxWidth()
                    )
                    ExposedDropdownMenu(expanded = bankDropdownExpanded, onDismissRequest = { bankDropdownExpanded = false }) {
                        BankDirectory.entries.forEach { entry ->
                            DropdownMenuItem(
                                text = { Text(entry.name) },
                                onClick = {
                                    bankName = entry.name
                                    bankSwift = entry.swift
                                    bankBranchName = entry.branchName
                                    bankBranchCode = entry.branchCode
                                    bankBranchAddress = entry.branchAddress
                                    bankDropdownExpanded = false
                                }
                            )
                        }
                    }
                }

                OutlinedTextField(value = bankSwift, onValueChange = { bankSwift = it }, label = { Text("SWIFT") }, shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth())
                OutlinedTextField(value = bankBranchName, onValueChange = { bankBranchName = it }, label = { Text(tr(lang, "Cabang", "Branch")) }, shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth())
                OutlinedTextField(value = bankAccNo, onValueChange = { bankAccNo = it }, label = { Text(tr(lang, "No. Rekening", "Account Number")) }, shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth())
                OutlinedTextField(value = bankAccHolder, onValueChange = { bankAccHolder = it }, label = { Text(tr(lang, "Atas Nama", "Account Holder")) }, shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth())

                Button(
                    enabled = !savingBank,
                    onClick = {
                        val empId = profile?.id ?: return@Button
                        scope.launch {
                            savingBank = true
                            val req = UpdateBankDetailsRequest(
                                bank_name = bankName.trim(),
                                bank_swift_code = bankSwift.trim(),
                                bank_branch_name = bankBranchName.trim(),
                                bank_branch_code = bankBranchCode.trim(),
                                bank_branch_address = bankBranchAddress.trim(),
                                bank_account_number = bankAccNo.trim(),
                                bank_account_holder = bankAccHolder.trim()
                            )
                            repository.updateBankDetails(empId, req)
                                .onSuccess { msg ->
                                    feedback = msg to false
                                    showBankSheet = false
                                    loadProfile()
                                }
                                .onFailure { err ->
                                    feedback = (err.message ?: "Error") to true
                                }
                            savingBank = false
                        }
                    },
                    modifier = Modifier.fillMaxWidth().height(48.dp).pressScale(),
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = palette.accent, contentColor = Color.White)
                ) {
                    Text(if (savingBank) tr(lang, "Menyimpan...", "Saving...") else tr(lang, "Simpan Rekening", "Save Bank Details"), fontWeight = FontWeight.Bold)
                }
            }
        }
    }

    // Contact Details ModalBottomSheet
    if (showIdCard && profile != null) {
        EmployeeIdCardDialog(
            profile = profile!!,
            companyName = companyName,
            companyLogoUrl = companyLogoUrl,
            baseUrl = baseUrl,
            token = token,
            lang = lang,
            onDismiss = { showIdCard = false }
        )
    }

    if (showContactSheet) {
        val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        ModalBottomSheet(
            onDismissRequest = { showContactSheet = false },
            sheetState = sheetState,
            containerColor = palette.card,
            contentColor = palette.textPrimary,
            shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .navigationBarsPadding()
                    .imePadding()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 20.dp)
                    .padding(bottom = 24.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text(
                    tr(lang, "Ubah Kontak & Alamat", "Edit Contact & Address"),
                    fontWeight = FontWeight.ExtraBold,
                    fontSize = 18.sp,
                    color = palette.textPrimary
                )

                OutlinedTextField(value = phone, onValueChange = { phone = it }, label = { Text(tr(lang, "No. Telepon", "Phone")) }, shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth())
                OutlinedTextField(value = address, onValueChange = { address = it }, label = { Text(tr(lang, "Alamat", "Address")) }, minLines = 2, shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth())

                Button(
                    enabled = !savingContact,
                    onClick = {
                        val empId = profile?.id ?: return@Button
                        scope.launch {
                            savingContact = true
                            repository.updateContact(
                                employeeId = empId,
                                phone = phone.trim(),
                                address = address.trim()
                            ).onSuccess { msg ->
                                feedback = msg to false
                                showContactSheet = false
                                loadProfile()
                            }.onFailure { err ->
                                feedback = (err.message ?: "Error") to true
                            }
                            savingContact = false
                        }
                    },
                    modifier = Modifier.fillMaxWidth().height(48.dp).pressScale(),
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = palette.accent, contentColor = Color.White)
                ) {
                    Text(if (savingContact) tr(lang, "Menyimpan...", "Saving...") else tr(lang, "Simpan Kontak", "Save Contact"), fontWeight = FontWeight.Bold)
                }
            }
        }
    }

    if (showFaceEnrollCamera) {
        CameraCaptureDialog(
            title = tr(lang, "Daftarkan Wajah", "Enroll Face"),
            useFrontCamera = true,
            lang = lang,
            onDismiss = { showFaceEnrollCamera = false },
            onCaptured = { base64 ->
                showFaceEnrollCamera = false
                enrollingFace = true
                scope.launch {
                    when (val result = FaceRecognizer.extractFromDataUrl(context, base64)) {
                        is FaceExtractResult.Success -> {
                            sessionStore.saveFaceEmbedding(user?.employeeId, result.embedding)
                            feedback = tr(
                                lang,
                                "Wajah berhasil didaftarkan di perangkat ini",
                                "Face enrolled on this device"
                            ) to false
                        }
                        is FaceExtractResult.NoFace -> {
                            feedback = tr(
                                lang,
                                "Wajah tidak terdeteksi, coba lagi di tempat terang",
                                "No face detected, please try again in good light"
                            ) to true
                        }
                        is FaceExtractResult.Error -> {
                            feedback = result.message to true
                        }
                    }
                    enrollingFace = false
                }
            }
        )
    }

    if (showPhotoOptions) {
        AlertDialog(
            onDismissRequest = { showPhotoOptions = false },
            containerColor = palette.card,
            title = {
                Text(
                    tr(lang, "Foto Profil Karyawan", "Employee Profile Photo"),
                    fontWeight = FontWeight.Bold
                )
            },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(
                        onClick = {
                            showPhotoOptions = false
                            showProfilePhotoCamera = true
                        },
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Icon(Icons.Default.CameraAlt, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(tr(lang, "Ambil Foto Kamera", "Take Camera Photo"), fontSize = 13.sp)
                    }
                    OutlinedButton(
                        onClick = {
                            showPhotoOptions = false
                            profileGalleryPicker.launch("image/*")
                        },
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Icon(Icons.Default.PhotoLibrary, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(tr(lang, "Pilih dari Galeri", "Choose from Gallery"), fontSize = 13.sp)
                    }
                    if (!profile?.photo_url.isNullOrBlank()) {
                        TextButton(
                            onClick = {
                                showPhotoOptions = false
                                val empId = user?.employeeId ?: return@TextButton
                                uploadingPhoto = true
                                scope.launch {
                                    repository.deleteEmployeePhoto(empId)
                                        .onSuccess {
                                            profile = profile?.copy(photo_url = null)
                                            feedback = tr(lang, "Foto profil dihapus", "Profile photo removed") to false
                                        }
                                        .onFailure { err -> feedback = (err.message ?: "Error") to true }
                                    uploadingPhoto = false
                                }
                            },
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(tr(lang, "Hapus Foto Saat Ini", "Remove Current Photo"), color = palette.danger, fontSize = 12.sp)
                        }
                    }
                }
            },
            confirmButton = {},
            dismissButton = {
                TextButton(onClick = { showPhotoOptions = false }) {
                    Text(tr(lang, "Batal", "Cancel"))
                }
            }
        )
    }

    if (showProfilePhotoCamera) {
        CameraCaptureDialog(
            title = tr(lang, "Foto Profil", "Profile Photo"),
            useFrontCamera = true,
            lang = lang,
            onDismiss = { showProfilePhotoCamera = false },
            onCaptured = { base64 ->
                showProfilePhotoCamera = false
                val empId = user?.employeeId ?: return@CameraCaptureDialog
                uploadingPhoto = true
                scope.launch {
                    repository.updateEmployeePhoto(empId, base64)
                        .onSuccess { res ->
                            profile = profile?.copy(photo_url = res.photo_url)
                            feedback = tr(lang, "Foto profil diperbarui", "Profile photo updated") to false
                        }
                        .onFailure { err -> feedback = (err.message ?: "Error") to true }
                    uploadingPhoto = false
                }
            }
        )
    }
}

@Composable
private fun CopyChip(
    label: String,
    value: String?,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    Surface(
        onClick = onClick,
        enabled = !value.isNullOrBlank(),
        modifier = modifier,
        shape = RoundedCornerShape(12.dp),
        color = Color.White.copy(alpha = 0.12f)
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(2.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                Text(label, fontSize = 9.sp, fontWeight = FontWeight.Bold, color = Color(0xFF93C5FD))
                if (!value.isNullOrBlank()) {
                    Icon(Icons.Default.ContentCopy, contentDescription = "Copy", tint = Color.White.copy(alpha = 0.65f), modifier = Modifier.size(10.dp))
                }
            }
            Text(
                text = value?.ifBlank { "-" } ?: "-",
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

@Composable
private fun ProfileSectionCard(
    title: String,
    icon: ImageVector,
    iconTint: Color,
    collapsible: Boolean = false,
    initiallyExpanded: Boolean = true,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit
) {
    val palette = LocalEssPalette.current
    var expanded by remember { mutableStateOf(initiallyExpanded) }
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        color = palette.card,
        border = BorderStroke(1.dp, palette.cardBorder),
        shadowElevation = 0.dp
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .then(if (collapsible) Modifier.clickable { expanded = !expanded } else Modifier),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(icon, contentDescription = null, tint = iconTint, modifier = Modifier.size(18.dp))
                    Text(title, fontWeight = FontWeight.Bold, fontSize = 14.sp, color = palette.textPrimary)
                }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    if (actionLabel != null && onAction != null && expanded) {
                        TextButton(onClick = onAction, contentPadding = PaddingValues(horizontal = 8.dp, vertical = 0.dp)) {
                            Text(actionLabel, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = palette.accent)
                        }
                    }
                    if (collapsible) {
                        Icon(
                            imageVector = if (expanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                            contentDescription = null,
                            tint = palette.textMuted,
                            modifier = Modifier.size(20.dp)
                        )
                    }
                }
            }
            if (expanded) {
                content()
            }
        }
    }
}

@Composable
private fun ProfileMenuRow(
    icon: ImageVector,
    title: String,
    subtitle: String,
    expanded: Boolean,
    onClick: () -> Unit
) {
    val palette = LocalEssPalette.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Box(
            modifier = Modifier
                .size(36.dp)
                .clip(CircleShape)
                .background(palette.subtleSurface),
            contentAlignment = Alignment.Center
        ) {
            Icon(icon, contentDescription = null, tint = palette.textSecondary, modifier = Modifier.size(18.dp))
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(title, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, color = palette.textPrimary)
            Text(subtitle, fontSize = 11.sp, color = palette.textMuted, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Icon(
            imageVector = if (expanded) Icons.Default.ExpandLess else Icons.Default.ChevronRight,
            contentDescription = null,
            tint = palette.textMuted,
            modifier = Modifier.size(18.dp)
        )
    }
}

@Composable
private fun ProfileRow(label: String, value: String?) {
    val palette = LocalEssPalette.current
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(label, fontSize = 12.sp, color = palette.textSecondary, modifier = Modifier.weight(0.42f))
        Text(
            value?.ifBlank { "-" } ?: "-",
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            color = palette.textPrimary,
            modifier = Modifier.weight(0.58f)
        )
    }
}
