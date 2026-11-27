package id.openhr.ess.data.local

import android.content.Context
import android.os.Build
import id.openhr.ess.BuildConfig
import id.openhr.ess.data.model.ModulesConfig
import id.openhr.ess.data.model.OfflineClockRecord
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

    private fun loadModules(): ModulesConfig {
        val raw = prefs.getString(KEY_MODULES, null) ?: return ModulesConfig()
        return runCatching { json.decodeFromString<ModulesConfig>(raw) }.getOrDefault(ModulesConfig())
    }

    fun saveModules(modules: ModulesConfig) {
        prefs.edit().putString(KEY_MODULES, json.encodeToString(modules)).apply()
        _modulesFlow.value = modules
    }

    private fun loadUser(): UserSession? {
        val raw = prefs.getString(KEY_USER, null) ?: return null
        return runCatching { json.decodeFromString<UserSession>(raw) }.getOrNull()
    }

    private fun loadBaseUrl(): String {
        val saved = prefs.getString(KEY_BASE_URL, null)
        val defaultUrl = if (isEmulator()) BuildConfig.DEFAULT_BASE_URL else "http://127.0.0.1:8787"
        return normalizeBaseUrl(saved ?: defaultUrl)
    }

    private fun isEmulator(): Boolean {
        return (Build.BRAND.startsWith("generic") && Build.DEVICE.startsWith("generic")) ||
            Build.FINGERPRINT.startsWith("generic") ||
            Build.FINGERPRINT.startsWith("unknown") ||
            Build.HARDWARE.contains("goldfish") ||
            Build.HARDWARE.contains("ranchu") ||
            Build.MODEL.contains("google_sdk") ||
            Build.MODEL.contains("Emulator") ||
            Build.MODEL.contains("Android SDK built for x86") ||
            Build.MANUFACTURER.contains("Genymotion") ||
            Build.PRODUCT.contains("sdk_gphone") ||
            Build.PRODUCT.contains("emulator")
    }

    private fun loadOfflineQueue(): List<OfflineClockRecord> {
        val raw = prefs.getString(KEY_OFFLINE_QUEUE, null) ?: return emptyList()
        return runCatching { json.decodeFromString<List<OfflineClockRecord>>(raw) }.getOrDefault(emptyList())
    }

    fun getToken(): String? = _tokenFlow.value

    fun getBaseUrl(): String = _baseUrlFlow.value

    fun saveSession(token: String, user: UserSession) {
        prefs.edit()
            .putString(KEY_TOKEN, token)
            .putString(KEY_USER, json.encodeToString(user))
            .apply()
        _tokenFlow.value = token
        _userFlow.value = user
    }

    fun clearSession() {
        prefs.edit()
            .remove(KEY_TOKEN)
            .remove(KEY_USER)
            .apply()
        _tokenFlow.value = null
        _userFlow.value = null
    }

    fun setBaseUrl(rawUrl: String) {
        val normalized = normalizeBaseUrl(rawUrl)
        prefs.edit().putString(KEY_BASE_URL, normalized).apply()
        _baseUrlFlow.value = normalized
    }

    fun setLanguage(lang: String) {
        val valid = if (lang == "en") "en" else "id"
        prefs.edit().putString(KEY_LANG, valid).apply()
        _langFlow.value = valid
    }

    fun enqueueOfflineClock(record: OfflineClockRecord) {
        val updated = _offlineQueueFlow.value + record
        saveOfflineQueue(updated)
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
        private const val KEY_USER = "user"
        private const val KEY_BASE_URL = "base_url"
        private const val KEY_LANG = "lang"
        private const val KEY_OFFLINE_QUEUE = "offline_queue"
        private const val KEY_MODULES = "modules"

        fun normalizeBaseUrl(url: String): String {
            var trimmed = url.trim().removeSuffix("/")
            if (trimmed.isEmpty()) trimmed = BuildConfig.DEFAULT_BASE_URL
            if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
                trimmed = "http://$trimmed"
            }
            return trimmed
        }
    }
}
