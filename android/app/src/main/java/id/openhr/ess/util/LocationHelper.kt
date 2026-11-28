package id.openhr.ess.util

import android.annotation.SuppressLint
import android.content.Context
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import android.os.Looper
import androidx.core.location.LocationManagerCompat
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.coroutines.resume

data class GpsReading(
    val latitude: Double,
    val longitude: Double,
    val accuracyMeters: Float,
    val isMock: Boolean = false
)

object LocationHelper {
    private const val FUSED_TIMEOUT_MS = 4500L
    private const val HARDWARE_GPS_TIMEOUT_MS = 6000L
    private const val MAX_LAST_KNOWN_AGE_MS = 5 * 60 * 1000L

    fun isLocationEnabled(context: Context): Boolean {
        val lm = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return false
        return LocationManagerCompat.isLocationEnabled(lm)
    }

    @SuppressLint("MissingPermission")
    suspend fun getCurrentGps(context: Context): GpsReading? {
        if (!isLocationEnabled(context)) return null

        val client = LocationServices.getFusedLocationProviderClient(context)
        val cts = CancellationTokenSource()
        val fusedCurrent: Location? = try {
            withTimeoutOrNull(FUSED_TIMEOUT_MS) {
                runCatching {
                    client.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, cts.token).await()
                }.getOrNull()
            }
        } finally {
            cts.cancel()
        }
        fusedCurrent?.toValidReading()?.let { return it }

        // Offline fallback: direct hardware GNSS fix without needing network/Play Services assistance
        val lm = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
        if (lm != null && lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
            requestSingleHardwareFix(lm)?.toValidReading()?.let { return it }
        }

        // Last resort: fresh last known fix only (must not be older than 5 minutes so turned-off GPS isn't spoofed)
        val now = System.currentTimeMillis()
        val lastFused = runCatching { client.lastLocation.await() }.getOrNull()
        if (lastFused != null && (now - lastFused.time) <= MAX_LAST_KNOWN_AGE_MS) {
            lastFused.toValidReading()?.let { return it }
        }
        if (lm != null) {
            val lastGps = runCatching { lm.getLastKnownLocation(LocationManager.GPS_PROVIDER) }.getOrNull()
            if (lastGps != null && (now - lastGps.time) <= MAX_LAST_KNOWN_AGE_MS) {
                lastGps.toValidReading()?.let { return it }
            }
        }
        return null
    }

    @SuppressLint("MissingPermission")
    private suspend fun requestSingleHardwareFix(lm: LocationManager): Location? {
        return withTimeoutOrNull(HARDWARE_GPS_TIMEOUT_MS) {
            suspendCancellableCoroutine { cont ->
                val listener = object : LocationListener {
                    override fun onLocationChanged(location: Location) {
                        lm.removeUpdates(this)
                        if (cont.isActive) cont.resume(location)
                    }

                    @Deprecated("Deprecated in Java")
                    override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
                    override fun onProviderEnabled(provider: String) {}
                    override fun onProviderDisabled(provider: String) {
                        lm.removeUpdates(this)
                        if (cont.isActive) cont.resume(null)
                    }
                }
                cont.invokeOnCancellation { runCatching { lm.removeUpdates(listener) } }
                runCatching {
                    lm.requestLocationUpdates(
                        LocationManager.GPS_PROVIDER,
                        0L,
                        0f,
                        listener,
                        Looper.getMainLooper()
                    )
                }.onFailure {
                    if (cont.isActive) cont.resume(null)
                }
            }
        }
    }

    private fun Location.toValidReading(): GpsReading? {
        if (latitude == 0.0 && longitude == 0.0) return null
        return GpsReading(
            latitude = latitude,
            longitude = longitude,
            accuracyMeters = accuracy,
            isMock = SecurityGuard.isLocationMocked(this)
        )
    }
}
