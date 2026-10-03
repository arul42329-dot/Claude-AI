package com.jarvis.offline

import android.Manifest
import android.app.AlertDialog
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import com.jarvis.offline.core.ActionOutcome
import com.jarvis.offline.core.AssistantPreferences
import com.jarvis.offline.core.AssistantState
import com.jarvis.offline.core.CommandExecutor
import com.jarvis.offline.core.CommandParser
import com.jarvis.offline.core.ParsedCommand
import com.jarvis.offline.core.ReplyLanguage
import com.jarvis.offline.device.AccessStatus
import com.jarvis.offline.voice.SpeechInput
import com.jarvis.offline.voice.SpeechOutput

class MainActivity : android.app.Activity(), SpeechInput.Listener, SpeechOutput.Callback {
    private lateinit var preferences: AssistantPreferences
    private lateinit var parser: CommandParser
    private lateinit var executor: CommandExecutor
    private lateinit var speechInput: SpeechInput
    private lateinit var speechOutput: SpeechOutput

    private lateinit var assistantNameText: TextView
    private lateinit var statusText: TextView
    private lateinit var helperText: TextView
    private lateinit var transcriptText: TextView
    private lateinit var responseText: TextView
    private lateinit var microphoneButton: Button
    private lateinit var permissionSummaryText: TextView

    private val handler = Handler(Looper.getMainLooper())
    private var currentState = AssistantState.IDLE
    private var isForeground = false
    private var pendingCommand: ParsedCommand? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        preferences = AssistantPreferences(this)
        parser = CommandParser(preferences)
        executor = CommandExecutor(this)
        speechInput = SpeechInput(this, preferences, this)
        speechOutput = SpeechOutput(this, preferences, this)
        bindViews()
        bindClicks()
        refreshUi()
    }

    override fun onResume() {
        super.onResume()
        isForeground = true
        refreshUi()
    }

    override fun onPause() {
        isForeground = false
        if (currentState == AssistantState.LISTENING) speechInput.cancel()
        super.onPause()
    }

    private fun bindViews() {
        assistantNameText = findViewById(R.id.assistantNameText)
        statusText = findViewById(R.id.statusText)
        helperText = findViewById(R.id.helperText)
        transcriptText = findViewById(R.id.transcriptText)
        responseText = findViewById(R.id.responseText)
        microphoneButton = findViewById(R.id.microphoneButton)
        permissionSummaryText = findViewById(R.id.permissionSummaryText)
    }

    private fun bindClicks() {
        microphoneButton.setOnClickListener {
            if (currentState == AssistantState.LISTENING) {
                speechInput.stop()
                updateState(AssistantState.THINKING, "Processing what I heard…")
            } else if (currentState != AssistantState.THINKING && currentState != AssistantState.EXECUTING) {
                beginListening()
            }
        }
        findViewById<Button>(R.id.settingsButton).setOnClickListener { startActivity(Intent(this, SettingsActivity::class.java)) }
        findViewById<Button>(R.id.permissionsButton).setOnClickListener { startActivity(Intent(this, PrivacyActivity::class.java)) }
        findViewById<Button>(R.id.openSettingsQuick).setOnClickListener { processText("open settings") }
        findViewById<Button>(R.id.batteryQuick).setOnClickListener { processText("battery percentage") }
        findViewById<Button>(R.id.helpButton).setOnClickListener { processText("what can you do") }
    }

    private fun beginListening() {
        if (!AccessStatus.hasPermission(this, Manifest.permission.RECORD_AUDIO)) {
            explainAndRequest(Manifest.permission.RECORD_AUDIO, "JARVIS needs microphone access to hear your commands. Audio is processed by your device speech service and raw recordings are never saved by JARVIS.")
            return
        }
        speechOutput.stop()
        transcriptText.text = "Listening…"
        responseText.text = ""
        updateState(AssistantState.LISTENING, "Listening for English or Tamil…")
        speechInput.start()
    }

    override fun onReady(offlineGuaranteed: Boolean) = runOnUiThread {
        helperText.text = if (offlineGuaranteed) "On-device recognition active. Speak naturally."
        else "Offline-preferred recognition. Install device language packs for fully offline speech."
    }

    override fun onPartial(text: String) = runOnUiThread {
        transcriptText.text = text
    }

    override fun onFinal(text: String) = runOnUiThread {
        transcriptText.text = text
        updateState(AssistantState.THINKING, "Understanding your request…")
        handler.post { processText(text) }
    }

    override fun onError(message: String) = runOnUiThread {
        responseText.text = message
        updateState(AssistantState.ERROR, "Listening needs attention")
        handler.postDelayed({ updateState(AssistantState.IDLE, "Tap to speak. Your voice stays on this device.") }, 1800)
    }

    override fun onEnd() = Unit

    private fun processText(text: String) {
        val command = parser.parse(text)
        updateState(AssistantState.EXECUTING, "Working locally…")
        val outcome = executor.execute(command)
        handleOutcome(command, outcome)
    }

    private fun handleOutcome(command: ParsedCommand, outcome: ActionOutcome) {
        when (outcome) {
            is ActionOutcome.Success -> answer(command, outcome.response)
            is ActionOutcome.Failure -> answer(command, outcome.response)
            is ActionOutcome.PermissionNeeded -> {
                pendingCommand = command
                responseText.text = outcome.explanation
                updateState(AssistantState.IDLE, "Permission needed")
                AlertDialog.Builder(this)
                    .setTitle("Permission needed")
                    .setMessage(outcome.explanation)
                    .setNegativeButton("Not now") { _, _ ->
                        pendingCommand = null
                        answer(command, localized(command, "Okay, I won't use that permission.", "சரி, அந்த அனுமதியை பயன்படுத்த மாட்டேன்."), saveHistory = true)
                    }
                    .setPositiveButton("Allow") { _, _ -> requestPermissions(arrayOf(outcome.permission), REQUEST_FEATURE_PERMISSION) }
                    .show()
            }
            is ActionOutcome.SpecialAccessNeeded -> {
                responseText.text = outcome.explanation
                updateState(AssistantState.IDLE, "Optional access required")
                preferences.addHistory(command.rawText, outcome.explanation)
                        updateState(AssistantState.SPEAKING, "Explaining required access…")
                speechOutput.speak(outcome.explanation, command.language)
                AlertDialog.Builder(this)
                    .setTitle(outcome.title)
                    .setMessage(outcome.explanation + "\n\nJARVIS will only use this access when you explicitly ask for a related command.")
                    .setNegativeButton("Not now", null)
                    .setPositiveButton("Open Android settings") { _, _ ->
                        runCatching { startActivity(Intent(outcome.settingsAction)) }
                            .onFailure { Toast.makeText(this, "Unable to open this Android settings page.", Toast.LENGTH_LONG).show() }
                    }
                    .show()
            }
        }
    }

    private fun answer(command: ParsedCommand, response: String, saveHistory: Boolean = true) {
        responseText.text = response
        if (saveHistory) preferences.addHistory(command.rawText, response)
        updateState(AssistantState.SPEAKING, "Speaking response…")
        speechOutput.speak(response, command.language)
    }

    private fun explainAndRequest(permission: String, explanation: String) {
        AlertDialog.Builder(this)
            .setTitle("Microphone permission")
            .setMessage(explanation)
            .setNegativeButton("Not now", null)
            .setPositiveButton("Allow") { _, _ -> requestPermissions(arrayOf(permission), REQUEST_MICROPHONE_PERMISSION) }
            .show()
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        val granted = grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED
        when (requestCode) {
            REQUEST_MICROPHONE_PERMISSION -> if (granted) beginListening() else {
                responseText.text = "Microphone permission was not granted. You can enable it later in Privacy & access."
                updateState(AssistantState.IDLE, "Microphone is off")
            }
            REQUEST_FEATURE_PERMISSION -> {
                val command = pendingCommand
                pendingCommand = null
                if (granted && command != null) processText(command.rawText)
                else if (command != null) answer(command, localized(command, "Permission was not granted, so I did not perform that action.", "அனுமதி வழங்கப்படவில்லை. அதனால் அந்த செயலை செய்யவில்லை."))
            }
        }
        refreshUi()
    }

    override fun onSpeechStarted() = runOnUiThread {
        updateState(AssistantState.SPEAKING, "Speaking response…")
    }

    override fun onSpeechDone() = runOnUiThread {
        updateState(AssistantState.IDLE, "Tap to speak. Your voice stays on this device.")
        if (preferences.autoListen && isForeground && !isFinishing) handler.postDelayed({ beginListening() }, 600)
    }

    override fun onSpeechUnavailable(language: ReplyLanguage) = runOnUiThread {
        val languageName = if (language == ReplyLanguage.TAMIL) "Tamil" else "English"
        responseText.text = "${responseText.text}\n\n$languageName text-to-speech voice is not installed. Install it in Android Text-to-speech settings; the response is still shown here."
        Toast.makeText(this, "$languageName TTS voice is unavailable on this device.", Toast.LENGTH_LONG).show()
    }

    private fun localized(command: ParsedCommand, english: String, tamil: String): String =
        if (command.language == ReplyLanguage.TAMIL) tamil else english

    private fun updateState(state: AssistantState, helper: String) {
        currentState = state
        val (label, color) = when (state) {
            AssistantState.IDLE -> "●  IDLE" to R.color.jarvis_cyan
            AssistantState.LISTENING -> "●  LISTENING" to R.color.jarvis_success
            AssistantState.THINKING -> "◌  THINKING" to R.color.jarvis_warning
            AssistantState.EXECUTING -> "◌  EXECUTING" to R.color.jarvis_warning
            AssistantState.SPEAKING -> "◉  SPEAKING" to R.color.jarvis_cyan
            AssistantState.ERROR -> "!  NEEDS ATTENTION" to R.color.jarvis_error
        }
        statusText.text = label
        statusText.setTextColor(getColor(color))
        helperText.text = helper
        microphoneButton.text = if (state == AssistantState.LISTENING) "■\nSTOP" else "◉\nTALK"
        microphoneButton.isEnabled = state != AssistantState.THINKING && state != AssistantState.EXECUTING
    }

    private fun refreshUi() {
        assistantNameText.text = preferences.assistantName.uppercase()
        val microphone = if (AccessStatus.hasPermission(this, Manifest.permission.RECORD_AUDIO)) "Microphone: enabled" else "Microphone: off"
        val access = if (AccessStatus.isAccessibilityEnabled(this)) "Accessibility: enabled" else "Accessibility: optional"
        permissionSummaryText.text = "$microphone • $access • Local-only data"
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        speechInput.shutdown()
        speechOutput.shutdown()
        super.onDestroy()
    }

    private companion object {
        const val REQUEST_MICROPHONE_PERMISSION = 501
        const val REQUEST_FEATURE_PERMISSION = 502
    }
}
