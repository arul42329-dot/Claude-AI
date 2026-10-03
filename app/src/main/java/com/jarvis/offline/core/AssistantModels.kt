package com.jarvis.offline.core

enum class AssistantState { IDLE, LISTENING, THINKING, EXECUTING, SPEAKING, ERROR }

enum class ReplyLanguage { ENGLISH, TAMIL }

/** Minimal parser configuration so command rules remain independently testable. */
interface AssistantCommandSettings {
    val assistantName: String
    val wakeWord: String
    val responseMode: String
}

enum class CommandType {
    GREETING,
    CONVERSATION_STATUS,
    CONVERSATION_THANKS,
    IDENTITY,
    CAPABILITIES,
    BATTERY,
    OPEN_APP,
    OPEN_SETTINGS,
    OPEN_WIFI_SETTINGS,
    OPEN_BLUETOOTH_SETTINGS,
    OPEN_MOBILE_NETWORK_SETTINGS,
    OPEN_DISPLAY_SETTINGS,
    OPEN_BATTERY_SETTINGS,
    OPEN_SOUND_SETTINGS,
    CALL,
    COMPOSE_MESSAGE,
    CONTACT_SEARCH,
    SET_ALARM,
    SET_TIMER,
    CREATE_REMINDER,
    VOLUME_UP,
    VOLUME_DOWN,
    VOLUME_MUTE,
    MEDIA_PLAY_PAUSE,
    MEDIA_NEXT,
    MEDIA_PREVIOUS,
    READ_NOTIFICATIONS,
    READ_CLIPBOARD,
    ACCESSIBILITY_TAP,
    ACCESSIBILITY_SCROLL_DOWN,
    ACCESSIBILITY_SCROLL_UP,
    ACCESSIBILITY_BACK,
    ACCESSIBILITY_HOME,
    ACCESSIBILITY_READ_SCREEN,
    UNKNOWN
}

data class ParsedCommand(
    val type: CommandType,
    val rawText: String,
    val target: String? = null,
    val value: String? = null,
    val language: ReplyLanguage = ReplyLanguage.ENGLISH
)

sealed class ActionOutcome {
    data class Success(val response: String) : ActionOutcome()
    data class PermissionNeeded(val permission: String, val explanation: String) : ActionOutcome()
    data class SpecialAccessNeeded(val title: String, val explanation: String, val settingsAction: String) : ActionOutcome()
    data class Failure(val response: String) : ActionOutcome()
}
