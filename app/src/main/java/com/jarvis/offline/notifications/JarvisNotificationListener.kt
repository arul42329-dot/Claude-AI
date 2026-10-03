package com.jarvis.offline.notifications

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/** Optional notification access. The latest non-empty notification is held only in RAM, never saved. */
class JarvisNotificationListener : NotificationListenerService() {
    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val extras = sbn.notification.extras
        val title = extras.getCharSequence("android.title")?.toString()?.trim().orEmpty()
        val text = extras.getCharSequence("android.text")?.toString()?.trim().orEmpty()
        if (title.isNotEmpty() || text.isNotEmpty()) latest = NotificationSummary(title, text, sbn.postTime)
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification) = Unit

    data class NotificationSummary(val title: String, val text: String, val postedAt: Long)

    companion object {
        @Volatile private var latest: NotificationSummary? = null
        fun latest(): NotificationSummary? = latest
        fun clear() { latest = null }
    }
}
