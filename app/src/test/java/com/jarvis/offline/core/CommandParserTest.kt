package com.jarvis.offline.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CommandParserTest {
    private val settings = object : AssistantCommandSettings {
        override val assistantName = "JARVIS"
        override val wakeWord = "Hey JARVIS"
        override val responseMode = "DETECTED"
    }
    private val parser = CommandParser(settings)

    @Test fun `maps English app command`() {
        val command = parser.parse("Open YouTube")
        assertEquals(CommandType.OPEN_APP, command.type)
        assertEquals("youtube", command.target)
        assertEquals(ReplyLanguage.ENGLISH, command.language)
    }

    @Test fun `maps Tamil English mixed aliases`() {
        assertEquals(CommandType.OPEN_APP, parser.parse("WhatsApp open pannu").type)
        assertEquals(ReplyLanguage.TAMIL, parser.parse("WhatsApp open pannu").language)
        assertEquals(CommandType.OPEN_BLUETOOTH_SETTINGS, parser.parse("Bluetooth on pannu").type)
        assertEquals(CommandType.VOLUME_UP, parser.parse("Volume konjam increase pannu").type)
    }

    @Test fun `accepts wake phrase before an action`() {
        val command = parser.parse("Hey JARVIS open camera")
        assertEquals(CommandType.OPEN_APP, command.type)
        assertEquals("camera", command.target)
    }

    @Test fun `maps alarm timer reminder and draft message`() {
        assertEquals(CommandType.SET_ALARM, parser.parse("Alarm set pannu 6 AM").type)
        assertEquals(CommandType.SET_TIMER, parser.parse("Set timer 5 minutes").type)
        val reminder = parser.parse("Remind me to drink water in 10 minutes")
        assertEquals(CommandType.CREATE_REMINDER, reminder.type)
        assertEquals("drink water", reminder.target)
        assertEquals("10", reminder.value)
        val message = parser.parse("Send message to Ravi saying I will call you")
        assertEquals(CommandType.COMPOSE_MESSAGE, message.type)
        assertEquals("ravi", message.target)
        assertTrue(message.value!!.contains("i will call you"))
    }

    @Test fun `maps Tamil script camera command`() {
        val command = parser.parse("கேமரா திற")
        assertEquals(CommandType.OPEN_APP, command.type)
        assertEquals(ReplyLanguage.TAMIL, command.language)
    }
}
