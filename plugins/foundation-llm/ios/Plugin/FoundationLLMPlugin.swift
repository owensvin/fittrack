import Foundation
import Capacitor
#if canImport(FoundationModels)
import FoundationModels
#endif

/// Bridges Apple's on-device Foundation Models (iOS 26+, Apple Intelligence)
/// to the webview. All guards degrade gracefully: on older iOS/toolchains the
/// plugin still compiles and reports "unavailable" instead of failing the build.
@objc(FoundationLLMPlugin)
public class FoundationLLMPlugin: CAPPlugin {

    @objc func availability(_ call: CAPPluginCall) {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            switch SystemLanguageModel.default.availability {
            case .available:
                call.resolve(["status": "available"])
            case .unavailable(let reason):
                call.resolve(["status": "unavailable", "reason": String(describing: reason)])
            @unknown default:
                call.resolve(["status": "unavailable", "reason": "unknown"])
            }
        } else {
            call.resolve(["status": "unavailable", "reason": "requires iOS 26"])
        }
        #else
        call.resolve(["status": "unavailable", "reason": "built without FoundationModels SDK"])
        #endif
    }

    @objc func generate(_ call: CAPPluginCall) {
        guard let prompt = call.getString("prompt"), !prompt.isEmpty else {
            call.reject("prompt required")
            return
        }
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            Task {
                do {
                    let session = LanguageModelSession()
                    let response = try await session.respond(to: prompt)
                    call.resolve(["text": response.content])
                } catch {
                    call.reject("generation failed: \(error.localizedDescription)")
                }
            }
        } else {
            call.reject("requires iOS 26")
        }
        #else
        call.reject("built without FoundationModels SDK")
        #endif
    }
}
