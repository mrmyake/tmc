package nl.themovementclub.akiles;

import android.Manifest;
import android.os.Build;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import app.akiles.sdk.ActionBluetoothStatus;
import app.akiles.sdk.ActionCallback;
import app.akiles.sdk.ActionInternetStatus;
import app.akiles.sdk.ActionOptions;
import app.akiles.sdk.Akiles;
import app.akiles.sdk.AkilesException;
import app.akiles.sdk.Callback;
import app.akiles.sdk.Gadget;
import app.akiles.sdk.GadgetAction;

import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Capacitor-plugin "Akiles" voor Android (workstream E2, spec-akiles-access.md).
 * Zelfde JS-contract als de iOS-bridge (src/definitions.ts). Geschreven
 * tegen de Akiles Android SDK 2.6.0 zoals de officiele Cordova-plugin hem
 * gebruikt (github.com/akiles/akiles-cordova, plugin/src/android).
 *
 * Permissies lopen via Capacitor, niet via de PermissionRequester van de
 * SDK: Capacitor routeert legacy permission-results niet meer naar een
 * plugin met @CapacitorPlugin, dus de plugin vraagt de Bluetooth-permissie
 * zelf (requestPermissionForAlias) en roept de SDK daarna aan met
 * requestBluetoothPermission = false. Op API 31+ zijn dat BLUETOOTH_SCAN en
 * BLUETOOTH_CONNECT; op API 29 en 30 vereist BLE-scannen ACCESS_FINE_LOCATION;
 * onder API 29 ondersteunt de SDK geen Bluetooth (NOT_AVAILABLE).
 *
 * Het token komt binnen via initialize(), gaat een keer naar addSession en
 * wordt nergens bewaard of gelogd.
 */
@CapacitorPlugin(
    name = "Akiles",
    permissions = {
        @Permission(alias = AkilesPlugin.ALIAS_BLUETOOTH, strings = { Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT }),
        @Permission(alias = AkilesPlugin.ALIAS_LOCATION, strings = { Manifest.permission.ACCESS_FINE_LOCATION })
    }
)
public class AkilesPlugin extends Plugin {

    static final String ALIAS_BLUETOOTH = "bluetooth";
    static final String ALIAS_LOCATION = "location";

    private Akiles ak;

    @Override
    public void load() {
        ak = new Akiles(getActivity());
        // De plugin regelt permissies zelf; de SDK mag ze niet zelf gaan vragen.
        ak.setPermissionRequester((permissions, requestCode) -> false);
    }

    // ------------------------------------------------------------------
    // Sessie
    // ------------------------------------------------------------------

    @PluginMethod
    public void initialize(PluginCall call) {
        String token = call.getString("token");
        if (token == null || token.trim().isEmpty()) {
            reject(call, "INVALID_TOKEN", "initialize() requires a non-empty token", null);
            return;
        }
        final String trimmed = token.trim();
        getBridge().execute(() -> {
            // Precies een sessie per toestel: oude sessies eerst weg.
            try {
                ak.removeAllSessions();
            } catch (AkilesException ignored) {
                // Geen blokkade.
            }
            ak.addSession(trimmed, new Callback<String>() {
                @Override
                public void onSuccess(String sessionId) {
                    JSObject result = new JSObject();
                    result.put("sessionId", sessionId);
                    call.resolve(result);
                }

                @Override
                public void onError(AkilesException e) {
                    rejectWithSdkError(call, e, null);
                }
            });
        });
    }

    @PluginMethod
    public void getSession(PluginCall call) {
        getBridge().execute(() -> {
            try {
                String[] ids = ak.getSessionIDs();
                JSObject result = new JSObject();
                if (ids != null && ids.length > 0) {
                    result.put("sessionId", ids[0]);
                } else {
                    result.put("sessionId", JSObject.NULL);
                }
                call.resolve(result);
            } catch (AkilesException e) {
                rejectWithSdkError(call, e, null);
            }
        });
    }

    @PluginMethod
    public void refresh(PluginCall call) {
        getBridge().execute(() -> {
            String sessionId = currentSessionId();
            if (sessionId == null) {
                reject(call, "NO_SESSION", "No Akiles session on this device; call initialize() first", null);
                return;
            }
            ak.refreshSession(sessionId, new Callback<Void>() {
                @Override
                public void onSuccess(Void unused) {
                    call.resolve();
                }

                @Override
                public void onError(AkilesException e) {
                    rejectWithSdkError(call, e, null);
                }
            });
        });
    }

    @PluginMethod
    public void clearSession(PluginCall call) {
        getBridge().execute(() -> {
            try {
                ak.removeAllSessions();
                call.resolve();
            } catch (AkilesException e) {
                rejectWithSdkError(call, e, null);
            }
        });
    }

    // ------------------------------------------------------------------
    // Gadgets
    // ------------------------------------------------------------------

    @PluginMethod
    public void getGadgets(PluginCall call) {
        getBridge().execute(() -> {
            String sessionId = currentSessionId();
            if (sessionId == null) {
                reject(call, "NO_SESSION", "No Akiles session on this device; call initialize() first", null);
                return;
            }
            try {
                Gadget[] gadgets = ak.getGadgets(sessionId);
                JSArray list = new JSArray();
                if (gadgets != null) {
                    for (Gadget gadget : gadgets) {
                        list.put(gadgetToJson(gadget));
                    }
                }
                JSObject result = new JSObject();
                result.put("gadgets", list);
                call.resolve(result);
            } catch (AkilesException e) {
                rejectWithSdkError(call, e, null);
            }
        });
    }

    // ------------------------------------------------------------------
    // Openen
    // ------------------------------------------------------------------

    @PluginMethod
    public void open(PluginCall call) {
        String gadgetId = call.getString("gadgetId");
        if (gadgetId == null || gadgetId.isEmpty()) {
            reject(call, "INVALID_TOKEN", "open() requires gadgetId", null);
            return;
        }
        String alias = requiredPermissionAlias();
        if (alias == null) {
            reject(call, "NOT_AVAILABLE", "Opening via Bluetooth requires Android 10 (API 29) or newer", null);
            return;
        }
        if (getPermissionState(alias) == PermissionState.GRANTED) {
            runOpen(call);
        } else {
            requestPermissionForAlias(alias, call, "openPermissionCallback");
        }
    }

    @PermissionCallback
    private void openPermissionCallback(PluginCall call) {
        String alias = requiredPermissionAlias();
        if (alias != null && getPermissionState(alias) == PermissionState.GRANTED) {
            runOpen(call);
            return;
        }
        JSObject data = new JSObject();
        data.put("permanent", false);
        reject(call, "BLUETOOTH_PERMISSION_DENIED", "Bluetooth permission not granted", data);
    }

    /** API 31+: Bluetooth-permissies; API 29 en 30: fijne locatie (BLE-scan); daaronder niet ondersteund. */
    private String requiredPermissionAlias() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) return ALIAS_BLUETOOTH;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) return ALIAS_LOCATION;
        return null;
    }

    private void runOpen(PluginCall call) {
        final String gadgetId = call.getString("gadgetId");
        final String requestedActionId = call.getString("actionId");

        getBridge().execute(() -> {
            String sessionId = currentSessionId();
            if (sessionId == null) {
                reject(call, "NO_SESSION", "No Akiles session on this device; call initialize() first", null);
                return;
            }

            String actionId = requestedActionId;
            if (actionId == null || actionId.isEmpty()) {
                try {
                    Gadget[] gadgets = ak.getGadgets(sessionId);
                    Gadget match = null;
                    if (gadgets != null) {
                        for (Gadget gadget : gadgets) {
                            if (gadgetId.equals(gadget.id)) {
                                match = gadget;
                                break;
                            }
                        }
                    }
                    if (match == null) {
                        JSObject data = new JSObject();
                        data.put("reason", "OTHER");
                        reject(call, "DENIED_BY_AKILES", "Gadget " + gadgetId + " is not available for this member", data);
                        return;
                    }
                    if (match.actions == null || match.actions.length == 0) {
                        JSObject data = new JSObject();
                        data.put("reason", "OTHER");
                        reject(call, "DENIED_BY_AKILES", "Gadget " + gadgetId + " has no actions for this member", data);
                        return;
                    }
                    actionId = match.actions[0].id;
                } catch (AkilesException e) {
                    rejectWithSdkError(call, e, null);
                    return;
                }
            }

            ActionOptions options = new ActionOptions();
            options.requestBluetoothPermission = false;
            options.requestLocationPermission = false;
            options.useInternet = false;
            options.useBluetooth = true;

            final AtomicBoolean finished = new AtomicBoolean(false);
            final AkilesException[] lastBluetoothError = new AkilesException[1];

            ak.action(sessionId, gadgetId, actionId, options, new ActionCallback() {
                @Override
                public void onSuccess() {
                    if (finished.compareAndSet(false, true)) {
                        JSObject result = new JSObject();
                        result.put("method", "bluetooth");
                        call.resolve(result);
                    }
                }

                @Override
                public void onError(AkilesException e) {
                    if (finished.compareAndSet(false, true)) {
                        rejectWithSdkError(call, e, lastBluetoothError[0]);
                    }
                }

                @Override
                public void onInternetStatus(ActionInternetStatus status) {}

                @Override
                public void onInternetSuccess() {}

                @Override
                public void onInternetError(AkilesException e) {}

                @Override
                public void onBluetoothStatus(ActionBluetoothStatus status) {
                    JSObject event = new JSObject();
                    event.put("status", status.toString());
                    notifyListeners("openStatus", event);
                }

                @Override
                public void onBluetoothStatusProgress(float percent) {
                    JSObject event = new JSObject();
                    event.put("status", "EXECUTING_ACTION");
                    event.put("percent", percent);
                    notifyListeners("openStatus", event);
                }

                @Override
                public void onBluetoothSuccess() {}

                @Override
                public void onBluetoothError(AkilesException e) {
                    lastBluetoothError[0] = e;
                }
            });
        });
    }

    // ------------------------------------------------------------------
    // Hulpfuncties
    // ------------------------------------------------------------------

    private String currentSessionId() {
        try {
            String[] ids = ak.getSessionIDs();
            return ids != null && ids.length > 0 ? ids[0] : null;
        } catch (AkilesException e) {
            return null;
        }
    }

    private static JSObject gadgetToJson(Gadget gadget) {
        JSObject obj = new JSObject();
        obj.put("id", gadget.id);
        obj.put("name", gadget.name);
        JSArray actions = new JSArray();
        if (gadget.actions != null) {
            for (GadgetAction action : gadget.actions) {
                JSObject a = new JSObject();
                a.put("id", action.id);
                a.put("name", action.name);
                actions.put(a);
            }
        }
        obj.put("actions", actions);
        return obj;
    }

    private static void reject(PluginCall call, String code, String message, JSObject data) {
        call.reject(message, code, data == null ? new JSObject() : data);
    }

    /**
     * Zelfde vertaling als AkilesErrorMapping.swift. AkilesException.code is de
     * SDK-ErrorCode; de naam (INVALID_SESSION, ...) is gelijk aan die op iOS.
     * Bij ALL_COMM_METHODS_FAILED is de Bluetooth-fout de informatieve.
     */
    private static void rejectWithSdkError(PluginCall call, AkilesException e, AkilesException lastBluetoothError) {
        String sdkCode = e.code == null ? "INTERNAL" : e.code.toString();
        String description = e.getMessage() == null ? "" : e.getMessage();
        JSObject data = new JSObject();
        data.put("sdkCode", sdkCode);
        data.put("description", description);

        switch (sdkCode) {
            case "INVALID_SESSION":
                reject(call, "INVALID_TOKEN", "Akiles session token is invalid or revoked", data);
                return;
            case "INVALID_PARAM":
                reject(call, "INVALID_TOKEN", "Akiles rejected the parameter: " + description, data);
                return;
            case "PERMISSION_DENIED": {
                String reason = permissionDeniedReason(e);
                data.put("reason", reason);
                reject(call, "DENIED_BY_AKILES", "Akiles denied the action (" + reason + ")", data);
                return;
            }
            case "SESSION_NOT_GRANTED":
                data.put("reason", "SESSION_NOT_GRANTED");
                reject(call, "DENIED_BY_AKILES", "This device has not been granted access by the organization administrator", data);
                return;
            case "BLUETOOTH_PERMISSION_NOT_GRANTED":
                data.put("permanent", false);
                reject(call, "BLUETOOTH_PERMISSION_DENIED", "Bluetooth permission not granted", data);
                return;
            case "BLUETOOTH_PERMISSION_NOT_GRANTED_PERMANENTLY":
                data.put("permanent", true);
                reject(call, "BLUETOOTH_PERMISSION_DENIED", "Bluetooth permission permanently denied; enable it in Settings", data);
                return;
            case "BLUETOOTH_DISABLED":
                reject(call, "BLUETOOTH_OFF", "Bluetooth is turned off", data);
                return;
            case "BLUETOOTH_NOT_AVAILABLE":
                reject(call, "NOT_AVAILABLE", "This device has no Bluetooth support", data);
                return;
            case "BLUETOOTH_DEVICE_NOT_FOUND":
            case "TIMEOUT":
                reject(call, "OUT_OF_RANGE", "No Akiles device within Bluetooth range", data);
                return;
            case "ALL_COMM_METHODS_FAILED":
                if (lastBluetoothError != null) {
                    rejectWithSdkError(call, lastBluetoothError, null);
                    return;
                }
                reject(call, "OUT_OF_RANGE", "Could not reach the Akiles device via Bluetooth", data);
                return;
            case "CANCELED":
                reject(call, "CANCELLED", "Cancelled", data);
                return;
            default:
                reject(call, "UNKNOWN", "Akiles error " + sdkCode + ": " + description, data);
        }
    }

    /** Reden uit de subklassen van AkilesException; geen aanname over veldnamen. */
    private static String permissionDeniedReason(AkilesException e) {
        if (e instanceof AkilesException.PermissionDeniedEnded) return "MEMBER_ENDED";
        if (e instanceof AkilesException.PermissionDeniedNotStarted) return "MEMBER_NOT_STARTED";
        if (e instanceof AkilesException.PermissionDeniedOutOfSchedule) return "OUT_OF_SCHEDULE";
        return "OTHER";
    }
}
