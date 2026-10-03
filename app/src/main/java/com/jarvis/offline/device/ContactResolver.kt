package com.jarvis.offline.device

import android.content.Context
import android.provider.ContactsContract

/** Reads a matching phone number only after READ_CONTACTS was granted for a call/search request. */
class ContactResolver(private val context: Context) {
    data class ContactMatch(val displayName: String, val phoneNumber: String)

    fun findFirst(query: String): ContactMatch? {
        val projection = arrayOf(
            ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
            ContactsContract.CommonDataKinds.Phone.NUMBER
        )
        val selection = "${ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME} LIKE ?"
        val cursor = context.contentResolver.query(
            ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
            projection,
            selection,
            arrayOf("%${query.trim()}%"),
            "${ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME} ASC"
        ) ?: return null
        cursor.use {
            if (!it.moveToFirst()) return null
            return ContactMatch(
                it.getString(it.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME)),
                it.getString(it.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Phone.NUMBER))
            )
        }
    }

    fun normalizePhone(value: String): String? {
        val cleaned = value.filter { it.isDigit() || it == '+' }
        return cleaned.takeIf { phone -> phone.count { character -> character.isDigit() } >= 3 }
    }
}
