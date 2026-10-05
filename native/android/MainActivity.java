package com.edgefolio.app;

import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

/**
 * App entry point (replaces the file `npx cap add android` generates).
 * Registers our first-party biometric plugin before the bridge starts.
 */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(EdgefolioBiometricPlugin.class);
        super.onCreate(savedInstanceState);
        // The Android WebView scales text with the phone's font-size setting,
        // which blew up the trades table layout on large-font phones. The app
        // sizes its own text, so pin the zoom to 100% for a consistent layout.
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView != null) {
            WebSettings settings = webView.getSettings();
            settings.setTextZoom(100);
        }
    }
}
