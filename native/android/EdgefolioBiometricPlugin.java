package com.edgefolio.app;

import android.os.Build;
import android.util.Log;

import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.concurrent.Executor;

/**
 * Tiny first-party plugin: Android BiometricPrompt (fingerprint / face / PIN)
 * used by the app-lock screen. No npm package needed — this file is copied
 * into the CI-generated Android project by the build workflow.
 */
@CapacitorPlugin(name = "EdgefolioBiometric")
public class EdgefolioBiometricPlugin extends Plugin {

    private static final String TAG = "EdgefolioBiometric";

    private int authenticators() {
        // Weak biometrics + device credential: fingerprint/face, or the phone's
        // PIN/pattern when no biometric hardware is enrolled.
        return BiometricManager.Authenticators.BIOMETRIC_WEAK
                | BiometricManager.Authenticators.DEVICE_CREDENTIAL;
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        try {
            BiometricManager bm = BiometricManager.from(getContext());
            int code = bm.canAuthenticate(authenticators());
            JSObject ret = new JSObject();
            ret.put("available", code == BiometricManager.BIOMETRIC_SUCCESS);
            ret.put("code", code);
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "isAvailable failed", e);
            call.reject("biometric check failed");
        }
    }

    @PluginMethod
    public void verify(PluginCall call) {
        String title = call.getString("title");
        if (title == null) title = "Unlock Edgefolio";
        String subtitle = call.getString("subtitle");

        try {
            if (!(getActivity() instanceof FragmentActivity)) {
                call.reject("activity is not a FragmentActivity");
                return;
            }
            FragmentActivity activity = (FragmentActivity) getActivity();

            BiometricManager bm = BiometricManager.from(getContext());
            int code = bm.canAuthenticate(authenticators());
            if (code != BiometricManager.BIOMETRIC_SUCCESS) {
                // Nothing enrolled / no hardware — report calmly, don't crash.
                JSObject ret = new JSObject();
                ret.put("ok", false);
                ret.put("code", code);
                call.resolve(ret);
                return;
            }

            Executor executor = ContextCompat.getMainExecutor(getContext());
            BiometricPrompt.PromptInfo.Builder builder = new BiometricPrompt.PromptInfo.Builder()
                    .setTitle(title)
                    .setConfirmationRequired(false);
            if (subtitle != null && !subtitle.isEmpty()) {
                builder.setSubtitle(subtitle);
            }
            if (Build.VERSION.SDK_INT >= 30) {
                builder.setAllowedAuthenticators(authenticators());
            } else {
                // DEVICE_CREDENTIAL in setAllowedAuthenticators is API 30+;
                // on older Android use the (still functional) legacy switch.
                builder.setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_WEAK);
                builder.setDeviceCredentialAllowed(true);
            }

            BiometricPrompt prompt = new BiometricPrompt(activity, executor,
                    new BiometricPrompt.AuthenticationCallback() {
                        @Override
                        public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                            JSObject ret = new JSObject();
                            ret.put("ok", true);
                            call.resolve(ret);
                        }

                        @Override
                        public void onAuthenticationError(int errorCode, CharSequence errString) {
                            // User cancelled / too many attempts / lockout — resolve
                            // (not reject) so the app falls back to the PIN screen.
                            JSObject ret = new JSObject();
                            ret.put("ok", false);
                            ret.put("code", errorCode);
                            ret.put("message", String.valueOf(errString));
                            call.resolve(ret);
                        }
                    });
            prompt.authenticate(builder.build());
        } catch (Exception e) {
            Log.e(TAG, "verify failed", e);
            call.reject("biometric prompt failed");
        }
    }
}
