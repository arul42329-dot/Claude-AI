package com.jarvis.offline.reminders

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import org.json.JSONArray
import org.json.JSONObject

/** Private, device-local reminder scheduler. Reminder text never leaves this app/device. */
class ReminderManager(private val context: Context) {
    private val preferences = context.getSharedPreferences("jarvis_local_reminders", Context.MODE_PRIVATE)
    private val alarmManager = context.getSystemService(AlarmManager::class.java)

    data class Reminder(val id: Int, val message: String, val triggerAt: Long)

    fun schedule(message: String, minutes: Int): Reminder {
        val reminder = Reminder(nextId(), message.trim().take(300), System.currentTimeMillis() + minutes * 60_000L)
        save(reminders() + reminder)
        scheduleAlarm(reminder)
        return reminder
    }

    fun reminders(): List<Reminder> = runCatching {
        val json = JSONArray(preferences.getString(KEY_ITEMS, "[]") ?: "[]")
        buildList {
            for (index in 0 until json.length()) {
                val item = json.getJSONObject(index)
                add(Reminder(item.getInt("id"), item.getString("message"), item.getLong("triggerAt")))
            }
        }
    }.getOrDefault(emptyList())

    fun remove(id: Int) {
        save(reminders().filterNot { it.id == id })
    }

    fun storageByteCount(): Int = (preferences.getString(KEY_ITEMS, "") ?: "").toByteArray().size

    fun rescheduleAll() = reminders().filter { it.triggerAt > System.currentTimeMillis() }.forEach(::scheduleAlarm)

    fun clearAll() {
        reminders().forEach { alarmManager?.cancel(pendingIntent(it)) }
        preferences.edit().clear().apply()
    }

    private fun scheduleAlarm(reminder: Reminder) {
        val alarm = alarmManager ?: return
        // Public inexact alarm API: works without exact-alarm special access and respects Android battery policy.
        alarm.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, reminder.triggerAt, pendingIntent(reminder))
    }

    private fun pendingIntent(reminder: Reminder): PendingIntent {
        val intent = Intent(context, ReminderReceiver::class.java)
            .putExtra(ReminderReceiver.EXTRA_ID, reminder.id)
            .putExtra(ReminderReceiver.EXTRA_MESSAGE, reminder.message)
        return PendingIntent.getBroadcast(
            context,
            reminder.id,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    private fun save(items: List<Reminder>) {
        val json = JSONArray()
        items.forEach { reminder ->
            json.put(JSONObject().apply {
                put("id", reminder.id)
                put("message", reminder.message)
                put("triggerAt", reminder.triggerAt)
            })
        }
        preferences.edit().putString(KEY_ITEMS, json.toString()).apply()
    }

    private fun nextId(): Int {
        val id = preferences.getInt(KEY_NEXT_ID, 1)
        preferences.edit().putInt(KEY_NEXT_ID, if (id == Int.MAX_VALUE) 1 else id + 1).apply()
        return id
    }

    private companion object {
        const val KEY_ITEMS = "items"
        const val KEY_NEXT_ID = "next_id"
    }
}
