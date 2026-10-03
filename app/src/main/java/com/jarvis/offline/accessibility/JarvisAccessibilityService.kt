package com.jarvis.offline.accessibility

import android.accessibilityservice.AccessibilityService
import android.view.accessibility.AccessibilityNodeInfo

/**
 * Optional and visibly named Android Accessibility service. It only reacts to explicit in-app
 * voice commands; it has no background workflow, no hidden actions, and no network behavior.
 */
class JarvisAccessibilityService : AccessibilityService() {
    override fun onServiceConnected() {
        super.onServiceConnected()
        activeService = this
    }

    override fun onAccessibilityEvent(event: android.view.accessibility.AccessibilityEvent?) = Unit

    override fun onInterrupt() = Unit

    override fun onDestroy() {
        if (activeService === this) activeService = null
        super.onDestroy()
    }

    fun tapVisibleText(text: String): Boolean {
        val matches = rootInActiveWindow?.findAccessibilityNodeInfosByText(text).orEmpty()
        val target = matches.firstNotNullOfOrNull { clickableParent(it) }
        return target?.performAction(AccessibilityNodeInfo.ACTION_CLICK) == true
    }

    fun scroll(forward: Boolean): Boolean {
        val root = rootInActiveWindow ?: return false
        val node = findScrollable(root) ?: return false
        return node.performAction(if (forward) AccessibilityNodeInfo.ACTION_SCROLL_FORWARD else AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD)
    }

    fun readScreen(maxCharacters: Int = 420): String? {
        val root = rootInActiveWindow ?: return null
        val pieces = mutableListOf<String>()
        collectText(root, pieces, maxCharacters)
        return pieces.joinToString(". ").take(maxCharacters).takeIf { it.isNotBlank() }
    }

    private fun clickableParent(node: AccessibilityNodeInfo?): AccessibilityNodeInfo? {
        var current = node
        repeat(8) {
            if (current?.isClickable == true && current?.isEnabled == true) return current
            current = current?.parent
        }
        return null
    }

    private fun findScrollable(node: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        if (node.isScrollable) return node
        for (index in 0 until node.childCount) {
            node.getChild(index)?.let { child -> findScrollable(child)?.let { return it } }
        }
        return null
    }

    private fun collectText(node: AccessibilityNodeInfo, pieces: MutableList<String>, max: Int) {
        if (pieces.joinToString().length >= max) return
        node.text?.toString()?.trim()?.takeIf { it.isNotBlank() }?.let { pieces.add(it) }
        node.contentDescription?.toString()?.trim()?.takeIf { it.isNotBlank() && it !in pieces }?.let { pieces.add(it) }
        for (index in 0 until node.childCount) node.getChild(index)?.let { collectText(it, pieces, max) }
    }

    companion object {
        @Volatile private var activeService: JarvisAccessibilityService? = null
        fun active(): JarvisAccessibilityService? = activeService
    }
}
