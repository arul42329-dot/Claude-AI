package com.jarvis.offline.voice

import android.content.Context
import android.speech.tts.TextToSpeech
import com.jarvis.offline.core.AssistantPreferences
import com.jarvis.offline.core.ReplyLanguage
import java.util.Locale

/** Uses the device's installed TextToSpeech engine. No response text leaves the device. */
class SpeechOutput(
    context: Context,
    private val preferences: AssistantPreferences,
    private val callback: Callback
) {
    interface Callback {
        fun onSpeechStarted()
        fun onSpeechDone()
        fun onSpeechUnavailable(language: ReplyLanguage)
    }

    private var ready = false
    private var pending: Pair<String, ReplyLanguage>? = null
    private val textToSpeech = TextToSpeech(context.applicationContext) { status ->
        ready = status == TextToSpeech.SUCCESS
        val request = pending
        pending = null
        if (ready && request != null) speak(request.first, request.second)
        else if (!ready && request != null) {
            callback.onSpeechUnavailable(request.second)
            callback.onSpeechDone()
        }
    }.apply {
        setOnUtteranceProgressListener(object : android.speech.tts.UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) = callback.onSpeechStarted()
            override fun onDone(utteranceId: String?) = callback.onSpeechDone()
            @Deprecated("Deprecated in Java")
            override fun onError(utteranceId: String?) = callback.onSpeechDone()
            override fun onError(utteranceId: String?, errorCode: Int) = callback.onSpeechDone()
        })
    }

    fun speak(text: String, language: ReplyLanguage) {
        if (!ready) {
            pending = text to language
            return
        }
        val locale = if (language == ReplyLanguage.TAMIL) Locale("ta", "IN") else Locale("en", "IN")
        val availability = textToSpeech.setLanguage(locale)
        val textToSpeak: String = if (availability == TextToSpeech.LANG_MISSING_DATA || availability == TextToSpeech.LANG_NOT_SUPPORTED) {
            callback.onSpeechUnavailable(language)
            textToSpeech.language = Locale("en", "IN")
            if (language == ReplyLanguage.TAMIL) {
                "Tamil text to speech is not installed. Your response is shown on screen."
            } else {
                "English text to speech is not installed. Your response is shown on screen."
            }
        } else text
        textToSpeech.setSpeechRate(preferences.speechRate)
        textToSpeech.setPitch(preferences.speechPitch)
        textToSpeech.speak(textToSpeak, TextToSpeech.QUEUE_FLUSH, null, "jarvis-response")
    }

    fun stop() {
        pending = null
        textToSpeech.stop()
    }

    fun shutdown() = textToSpeech.shutdown()
}
