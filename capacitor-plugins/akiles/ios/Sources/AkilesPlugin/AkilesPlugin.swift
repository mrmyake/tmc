import Foundation
import Capacitor
import AkilesSDK

/**
 * Capacitor-plugin "Akiles" voor iOS (workstream E2, spec-akiles-access.md).
 * Dunne bridge rond de Akiles Mobile SDK: een sessie per toestel, gadgets
 * uit de cache, deur openen via Bluetooth. Internet staat als methode uit
 * (useInternet false), conform de permission rules; locatie wordt niet
 * gevraagd (requestLocationPermission false), want die hoort alleen bij
 * de internetmethode.
 *
 * Het token komt binnen via initialize(), gaat een keer naar
 * addSession(token:) en wordt nergens bewaard of gelogd. De SDK houdt
 * zelf zijn sessiecache op het toestel bij.
 */
@objc(AkilesPlugin)
public class AkilesPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AkilesPlugin"
    public let jsName = "Akiles"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "initialize", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "refresh", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getGadgets", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise)
    ]

    private let sdk = Akiles()

    // MARK: - Sessie

    @objc func initialize(_ call: CAPPluginCall) {
        guard let token = call.getString("token")?.trimmingCharacters(in: .whitespacesAndNewlines), !token.isEmpty else {
            reject(call, .invalidArgument("initialize() requires a non-empty token"))
            return
        }
        Task {
            // Precies een sessie per toestel: oude sessies (vorige login,
            // vorig token) eerst weg. Een fout hier is geen blokkade.
            try? await sdk.removeAllSessions()
            do {
                let sessionId = try await sdk.addSession(token: token)
                call.resolve(["sessionId": sessionId])
            } catch {
                reject(call, mapAkilesError(error))
            }
        }
    }

    @objc func getSession(_ call: CAPPluginCall) {
        Task {
            do {
                let ids = try await sdk.getSessionIDs()
                call.resolve(["sessionId": ids.first ?? NSNull()])
            } catch {
                reject(call, mapAkilesError(error))
            }
        }
    }

    @objc func refresh(_ call: CAPPluginCall) {
        Task {
            guard let sessionId = await currentSessionId() else {
                reject(call, .noSession())
                return
            }
            do {
                try await sdk.refreshSession(id: sessionId)
                call.resolve()
            } catch {
                reject(call, mapAkilesError(error))
            }
        }
    }

    @objc func clearSession(_ call: CAPPluginCall) {
        Task {
            do {
                try await sdk.removeAllSessions()
                call.resolve()
            } catch {
                reject(call, mapAkilesError(error))
            }
        }
    }

    // MARK: - Gadgets

    @objc func getGadgets(_ call: CAPPluginCall) {
        Task {
            guard let sessionId = await currentSessionId() else {
                reject(call, .noSession())
                return
            }
            do {
                let gadgets = try await sdk.getGadgets(sessionID: sessionId)
                call.resolve(["gadgets": gadgets.map(gadgetToDict)])
            } catch {
                reject(call, mapAkilesError(error))
            }
        }
    }

    // MARK: - Openen

    @objc func open(_ call: CAPPluginCall) {
        guard let gadgetId = call.getString("gadgetId"), !gadgetId.isEmpty else {
            reject(call, .invalidArgument("open() requires gadgetId"))
            return
        }
        let requestedActionId = call.getString("actionId")

        Task {
            guard let sessionId = await currentSessionId() else {
                reject(call, .noSession())
                return
            }

            let actionId: String
            if let requested = requestedActionId, !requested.isEmpty {
                actionId = requested
            } else {
                do {
                    let gadgets = try await sdk.getGadgets(sessionID: sessionId)
                    guard let gadget = gadgets.first(where: { $0.id == gadgetId }) else {
                        reject(call, AkilesPluginError(code: "DENIED_BY_AKILES", message: "Gadget \(gadgetId) is not available for this member", data: ["reason": "OTHER"]))
                        return
                    }
                    guard let first = gadget.actions.first else {
                        reject(call, AkilesPluginError(code: "DENIED_BY_AKILES", message: "Gadget \(gadgetId) has no actions for this member", data: ["reason": "OTHER"]))
                        return
                    }
                    actionId = first.id
                } catch {
                    reject(call, mapAkilesError(error))
                    return
                }
            }

            let options = ActionOptions()
            options.requestBluetoothPermission = true
            options.requestLocationPermission = false
            options.useInternet = false
            options.useBluetooth = true

            // Geen [weak self]: de omsluitende Task houdt self al vast tot de
            // actie klaar is, en de plugin leeft zolang de bridge leeft.
            let callback = OpenCallback(onStatus: { status, percent in
                var data: [String: Any] = ["status": status]
                if let percent { data["percent"] = percent }
                self.notifyListeners("openStatus", data: data)
            })

            let outcome: Result<Void, AkilesPluginErrorBox> = await withCheckedContinuation { continuation in
                callback.onFinish = { result in continuation.resume(returning: result) }
                Task {
                    await sdk.action(sessionID: sessionId, gadgetID: gadgetId, actionID: actionId, options: options, callback: callback)
                    // Vangnet: de SDK meldt normaal onSuccess of onError voordat
                    // action() terugkeert. Zo niet, dan nooit een hangende Promise.
                    callback.finish(.failure(AkilesPluginErrorBox(.unknown("Akiles action finished without a result"))))
                }
            }

            switch outcome {
            case .success:
                call.resolve(["method": "bluetooth"])
            case .failure(let box):
                reject(call, box.error)
            }
        }
    }

    // MARK: - Hulpfuncties

    private func currentSessionId() async -> String? {
        (try? await sdk.getSessionIDs())?.first
    }

    private func reject(_ call: CAPPluginCall, _ error: AkilesPluginError) {
        call.reject(error.message, error.code, nil, error.data)
    }

    private func gadgetToDict(_ gadget: Gadget) -> [String: Any] {
        [
            "id": gadget.id,
            "name": gadget.name,
            "actions": gadget.actions.map { ["id": $0.id, "name": $0.name] }
        ]
    }
}

/// Swift.Error-wrapper zodat Result de plugin-fout kan dragen.
struct AkilesPluginErrorBox: Error {
    let error: AkilesPluginError
    init(_ error: AkilesPluginError) { self.error = error }
}

/// ActionCallback van de SDK. Meldt precies een keer een uitkomst; de
/// Bluetooth-fout wordt onthouden omdat de eindfout bij uitsluitend
/// Bluetooth ALL_COMM_METHODS_FAILED is en de echte oorzaak in de
/// Bluetooth-fout zit.
final class OpenCallback: NSObject, ActionCallback {
    var onFinish: ((Result<Void, AkilesPluginErrorBox>) -> Void)?
    private let onStatus: (String, Float?) -> Void
    private var lastBluetoothError: Error?
    private var finished = false
    private let lock = NSLock()

    init(onStatus: @escaping (String, Float?) -> Void) {
        self.onStatus = onStatus
    }

    func finish(_ result: Result<Void, AkilesPluginErrorBox>) {
        lock.lock()
        let alreadyDone = finished
        finished = true
        lock.unlock()
        if alreadyDone { return }
        onFinish?(result)
    }

    func onSuccess() {
        finish(.success(()))
    }

    func onError(_ error: Error) {
        finish(.failure(AkilesPluginErrorBox(mapAkilesError(error, lastBluetoothError: lastBluetoothError))))
    }

    func onInternetStatus(_ status: ActionInternetStatus) {}

    func onInternetSuccess() {}

    func onInternetError(_ error: Error) {}

    func onBluetoothStatus(_ status: ActionBluetoothStatus) {
        onStatus(NSStringFromActionBluetoothStatus(status), nil)
    }

    func onBluetoothStatusProgress(_ percent: Float) {
        onStatus("EXECUTING_ACTION", percent)
    }

    func onBluetoothSuccess() {}

    func onBluetoothError(_ error: Error) {
        lastBluetoothError = error
    }
}
