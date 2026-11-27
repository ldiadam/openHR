package id.openhr.ess.util

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import id.openhr.ess.MainActivity
import java.util.Calendar

class ShiftReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val kind = intent.getStringExtra(EXTRA_KIND) ?: KIND_IN
        val lang = intent.getStringExtra(EXTRA_LANG) ?: "id"

        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channelName = if (lang == "id") "Pengingat Presensi Shift" else "Shift Attendance Reminders"
            val channel = NotificationChannel(CHANNEL_ID, channelName, NotificationManager.IMPORTANCE_HIGH)
            manager.createNotificationChannel(channel)
        }

        val openIntent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val contentPending = PendingIntent.getActivity(
            context,
            if (kind == KIND_IN) 5101 else 5102,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val title = when {
            kind == KIND_IN && lang == "id" -> "Waktunya Presensi Masuk"
            kind == KIND_IN -> "Time to Clock In"
            lang == "id" -> "Waktunya Presensi Pulang"
            else -> "Time to Clock Out"
        }
        val body = when {
            kind == KIND_IN && lang == "id" -> "Shift Anda segera dimulai. Buka openHR ESS untuk tap masuk."
            kind == KIND_IN -> "Your shift starts soon. Open openHR ESS to clock in."
            lang == "id" -> "Jam shift berakhir. Jangan lupa lakukan tap pulang."
            else -> "Your shift is ending. Don't forget to clock out."
        }

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(contentPending)
            .build()

        manager.notify(if (kind == KIND_IN) 6101 else 6102, notification)
    }

    companion object {
        const val CHANNEL_ID = "openhr_shift_reminders"
        const val EXTRA_KIND = "kind"
        const val EXTRA_LANG = "lang"
        const val KIND_IN = "in"
        const val KIND_OUT = "out"
    }
}

object ShiftReminderScheduler {
    private const val REQ_IN = 4101
    private const val REQ_OUT = 4102

    fun schedule(
        context: Context,
        shiftStart: String?,
        shiftEnd: String?,
        lang: String
    ) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return

        val (startHour, startMinute) = parseClock(shiftStart, 8, 30)
        // Notify 10 minutes before shift start
        val inCal = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, startHour)
            set(Calendar.MINUTE, startMinute)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
            add(Calendar.MINUTE, -10)
            if (timeInMillis <= System.currentTimeMillis()) {
                add(Calendar.DAY_OF_MONTH, 1)
            }
        }

        val (endHour, endMinute) = parseClock(shiftEnd, 17, 30)
        val outCal = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, endHour)
            set(Calendar.MINUTE, endMinute)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
            if (timeInMillis <= System.currentTimeMillis()) {
                add(Calendar.DAY_OF_MONTH, 1)
            }
        }

        alarmManager.setInexactRepeating(
            AlarmManager.RTC_WAKEUP,
            inCal.timeInMillis,
            AlarmManager.INTERVAL_DAY,
            pendingFor(context, ShiftReminderReceiver.KIND_IN, lang, REQ_IN)
        )
        alarmManager.setInexactRepeating(
            AlarmManager.RTC_WAKEUP,
            outCal.timeInMillis,
            AlarmManager.INTERVAL_DAY,
            pendingFor(context, ShiftReminderReceiver.KIND_OUT, lang, REQ_OUT)
        )
    }

    fun cancel(context: Context) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
        alarmManager.cancel(pendingFor(context, ShiftReminderReceiver.KIND_IN, "id", REQ_IN))
        alarmManager.cancel(pendingFor(context, ShiftReminderReceiver.KIND_OUT, "id", REQ_OUT))
    }

    private fun pendingFor(context: Context, kind: String, lang: String, reqCode: Int): PendingIntent {
        val intent = Intent(context, ShiftReminderReceiver::class.java).apply {
            putExtra(ShiftReminderReceiver.EXTRA_KIND, kind)
            putExtra(ShiftReminderReceiver.EXTRA_LANG, lang)
        }
        return PendingIntent.getBroadcast(
            context,
            reqCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    private fun parseClock(raw: String?, defaultHour: Int, defaultMin: Int): Pair<Int, Int> {
        val parts = raw?.trim()?.split(":")
        val h = parts?.getOrNull(0)?.toIntOrNull()?.coerceIn(0, 23) ?: defaultHour
        val m = parts?.getOrNull(1)?.toIntOrNull()?.coerceIn(0, 59) ?: defaultMin
        return h to m
    }
}
