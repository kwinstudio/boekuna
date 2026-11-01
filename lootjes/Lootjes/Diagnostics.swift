import Foundation
import MetricKit


/// Sends Apple's anonymous crash and hang reports (MetricKit) to our server, so problems in the
/// field show up without a third-party SDK. Reports contain stack traces and device/OS info only.
final class Diagnostics: NSObject, MXMetricManagerSubscriber {
    static let shared = Diagnostics()

    func start() {
        MXMetricManager.shared.add(self)
    }

    func didReceive(_ payloads: [MXDiagnosticPayload]) {
        for p in payloads {
            var reports: [(kind: String, summary: String, json: Data)] = []
            for c in p.crashDiagnostics ?? [] {
                let s = [c.exceptionType.map { "exception \($0)" }, c.signal.map { "signal \($0)" }, c.terminationReason]
                    .compactMap { $0 }.joined(separator: ", ")
                reports.append(("crash", s, c.jsonRepresentation()))
            }
            for h in p.hangDiagnostics ?? [] {
                reports.append(("hang", "hang \(h.hangDuration)", h.jsonRepresentation()))
            }
            for d in p.diskWriteExceptionDiagnostics ?? [] { reports.append(("disk", "disk writes", d.jsonRepresentation())) }
            for c in p.cpuExceptionDiagnostics ?? [] { reports.append(("cpu", "cpu \(c.totalCPUTime)", c.jsonRepresentation())) }
            for r in reports.prefix(5) { Task { await Self.send(kind: r.kind, summary: r.summary, json: r.json) } }
        }
    }

    static func send(kind: String, summary: String, json: Data) async {
        guard json.count < 60_000, let payload = try? JSONSerialization.jsonObject(with: json) else { return }
        let version = (Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "?")
            + " (" + (Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "?") + ")"
        let body: [String: Any] = [
            "action": "diag", "kind": kind, "summary": String(summary.prefix(500)), "payload": payload,
            "appVersion": version, "osVersion": ProcessInfo.processInfo.operatingSystemVersionString,
        ]
        var req = URLRequest(url: AppConfig.apiURL, timeoutInterval: 20)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try? JSONSerialization.data(withJSONObject: body)
        _ = try? await URLSession.shared.data(for: req)
    }
}
