package com.jarvis.offline.core

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/** Lightweight, private on-device preferences. No account or network is involved. */
class AssistantPreferences(context: Context) : AssistantCommandSettings {
    private val prefs = context.getSharedPreferences("jarvis_private_settings", Context.MODE_PRIVATE)

    override var assistantName: String
        get() = prefs.getString(KEY_NAME, "JARVIS") ?: "JARVIS"
        set(value) = prefs.edit().putString(KEY_NAME, value.ifBlank { "JARVIS" }.trim()).apply()

    override var wakeWord: String
        get() = prefs.getString(KEY_WAKE_WORD, "Hey JARVIS") ?: "Hey JARVIS"
        set(value) = prefs.edit().putString(KEY_WAKE_WORD, value.ifBlank { "Hey $assistantName" }.trim()).apply()

    /** AUTO, ENGLISH, or TAMIL */
    var defaultLanguage: String
        get() = prefs.getString(KEY_DEFAULT_LANGUAGE, "AUTO") ?: "AUTO"
        set(value) = prefs.edit().putString(KEY_DEFAULT_LANGUAGE, value).apply()

    /** DETECTED, ENGLISH, or TAMIL */
    override var responseMode: String
        get() = prefs.getString(KEY_RESPONSE_MODE, "DETECTED") ?: "DETECTED"
        set(value) = prefs.edit().putString(KEY_RESPONSE_MODE, value).apply()

    var speechRate: Float
        get() = prefs.getFloat(KEY_RATE, 1.0f)
        set(value) = prefs.edit().putFloat(KEY_RATE, value.coerceIn(0.5f, 1.5f)).apply()

    var speechPitch: Float
        get() = prefs.getFloat(KEY_PITCH, 1.0f)
        set(value) = prefs.edit().putFloat(KEY_PITCH, value.coerceIn(0.5f, 1.5f)).apply()

    var autoListen: Boolean
        get() = prefs.getBoolean(KEY_AUTO_LISTEN, false)
        set(value) = prefs.edit().putBoolean(KEY_AUTO_LISTEN, value).apply()

    fun addHistory(command: String, response: String) {
        val items = history().toMutableList()
        items.add(0, HistoryEntry(System.currentTimeMillis(), command, response))
        val json = JSONArray()
        items.take(MAX_HISTORY).forEach { entry ->
            json.put(JSONObject().apply {
                put("time", entry.timestamp)
                put("command", entry.command)
                put("response", entry.response)
            })
        }
        prefs.edit().putString(KEY_HISTORY, json.toString()).apply()
    }

    fun history(): List<HistoryEntry> {
        val saved = prefs.getString(KEY_HISTORY, "[]") ?: "[]"
        return runCatching {
            val json = JSONArray(saved)
            buildList {
                for (index in 0 until json.length()) {
                    val item = json.getJSONObject(index)
                    add(HistoryEntry(item.optLong("time"), item.optString("command"), item.optString("response")))
                }
            }
        }.getOrDefault(emptyList())
    }

    fun historyByteCount(): Int = (prefs.getString(KEY_HISTORY, "") ?: "").toByteArray().size

    fun clearHistory() = prefs.edit().remove(KEY_HISTORY).apply()

    fun clearAll() = prefs.edit().clear().apply()

    data class HistoryEntry(val timestamp: Long, val command: String, val response: String)

    private companion object {
        const val KEY_NAME = "assistant_name"
        const val KEY_WAKE_WORD = "wake_word"
        const val KEY_DEFAULT_LANGUAGE = "default_language"
        const val KEY_RESPONSE_MODE = "response_mode"
        const val KEY_RATE = "speech_rate"
        const val KEY_PITCH = "speech_pitch"
        const val KEY_AUTO_LISTEN = "auto_listen"
        const val KEY_HISTORY = "local_history"
        const val MAX_HISTORY = 100
    }
}
