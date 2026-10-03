package com.jarvis.offline.reminders

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Restores only future reminders the owner created, after a device reboot or app update. */
class ReminderBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED || intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) {
            ReminderManager(context).rescheduleAll()
        }
    }
}
