package id.openhr.ess.util

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.util.Base64
import java.io.ByteArrayOutputStream
import java.text.NumberFormat
import java.time.LocalDate
import java.time.LocalTime
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.*

data class BankDirectoryEntry(
    val name: String,
    val swift: String,
    val branchAddress: String,
    val branchName: String = "Head Office Jakarta",
    val branchCode: String = "XXX"
)

object BankDirectory {
    val entries = listOf(
        BankDirectoryEntry("BCA", "CENAIDJA", "Menara BCA, Jl. M.H. Thamrin No. 1, Jakarta 10310"),
        BankDirectoryEntry("Bank Mandiri", "BMRIIDJA", "Plaza Mandiri, Jl. Jend. Gatot Subroto Kav. 36-38, Jakarta 12190"),
        BankDirectoryEntry("BRI", "BRINIDJA", "Gedung BRI I, Jl. Jend. Sudirman Kav. 44-46, Jakarta 10210"),
        BankDirectoryEntry("BNI", "BNINIDJA", "Gedung BNI, Jl. Jend. Sudirman Kav. 1, Jakarta 10220"),
        BankDirectoryEntry("BSI (Bank Syariah Indonesia)", "BSMDIDJA", "Jl. M.H. Thamrin No. 5, Jakarta 10340"),
        BankDirectoryEntry("CIMB Niaga", "BNIAIDJA", "Menara Sentraya, Fl. 32, Jl. Iskandarsyah Raya No. 1A, Jakarta 12160"),
        BankDirectoryEntry("Permata Bank", "BBBAIDJA", "WTC II, Fl. 21, Jl. Jend. Sudirman No. 29-31, Jakarta 12920"),
        BankDirectoryEntry("Bank Danamon", "BDINIDJA", "Menara Bank Danamon, Jl. HR. Rasuna Said Blok C No. 10, Jakarta 12920"),
        BankDirectoryEntry("BTN", "BTANIDJA", "Menara BTN, Fl. 10, Jl. Gajah Mada No. 1, Jakarta 10130"),
        BankDirectoryEntry("Panin Bank", "PINBIDJA", "Panin Bank Centre, Jl. Jend. Sudirman No. 1, Jakarta 10270"),
        BankDirectoryEntry("OCBC NISP", "NISPIDJA", "OCBC NISP Tower, Jl. Prof. Dr. Satrio Kav. 25, Jakarta 12940"),
        BankDirectoryEntry("Bank Mega", "MEGAIDJA", "Menara Bank Mega, Jl. Kapten Tendean No. 12-14A, Jakarta 12790"),
        BankDirectoryEntry("BTPN / Jenius", "SUNIIDJA", "Menara BTPN, Jl. Dr. Ide Anak Agung Gde Agung Kav. 5.5-5.6, Jakarta 12950"),
        BankDirectoryEntry("Bank Jago", "JAGBIDJA", "Menara BTPN, Fl. 46, Jl. Dr. Ide Anak Agung Gde Agung Kav. 5.5-5.6, Jakarta 12950"),
        BankDirectoryEntry("Maybank Indonesia", "IBBKIDJA", "Sentral Senayan 3, Jl. Asia Afrika No. 8, Jakarta 10270"),
        BankDirectoryEntry("UOB Indonesia", "BBIJIDJA", "UOB Plaza, Jl. M.H. Thamrin No. 10, Jakarta 10230"),
        BankDirectoryEntry("DBS Indonesia", "DBSBIDJA", "DBS Bank Tower, Jl. Prof. Dr. Satrio Kav. 3-5, Jakarta 12940"),
        BankDirectoryEntry("Bank Sinarmas", "SBJKIDJA", "Sinarmas Land Plaza, Fl. 8, Jl. M.H. Thamrin No. 51, Jakarta 10350"),
        BankDirectoryEntry("Bank Muamalat", "MUABIDJA", "Muamalat Tower, Jl. Prof. Dr. Satrio No. 18, Jakarta 12940"),
        BankDirectoryEntry("SeaBank Indonesia", "SSPIIDJA", "Gama Tower, Fl. 35, Jl. H.R. Rasuna Said No. 2, Jakarta 12950"),
        BankDirectoryEntry("Allo Bank", "ALOBIDJA", "Menara Bank Mega, Fl. 5-6, Jl. Kapten Pierre Tendean No. 12-14A, Jakarta 12790"),
        BankDirectoryEntry("Bank DKI", "BDKIIDJA", "Jl. Ir. H. Juanda No. 34, Jakarta 10120")
    )

    fun find(name: String?): BankDirectoryEntry? {
        val target = name?.trim()?.lowercase() ?: return null
        return entries.firstOrNull { it.name.lowercase() == target }
    }
}

object Formatters {
    private val idLocale = Locale("id", "ID")
    private val rupiahFormat: NumberFormat = NumberFormat.getCurrencyInstance(idLocale).apply {
        maximumFractionDigits = 0
        minimumFractionDigits = 0
    }

    fun formatRupiah(amount: Double): String {
        return rupiahFormat.format(amount.roundToLong())
    }

    fun localDateString(date: LocalDate = LocalDate.now()): String =
        date.format(DateTimeFormatter.ISO_LOCAL_DATE)

    fun localMonthString(ym: YearMonth = YearMonth.now()): String =
        ym.format(DateTimeFormatter.ofPattern("yyyy-MM"))

    fun localTimeString(time: LocalTime = LocalTime.now()): String =
        time.format(DateTimeFormatter.ofPattern("HH:mm:ss"))

    fun formatDisplayDate(rawDate: String?, lang: String = "id"): String {
        if (rawDate.isNullOrBlank()) return "-"
        val datePart = rawDate.take(10)
        return runCatching {
            val d = LocalDate.parse(datePart)
            val locale = if (lang == "id") idLocale else Locale.US
            d.format(DateTimeFormatter.ofPattern("dd MMM yyyy", locale))
        }.getOrDefault(rawDate)
    }

    fun formatMonthLabel(monthStr: String, lang: String = "id"): String {
        return runCatching {
            val ym = YearMonth.parse(monthStr)
            val locale = if (lang == "id") idLocale else Locale.US
            ym.format(DateTimeFormatter.ofPattern("MMMM yyyy", locale))
        }.getOrDefault(monthStr)
    }

    fun haversineMeters(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
        val r = 6371000.0
        val dLat = Math.toRadians(lat2 - lat1)
        val dLon = Math.toRadians(lon2 - lon1)
        val a = sin(dLat / 2).pow(2.0) +
            cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) * sin(dLon / 2).pow(2.0)
        val c = 2 * atan2(sqrt(a), sqrt(1 - a))
        return r * c
    }

    fun isNetworkConnected(context: Context): Boolean {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            ?: return true
        val net = cm.activeNetwork ?: return false
        val caps = cm.getNetworkCapabilities(net) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    fun bitmapToBase64DataUrl(
        bitmap: Bitmap,
        maxDimension: Int = 1280,
        quality: Int = 82,
        rotationDegrees: Float = 0f
    ): String {
        val rotated = if (rotationDegrees != 0f) {
            val matrix = Matrix().apply { postRotate(rotationDegrees) }
            Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
        } else {
            bitmap
        }

        val scale = min(1f, maxDimension.toFloat() / max(rotated.width, rotated.height).toFloat())
        val scaled = if (scale < 1f) {
            Bitmap.createScaledBitmap(
                rotated,
                (rotated.width * scale).roundToInt().coerceAtLeast(1),
                (rotated.height * scale).roundToInt().coerceAtLeast(1),
                true
            )
        } else {
            rotated
        }

        val out = ByteArrayOutputStream()
        scaled.compress(Bitmap.CompressFormat.JPEG, quality, out)
        val b64 = Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
        return "data:image/jpeg;base64,$b64"
    }

    fun uriToBase64DataUrl(context: Context, uri: Uri, maxDimension: Int = 1280): String? {
        return runCatching {
            val mime = context.contentResolver.getType(uri) ?: "image/jpeg"
            if (mime.startsWith("image/")) {
                val stream = context.contentResolver.openInputStream(uri) ?: return null
                val bitmap = stream.use { BitmapFactory.decodeStream(it) } ?: return null
                bitmapToBase64DataUrl(bitmap, maxDimension = maxDimension)
            } else {
                val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: return null
                val b64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
                "data:$mime;base64,$b64"
            }
        }.getOrNull()
    }
}
