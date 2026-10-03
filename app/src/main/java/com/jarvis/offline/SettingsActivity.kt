package com.jarvis.offline

import android.app.AlertDialog
import android.content.Intent
import android.os.Bundle
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.EditText
import android.widget.SeekBar
import android.widget.Spinner
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast
import com.jarvis.offline.core.AssistantPreferences
import com.jarvis.offline.device.AccessStatus
import java.util.Locale

class SettingsActivity : android.app.Activity() {
    private lateinit var preferences: AssistantPreferences
    private lateinit var nameInput: EditText
    private lateinit var wakeWordInput: EditText
    private lateinit var defaultLanguageSpinner: Spinner
    private lateinit var responseModeSpinner: Spinner
    private lateinit var speedSeekBar: SeekBar
    private lateinit var pitchSeekBar: SeekBar
    private lateinit var speedValue: TextView
    private lateinit var pitchValue: TextView
    private lateinit var autoListenSwitch: Switch
    private lateinit var accessSummaryText: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_settings)
        preferences = AssistantPreferences(this)
        bindViews()
        setUpSpinners()
        loadPreferences()
        bindActions()
    }

    override fun onResume() {
        super.onResume()
        if (::accessSummaryText.isInitialized) updateAccessSummary()
    }

    private fun bindViews() {
        nameInput = findViewById(R.id.nameInput)
        wakeWordInput = findViewById(R.id.wakeWordInput)
        defaultLanguageSpinner = findViewById(R.id.defaultLanguageSpinner)
        responseModeSpinner = findViewById(R.id.responseModeSpinner)
        speedSeekBar = findViewById(R.id.speedSeekBar)
        pitchSeekBar = findViewById(R.id.pitchSeekBar)
        speedValue = findViewById(R.id.speedValue)
        pitchValue = findViewById(R.id.pitchValue)
        autoListenSwitch = findViewById(R.id.autoListenSwitch)
        accessSummaryText = findViewById(R.id.accessSummaryText)
    }

    private fun setUpSpinners() {
        listOf(defaultLanguageSpinner, responseModeSpinner).forEach { spinner ->
            spinner.adapter = ArrayAdapter.createFromResource(this, if (spinner.id == R.id.defaultLanguageSpinner) R.array.language_choices else R.array.response_mode_choices, R.layout.spinner_item).apply {
                setDropDownViewResource(R.layout.spinner_item)
            }
        }
    }

    private fun loadPreferences() {
        nameInput.setText(preferences.assistantName)
        wakeWordInput.setText(preferences.wakeWord)
        defaultLanguageSpinner.setSelection(when (preferences.defaultLanguage) { "ENGLISH" -> 1; "TAMIL" -> 2; else -> 0 })
        responseModeSpinner.setSelection(when (preferences.responseMode) { "ENGLISH" -> 1; "TAMIL" -> 2; else -> 0 })
        speedSeekBar.progress = ((preferences.speechRate - 0.5f) * 20).toInt().coerceIn(0, 20)
        pitchSeekBar.progress = ((preferences.speechPitch - 0.5f) * 20).toInt().coerceIn(0, 20)
        autoListenSwitch.isChecked = preferences.autoListen
        renderVoiceValues()
        updateAccessSummary()
    }

    private fun bindActions() {
        findViewById<Button>(R.id.backButton).setOnClickListener { finish() }
        val listener = object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(seekBar: SeekBar?, progress: Int, fromUser: Boolean) = renderVoiceValues()
            override fun onStartTrackingTouch(seekBar: SeekBar?) = Unit
            override fun onStopTrackingTouch(seekBar: SeekBar?) = Unit
        }
        speedSeekBar.setOnSeekBarChangeListener(listener)
        pitchSeekBar.setOnSeekBarChangeListener(listener)
        findViewById<Button>(R.id.saveButton).setOnClickListener { save() }
        findViewById<Button>(R.id.privacyButton).setOnClickListener { startActivity(Intent(this, PrivacyActivity::class.java)) }
        findViewById<Button>(R.id.clearHistoryButton).setOnClickListener { confirmClearHistory() }
    }

    private fun renderVoiceValues() {
        speedValue.text = String.format(Locale.US, "%.2fx", sliderValue(speedSeekBar))
        pitchValue.text = String.format(Locale.US, "%.2fx", sliderValue(pitchSeekBar))
    }

    private fun sliderValue(bar: SeekBar): Float = 0.5f + bar.progress / 20f

    private fun save() {
        preferences.assistantName = nameInput.text.toString()
        preferences.wakeWord = wakeWordInput.text.toString()
        preferences.defaultLanguage = when (defaultLanguageSpinner.selectedItemPosition) { 1 -> "ENGLISH"; 2 -> "TAMIL"; else -> "AUTO" }
        preferences.responseMode = when (responseModeSpinner.selectedItemPosition) { 1 -> "ENGLISH"; 2 -> "TAMIL"; else -> "DETECTED" }
        preferences.speechRate = sliderValue(speedSeekBar)
        preferences.speechPitch = sliderValue(pitchSeekBar)
        preferences.autoListen = autoListenSwitch.isChecked
        Toast.makeText(this, "Saved locally on this device.", Toast.LENGTH_SHORT).show()
        finish()
    }

    private fun updateAccessSummary() {
        val mic = if (AccessStatus.hasPermission(this, android.Manifest.permission.RECORD_AUDIO)) "Microphone enabled" else "Microphone off"
        val contacts = if (AccessStatus.hasPermission(this, android.Manifest.permission.READ_CONTACTS)) "Contacts enabled" else "Contacts off"
        val phone = if (AccessStatus.hasPermission(this, android.Manifest.permission.CALL_PHONE)) "Phone calls enabled" else "Phone calls off"
        val accessibility = if (AccessStatus.isAccessibilityEnabled(this)) "Accessibility enabled" else "Accessibility off"
        val notifications = if (AccessStatus.isNotificationAccessEnabled(this)) "Notification access enabled" else "Notification access off"
        accessSummaryText.text = listOf(mic, contacts, phone, accessibility, notifications).joinToString("\n")
    }

    private fun confirmClearHistory() {
        AlertDialog.Builder(this)
            .setTitle("Clear local command history?")
            .setMessage("This removes saved command transcripts and responses from this device. It cannot be undone.")
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Clear") { _, _ ->
                preferences.clearHistory()
                Toast.makeText(this, "Local command history cleared.", Toast.LENGTH_SHORT).show()
            }.show()
    }
}
