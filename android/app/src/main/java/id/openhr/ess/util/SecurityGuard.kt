package id.openhr.ess.util

import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.os.Build
import java.io.File

data class ClientSecurityReport(
    val isMockLocation: Boolean,
    val spoofApps: List<String>,
    val isRooted: Boolean,
    val deviceId: String,
    val deviceLabel: String
) {
    val hasMockThreat: Boolean get() = isMockLocation || spoofApps.isNotEmpty()
}

object SecurityGuard {
    val KNOWN_SPOOF_PACKAGES = listOf(
        "com.lexa.fakegps",
        "com.incorporateapps.fakegps.fre",
        "com.incorporateapps.fakegps_route",
        "com.blogspot.newapphorizons.fakegps",
        "fr.dvilleneuve.lockito",
        "com.gsmartstudio.fakegps",
        "com.theappninjas.fakegpsjoystick",
        "com.fakegps.mock",
        "com.lkr.fakelocation",
        "io.github.qauxv"
    )

    private val ROOT_BINARY_PATHS = listOf(
        "/system/bin/su",
        "/system/xbin/su",
        "/sbin/su",
        "/data/local/xbin/su",
        "/data/local/bin/su",
        "/system/app/Superuser.apk"
    )

    @Suppress("DEPRECATION")
    fun isLocationMocked(location: Location): Boolean {
        val osFlag = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            location.isMock
        } else {
            location.isFromMockProvider
        }
        val extraMock = location.extras?.getBoolean("mockLocation", false) == true
        return osFlag || extraMock
    }

    fun findInstalledSpoofApps(context: Context): List<String> {
        val pm = context.packageManager
        return KNOWN_SPOOF_PACKAGES.filter { pkg ->
            runCatching {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    pm.getPackageInfo(pkg, PackageManager.PackageInfoFlags.of(0))
                } else {
                    @Suppress("DEPRECATION")
                    pm.getPackageInfo(pkg, 0)
                }
                true
            }.getOrDefault(false)
        }
    }

    fun isDeviceRooted(): Boolean {
        if (Build.TAGS?.contains("test-keys") == true) return true
        return ROOT_BINARY_PATHS.any { runCatching { File(it).exists() }.getOrDefault(false) }
    }

    fun evaluate(
        context: Context,
        deviceId: String,
        gps: GpsReading?
    ): ClientSecurityReport {
        val spoofApps = findInstalledSpoofApps(context)
        val rooted = isDeviceRooted()
        val label = "${Build.MANUFACTURER} ${Build.MODEL}".trim()
        return ClientSecurityReport(
            isMockLocation = gps?.isMock == true,
            spoofApps = spoofApps,
            isRooted = rooted,
            deviceId = deviceId,
            deviceLabel = label
        )
    }
}
