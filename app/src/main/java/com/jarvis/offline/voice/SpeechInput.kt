package com.jarvis.offline.voice

import android.content.Context
import android.content.Intent
import android.os.Build
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import com.jarvis.offline.core.AssistantPreferences

/** Android speech layer: on-device recognizer when supplied by the phone, offline-preferred otherwise. */
class SpeechInput(
    private val context: Context,
    private val preferences: AssistantPreferences,
    private val listener: Listener
) : RecognitionListener {
    interface Listener {
        fun onReady(offlineGuaranteed: Boolean)
        fun onPartial(text: String)
        fun onFinal(text: String)
        fun onError(message: String)
        fun onEnd()
    }

    private var recognizer: SpeechRecognizer? = null
    private var usingOnDevice = false

    fun start() {
        destroyRecognizer()
        usingOnDevice = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && SpeechRecognizer.isOnDeviceRecognitionAvailable(context)
        recognizer = if (usingOnDevice) SpeechRecognizer.createOnDeviceSpeechRecognizer(context) else SpeechRecognizer.createSpeechRecognizer(context)
        recognizer?.setRecognitionListener(this)
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
            // This tells legacy device recognizers to use a downloaded/offline language pack if possible.
            putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
            when (preferences.defaultLanguage) {
                "ENGLISH" -> putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-IN")
                "TAMIL" -> putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ta-IN")
                else -> if (Build.VERSION.SDK_INT >= 34) putExtra("android.speech.extra.ENABLE_LANGUAGE_DETECTION", true)
            }
        }
        recognizer?.startListening(intent)
    }

    fun stop() = recognizer?.stopListening()

    fun cancel() = recognizer?.cancel()

    fun shutdown() = destroyRecognizer()

    override fun onReadyForSpeech(params: android.os.Bundle?) = listener.onReady(usingOnDevice)
    override fun onBeginningOfSpeech() = Unit
    override fun onRmsChanged(rmsdB: Float) = Unit
    override fun onBufferReceived(buffer: ByteArray?) = Unit
    override fun onEndOfSpeech() = listener.onEnd()
    override fun onError(error: Int) = listener.onError(errorMessage(error))
    override fun onResults(results: android.os.Bundle?) {
        val spoken = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
            ?.firstOrNull()
            ?.trim()
        if (spoken.isNullOrBlank()) listener.onError("I did not hear a command. Please try again.") else listener.onFinal(spoken)
    }
    override fun onPartialResults(partialResults: android.os.Bundle?) {
        partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.let(listener::onPartial)
    }
    override fun onEvent(eventType: Int, params: android.os.Bundle?) = Unit

    private fun destroyRecognizer() {
        recognizer?.destroy()
        recognizer = null
    }

    private fun errorMessage(error: Int): String = when (error) {
        SpeechRecognizer.ERROR_AUDIO -> "There was an audio problem. Check your microphone."
        SpeechRecognizer.ERROR_CLIENT -> "Listening was cancelled. Try the microphone button again."
        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Microphone permission is required to listen."
        SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "No offline speech recognizer was available. Install an offline language pack or on-device speech service, then try again."
        SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "I did not catch that. Please try again."
        SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "The speech recognizer is busy. Please try again."
        SpeechRecognizer.ERROR_SERVER -> "The device speech service is unavailable. Install or enable an offline speech language pack."
        else -> "Speech recognition is unavailable on this device. Install an offline language pack and try again."
    }
}
