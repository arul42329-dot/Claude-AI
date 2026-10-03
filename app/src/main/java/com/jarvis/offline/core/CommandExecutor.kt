package com.jarvis.offline.core

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.media.AudioManager
import android.net.Uri
import android.os.BatteryManager
import android.provider.AlarmClock
import android.provider.MediaStore
import android.provider.Settings
import android.view.KeyEvent
import com.jarvis.offline.accessibility.JarvisAccessibilityService
import com.jarvis.offline.device.AccessStatus
import com.jarvis.offline.device.AppResolver
import com.jarvis.offline.device.ContactResolver
import com.jarvis.offline.notifications.JarvisNotificationListener
import com.jarvis.offline.reminders.ReminderManager
import java.util.Locale

/** Executes only public Android APIs and reports actual failures rather than pretending. */
class CommandExecutor(private val activity: Activity) {
    private val appResolver = AppResolver(activity)
    private val contactResolver = ContactResolver(activity)

    fun execute(command: ParsedCommand): ActionOutcome {
        val tamil = command.language == ReplyLanguage.TAMIL
        fun response(english: String, tamilText: String) = if (tamil) tamilText else english
        fun open(intent: Intent, success: String, failure: String): ActionOutcome = try {
            if (intent.resolveActivity(activity.packageManager) == null) ActionOutcome.Failure(failure)
            else {
                activity.startActivity(intent)
                ActionOutcome.Success(success)
            }
        } catch (_: Exception) { ActionOutcome.Failure(failure) }

        return when (command.type) {
            CommandType.GREETING -> ActionOutcome.Success(response(
                "Hello! How can I help you?", "வணக்கம்! உங்களுக்கு என்ன உதவி வேண்டும்?"
            ))
            CommandType.CONVERSATION_STATUS -> ActionOutcome.Success(response(
                "I'm doing well and ready to help on this device.", "நான் நன்றாக இருக்கிறேன். இந்த போனில் உங்களுக்கு உதவ தயாராக இருக்கிறேன்."
            ))
            CommandType.CONVERSATION_THANKS -> ActionOutcome.Success(response(
                "You're welcome.", "உதவியது மகிழ்ச்சி."
            ))
            CommandType.IDENTITY -> ActionOutcome.Success(response(
                "I'm ${AssistantPreferences(activity).assistantName}, your private on-device phone assistant.",
                "நான் ${AssistantPreferences(activity).assistantName}. உங்கள் போனில் உதவும் தனியுரிமை உள்ள உதவியாளர்."
            ))
            CommandType.CAPABILITIES -> ActionOutcome.Success(response(
                "I can open installed apps and settings, check battery, set alarms and timers, adjust volume, place calls with permission, and use optional accessibility controls when you enable them.",
                "நான் ஆப்ஸ் மற்றும் செட்டிங்ஸை திறக்கவும், பேட்டரியை சொல்லவும், அலாரம் டைமர் வைக்கவும், வால்யூம் மாற்றவும், அனுமதியுடன் கால் செய்யவும் உதவுவேன்."
            ))
            CommandType.BATTERY -> batteryResponse(tamil)
            CommandType.OPEN_SETTINGS -> open(Intent(Settings.ACTION_SETTINGS), response("Opening Settings.", "செட்டிங்ஸ் திறக்கிறேன்."), response("I couldn't open Settings.", "செட்டிங்ஸை திறக்க முடியவில்லை."))
            CommandType.OPEN_WIFI_SETTINGS -> open(Intent(Settings.ACTION_WIFI_SETTINGS), response("Opening Wi-Fi settings.", "வைஃபை செட்டிங்ஸ் திறக்கிறேன்."), response("I couldn't open Wi-Fi settings.", "வைஃபை செட்டிங்ஸை திறக்க முடியவில்லை."))
            CommandType.OPEN_BLUETOOTH_SETTINGS -> open(Intent(Settings.ACTION_BLUETOOTH_SETTINGS), response("Opening Bluetooth settings.", "புளூடூத் செட்டிங்ஸ் திறக்கிறேன்."), response("I couldn't open Bluetooth settings.", "புளூடூத் செட்டிங்ஸை திறக்க முடியவில்லை."))
            CommandType.OPEN_MOBILE_NETWORK_SETTINGS -> open(Intent(Settings.ACTION_WIRELESS_SETTINGS), response("I can't directly change mobile data on this Android version, so I'm opening network settings.", "இந்த Android பதிப்பில் மொபைல் டேட்டாவை நேரடியாக மாற்ற முடியாது. நெட்வொர்க் செட்டிங்ஸை திறக்கிறேன்."), response("I couldn't open network settings.", "நெட்வொர்க் செட்டிங்ஸை திறக்க முடியவில்லை."))
            CommandType.OPEN_DISPLAY_SETTINGS -> open(Intent(Settings.ACTION_DISPLAY_SETTINGS), response("Opening display settings.", "டிஸ்ப்ளே செட்டிங்ஸ் திறக்கிறேன்."), response("I couldn't open display settings.", "டிஸ்ப்ளே செட்டிங்ஸை திறக்க முடியவில்லை."))
            CommandType.OPEN_BATTERY_SETTINGS -> open(Intent(Settings.ACTION_BATTERY_SAVER_SETTINGS), response("Opening battery settings.", "பேட்டரி செட்டிங்ஸ் திறக்கிறேன்."), response("I couldn't open battery settings.", "பேட்டரி செட்டிங்ஸை திறக்க முடியவில்லை."))
            CommandType.OPEN_SOUND_SETTINGS -> open(Intent(Settings.ACTION_SOUND_SETTINGS), response("Opening sound settings.", "சவுண்ட் செட்டிங்ஸ் திறக்கிறேன்."), response("I couldn't open sound settings.", "சவுண்ட் செட்டிங்ஸை திறக்க முடியவில்லை."))
            CommandType.OPEN_APP -> openApp(command.target.orEmpty(), tamil)
            CommandType.CALL -> call(command.target.orEmpty(), tamil)
            CommandType.COMPOSE_MESSAGE -> composeMessage(command.target.orEmpty(), command.value.orEmpty(), tamil)
            CommandType.CONTACT_SEARCH -> findContact(command.target.orEmpty(), tamil)
            CommandType.SET_ALARM -> setAlarm(command.value.orEmpty(), tamil)
            CommandType.SET_TIMER -> setTimer(command.value.orEmpty(), tamil)
            CommandType.CREATE_REMINDER -> createReminder(command.target.orEmpty(), command.value.orEmpty(), tamil)
            CommandType.VOLUME_UP -> changeVolume(AudioManager.ADJUST_RAISE, tamil)
            CommandType.VOLUME_DOWN -> changeVolume(AudioManager.ADJUST_LOWER, tamil)
            CommandType.VOLUME_MUTE -> changeVolume(AudioManager.ADJUST_MUTE, tamil)
            CommandType.MEDIA_PLAY_PAUSE -> mediaKey(KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE, tamil)
            CommandType.MEDIA_NEXT -> mediaKey(KeyEvent.KEYCODE_MEDIA_NEXT, tamil)
            CommandType.MEDIA_PREVIOUS -> mediaKey(KeyEvent.KEYCODE_MEDIA_PREVIOUS, tamil)
            CommandType.READ_NOTIFICATIONS -> readNotifications(tamil)
            CommandType.READ_CLIPBOARD -> readClipboard(tamil)
            CommandType.ACCESSIBILITY_TAP -> tap(command.target.orEmpty(), tamil)
            CommandType.ACCESSIBILITY_SCROLL_DOWN -> scroll(true, tamil)
            CommandType.ACCESSIBILITY_SCROLL_UP -> scroll(false, tamil)
            CommandType.ACCESSIBILITY_BACK -> globalAction(android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_BACK, tamil, "Went back.", "பின்னால் செல்கிறேன்.")
            CommandType.ACCESSIBILITY_HOME -> globalAction(android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_HOME, tamil, "Going home.", "முகப்புக்கு செல்கிறேன்.")
            CommandType.ACCESSIBILITY_READ_SCREEN -> readScreen(tamil)
            CommandType.UNKNOWN -> ActionOutcome.Failure(response(
                "I didn't understand that yet. Try “open WhatsApp”, “set alarm 6 AM”, or “what can you do?”.",
                "அதை எனக்கு இன்னும் புரியவில்லை. “WhatsApp open pannu”, “alarm set pannu 6 AM” என்று முயற்சி செய்யுங்கள்."
            ))
        }
    }

    private fun batteryResponse(tamil: Boolean): ActionOutcome {
        val battery = activity.getSystemService(BatteryManager::class.java)
        val percent = battery?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1
        return if (percent in 0..100) ActionOutcome.Success(if (tamil) "பேட்டரி $percent சதவீதம் உள்ளது." else "Your battery is $percent percent.")
        else ActionOutcome.Failure(if (tamil) "பேட்டரி அளவை படிக்க முடியவில்லை." else "I couldn't read the battery level.")
    }

    private fun openApp(requested: String, tamil: Boolean): ActionOutcome {
        val target = requested.trim()
        if (target.equals("camera", true) || target.contains("camera", true) || target.contains("கேமரா")) {
            return launch(Intent(MediaStore.INTENT_ACTION_STILL_IMAGE_CAMERA), if (tamil) "கேமரா திறக்கிறேன்." else "Opening camera.", if (tamil) "கேமராவை திறக்க முடியவில்லை." else "I couldn't open the camera.")
        }
        if (target.equals("browser", true) || target.equals("internet", true)) {
            // This hands off to the user's browser; JARVIS itself declares no Internet permission.
            return launch(Intent(Intent.ACTION_VIEW, Uri.parse("https://www.google.com")), if (tamil) "பிரௌசரை திறக்கிறேன்." else "Opening your browser.", if (tamil) "பிரௌசரை திறக்க முடியவில்லை." else "I couldn't find a browser.")
        }
        val app = appResolver.resolve(target)
        return if (app != null) launch(app.launchIntent, if (tamil) "${app.label} திறக்கிறேன்." else "Opening ${app.label}.", if (tamil) "${app.label} திறக்க முடியவில்லை." else "I couldn't open ${app.label}.")
        else ActionOutcome.Failure(if (tamil) "$target என்ற நிறுவப்பட்ட ஆப்பை கண்டுபிடிக்க முடியவில்லை." else "I couldn't find an installed app called $target.")
    }

    private fun call(target: String, tamil: Boolean): ActionOutcome {
        if (target.isBlank()) return ActionOutcome.Failure(if (tamil) "யாருக்கு கால் செய்ய வேண்டும் என்று சொல்லுங்கள்." else "Tell me who you would like to call.")
        val number = contactResolver.normalizePhone(target)
        if (number == null && !AccessStatus.hasPermission(activity, Manifest.permission.READ_CONTACTS)) {
            return ActionOutcome.PermissionNeeded(Manifest.permission.READ_CONTACTS, if (tamil) "$target என்ற தொடர்பை கண்டுபிடிக்க Contacts அனுமதி தேவை." else "Contacts permission is needed to find $target for this call.")
        }
        val result = number ?: contactResolver.findFirst(target)
            ?.let { it.phoneNumber }
            ?: return ActionOutcome.Failure(if (tamil) "$target என்ற தொடர்பை கண்டுபிடிக்க முடியவில்லை." else "I couldn't find a contact named $target.")
        if (!AccessStatus.hasPermission(activity, Manifest.permission.CALL_PHONE)) {
            return ActionOutcome.PermissionNeeded(Manifest.permission.CALL_PHONE, if (tamil) "$target-க்கு கால் செய்ய Phone அனுமதி தேவை." else "Phone permission is needed before I can call $target.")
        }
        return launch(Intent(Intent.ACTION_CALL, Uri.parse("tel:${Uri.encode(result)}")), if (tamil) "$target-க்கு கால் செய்கிறேன்." else "Calling $target.", if (tamil) "கால் செய்ய முடியவில்லை." else "I couldn't start the call.")
    }

    private fun composeMessage(target: String, body: String, tamil: Boolean): ActionOutcome {
        if (target.isBlank() || body.isBlank()) {
            return ActionOutcome.Failure(if (tamil) "யாருக்கு என்ன மெசேஜ் என்று சொல்லுங்கள்." else "Tell me who to message and what you want to say.")
        }
        val number = contactResolver.normalizePhone(target)
        if (number == null && !AccessStatus.hasPermission(activity, Manifest.permission.READ_CONTACTS)) {
            return ActionOutcome.PermissionNeeded(Manifest.permission.READ_CONTACTS, if (tamil) "$target என்ற தொடர்பை கண்டுபிடிக்க Contacts அனுமதி தேவை." else "Contacts permission is needed to find $target for this message.")
        }
        val recipient = number ?: contactResolver.findFirst(target)?.phoneNumber
            ?: return ActionOutcome.Failure(if (tamil) "$target என்ற தொடர்பை கண்டுபிடிக்க முடியவில்லை." else "I couldn't find a contact named $target.")
        val intent = Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:${Uri.encode(recipient)}"))
            .putExtra("sms_body", body)
        return launch(
            intent,
            if (tamil) "$target-க்கு அனுப்ப மெசேஜை தயார் செய்தேன். அனுப்பும் முன் நீங்கள் சரிபார்க்கலாம்." else "I prepared a message to $target. Please review it before sending.",
            if (tamil) "மெசேஜிங் ஆப்பை திறக்க முடியவில்லை." else "I couldn't open a messaging app."
        )
    }

    private fun findContact(target: String, tamil: Boolean): ActionOutcome {
        if (!AccessStatus.hasPermission(activity, Manifest.permission.READ_CONTACTS)) {
            return ActionOutcome.PermissionNeeded(Manifest.permission.READ_CONTACTS, if (tamil) "தொடர்புகளை தேட Contacts அனுமதி தேவை." else "Contacts permission is needed to search your contacts.")
        }
        val match = contactResolver.findFirst(target)
        return if (match != null) ActionOutcome.Success(if (tamil) "${match.displayName} என்ற தொடர்பு கிடைத்தது." else "I found ${match.displayName}.")
        else ActionOutcome.Failure(if (tamil) "$target என்ற தொடர்பு கிடைக்கவில்லை." else "I couldn't find $target in your contacts.")
    }

    private fun setAlarm(value: String, tamil: Boolean): ActionOutcome {
        val time = parseAlarm(value) ?: return ActionOutcome.Failure(if (tamil) "அலாரம் நேரத்தை புரிந்துகொள்ள முடியவில்லை." else "I couldn't understand the alarm time.")
        val intent = Intent(AlarmClock.ACTION_SET_ALARM)
            .putExtra(AlarmClock.EXTRA_HOUR, time.first)
            .putExtra(AlarmClock.EXTRA_MINUTES, time.second)
            .putExtra(AlarmClock.EXTRA_MESSAGE, "JARVIS alarm")
        return launch(intent, if (tamil) "${formatTime(time)}க்கு அலாரம் அமைக்கிறேன்." else "Setting an alarm for ${formatTime(time)}.", if (tamil) "Clock ஆப்பை திறக்க முடியவில்லை." else "I couldn't open a Clock app to set that alarm.")
    }

    private fun setTimer(value: String, tamil: Boolean): ActionOutcome {
        val minutes = value.toIntOrNull()?.coerceIn(1, 1440)
            ?: return ActionOutcome.Failure(if (tamil) "டைமர் நேரத்தை புரிந்துகொள்ள முடியவில்லை." else "I couldn't understand the timer length.")
        val intent = Intent(AlarmClock.ACTION_SET_TIMER)
            .putExtra(AlarmClock.EXTRA_LENGTH, minutes * 60)
            .putExtra(AlarmClock.EXTRA_MESSAGE, "JARVIS timer")
        return launch(intent, if (tamil) "$minutes நிமிட டைமர் அமைக்கிறேன்." else "Setting a $minutes minute timer.", if (tamil) "Clock ஆப்பை திறக்க முடியவில்லை." else "I couldn't open a Clock app to set that timer.")
    }

    private fun createReminder(message: String, minutesText: String, tamil: Boolean): ActionOutcome {
        val minutes = minutesText.toIntOrNull()?.coerceIn(1, 1440)
            ?: return ActionOutcome.Failure(if (tamil) "நினைவூட்டல் நேரத்தை புரிந்துகொள்ள முடியவில்லை." else "I couldn't understand when to set that reminder.")
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU &&
            !AccessStatus.hasPermission(activity, Manifest.permission.POST_NOTIFICATIONS)
        ) {
            return ActionOutcome.PermissionNeeded(
                Manifest.permission.POST_NOTIFICATIONS,
                if (tamil) "நீங்கள் உருவாக்கும் உள்ளூர் நினைவூட்டலை காட்ட Notification அனுமதி தேவை." else "Notification permission is needed to show the local reminder you asked me to create."
            )
        }
        ReminderManager(activity).schedule(message, minutes)
        return ActionOutcome.Success(if (tamil) "$minutes நிமிடத்தில் $message என்று நினைவூட்டுவேன்." else "I'll remind you to $message in $minutes minutes.")
    }

    private fun changeVolume(direction: Int, tamil: Boolean): ActionOutcome = try {
        activity.getSystemService(AudioManager::class.java)
            ?.adjustStreamVolume(AudioManager.STREAM_MUSIC, direction, AudioManager.FLAG_SHOW_UI)
        ActionOutcome.Success(if (tamil) "வால்யூமை மாற்றினேன்." else "Adjusted media volume.")
    } catch (_: SecurityException) {
        ActionOutcome.Failure(if (tamil) "இந்த சாதனத்தில் வால்யூமை மாற்ற முடியவில்லை." else "This device did not allow me to change the volume.")
    }

    private fun mediaKey(keyCode: Int, tamil: Boolean): ActionOutcome = try {
        val audio = activity.getSystemService(AudioManager::class.java)
        audio?.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, keyCode))
        audio?.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_UP, keyCode))
        ActionOutcome.Success(if (tamil) "மீடியா கட்டுப்பாட்டை அனுப்பினேன்." else "Sent the media control.")
    } catch (_: Exception) {
        ActionOutcome.Failure(if (tamil) "மீடியாவை கட்டுப்படுத்த முடியவில்லை." else "I couldn't control the current media session.")
    }

    private fun readNotifications(tamil: Boolean): ActionOutcome {
        if (!AccessStatus.isNotificationAccessEnabled(activity)) {
            return ActionOutcome.SpecialAccessNeeded(
                if (tamil) "Notification access" else "Notification access",
                if (tamil) "சமீபத்திய நோட்டிபிகேஷனை படிக்க Android Notification Access-ஐ நீங்கள் இயக்க வேண்டும்." else "To read a notification you must explicitly enable Android Notification Access for JARVIS.",
                Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS
            )
        }
        val notification = JarvisNotificationListener.latest()
            ?: return ActionOutcome.Failure(if (tamil) "படிக்க புதிய நோட்டிபிகேஷன் இல்லை." else "There is no recent notification available to read.")
        val content = listOf(notification.title, notification.text).filter { it.isNotBlank() }.joinToString(". ")
        return ActionOutcome.Success(if (tamil) "சமீபத்திய நோட்டிபிகேஷன்: $content" else "Latest notification: $content")
    }

    private fun readClipboard(tamil: Boolean): ActionOutcome {
        val clipboard = activity.getSystemService(android.content.ClipboardManager::class.java)
        if (clipboard?.hasPrimaryClip() != true) return ActionOutcome.Failure(if (tamil) "கிளிப்போர்டில் எதுவும் இல்லை." else "Your clipboard is empty.")
        val clip = clipboard.primaryClip ?: return ActionOutcome.Failure(if (tamil) "கிளிப்போர்டை படிக்க முடியவில்லை." else "I couldn't read the clipboard.")
        val value = clip.getItemAt(0).coerceToText(activity)?.toString()?.take(300).orEmpty()
        return if (value.isNotBlank()) ActionOutcome.Success(if (tamil) "கிளிப்போர்டில் உள்ளது: $value" else "Your clipboard says: $value")
        else ActionOutcome.Failure(if (tamil) "கிளிப்போர்டில் படிக்க உரை இல்லை." else "The clipboard does not contain readable text.")
    }

    private fun tap(target: String, tamil: Boolean): ActionOutcome {
        val service = JarvisAccessibilityService.active() ?: return accessibilityNeeded(tamil)
        return if (service.tapVisibleText(target)) ActionOutcome.Success(if (tamil) "$target என்பதை தட்டினேன்." else "Tapped $target.")
        else ActionOutcome.Failure(if (tamil) "$target என்ற காணக்கூடிய பட்டனை கண்டுபிடிக்க முடியவில்லை." else "I couldn't find a visible item called $target to tap.")
    }

    private fun scroll(forward: Boolean, tamil: Boolean): ActionOutcome {
        val service = JarvisAccessibilityService.active() ?: return accessibilityNeeded(tamil)
        return if (service.scroll(forward)) ActionOutcome.Success(if (tamil) if (forward) "கீழே ஸ்க்ரோல் செய்கிறேன்." else "மேலே ஸ்க்ரோல் செய்கிறேன்." else if (forward) "Scrolling down." else "Scrolling up.")
        else ActionOutcome.Failure(if (tamil) "இந்த திரையில் ஸ்க்ரோல் செய்ய முடியவில்லை." else "I couldn't scroll this screen.")
    }

    private fun globalAction(action: Int, tamil: Boolean, english: String, tamilText: String): ActionOutcome {
        val service = JarvisAccessibilityService.active() ?: return accessibilityNeeded(tamil)
        return if (service.performGlobalAction(action)) ActionOutcome.Success(if (tamil) tamilText else english)
        else ActionOutcome.Failure(if (tamil) "அந்த செயலை செய்ய முடியவில்லை." else "I couldn't perform that action.")
    }

    private fun readScreen(tamil: Boolean): ActionOutcome {
        val service = JarvisAccessibilityService.active() ?: return accessibilityNeeded(tamil)
        val content = service.readScreen()
        return if (content != null) ActionOutcome.Success(if (tamil) "திரையில் உள்ளது: $content" else "The screen says: $content")
        else ActionOutcome.Failure(if (tamil) "திரையில் படிக்க உரை இல்லை." else "There is no readable text on this screen.")
    }

    private fun accessibilityNeeded(tamil: Boolean) = ActionOutcome.SpecialAccessNeeded(
        "JARVIS Accessibility Service",
        if (tamil) "Tap, scroll, back மற்றும் screen read செய்ய JARVIS Accessibility Service-ஐ நீங்கள் Android Accessibility Settings-ல் இயக்க வேண்டும்." else "To tap, scroll, go back, or read screen text, you must explicitly enable JARVIS Accessibility Service in Android Accessibility settings.",
        Settings.ACTION_ACCESSIBILITY_SETTINGS
    )

    private fun launch(intent: Intent, success: String, failure: String): ActionOutcome = try {
        if (intent.resolveActivity(activity.packageManager) == null) ActionOutcome.Failure(failure)
        else {
            activity.startActivity(intent)
            ActionOutcome.Success(success)
        }
    } catch (_: Exception) { ActionOutcome.Failure(failure) }

    private fun parseAlarm(value: String): Pair<Int, Int>? {
        val bits = value.lowercase(Locale.ROOT).split(":")
        val hourRaw = bits.getOrNull(0)?.toIntOrNull() ?: return null
        val minute = bits.getOrNull(1)?.toIntOrNull()?.takeIf { it in 0..59 } ?: 0
        val meridiem = bits.getOrNull(2)?.replace(" ", "")
        var hour = hourRaw
        if (meridiem == "am" && hour == 12) hour = 0
        if (meridiem == "pm" && hour in 1..11) hour += 12
        return hour.takeIf { it in 0..23 }?.let { it to minute }
    }

    private fun formatTime(time: Pair<Int, Int>): String = String.format(Locale.getDefault(), "%02d:%02d", time.first, time.second)
}
