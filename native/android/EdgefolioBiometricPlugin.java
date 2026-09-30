package com.edgefolio.app;

import android.app.AlarmManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
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
 * used by the app-lock screen, plus a few device-setting helpers for
 * notifications. No npm package needed — this file is copied into the
 * CI-generated Android project by the build workflow.
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

    // ---------------- Notification / alarm helpers ----------------

    /** Deep-link straight to this app's notification page in system settings. */
    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                    .putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
            getActivity().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            Log.e(TAG, "openNotificationSettings failed", e);
            call.reject("could not open notification settings");
        }
    }

    /** Whether exact alarms are allowed (Android 12+ "Alarms & reminders"). */
    @PluginMethod
    public void exactAlarmState(PluginCall call) {
        try {
            AlarmManager am = (AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
            JSObject ret = new JSObject();
            ret.put("exact", Build.VERSION.SDK_INT < 31 || am == null || am.canScheduleExactAlarms());
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "exactAlarmState failed", e);
            call.reject("alarm check failed");
        }
    }

    /** Deep-link to the "Alarms & reminders" permission page (Android 12+). */
    @PluginMethod
    public void openExactAlarmSettings(PluginCall call) {
        try {
            Intent intent;
            if (Build.VERSION.SDK_INT >= 31) {
                intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                        Uri.parse("package:" + getContext().getPackageName()));
            } else {
                intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                        Uri.parse("package:" + getContext().getPackageName()));
            }
            getActivity().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            Log.e(TAG, "openExactAlarmSettings failed", e);
            call.reject("could not open alarm settings");
        }
    }
}
