package id.openhr.ess.ui.screens

import androidx.compose.foundation.background
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
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import id.openhr.ess.data.local.SessionStore
import id.openhr.ess.data.model.EmployeeProfile
import id.openhr.ess.data.model.UpdateBankDetailsRequest
import id.openhr.ess.data.repository.EssRepository
import id.openhr.ess.ui.components.FeedbackBanner
import id.openhr.ess.ui.components.tr
import id.openhr.ess.ui.theme.*
import id.openhr.ess.util.BankDirectory
import id.openhr.ess.util.Formatters
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(
    repository: EssRepository,
    sessionStore: SessionStore
) {
    val scope = rememberCoroutineScope()
    val user by sessionStore.userFlow.collectAsState()
    val lang by sessionStore.langFlow.collectAsState()

    var profile by remember { mutableStateOf<EmployeeProfile?>(null) }
    var loading by remember { mutableStateOf(true) }
    var feedback by remember { mutableStateOf<Pair<String, Boolean>?>(null) }

    // Bank Editing
    var editingBank by remember { mutableStateOf(false) }
    var savingBank by remember { mutableStateOf(false) }
    var bankName by remember { mutableStateOf("") }
    var bankSwift by remember { mutableStateOf("") }
    var bankBranchName by remember { mutableStateOf("") }
    var bankBranchCode by remember { mutableStateOf("") }
    var bankBranchAddress by remember { mutableStateOf("") }
    var bankAccNo by remember { mutableStateOf("") }
    var bankAccHolder by remember { mutableStateOf("") }

    // Contact Editing
    var editingContact by remember { mutableStateOf(false) }
    var savingContact by remember { mutableStateOf(false) }
    var phone by remember { mutableStateOf("") }
    var address by remember { mutableStateOf("") }

    LaunchedEffect(user?.employeeId) {
        val empId = user?.employeeId ?: return@LaunchedEffect
        loading = true
        repository.getEmployee(empId)
            .onSuccess { profile = it }
            .onFailure { err ->
                feedback = (err.message ?: tr(lang, "Gagal memuat profil", "Failed to load profile")) to true
            }
        loading = false
    }

    if (loading) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }
        return
    }

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

        // Header Card
        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(24.dp),
            color = Color.White,
            shadowElevation = 1.dp
        ) {
            Column(
                modifier = Modifier.padding(20.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Box(
                    modifier = Modifier
                        .size(64.dp)
                        .clip(CircleShape)
                        .background(Blue600),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = profile?.full_name?.firstOrNull()?.uppercase() ?: "U",
                        color = Color.White,
                        fontWeight = FontWeight.Black,
                        fontSize = 24.sp
                    )
                }
                Text(profile?.full_name ?: user?.name ?: "-", fontWeight = FontWeight.Bold, fontSize = 18.sp, color = Slate900)
                Text(profile?.job_title ?: user?.jobTitle ?: "-", fontSize = 12.sp, color = Slate500)
                Surface(shape = RoundedCornerShape(50), color = Slate100) {
                    Text(
                        text = "NIK: ${profile?.nik ?: "-"}  •  ${profile?.employment_status ?: "-"}",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Blue600,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 5.dp)
                    )
                }
            }
        }

        // Identity & Legal Info
        ProfileSectionCard(
            title = tr(lang, "Identitas & Pajak", "Identity & Tax"),
            icon = Icons.Default.VerifiedUser,
            iconTint = Blue600
        ) {
            ProfileRow(
                label = if (profile?.is_foreign_worker == true) tr(lang, "No. Paspor", "Passport No.") else "KTP",
                value = if (profile?.is_foreign_worker == true) profile?.passport_number else profile?.ktp_number
            )
            ProfileRow("NPWP", profile?.npwp_number)
            ProfileRow("PTKP", profile?.ptkp_status ?: "TK/0")
            ProfileRow(tr(lang, "Tanggal Bergabung", "Join Date"), Formatters.formatDisplayDate(profile?.join_date, lang))
        }

        // Payroll Bank Account
        ProfileSectionCard(
            title = tr(lang, "Rekening Bank Payroll", "Payroll Bank Account"),
            icon = Icons.Default.CreditCard,
            iconTint = Color(0xFF4F46E5),
            actionLabel = if (!editingBank) tr(lang, "Ubah", "Edit") else null,
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
                editingBank = true
            }
        ) {
            if (editingBank) {
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
                OutlinedTextField(value = bankSwift, onValueChange = { bankSwift = it }, label = { Text("SWIFT") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(value = bankBranchName, onValueChange = { bankBranchName = it }, label = { Text(tr(lang, "Cabang", "Branch")) }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(value = bankAccNo, onValueChange = { bankAccNo = it }, label = { Text(tr(lang, "No. Rekening", "Account Number")) }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(value = bankAccHolder, onValueChange = { bankAccHolder = it }, label = { Text(tr(lang, "Atas Nama", "Account Holder")) }, modifier = Modifier.fillMaxWidth())

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(
                        enabled = !savingBank,
                        onClick = {
                            val empId = profile?.id ?: return@Button
                            scope.launch {
                                savingBank = true
                                val req = UpdateBankDetailsRequest(
                                    bank_name = bankName,
                                    bank_swift_code = bankSwift,
                                    bank_branch_name = bankBranchName,
                                    bank_branch_code = bankBranchCode,
                                    bank_branch_address = bankBranchAddress,
                                    bank_account_number = bankAccNo,
                                    bank_account_holder = bankAccHolder
                                )
                                repository.updateBankDetails(empId, req)
                                    .onSuccess { msg ->
                                        profile = profile?.copy(
                                            bank_name = bankName,
                                            bank_swift_code = bankSwift,
                                            bank_branch_name = bankBranchName,
                                            bank_branch_code = bankBranchCode,
                                            bank_branch_address = bankBranchAddress,
                                            bank_account_number = bankAccNo,
                                            bank_account_holder = bankAccHolder
                                        )
                                        editingBank = false
                                        feedback = msg to false
                                    }
                                    .onFailure { err ->
                                        feedback = (err.message ?: "Error") to true
                                    }
                                savingBank = false
                            }
                        },
                        modifier = Modifier.weight(1f)
                    ) {
                        Text(tr(lang, "Simpan", "Save"))
                    }
                    OutlinedButton(onClick = { editingBank = false }, modifier = Modifier.weight(1f)) {
                        Text(tr(lang, "Batal", "Cancel"))
                    }
                }
            } else {
                ProfileRow(tr(lang, "Bank", "Bank"), profile?.bank_name)
                ProfileRow("SWIFT", profile?.bank_swift_code)
                ProfileRow(tr(lang, "Cabang", "Branch"), profile?.bank_branch_name)
                ProfileRow(tr(lang, "No. Rekening", "Account Number"), profile?.bank_account_number)
                ProfileRow(tr(lang, "Atas Nama", "Account Holder"), profile?.bank_account_holder)
            }
        }

        // BPJS
        if (!profile?.bpjs_kesehatan_number.isNullOrBlank() || (!profile?.bpjs_tk_number.isNullOrBlank() && profile?.has_bpjs_tk == true)) {
            ProfileSectionCard(title = "BPJS", icon = Icons.Default.Favorite, iconTint = Emerald600) {
                if (!profile?.bpjs_kesehatan_number.isNullOrBlank()) {
                    ProfileRow(tr(lang, "BPJS Kesehatan", "BPJS Health"), profile?.bpjs_kesehatan_number)
                }
                if (!profile?.bpjs_tk_number.isNullOrBlank() && profile?.has_bpjs_tk == true) {
                    ProfileRow("BPJS Ketenagakerjaan", profile?.bpjs_tk_number)
                }
            }
        }

        // Contact
        ProfileSectionCard(
            title = tr(lang, "Kontak & Alamat", "Contact & Address"),
            icon = Icons.Default.Phone,
            iconTint = Color(0xFF9333EA),
            actionLabel = if (!editingContact) tr(lang, "Ubah", "Edit") else null,
            onAction = {
                phone = profile?.phone ?: ""
                address = profile?.address ?: ""
                editingContact = true
            }
        ) {
            if (editingContact) {
                OutlinedTextField(value = phone, onValueChange = { phone = it }, label = { Text(tr(lang, "Telepon", "Phone")) }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(value = address, onValueChange = { address = it }, label = { Text(tr(lang, "Alamat", "Address")) }, minLines = 2, modifier = Modifier.fillMaxWidth())
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(
                        enabled = !savingContact,
                        onClick = {
                            val empId = profile?.id ?: return@Button
                            scope.launch {
                                savingContact = true
                                repository.updateContact(empId, phone, address)
                                    .onSuccess { msg ->
                                        profile = profile?.copy(phone = phone, address = address)
                                        editingContact = false
                                        feedback = msg to false
                                    }
                                    .onFailure { err -> feedback = (err.message ?: "Error") to true }
                                savingContact = false
                            }
                        },
                        modifier = Modifier.weight(1f)
                    ) {
                        Text(tr(lang, "Simpan", "Save"))
                    }
                    OutlinedButton(onClick = { editingContact = false }, modifier = Modifier.weight(1f)) {
                        Text(tr(lang, "Batal", "Cancel"))
                    }
                }
            } else {
                ProfileRow("Email", profile?.company_email ?: profile?.personal_email)
                ProfileRow(tr(lang, "Telepon", "Phone"), profile?.phone)
                ProfileRow(tr(lang, "Alamat", "Address"), profile?.address)
            }
        }

        // Language Preference
        ProfileSectionCard(
            title = tr(lang, "Bahasa", "Language"),
            icon = Icons.Default.Language,
            iconTint = Slate600
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(tr(lang, "Bahasa Tampilan", "Display Language"), fontSize = 12.sp, color = Slate600)
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    FilterChip(selected = lang == "id", onClick = { sessionStore.setLanguage("id") }, label = { Text("ID") })
                    FilterChip(selected = lang == "en", onClick = { sessionStore.setLanguage("en") }, label = { Text("EN") })
                }
            }
        }

        // Logout
        Button(
            onClick = { sessionStore.clearSession() },
            colors = ButtonDefaults.buttonColors(containerColor = Rose50, contentColor = Rose600),
            shape = RoundedCornerShape(14.dp),
            modifier = Modifier
                .fillMaxWidth()
                .height(48.dp)
        ) {
            Icon(Icons.AutoMirrored.Filled.Logout, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(modifier = Modifier.width(8.dp))
            Text(tr(lang, "Keluar dari Akun", "Log Out"), fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun ProfileSectionCard(
    title: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    iconTint: Color,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        color = Color.White,
        shadowElevation = 1.dp
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(icon, contentDescription = null, tint = iconTint, modifier = Modifier.size(16.dp))
                    Text(title, fontWeight = FontWeight.Bold, fontSize = 12.sp, color = Slate900)
                }
                if (actionLabel != null && onAction != null) {
                    TextButton(onClick = onAction, contentPadding = PaddingValues(0.dp)) {
                        Text(actionLabel, fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Blue600)
                    }
                }
            }
            HorizontalDivider(color = Slate100)
            content()
        }
    }
}

@Composable
private fun ProfileRow(label: String, value: String?) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.Top
    ) {
        Text(label, fontSize = 11.sp, color = Slate500, modifier = Modifier.weight(0.42f))
        Text(
            value?.ifBlank { "-" } ?: "-",
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            color = Slate900,
            modifier = Modifier.weight(0.58f)
        )
    }
}
