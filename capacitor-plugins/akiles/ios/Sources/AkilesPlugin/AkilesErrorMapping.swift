import Foundation
import AkilesSDK

/// Fout zoals de plugin hem naar JS stuurt: code uit definitions.ts,
/// klantonafhankelijke message (Engels, technisch; de klanttaal komt in E3)
/// en data met de ruwe SDK-code.
struct AkilesPluginError {
    let code: String
    let message: String
    let data: [String: Any]

    static func noSession() -> AkilesPluginError {
        AkilesPluginError(code: "NO_SESSION", message: "No Akiles session on this device; call initialize() first", data: [:])
    }

    static func invalidArgument(_ message: String) -> AkilesPluginError {
        AkilesPluginError(code: "INVALID_TOKEN", message: message, data: [:])
    }

    static func unknown(_ message: String) -> AkilesPluginError {
        AkilesPluginError(code: "UNKNOWN", message: message, data: [:])
    }
}

/// Vertaalt een SDK-fout (NSError met ErrorCode) naar de plugincode.
/// NSDictionaryFromNSError levert de door Akiles gedocumenteerde velden
/// (code als UPPER_CASE-string, description, reason bij PERMISSION_DENIED).
/// `lastBluetoothError` is de fout uit onBluetoothError: bij
/// ALL_COMM_METHODS_FAILED is dat de informatieve fout, want internet staat
/// bewust uit. Tokenwaarden komen hier nooit langs.
func mapAkilesError(_ error: Error, lastBluetoothError: Error? = nil) -> AkilesPluginError {
    let ns = error as NSError
    let dict = (NSDictionaryFromNSError(ns) as? [String: Any]) ?? [:]
    let sdkCode = (dict["code"] as? String)
        ?? NSStringFromErrorCode(ErrorCode(rawValue: ns.code) ?? .internal)
    let description = (dict["description"] as? String) ?? ns.localizedDescription

    var data: [String: Any] = ["sdkCode": sdkCode, "description": description]
    if let reason = dict["reason"] as? String {
        data["reason"] = reason
    }

    switch sdkCode {
    case "INVALID_SESSION":
        return AkilesPluginError(code: "INVALID_TOKEN", message: "Akiles session token is invalid or revoked", data: data)
    case "INVALID_PARAM":
        return AkilesPluginError(code: "INVALID_TOKEN", message: "Akiles rejected the parameter: \(description)", data: data)
    case "PERMISSION_DENIED":
        return AkilesPluginError(code: "DENIED_BY_AKILES", message: "Akiles denied the action (\(data["reason"] as? String ?? "OTHER"))", data: data)
    case "SESSION_NOT_GRANTED":
        data["reason"] = "SESSION_NOT_GRANTED"
        return AkilesPluginError(code: "DENIED_BY_AKILES", message: "This device has not been granted access by the organization administrator", data: data)
    case "BLUETOOTH_PERMISSION_NOT_GRANTED":
        data["permanent"] = false
        return AkilesPluginError(code: "BLUETOOTH_PERMISSION_DENIED", message: "Bluetooth permission not granted", data: data)
    case "BLUETOOTH_PERMISSION_NOT_GRANTED_PERMANENTLY":
        data["permanent"] = true
        return AkilesPluginError(code: "BLUETOOTH_PERMISSION_DENIED", message: "Bluetooth permission permanently denied; enable it in Settings", data: data)
    case "BLUETOOTH_DISABLED":
        return AkilesPluginError(code: "BLUETOOTH_OFF", message: "Bluetooth is turned off", data: data)
    case "BLUETOOTH_NOT_AVAILABLE":
        return AkilesPluginError(code: "NOT_AVAILABLE", message: "This device has no Bluetooth support", data: data)
    case "BLUETOOTH_DEVICE_NOT_FOUND", "TIMEOUT":
        return AkilesPluginError(code: "OUT_OF_RANGE", message: "No Akiles device within Bluetooth range", data: data)
    case "ALL_COMM_METHODS_FAILED":
        if let bluetooth = lastBluetoothError {
            var mapped = mapAkilesError(bluetooth)
            var merged = mapped.data
            merged["sdkCode"] = "ALL_COMM_METHODS_FAILED"
            merged["bluetoothSdkCode"] = mapped.data["sdkCode"]
            mapped = AkilesPluginError(code: mapped.code, message: mapped.message, data: merged)
            return mapped
        }
        return AkilesPluginError(code: "OUT_OF_RANGE", message: "Could not reach the Akiles device via Bluetooth", data: data)
    case "CANCELED":
        return AkilesPluginError(code: "CANCELLED", message: "Cancelled", data: data)
    default:
        return AkilesPluginError(code: "UNKNOWN", message: "Akiles error \(sdkCode): \(description)", data: data)
    }
}
