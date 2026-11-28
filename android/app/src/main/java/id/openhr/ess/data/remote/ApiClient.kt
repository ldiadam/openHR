package id.openhr.ess.data.remote

import android.os.Build
import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import id.openhr.ess.data.local.SessionStore
import id.openhr.ess.data.model.ApiErrorBody
import id.openhr.ess.data.model.LoginResponse
import id.openhr.ess.data.model.RefreshRequest
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.Authenticator
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.HttpException
import retrofit2.Retrofit
import java.io.IOException
import java.util.concurrent.TimeUnit

class ApiException(
    message: String,
    val statusCode: Int = 0,
    val errorCode: String? = null,
    val distanceMeters: Double? = null
) : IOException(message)

class ApiClient(private val sessionStore: SessionStore) {
    val json = Json {
        ignoreUnknownKeys = true
        coerceInputValues = true
        encodeDefaults = true
        explicitNulls = false
    }

    private val refreshLock = Any()

    private val dynamicHostInterceptor = Interceptor { chain ->
        val original = chain.request()
        val baseUrl = sessionStore.getBaseUrl().toHttpUrlOrNull()
            ?: throw IOException("Server not configured. Please scan the company QR code first.")
        val newUrl = original.url.newBuilder()
            .scheme(baseUrl.scheme)
            .host(baseUrl.host)
            .port(baseUrl.port)
            .build()

        val builder = original.newBuilder().url(newUrl)
        val path = original.url.encodedPath
        val skipAuth = path.contains("/api/auth/login") ||
            path.contains("/api/auth/refresh") ||
            path.contains("/api/auth/logout")

        val token = sessionStore.getToken()
        if (!token.isNullOrBlank() && !skipAuth) {
            builder.header("Authorization", "Bearer $token")
        }

        chain.proceed(builder.build())
    }

    // Separate bare client without Authenticator so refresh calls never recurse infinitely.
    private val refreshHttpClient: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .writeTimeout(20, TimeUnit.SECONDS)
        .build()

    private val tokenAuthenticator = Authenticator { _, response ->
        val path = response.request.url.encodedPath
        if (path.contains("/api/auth/login") ||
            path.contains("/api/auth/refresh") ||
            path.contains("/api/auth/logout")
        ) {
            return@Authenticator null
        }

        if (responseCount(response) >= 2) {
            return@Authenticator null
        }

        synchronized(refreshLock) {
            val refreshToken = sessionStore.getRefreshToken()
            if (refreshToken.isNullOrBlank()) {
                sessionStore.clearSession()
                return@Authenticator null
            }

            // If another concurrent request already rotated the access token, just retry with the fresh one.
            val currentAccessToken = sessionStore.getToken()
            val failedHeader = response.request.header("Authorization")
            if (!currentAccessToken.isNullOrBlank() && failedHeader != "Bearer $currentAccessToken") {
                return@Authenticator response.request.newBuilder()
                    .header("Authorization", "Bearer $currentAccessToken")
                    .build()
            }

            val base = sessionStore.getBaseUrl().toHttpUrlOrNull() ?: return@Authenticator null
            val refreshUrl = base.newBuilder()
                .encodedPath("/api/auth/refresh")
                .build()

            val payload = json.encodeToString(
                RefreshRequest(
                    refreshToken = refreshToken,
                    deviceLabel = "${Build.MANUFACTURER} ${Build.MODEL}"
                )
            )
            val refreshReq = Request.Builder()
                .url(refreshUrl)
                .post(payload.toRequestBody("application/json; charset=utf-8".toMediaType()))
                .build()

            try {
                refreshHttpClient.newCall(refreshReq).execute().use { refreshResp ->
                    if (refreshResp.isSuccessful) {
                        val bodyStr = refreshResp.body?.string() ?: return@Authenticator null
                        val parsed = runCatching { json.decodeFromString<LoginResponse>(bodyStr) }.getOrNull()
                            ?: return@Authenticator null
                        sessionStore.saveSession(
                            token = parsed.token,
                            user = parsed.user,
                            refreshToken = parsed.refreshToken ?: refreshToken
                        )
                        return@Authenticator response.request.newBuilder()
                            .header("Authorization", "Bearer ${parsed.token}")
                            .build()
                    } else if (refreshResp.code == 401 || refreshResp.code == 403) {
                        sessionStore.clearSession()
                        return@Authenticator null
                    } else {
                        return@Authenticator null
                    }
                }
            } catch (_: IOException) {
                // Keep session intact if offline or network drops mid-refresh
                return@Authenticator null
            }
        }
    }

    private fun responseCount(response: Response): Int {
        var result = 1
        var prior = response.priorResponse
        while (prior != null) {
            result++
            prior = prior.priorResponse
        }
        return result
    }

    val okHttpClient: OkHttpClient = OkHttpClient.Builder()
        .addInterceptor(dynamicHostInterceptor)
        .authenticator(tokenAuthenticator)
        .addInterceptor(HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BASIC
        })
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    private val retrofit: Retrofit = Retrofit.Builder()
        .baseUrl("https://placeholder.invalid/")
        .client(okHttpClient)
        .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
        .build()

    val api: OpenHrApi = retrofit.create(OpenHrApi::class.java)

    fun parseError(throwable: Throwable): ApiException {
        if (throwable is ApiException) return throwable
        if (throwable is HttpException) {
            val raw = runCatching { throwable.response()?.errorBody()?.string() }.getOrNull()
            val parsed = raw?.let { runCatching { json.decodeFromString<ApiErrorBody>(it) }.getOrNull() }
            val msg = parsed?.error ?: parsed?.message ?: "HTTP ${throwable.code()}"
            return ApiException(
                message = msg,
                statusCode = throwable.code(),
                errorCode = parsed?.code,
                distanceMeters = parsed?.distanceMeters
            )
        }
        return ApiException(throwable.message ?: "Network error")
    }
}
