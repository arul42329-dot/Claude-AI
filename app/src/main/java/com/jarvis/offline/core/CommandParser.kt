package com.jarvis.offline.core

import java.util.Locale

/**
 * Rule-based command registry. It is intentionally local, deterministic, and easy to extend:
 * add aliases to a rule or add a new rule above the generic app-launch fallback.
 */
class CommandParser(private val preferences: AssistantCommandSettings) {

    fun parse(spoken: String): ParsedCommand {
        val raw = spoken.trim()
        val text = stripActivation(normalize(raw))
        val language = LanguageSupport.replyLanguage(raw, preferences.responseMode)
        fun command(type: CommandType, target: String? = null, value: String? = null) =
            ParsedCommand(type, raw, target, value, language)

        // Saying only the configured wake phrase is a greeting; saying it before a command is supported.
        if (text.isBlank()) return command(CommandType.GREETING)
        if (hasAny(text, "how are you", "how are things", "epdi irukeenga", "எப்படி இருக்கிறீர்கள்")) return command(CommandType.CONVERSATION_STATUS)
        if (hasAny(text, "thank you", "thanks", "nandri", "நன்றி")) return command(CommandType.CONVERSATION_THANKS)
        if (hasAny(text, "who are you", "what are you", "yar neenga", "yaar neenga", "நீங்கள் யார்", "நீ யார்")) return command(CommandType.IDENTITY)
        if (hasAny(text, "what can you do", "help", "what do you do", "enna panna mudiyum", "என்ன செய்ய முடியும்")) return command(CommandType.CAPABILITIES)
        if (text in setOf("hi", "hello", "vanakkam", "வணக்கம்") || hasAny(text, "hi jarvis", "hey jarvis")) return command(CommandType.GREETING)
        if (hasAny(text, "battery percentage", "battery level", "battery enna", "battery evlo", "பேட்டரி")) return command(CommandType.BATTERY)

        if (hasAny(text, "read notifications", "notification read", "notifications enna", "notification enna")) return command(CommandType.READ_NOTIFICATIONS)
        if (hasAny(text, "what is copied", "read clipboard", "clipboard enna")) return command(CommandType.READ_CLIPBOARD)

        if (hasAny(text, "go back", "back pannu", "back போ", "பின் செல்")) return command(CommandType.ACCESSIBILITY_BACK)
        if (hasAny(text, "go home", "home pannu", "home போ", "முகப்பு செல்")) return command(CommandType.ACCESSIBILITY_HOME)
        if (hasAny(text, "scroll down", "keela scroll", " கீழே", "கீழே ஸ்க்ரோல்")) return command(CommandType.ACCESSIBILITY_SCROLL_DOWN)
        if (hasAny(text, "scroll up", "mela scroll", " மேலே", "மேலே ஸ்க்ரோல்")) return command(CommandType.ACCESSIBILITY_SCROLL_UP)
        if (hasAny(text, "read screen", "screen read", "screen la enna", "திரையை படி")) return command(CommandType.ACCESSIBILITY_READ_SCREEN)
        extractTapTarget(text)?.let { return command(CommandType.ACCESSIBILITY_TAP, it) }

        if (hasAny(text, "volume increase", "volume up", "sound increase", "volume konjam increase", "volume உயர்த்து")) return command(CommandType.VOLUME_UP)
        if (hasAny(text, "volume decrease", "volume down", "volume reduce", "volume குறை")) return command(CommandType.VOLUME_DOWN)
        if (hasAny(text, "mute", "volume mute", "sound mute")) return command(CommandType.VOLUME_MUTE)
        if (hasAny(text, "next song", "next track", "next music")) return command(CommandType.MEDIA_NEXT)
        if (hasAny(text, "previous song", "previous track", "previous music")) return command(CommandType.MEDIA_PREVIOUS)
        if (hasAny(text, "play music", "pause music", "play pause", "music play", "music pause")) return command(CommandType.MEDIA_PLAY_PAUSE)

        extractReminder(text)?.let { reminder -> return command(CommandType.CREATE_REMINDER, target = reminder.first, value = reminder.second) }
        extractTimer(text)?.let { return command(CommandType.SET_TIMER, value = it) }
        extractAlarm(text)?.let { return command(CommandType.SET_ALARM, value = it) }
        extractCallTarget(text)?.let { return command(CommandType.CALL, target = it) }
        extractMessage(text)?.let { message -> return command(CommandType.COMPOSE_MESSAGE, target = message.first, value = message.second) }
        extractContactTarget(text)?.let { return command(CommandType.CONTACT_SEARCH, target = it) }

        if (hasAny(text, "wifi settings", "wi fi settings", "wifi open", "wifi on", "wi-fi", "வைஃபை")) return command(CommandType.OPEN_WIFI_SETTINGS)
        if (hasAny(text, "bluetooth settings", "bluetooth open", "bluetooth on", "bluetooth", "புளூடூத்")) return command(CommandType.OPEN_BLUETOOTH_SETTINGS)
        if (hasAny(text, "mobile data", "mobile network", "network settings", "sim settings")) return command(CommandType.OPEN_MOBILE_NETWORK_SETTINGS)
        if (hasAny(text, "display settings", "brightness settings", "display open")) return command(CommandType.OPEN_DISPLAY_SETTINGS)
        if (hasAny(text, "battery settings", "battery saver")) return command(CommandType.OPEN_BATTERY_SETTINGS)
        if (hasAny(text, "sound settings", "sound open", "ringer settings")) return command(CommandType.OPEN_SOUND_SETTINGS)
        if (hasAny(text, "open settings", "settings open", "settings pannu", "settings திற", "செட்டிங்ஸ்")) return command(CommandType.OPEN_SETTINGS)

        extractOpenTarget(text)?.let { return command(CommandType.OPEN_APP, target = it) }
        return command(CommandType.UNKNOWN)
    }

    private fun normalize(value: String): String = value.lowercase(Locale.ROOT)
        .replace(Regex("[,.!?;:]+"), " ")
        .replace(Regex("\\s+"), " ")
        .trim()

    private fun stripActivation(text: String): String {
        val name = normalize(preferences.assistantName)
        val activators = listOf(
            normalize(preferences.wakeWord),
            name,
            "hey $name",
            "hi $name",
            "hello $name"
        ).filter { it.isNotBlank() }.distinct().sortedByDescending { it.length }
        return activators.firstNotNullOfOrNull { phrase ->
            when {
                text == phrase -> ""
                text.startsWith("$phrase ") -> text.removePrefix(phrase).trim()
                else -> null
            }
        } ?: text
    }

    private fun hasAny(text: String, vararg phrases: String): Boolean = phrases.any { text.contains(it) }

    private fun extractOpenTarget(text: String): String? {
        val patterns = listOf(
            Regex("(?:open|launch|start)\\s+(.+?)(?:\\s+(?:please|pannu|panunga|pannunga|திற))?$"),
            Regex("(.+?)(?:\\s+)(?:open|thira|thir|திற)(?:\\s+(?:pannu|panunga|pannunga))?$")
        )
        return patterns.firstNotNullOfOrNull { pattern -> pattern.find(text)?.groupValues?.getOrNull(1)?.trim() }
            ?.removePrefix("the ")
            ?.takeIf { it.isNotBlank() }
    }

    private fun extractCallTarget(text: String): String? {
        val match = Regex("(?:call|dial|phone)\\s+(.+?)(?:\\s+(?:please|pannu|panunga|pannunga))?$").find(text)
            ?: Regex("(.+?)\\s+(?:ku|க்கு)\\s+(?:call|dial)\\b").find(text)
        return match?.groupValues?.getOrNull(1)?.trim()?.takeIf { it.isNotBlank() }
    }

    /** Parses an explicit request into a draft, never an automatic SMS send. */
    private fun extractMessage(text: String): Pair<String, String>? {
        val pattern = Regex("(?:(?:send\\s+)?(?:message|sms|text)\\s+(?:to\\s+)?)?(.+?)\\s+(?:saying|that says|message)\\s+(.+)$")
        val startsLikeMessage = text.startsWith("send message") || text.startsWith("message") || text.startsWith("sms") || text.startsWith("text")
        if (!startsLikeMessage) return null
        val match = pattern.find(text) ?: return null
        val recipient = match.groupValues.getOrNull(1)?.removePrefix("send message to ")?.removePrefix("message to ")?.trim().orEmpty()
        val body = match.groupValues.getOrNull(2)?.trim().orEmpty()
        return if (recipient.isNotBlank() && body.isNotBlank()) recipient to body else null
    }

    private fun extractContactTarget(text: String): String? {
        val match = Regex("(?:find|search)\\s+(?:contact\\s+)?(.+)$").find(text)
        return match?.groupValues?.getOrNull(1)?.trim()?.takeIf { it.isNotBlank() }
    }

    private fun extractTapTarget(text: String): String? {
        val match = Regex("(?:tap|click|press)\\s+(.+?)(?:\\s+(?:please|pannu|panunga|pannunga))?$").find(text)
        return match?.groupValues?.getOrNull(1)?.trim()?.takeIf { it.isNotBlank() }
    }

    /** Extracts a local reminder such as 'remind me to call Amma in 10 minutes'. */
    private fun extractReminder(text: String): Pair<String, String>? {
        if (!hasAny(text, "remind me", "reminder", "remind", "நினைவூட்டு")) return null
        val pattern = Regex("(?:remind me(?: to)?|reminder(?: to)?|remind)\\s+(.+?)\\s+(?:in|after)\\s+(\\d{1,3})\\s*(?:minute|minutes|min|nimidam|நிமிடம்)")
        val match = pattern.find(text) ?: return null
        val message = match.groupValues.getOrNull(1)?.trim()?.takeIf { it.isNotBlank() } ?: return null
        val minutes = match.groupValues.getOrNull(2)?.trim()?.toIntOrNull()?.coerceIn(1, 1440) ?: return null
        return message to minutes.toString()
    }

    /** Returns minutes as text; accepts '5 minutes', '10 min', and common Tamil transliteration. */
    private fun extractTimer(text: String): String? {
        if (!hasAny(text, "timer", "minute", "minutes", "min", "nimidam", "நிமிடம்")) return null
        val amount = Regex("(\\d{1,3})\\s*(?:minute|minutes|min|nimidam|நிமிடம்)").find(text)?.groupValues?.getOrNull(1)
        return amount ?: if (text.contains("timer")) "5" else null
    }

    /** Preserves an explicit clock value like 6 AM or 18:30 for the executor. */
    private fun extractAlarm(text: String): String? {
        if (!hasAny(text, "alarm", "wake me", "alarm set", "அலாரம்")) return null
        return Regex("(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm|a m|p m)?", RegexOption.IGNORE_CASE)
            .find(text)
            ?.let { match ->
                listOfNotNull(
                    match.groupValues[1],
                    match.groupValues.getOrNull(2)?.takeIf { it.isNotBlank() },
                    match.groupValues.getOrNull(3)?.takeIf { it.isNotBlank() }
                ).joinToString(":")
            }
            ?: "7:00:am"
    }
}
