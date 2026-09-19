package com.example.readingpoc

import android.accessibilityservice.AccessibilityService
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.view.accessibility.AccessibilityEvent
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Does nothing accessibility-related on purpose. Its only job is to stay alive in the
 * background and write a timestamp every minute, so we can tell later whether the OS
 * killed it (heartbeat stops advancing) or it survived (heartbeat keeps advancing even
 * after the app was closed/backgrounded for hours).
 */
class HeartbeatAccessibilityService : AccessibilityService() {

    private val handler = Handler(Looper.getMainLooper())
    private val heartbeatIntervalMs = 60_000L

    private val heartbeatRunnable = object : Runnable {
        override fun run() {
            writeHeartbeat()
            handler.postDelayed(this, heartbeatIntervalMs)
        }
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        handler.post(heartbeatRunnable)
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // Intentionally empty: this POC only measures whether the service process survives.
    }

    override fun onInterrupt() {
        // No-op.
    }

    override fun onDestroy() {
        handler.removeCallbacks(heartbeatRunnable)
        super.onDestroy()
    }

    private fun writeHeartbeat() {
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val now = System.currentTimeMillis()
        val count = prefs.getInt(KEY_COUNT, 0) + 1
        prefs.edit()
            .putLong(KEY_LAST_HEARTBEAT_MS, now)
            .putInt(KEY_COUNT, count)
            .apply()
    }

    companion object {
        const val PREFS_NAME = "heartbeat_prefs"
        const val KEY_LAST_HEARTBEAT_MS = "last_heartbeat_ms"
        const val KEY_COUNT = "heartbeat_count"

        fun describeLastHeartbeat(context: Context): String {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val last = prefs.getLong(KEY_LAST_HEARTBEAT_MS, -1L)
            val count = prefs.getInt(KEY_COUNT, 0)
            if (last < 0) return "אין נתונים עדיין - הפעל את השירות בהגדרות הנגישות"
            val fmt = SimpleDateFormat("dd/MM HH:mm:ss", Locale.getDefault())
            val ageMinutes = (System.currentTimeMillis() - last) / 60_000
            return "פעימה אחרונה: ${fmt.format(Date(last))} (לפני $ageMinutes דק') | סה\"כ פעימות: $count"
        }
    }
}
