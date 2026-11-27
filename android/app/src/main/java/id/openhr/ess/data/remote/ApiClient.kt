package id.openhr.ess.data.remote

import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import id.openhr.ess.data.local.SessionStore
import id.openhr.ess.data.model.ApiErrorBody
import kotlinx.serialization.json.Json
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
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
        encodeDefaults = true
        explicitNulls = false
    }

    private val dynamicHostInterceptor = Interceptor { chain ->
        val original = chain.request()
        val baseUrl = sessionStore.getBaseUrl().toHttpUrlOrNull()
        val newUrl = if (baseUrl != null) {
            original.url.newBuilder()
                .scheme(baseUrl.scheme)
                .host(baseUrl.host)
                .port(baseUrl.port)
                .build()
        } else {
            original.url
        }

        val builder = original.newBuilder().url(newUrl)
        val token = sessionStore.getToken()
        if (!token.isNullOrBlank() && !original.url.encodedPath.contains("/api/auth/login")) {
            builder.header("Authorization", "Bearer $token")
        }

        val response = chain.proceed(builder.build())
        if (response.code == 401 && !original.url.encodedPath.contains("/api/auth/login")) {
            sessionStore.clearSession()
        }
        response
    }

    val okHttpClient: OkHttpClient = OkHttpClient.Builder()
        .addInterceptor(dynamicHostInterceptor)
        .addInterceptor(HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BASIC
        })
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    private val retrofit: Retrofit = Retrofit.Builder()
        .baseUrl("http://10.0.2.2:8787/")
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
