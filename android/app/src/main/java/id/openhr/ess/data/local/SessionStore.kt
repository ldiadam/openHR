package id.openhr.ess.data.local

import android.content.Context
import android.os.Build
import id.openhr.ess.BuildConfig
import id.openhr.ess.data.model.AttendanceSettingsResponse
import id.openhr.ess.data.model.BranchInfo
import id.openhr.ess.data.model.ModulesConfig
import id.openhr.ess.data.model.OfflineClockRecord
import id.openhr.ess.data.model.TodayAttendanceRecord
import id.openhr.ess.data.model.UserSession
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

class SessionStore(context: Context) {
    private val prefs = context.getSharedPreferences("openhr_ess_prefs", Context.MODE_PRIVATE)
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    private val _tokenFlow = MutableStateFlow(prefs.getString(KEY_TOKEN, null))
    val tokenFlow: StateFlow<String?> = _tokenFlow.asStateFlow()

    private val _userFlow = MutableStateFlow(loadUser())
    val userFlow: StateFlow<UserSession?> = _userFlow.asStateFlow()

    private val _baseUrlFlow = MutableStateFlow(loadBaseUrl())
    val baseUrlFlow: StateFlow<String> = _baseUrlFlow.asStateFlow()

    private val _langFlow = MutableStateFlow(prefs.getString(KEY_LANG, "id") ?: "id")
    val langFlow: StateFlow<String> = _langFlow.asStateFlow()

    private val _offlineQueueFlow = MutableStateFlow(loadOfflineQueue())
    val offlineQueueFlow: StateFlow<List<OfflineClockRecord>> = _offlineQueueFlow.asStateFlow()

    private val _modulesFlow = MutableStateFlow(loadModules())
    val modulesFlow: StateFlow<ModulesConfig> = _modulesFlow.asStateFlow()

    private val _themeModeFlow = MutableStateFlow(prefs.getString(KEY_THEME_MODE, "system") ?: "system")
    val themeModeFlow: StateFlow<String> = _themeModeFlow.asStateFlow()

    private val _biometricEnabledFlow = MutableStateFlow(prefs.getBoolean(KEY_BIOMETRIC, false))
    val biometricEnabledFlow: StateFlow<Boolean> = _biometricEnabledFlow.asStateFlow()

    private val _hideSalaryFlow = MutableStateFlow(prefs.getBoolean(KEY_HIDE_SALARY, false))
    val hideSalaryFlow: StateFlow<Boolean> = _hideSalaryFlow.asStateFlow()

    private val _companyLogoUrlFlow = MutableStateFlow(prefs.getString(KEY_LOGO_URL, null))
    val companyLogoUrlFlow: StateFlow<String?> = _companyLogoUrlFlow.asStateFlow()

    private val _companyNameFlow = MutableStateFlow(prefs.getString(KEY_COMPANY_NAME, "openHR") ?: "openHR")
    val companyNameFlow: StateFlow<String> = _companyNameFlow.asStateFlow()

    private val _primaryColorFlow = MutableStateFlow(prefs.getString(KEY_PRIMARY_COLOR, "#E12D53") ?: "#E12D53")
    val primaryColorFlow: StateFlow<String> = _primaryColorFlow.asStateFlow()

    private val _cachedBranchFlow = MutableStateFlow(loadCachedBranch())
    val cachedBranchFlow: StateFlow<BranchInfo?> = _cachedBranchFlow.asStateFlow()

    private val _cachedSettingsFlow = MutableStateFlow(loadCachedSettings())
    val cachedSettingsFlow: StateFlow<AttendanceSettingsResponse> = _cachedSettingsFlow.asStateFlow()

    private val _shiftReminderEnabledFlow = MutableStateFlow(prefs.getBoolean(KEY_SHIFT_REMINDER, false))
    val shiftReminderEnabledFlow: StateFlow<Boolean> = _shiftReminderEnabledFlow.asStateFlow()

    private val _faceEnrolledVersionFlow = MutableStateFlow(0)
    val faceEnrolledVersionFlow: StateFlow<Int> = _faceEnrolledVersionFlow.asStateFlow()

    fun getFaceEmbedding(employeeId: String?): FloatArray? {
        if (employeeId.isNullOrBlank()) return null
        val raw = prefs.getString("${KEY_FACE_EMBEDDING_PREFIX}$employeeId", null) ?: return null
        return runCatching { json.decodeFromString<List<Float>>(raw).toFloatArray() }
            .getOrNull()
            ?.takeIf { it.isNotEmpty() }
    }

    fun saveFaceEmbedding(employeeId: String?, embedding: FloatArray) {
        if (employeeId.isNullOrBlank()) return
        prefs.edit()
            .putString("${KEY_FACE_EMBEDDING_PREFIX}$employeeId", json.encodeToString(embedding.toList()))
            .apply()
        _faceEnrolledVersionFlow.value += 1
    }

    fun clearFaceEmbedding(employeeId: String?) {
        if (employeeId.isNullOrBlank()) return
        prefs.edit().remove("${KEY_FACE_EMBEDDING_PREFIX}$employeeId").apply()
        _faceEnrolledVersionFlow.value += 1
    }

    fun setShiftReminderEnabled(enabled: Boolean) {
        prefs.edit().putBoolean(KEY_SHIFT_REMINDER, enabled).apply()
        _shiftReminderEnabledFlow.value = enabled
    }

    private fun loadCachedBranch(): BranchInfo? {
        val raw = prefs.getString(KEY_CACHED_BRANCH, null) ?: return null
        return runCatching { json.decodeFromString<BranchInfo>(raw) }.getOrNull()
    }

    fun saveCachedBranch(branch: BranchInfo?) {
        if (branch == null) return
        prefs.edit().putString(KEY_CACHED_BRANCH, json.encodeToString(branch)).apply()
        _cachedBranchFlow.value = branch
    }

    private fun loadCachedSettings(): AttendanceSettingsResponse {
        val raw = prefs.getString(KEY_CACHED_SETTINGS, null) ?: return AttendanceSettingsResponse()
        return runCatching { json.decodeFromString<AttendanceSettingsResponse>(raw) }
            .getOrDefault(AttendanceSettingsResponse())
    }

    fun saveCachedSettings(settings: AttendanceSettingsResponse) {
        prefs.edit().putString(KEY_CACHED_SETTINGS, json.encodeToString(settings)).apply()
        _cachedSettingsFlow.value = settings
    }

    fun getCachedTodayRecord(todayDate: String): TodayAttendanceRecord? {
        val savedDate = prefs.getString(KEY_CACHED_TODAY_DATE, null)
        if (savedDate != todayDate) return null
        val raw = prefs.getString(KEY_CACHED_TODAY_RECORD, null) ?: return null
        return runCatching { json.decodeFromString<TodayAttendanceRecord>(raw) }.getOrNull()
    }

    fun saveCachedTodayRecord(todayDate: String, record: TodayAttendanceRecord?) {
        if (record == null) return
        prefs.edit()
            .putString(KEY_CACHED_TODAY_DATE, todayDate)
            .putString(KEY_CACHED_TODAY_RECORD, json.encodeToString(record))
            .apply()
    }

    private fun loadModules(): ModulesConfig {
        val raw = prefs.getString(KEY_MODULES, null) ?: return ModulesConfig()
        return runCatching { json.decodeFromString<ModulesConfig>(raw) }.getOrDefault(ModulesConfig())
    }

    fun saveModules(modules: ModulesConfig) {
        if (_modulesFlow.value == modules) return
        prefs.edit().putString(KEY_MODULES, json.encodeToString(modules)).apply()
        _modulesFlow.value = modules
    }

    fun saveCompanyBranding(name: String?, logoUrl: String?, primaryColor: String? = null) {
        val cleanName = name?.trim()?.takeIf { it.isNotEmpty() } ?: "openHR"
        val cleanLogo = logoUrl?.trim()?.takeIf { it.isNotEmpty() }
        val cleanColor = primaryColor?.trim()?.takeIf {
            Regex("^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$").matches(it)
        }?.uppercase() ?: "#E12D53"
        if (_companyNameFlow.value == cleanName &&
            _companyLogoUrlFlow.value == cleanLogo &&
            _primaryColorFlow.value == cleanColor
        ) return
        prefs.edit()
            .putString(KEY_COMPANY_NAME, cleanName)
            .putString(KEY_LOGO_URL, cleanLogo)
            .putString(KEY_PRIMARY_COLOR, cleanColor)
            .apply()
        _companyNameFlow.value = cleanName
        _companyLogoUrlFlow.value = cleanLogo
        _primaryColorFlow.value = cleanColor
    }

    fun setThemeMode(mode: String) {
        val valid = when (mode) {
            "light", "dark" -> mode
            else -> "system"
        }
        prefs.edit().putString(KEY_THEME_MODE, valid).apply()
        _themeModeFlow.value = valid
    }

    fun setBiometricEnabled(enabled: Boolean) {
        prefs.edit().putBoolean(KEY_BIOMETRIC, enabled).apply()
        _biometricEnabledFlow.value = enabled
    }

    fun setHideSalary(hidden: Boolean) {
        prefs.edit().putBoolean(KEY_HIDE_SALARY, hidden).apply()
        _hideSalaryFlow.value = hidden
    }

    private fun loadUser(): UserSession? {
        val raw = prefs.getString(KEY_USER, null) ?: return null
        return runCatching { json.decodeFromString<UserSession>(raw) }.getOrNull()
    }

    private fun loadBaseUrl(): String {
        val saved = prefs.getString(KEY_BASE_URL, null) ?: return ""
        return normalizeBaseUrl(saved)
    }

    fun isServerConfigured(): Boolean = _baseUrlFlow.value.isNotBlank()

    private fun loadOfflineQueue(): List<OfflineClockRecord> {
        val raw = prefs.getString(KEY_OFFLINE_QUEUE, null) ?: return emptyList()
        return runCatching { json.decodeFromString<List<OfflineClockRecord>>(raw) }.getOrDefault(emptyList())
    }

    fun getToken(): String? = _tokenFlow.value
    fun getRefreshToken(): String? = prefs.getString(KEY_REFRESH_TOKEN, null)

    fun getBaseUrl(): String = _baseUrlFlow.value

    fun getOrCreateDeviceId(): String {
        val existing = prefs.getString(KEY_DEVICE_ID, null)
        if (!existing.isNullOrBlank()) return existing
        val created = "dev-${java.util.UUID.randomUUID()}"
        prefs.edit().putString(KEY_DEVICE_ID, created).apply()
        return created
    }

    fun saveSession(token: String, user: UserSession, refreshToken: String? = getRefreshToken()) {
        val editor = prefs.edit()
            .putString(KEY_TOKEN, token)
            .putString(KEY_USER, json.encodeToString(user))
        if (!refreshToken.isNullOrBlank()) {
            editor.putString(KEY_REFRESH_TOKEN, refreshToken)
        } else {
            editor.remove(KEY_REFRESH_TOKEN)
        }
        editor.apply()
        _tokenFlow.value = token
        _userFlow.value = user
    }

    fun clearSession() {
        prefs.edit()
            .remove(KEY_TOKEN)
            .remove(KEY_REFRESH_TOKEN)
            .remove(KEY_USER)
            .remove(KEY_CACHED_TODAY_DATE)
            .remove(KEY_CACHED_TODAY_RECORD)
            .apply()
        _tokenFlow.value = null
        _userFlow.value = null
    }

    fun setBaseUrl(rawUrl: String) {
        val normalized = normalizeBaseUrl(rawUrl)
        if (normalized.isEmpty()) {
            prefs.edit().remove(KEY_BASE_URL).apply()
        } else {
            prefs.edit().putString(KEY_BASE_URL, normalized).apply()
        }
        _baseUrlFlow.value = normalized
    }

    fun setLanguage(lang: String) {
        val valid = if (lang == "en") "en" else "id"
        prefs.edit().putString(KEY_LANG, valid).apply()
        _langFlow.value = valid
    }

    fun enqueueOfflineClock(record: OfflineClockRecord) {
        val deduped = _offlineQueueFlow.value.filterNot {
            it.local_date == record.local_date && it.type == record.type
        }
        saveOfflineQueue(deduped + record)
    }

    fun replaceOfflineQueue(records: List<OfflineClockRecord>) {
        saveOfflineQueue(records)
    }

    private fun saveOfflineQueue(records: List<OfflineClockRecord>) {
        prefs.edit().putString(KEY_OFFLINE_QUEUE, json.encodeToString(records)).apply()
        _offlineQueueFlow.value = records
    }

    companion object {
        private const val KEY_TOKEN = "token"
        private const val KEY_REFRESH_TOKEN = "refresh_token"
        private const val KEY_USER = "user"
        private const val KEY_BASE_URL = "base_url"
        private const val KEY_DEVICE_ID = "device_id"
        private const val KEY_LANG = "lang"
        private const val KEY_OFFLINE_QUEUE = "offline_queue"
        private const val KEY_MODULES = "modules"
        private const val KEY_THEME_MODE = "theme_mode"
        private const val KEY_BIOMETRIC = "biometric_enabled"
        private const val KEY_HIDE_SALARY = "hide_salary"
        private const val KEY_LOGO_URL = "company_logo_url"
        private const val KEY_COMPANY_NAME = "company_name"
        private const val KEY_PRIMARY_COLOR = "company_primary_color"
        private const val KEY_CACHED_BRANCH = "cached_branch"
        private const val KEY_CACHED_SETTINGS = "cached_attendance_settings"
        private const val KEY_CACHED_TODAY_DATE = "cached_today_date"
        private const val KEY_CACHED_TODAY_RECORD = "cached_today_record"
        private const val KEY_SHIFT_REMINDER = "shift_reminder_enabled"
        private const val KEY_FACE_EMBEDDING_PREFIX = "face_embedding_"

        fun normalizeBaseUrl(url: String): String {
            var trimmed = url.trim().removeSuffix("/")
            if (trimmed.isEmpty()) return ""
            if (!trimmed.startsWith("http://", ignoreCase = true) &&
                !trimmed.startsWith("https://", ignoreCase = true)
            ) {
                val isLocal = trimmed.startsWith("localhost", ignoreCase = true) ||
                    trimmed.startsWith("127.") ||
                    trimmed.startsWith("10.") ||
                    trimmed.startsWith("192.168.")
                trimmed = if (isLocal) "http://$trimmed" else "https://$trimmed"
            }
            return trimmed
        }
    }
}
