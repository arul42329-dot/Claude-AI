package com.edgefolio.app;

import android.os.Bundle;

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
    }
}
