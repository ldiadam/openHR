package id.openhr.ess.util

import android.annotation.SuppressLint
import android.content.Context
import android.location.Location
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import kotlinx.coroutines.tasks.await

data class GpsReading(
    val latitude: Double,
    val longitude: Double,
    val accuracyMeters: Float
)

object LocationHelper {
    @SuppressLint("MissingPermission")
    suspend fun getCurrentGps(context: Context): GpsReading? {
        val client = LocationServices.getFusedLocationProviderClient(context)
        val cts = CancellationTokenSource()
        val current: Location? = runCatching {
            client.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, cts.token).await()
        }.getOrNull()

        val loc = current ?: runCatching { client.lastLocation.await() }.getOrNull() ?: return null
        if (loc.latitude == 0.0 && loc.longitude == 0.0) return null
        return GpsReading(
            latitude = loc.latitude,
            longitude = loc.longitude,
            accuracyMeters = loc.accuracy
        )
    }
}
