package com.edgefolio.app;

import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;

import com.capacitorjs.plugins.localnotifications.LocalNotificationsPlugin;
import com.getcapacitor.BridgeActivity;

/**
 * App entry point (replaces the file `npx cap add android` generates).
 * Registers our first-party biometric plugin and the local-notifications
 * plugin explicitly before the bridge starts, so notifications are always
 * available even if automatic plugin discovery ever falls short.
 */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(EdgefolioBiometricPlugin.class);
        registerPlugin(LocalNotificationsPlugin.class);
        super.onCreate(savedInstanceState);
        // The Android WebView scales text with the phone's font-size setting,
        // which blew up the trades table layout on large-font phones. The app
        // sizes its own text, so pin the zoom to 100% for a consistent layout.
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView != null) {
            WebSettings settings = webView.getSettings();
            settings.setTextZoom(100);
            // True-black WebView surface: this is the colour the system shows
            // when the page is transparent and during overscroll — without it
            // AMOLED mode showed a graphite strip when scrolling past the end.
            webView.setBackgroundColor(android.graphics.Color.BLACK);
        }
    }
}
