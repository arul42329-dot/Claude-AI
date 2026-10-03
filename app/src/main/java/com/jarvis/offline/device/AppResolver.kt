package com.jarvis.offline.device

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import java.util.Locale

/** Finds real, launchable installed apps without QUERY_ALL_PACKAGES. */
class AppResolver(private val context: Context) {
    data class ResolvedApp(val label: String, val packageName: String, val launchIntent: Intent)

    fun resolve(spokenName: String): ResolvedApp? {
        val wanted = normalize(spokenName)
        knownPackageFor(wanted)?.let { packageName ->
            context.packageManager.getLaunchIntentForPackage(packageName)?.let { launch ->
                return ResolvedApp(appLabel(packageName), packageName, launch)
            }
        }

        val launcherIntent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        val activities = context.packageManager.queryIntentActivities(launcherIntent, PackageManager.MATCH_ALL)
        return activities
            .mapNotNull { info ->
                val label = info.loadLabel(context.packageManager).toString()
                val packageName = info.activityInfo.packageName
                val launch = context.packageManager.getLaunchIntentForPackage(packageName) ?: return@mapNotNull null
                Candidate(label, packageName, launch, score(wanted, normalize(label), packageName))
            }
            .filter { it.score > 0 }
            .maxByOrNull { it.score }
            ?.let { ResolvedApp(it.label, it.packageName, it.intent) }
    }

    private fun appLabel(packageName: String): String = runCatching {
        context.packageManager.getApplicationLabel(context.packageManager.getApplicationInfo(packageName, 0)).toString()
    }.getOrDefault(packageName)

    private fun knownPackageFor(name: String): String? = when (name) {
        "youtube", "you tube" -> "com.google.android.youtube"
        "whatsapp", "whats app" -> "com.whatsapp"
        "maps", "google maps", "map" -> "com.google.android.apps.maps"
        "chrome", "google chrome" -> "com.android.chrome"
        "instagram" -> "com.instagram.android"
        "facebook" -> "com.facebook.katana"
        "telegram" -> "org.telegram.messenger"
        "spotify" -> "com.spotify.music"
        else -> null
    }

    private fun normalize(value: String): String = value.lowercase(Locale.ROOT)
        .replace(Regex("[^a-z0-9\u0B80-\u0BFF ]"), " ")
        .replace(Regex("\\s+"), " ")
        .trim()
        .removePrefix("the ")
        .removeSuffix(" app")

    private fun score(wanted: String, label: String, packageName: String): Int = when {
        wanted == label -> 100
        packageName.endsWith(".$wanted") || packageName.contains(wanted.replace(" ", "")) -> 85
        label.contains(wanted) -> 70
        wanted.contains(label) && label.length > 2 -> 50
        else -> 0
    }

    private data class Candidate(val label: String, val packageName: String, val intent: Intent, val score: Int)
}
