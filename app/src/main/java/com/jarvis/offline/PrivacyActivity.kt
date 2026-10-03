package com.jarvis.offline

import android.Manifest
import android.app.AlertDialog
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.provider.Settings
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import com.jarvis.offline.core.AssistantPreferences
import com.jarvis.offline.device.AccessStatus
import com.jarvis.offline.reminders.ReminderManager
import com.jarvis.offline.notifications.JarvisNotificationListener

class PrivacyActivity : android.app.Activity() {
    private lateinit var preferences: AssistantPreferences
    private lateinit var microphoneStatus: TextView
    private lateinit var contactsStatus: TextView
    private lateinit var phoneStatus: TextView
    private lateinit var accessibilityStatus: TextView
    private lateinit var notificationStatus: TextView
    private lateinit var historyStatus: TextView
    private lateinit var storageStatus: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_privacy)
        preferences = AssistantPreferences(this)
        bindViews()
        bindActions()
    }

    override fun onResume() {
        super.onResume()
        if (::microphoneStatus.isInitialized) refresh()
    }

    private fun bindViews() {
        microphoneStatus = findViewById(R.id.microphoneStatus)
        contactsStatus = findViewById(R.id.contactsStatus)
        phoneStatus = findViewById(R.id.phoneStatus)
        accessibilityStatus = findViewById(R.id.accessibilityStatus)
        notificationStatus = findViewById(R.id.notificationStatus)
        historyStatus = findViewById(R.id.historyStatus)
        storageStatus = findViewById(R.id.storageStatus)
    }

    private fun bindActions() {
        findViewById<Button>(R.id.backButton).setOnClickListener { finish() }
        findViewById<Button>(R.id.microphoneButton).setOnClickListener { requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), REQUEST_MICROPHONE) }
        findViewById<Button>(R.id.contactsButton).setOnClickListener { requestPermissions(arrayOf(Manifest.permission.READ_CONTACTS), REQUEST_CONTACTS) }
        findViewById<Button>(R.id.phoneButton).setOnClickListener { requestPermissions(arrayOf(Manifest.permission.CALL_PHONE), REQUEST_PHONE) }
        findViewById<Button>(R.id.accessibilityButton).setOnClickListener { explainAccessibility() }
        findViewById<Button>(R.id.notificationButton).setOnClickListener { explainNotifications() }
        findViewById<Button>(R.id.clearHistoryButton).setOnClickListener { clearHistory() }
        findViewById<Button>(R.id.clearDataButton).setOnClickListener { clearAllData() }
    }

    private fun refresh() {
        microphoneStatus.text = permissionLine("Microphone", AccessStatus.hasPermission(this, Manifest.permission.RECORD_AUDIO), "Used only while you press Talk; recordings are not saved.")
        contactsStatus.text = permissionLine("Contacts", AccessStatus.hasPermission(this, Manifest.permission.READ_CONTACTS), "Used only to find a contact you explicitly ask for.")
        phoneStatus.text = permissionLine("Phone calls", AccessStatus.hasPermission(this, Manifest.permission.CALL_PHONE), "Used only for a call you explicitly request.")
        accessibilityStatus.text = permissionLine("JARVIS Accessibility Service", AccessStatus.isAccessibilityEnabled(this), "Optional. Enables explicit tap, scroll, Back, Home, and read-screen commands.")
        val reminderNotifications = android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.TIRAMISU ||
            AccessStatus.hasPermission(this, Manifest.permission.POST_NOTIFICATIONS)
        notificationStatus.text = permissionLine(
            "Notification access",
            AccessStatus.isNotificationAccessEnabled(this),
            "Optional latest-notification reading is RAM-only. Local reminders: notifications ${if (reminderNotifications) "enabled" else "off"}."
        )
        val count = preferences.history().size
        val reminderManager = ReminderManager(this)
        val reminderCount = reminderManager.reminders().size
        val localBytes = preferences.historyByteCount() + reminderManager.storageByteCount()
        historyStatus.text = "Command history: $count local entr${if (count == 1) "y" else "ies"}. Local reminders: $reminderCount."
        storageStatus.text = "JARVIS local history/reminders use about ${formatBytes(localBytes)}. Settings are also private app storage. No raw microphone audio is stored."
    }

    private fun permissionLine(name: String, enabled: Boolean, detail: String): String =
        "$name: ${if (enabled) "Enabled" else "Off"}\n$detail"

    private fun explainAccessibility() {
        AlertDialog.Builder(this)
            .setTitle("Enable JARVIS Accessibility Service?")
            .setMessage("This optional service is clearly named in Android Settings. When you explicitly ask, it can tap matching visible text, scroll, press Back or Home, and read visible UI text. It cannot bypass Android security and does not run hidden automation.")
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Open Accessibility settings") { _, _ -> startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) }
            .show()
    }

    private fun explainNotifications() {
        AlertDialog.Builder(this)
            .setTitle("Enable notification access?")
            .setMessage("If you enable this optional access, JARVIS can read the latest visible notification only when you ask. Notification text is never uploaded and is not written to local history automatically.")
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Open notification settings") { _, _ -> startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)) }
            .show()
    }

    private fun clearHistory() {
        AlertDialog.Builder(this)
            .setTitle("Clear local history?")
            .setMessage("This permanently removes saved commands and responses from this device.")
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Clear") { _, _ ->
                preferences.clearHistory()
                refresh()
            }.show()
    }

    private fun clearAllData() {
        AlertDialog.Builder(this)
            .setTitle("Clear all JARVIS local data?")
            .setMessage("This permanently resets the assistant name, language and voice preferences, and command history. Android permissions are managed separately in system settings.")
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Clear all") { _, _ ->
                preferences.clearAll()
                ReminderManager(this).clearAll()
                JarvisNotificationListener.clear()
                refresh()
                Toast.makeText(this, "JARVIS local data was cleared.", Toast.LENGTH_SHORT).show()
            }.show()
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        val granted = grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED
        Toast.makeText(this, if (granted) "Access enabled." else "Access was not granted.", Toast.LENGTH_SHORT).show()
        refresh()
    }

    private fun formatBytes(bytes: Int): String = when {
        bytes < 1024 -> "$bytes B"
        else -> String.format(java.util.Locale.US, "%.1f KB", bytes / 1024f)
    }

    private companion object {
        const val REQUEST_MICROPHONE = 11
        const val REQUEST_CONTACTS = 12
        const val REQUEST_PHONE = 13
    }
}
