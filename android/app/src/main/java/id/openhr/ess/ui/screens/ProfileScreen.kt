package id.openhr.ess.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
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
import id.openhr.ess.ui.components.FeedbackBanner
import id.openhr.ess.ui.components.ListSkeletonCards
import id.openhr.ess.ui.components.pressScale
import id.openhr.ess.ui.components.tr
import id.openhr.ess.ui.theme.LocalEssPalette
import id.openhr.ess.util.BankDirectory
import id.openhr.ess.util.Formatters
import id.openhr.ess.util.ShiftReminderScheduler
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(
    repository: EssRepository,
    sessionStore: SessionStore
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
    val companyName by sessionStore.companyNameFlow.collectAsState()

    var profile by remember { mutableStateOf(repository.cachedProfile) }
    var loading by remember { mutableStateOf(repository.cachedProfile == null) }
    var refreshing by remember { mutableStateOf(false) }
    var feedback by remember { mutableStateOf<Pair<String, Boolean>?>(null) }

    val notifLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) {
            sessionStore.setShiftReminderEnabled(true)
            ShiftReminderScheduler.schedule(context, null, null, lang)
            feedback = tr(lang, "Pengingat presensi diaktifkan", "Shift reminders enabled") to false
        } else {
            feedback = tr(lang, "Izin notifikasi diperlukan untuk pengingat shift.", "Notification permission required for reminders.") to true
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

    PullToRefreshBox(
        isRefreshing = refreshing,
        onRefresh = { loadProfile(isPullRefresh = true) },
        modifier = Modifier
            .fillMaxSize()
            .background(palette.canvas)
    ) {
        if (loading) {
            Box(modifier = Modifier.padding(16.dp)) {
                ListSkeletonCards(count = 4)
            }
        } else {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                feedback?.let { (msg, isErr) ->
                    FeedbackBanner(message = msg, isError = isErr, onDismiss = { feedback = null })
                }

                // Digital Employee ID Card
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(24.dp))
                        .background(Brush.linearGradient(listOf(palette.heroStart, palette.heroEnd)))
                        .padding(18.dp)
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = (companyName ?: "openHR").uppercase(),
                                color = Color(0xFF93C5FD),
                                fontSize = 11.sp,
                                fontWeight = FontWeight.ExtraBold,
                                letterSpacing = 1.sp
                            )
                            Surface(
                                shape = RoundedCornerShape(50),
                                color = Color(0xFF10B981).copy(alpha = 0.22f)
                            ) {
                                Text(
                                    text = (profile?.employment_status ?: "ACTIVE").uppercase(),
                                    color = Color(0xFF6EE7B7),
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
                                )
                            }
                        }

                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(14.dp)
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(62.dp)
                                    .clip(CircleShape)
                                    .background(palette.accent),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = profile?.full_name?.firstOrNull()?.uppercase() ?: user?.name?.firstOrNull()?.uppercase() ?: "U",
                                    color = Color.White,
                                    fontWeight = FontWeight.Black,
                                    fontSize = 24.sp
                                )
                            }
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = profile?.full_name ?: user?.name ?: "-",
                                    color = Color.White,
                                    fontWeight = FontWeight.ExtraBold,
                                    fontSize = 18.sp
                                )
                                Text(
                                    text = profile?.job_title ?: user?.jobTitle ?: "-",
                                    color = Color.White.copy(alpha = 0.78f),
                                    fontSize = 12.sp
                                )
                                val emailSubtitle = profile?.company_email ?: user?.email
                                if (!emailSubtitle.isNullOrBlank()) {
                                    Text(
                                        text = emailSubtitle,
                                        color = Color(0xFF93C5FD),
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.SemiBold,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }
                            }
                        }

                        // Copyable Chips (NIK, NPWP, Bank Acc)
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            CopyChip(
                                label = "NIK",
                                value = profile?.nik,
                                modifier = Modifier.weight(1f),
                                onClick = { copyToClipboard("NIK", profile?.nik) }
                            )
                            CopyChip(
                                label = "NPWP",
                                value = profile?.npwp_number,
                                modifier = Modifier.weight(1f),
                                onClick = { copyToClipboard("NPWP", profile?.npwp_number) }
                            )
                            CopyChip(
                                label = tr(lang, "Rek", "Acct"),
                                value = profile?.bank_account_number,
                                modifier = Modifier.weight(1f),
                                onClick = { copyToClipboard(tr(lang, "No. Rekening", "Account Number"), profile?.bank_account_number) }
                            )
                        }
                    }
                }

                // Identity & Legal Info
                ProfileSectionCard(
                    title = tr(lang, "Identitas & Pajak", "Identity & Tax"),
                    icon = Icons.Default.VerifiedUser,
                    iconTint = palette.accent
                ) {
                    ProfileRow(
                        label = if (profile?.is_foreign_worker == true) tr(lang, "No. Paspor", "Passport No.") else "KTP",
                        value = if (profile?.is_foreign_worker == true) profile?.passport_number else profile?.ktp_number
                    )
                    ProfileRow("NPWP", profile?.npwp_number)
                    ProfileRow("PTKP", profile?.ptkp_status ?: "TK/0")
                    ProfileRow("BPJS Kesehatan", profile?.bpjs_kesehatan_number)
                    ProfileRow("BPJS TK", profile?.bpjs_tk_number)
                    ProfileRow(tr(lang, "Tanggal Bergabung", "Join Date"), Formatters.formatDisplayDate(profile?.join_date, lang))
                }

                // Payroll Bank Account (Sheet Edit)
                ProfileSectionCard(
                    title = tr(lang, "Rekening Bank Payroll", "Payroll Bank Account"),
                    icon = Icons.Default.CreditCard,
                    iconTint = Color(0xFF6366F1),
                    actionLabel = tr(lang, "Ubah", "Edit"),
                    onAction = {
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
                    }
                ) {
                    ProfileRow("Bank", profile?.bank_name)
                    ProfileRow("SWIFT Code", profile?.bank_swift_code)
                    ProfileRow(tr(lang, "Cabang", "Branch"), profile?.bank_branch_name)
                    ProfileRow(tr(lang, "No. Rekening", "Account Number"), profile?.bank_account_number)
                    ProfileRow(tr(lang, "Atas Nama", "Account Holder"), profile?.bank_account_holder)
                }

                // Contact & Address (Sheet Edit)
                ProfileSectionCard(
                    title = tr(lang, "Kontak & Alamat", "Contact & Address"),
                    icon = Icons.Default.Phone,
                    iconTint = palette.success,
                    actionLabel = tr(lang, "Ubah", "Edit"),
                    onAction = {
                        val p = profile
                        phone = p?.phone ?: ""
                        address = p?.address ?: ""
                        showContactSheet = true
                    }
                ) {
                    ProfileRow(tr(lang, "Email Kantor", "Work Email"), profile?.company_email ?: user?.email)
                    if (!profile?.personal_email.isNullOrBlank()) {
                        ProfileRow(tr(lang, "Email Pribadi", "Personal Email"), profile?.personal_email)
                    }
                    ProfileRow(tr(lang, "Telepon", "Phone"), profile?.phone)
                    ProfileRow(tr(lang, "Alamat", "Address"), profile?.address)
                }

                // Preferences: Appearance (System / Light / Dark), Biometric Lock, Language
                ProfileSectionCard(
                    title = tr(lang, "Tampilan & Keamanan", "Appearance & Security"),
                    icon = Icons.Default.Tune,
                    iconTint = palette.warning
                ) {
                    // Theme Mode Segmented Pills
                    Text(
                        tr(lang, "Tema Aplikasi", "App Theme"),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = palette.textSecondary
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        val themes = listOf(
                            "system" to tr(lang, "Sistem", "System"),
                            "light" to tr(lang, "Terang", "Light"),
                            "dark" to tr(lang, "Gelap", "Dark")
                        )
                        themes.forEach { (mode, label) ->
                            val selected = themeMode == mode
                            Surface(
                                onClick = { sessionStore.setThemeMode(mode) },
                                shape = RoundedCornerShape(12.dp),
                                color = if (selected) palette.accentSurface else palette.subtleSurface,
                                border = BorderStroke(1.dp, if (selected) palette.accent else palette.cardBorder),
                                modifier = Modifier.weight(1f)
                            ) {
                                Box(
                                    modifier = Modifier.padding(vertical = 9.dp),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(
                                        text = label,
                                        fontSize = 12.sp,
                                        fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                                        color = if (selected) palette.accent else palette.textSecondary
                                    )
                                }
                            }
                        }
                    }

                    HorizontalDivider(color = palette.cardBorder, modifier = Modifier.padding(vertical = 4.dp))

                    // Biometric Lock Toggle
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                tr(lang, "Kunci Biometrik", "Biometric App Lock"),
                                fontSize = 13.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = palette.textPrimary
                            )
                            Text(
                                tr(lang, "Sidik jari / wajah saat membuka aplikasi", "Fingerprint / face unlock on app open"),
                                fontSize = 11.sp,
                                color = palette.textSecondary
                            )
                        }
                        Switch(
                            checked = biometricEnabled,
                            onCheckedChange = { enable ->
                                if (enable) {
                                    val bm = BiometricManager.from(context)
                                    val authStatus = bm.canAuthenticate(
                                        BiometricManager.Authenticators.BIOMETRIC_STRONG or
                                            BiometricManager.Authenticators.BIOMETRIC_WEAK
                                    )
                                    if (authStatus == BiometricManager.BIOMETRIC_SUCCESS) {
                                        sessionStore.setBiometricEnabled(true)
                                        feedback = tr(lang, "Kunci biometrik diaktifkan", "Biometric lock enabled") to false
                                    } else {
                                        feedback = tr(
                                            lang,
                                            "Perangkat belum memiliki sidik jari / wajah aktif.",
                                            "No biometrics enrolled on this device."
                                        ) to true
                                    }
                                } else {
                                    sessionStore.setBiometricEnabled(false)
                                }
                            }
                        )
                    }

                    HorizontalDivider(color = palette.cardBorder, modifier = Modifier.padding(vertical = 4.dp))

                    // Shift Reminders Toggle
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                tr(lang, "Pengingat Presensi Shift", "Shift Clock Reminders"),
                                fontSize = 13.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = palette.textPrimary
                            )
                            Text(
                                tr(lang, "Notifikasi 10 menit sebelum masuk & saat pulang", "Alerts 10m before clock-in & at clock-out"),
                                fontSize = 11.sp,
                                color = palette.textSecondary
                            )
                        }
                        Switch(
                            checked = shiftReminderEnabled,
                            onCheckedChange = { enable ->
                                if (enable) {
                                    if (Build.VERSION.SDK_INT >= 33 &&
                                        ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) !=
                                        PackageManager.PERMISSION_GRANTED
                                    ) {
                                        notifLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                                    } else {
                                        sessionStore.setShiftReminderEnabled(true)
                                        ShiftReminderScheduler.schedule(context, null, null, lang)
                                        feedback = tr(lang, "Pengingat presensi diaktifkan", "Shift reminders enabled") to false
                                    }
                                } else {
                                    sessionStore.setShiftReminderEnabled(false)
                                    ShiftReminderScheduler.cancel(context)
                                }
                            }
                        )
                    }

                    HorizontalDivider(color = palette.cardBorder, modifier = Modifier.padding(vertical = 4.dp))

                    // Language Picker
                    Text(
                        tr(lang, "Bahasa Aplikasi", "App Language"),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = palette.textSecondary
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        val langs = listOf("id" to "Indonesia", "en" to "English")
                        langs.forEach { (code, label) ->
                            val selected = lang == code
                            Surface(
                                onClick = { sessionStore.setLanguage(code) },
                                shape = RoundedCornerShape(12.dp),
                                color = if (selected) palette.accentSurface else palette.subtleSurface,
                                border = BorderStroke(1.dp, if (selected) palette.accent else palette.cardBorder),
                                modifier = Modifier.weight(1f)
                            ) {
                                Box(
                                    modifier = Modifier.padding(vertical = 9.dp),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(
                                        text = label,
                                        fontSize = 12.sp,
                                        fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                                        color = if (selected) palette.accent else palette.textSecondary
                                    )
                                }
                            }
                        }
                    }
                }

                // Logout
                OutlinedButton(
                    onClick = {
                        scope.launch { repository.logout() }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp)
                        .pressScale(),
                    shape = RoundedCornerShape(14.dp),
                    border = BorderStroke(1.dp, palette.danger.copy(alpha = 0.45f)),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = palette.danger)
                ) {
                    Icon(Icons.AutoMirrored.Filled.Logout, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(tr(lang, "Keluar (Logout)", "Log Out"), fontWeight = FontWeight.Bold)
                }

                Spacer(modifier = Modifier.height(12.dp))
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
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit
) {
    val palette = LocalEssPalette.current
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        color = palette.card,
        border = BorderStroke(1.dp, palette.cardBorder),
        shadowElevation = 0.dp
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(icon, contentDescription = null, tint = iconTint, modifier = Modifier.size(18.dp))
                    Text(title, fontWeight = FontWeight.Bold, fontSize = 14.sp, color = palette.textPrimary)
                }
                if (actionLabel != null && onAction != null) {
                    TextButton(onClick = onAction, contentPadding = PaddingValues(horizontal = 8.dp, vertical = 0.dp)) {
                        Text(actionLabel, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = palette.accent)
                    }
                }
            }
            content()
        }
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
