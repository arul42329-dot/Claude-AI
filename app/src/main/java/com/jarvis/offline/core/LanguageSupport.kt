package com.jarvis.offline.core

import java.util.Locale

object LanguageSupport {
    private val tamilSignals = listOf(
        "pannu", "panunga", "pannunga", "enna", "thira", "thir", "venum", "konjam",
        "irukku", "illa", "yaar", "neenga", "ungal", "amma", "appa", "tamil", "tamilil"
    )

    fun detectedLanguage(text: String): ReplyLanguage {
        val hasTamilScript = text.any { it in '\u0B80'..'\u0BFF' }
        val lower = text.lowercase(Locale.ROOT)
        return if (hasTamilScript || tamilSignals.any { lower.contains(it) }) ReplyLanguage.TAMIL else ReplyLanguage.ENGLISH
    }

    fun replyLanguage(text: String, responseMode: String): ReplyLanguage = when (responseMode) {
        "ENGLISH" -> ReplyLanguage.ENGLISH
        "TAMIL" -> ReplyLanguage.TAMIL
        else -> detectedLanguage(text)
    }

    fun inLanguage(language: ReplyLanguage, english: String, tamil: String): String =
        if (language == ReplyLanguage.TAMIL) tamil else english

    fun isTamilScript(text: String): Boolean = text.any { it in '\u0B80'..'\u0BFF' }
}
