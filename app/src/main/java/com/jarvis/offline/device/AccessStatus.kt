package com.jarvis.offline.device

import android.accessibilityservice.AccessibilityServiceInfo
import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import android.view.accessibility.AccessibilityManager
import com.jarvis.offline.accessibility.JarvisAccessibilityService
import com.jarvis.offline.notifications.JarvisNotificationListener

object AccessStatus {
    fun hasPermission(context: Context, permission: String): Boolean =
        context.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED

    fun isAccessibilityEnabled(context: Context): Boolean {
        val manager = context.getSystemService(AccessibilityManager::class.java) ?: return false
        val component = ComponentName(context, JarvisAccessibilityService::class.java)
        return manager.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_ALL_MASK)
            .any { info -> info.resolveInfo.serviceInfo.packageName == component.packageName && info.resolveInfo.serviceInfo.name == component.className }
    }

    fun isNotificationAccessEnabled(context: Context): Boolean {
        // Works from API 26 onward and avoids relying on a newer NotificationManager method.
        val enabled = android.provider.Settings.Secure.getString(
            context.contentResolver,
            "enabled_notification_listeners"
        ).orEmpty()
        return enabled.contains(ComponentName(context, JarvisNotificationListener::class.java).flattenToString(), ignoreCase = true)
    }
}
