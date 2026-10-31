import Foundation

struct APIError: LocalizedError, Equatable {
    let code: String
    let message: String
    var errorDescription: String? { message }

    static let offline = APIError(code: "offline", message: "Geen internet. Controleer je verbinding en probeer het opnieuw.")
}

private struct ErrorWrapper: Decodable {
    struct E: Decodable { let code: String; let message: String }
    let error: E
}

/// Thin client for the lootjes edge function. Every call is one POST with an action.
struct API {
    var session: URLSession = .shared

    private func call<T: Decodable>(_ action: String, _ params: [String: Any?] = [:]) async throws -> T {
        var body: [String: Any] = ["action": action]
        for (k, v) in params { if let v { body[k] = v } }
        var req = URLRequest(url: AppConfig.apiURL, timeoutInterval: 20)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: body)

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: req)
        } catch {
            throw APIError.offline
        }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        if !(200..<300).contains(status) {
            if let w = try? JSONDecoder().decode(ErrorWrapper.self, from: data) {
                throw APIError(code: w.error.code, message: w.error.message)
            }
            throw APIError(code: "server", message: "Er ging iets mis (\(status)). Probeer het zo opnieuw.")
        }
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw APIError(code: "decode", message: "Onverwacht antwoord van de server. Werk de app bij.")
        }
    }

    func createGroup(name: String, occasion: Occasion, eventDate: Date?, budgetCents: Int?, note: String?, poems: Bool,
                     organizerName: String, organizerParticipates: Bool, members: [String]) async throws -> CreatedGroup {
        try await call("createGroup", [
            "name": name, "occasion": occasion.rawValue,
            "eventDate": eventDate.map(DayFormat.string), "budgetCents": budgetCents, "note": note, "poems": poems,
            "organizerName": organizerName, "organizerParticipates": organizerParticipates, "members": members,
        ])
    }

    func adminStatus(_ adminToken: String) async throws -> AdminStatus {
        try await call("adminStatus", ["adminToken": adminToken])
    }

    func updateGroup(_ adminToken: String, fields: [String: Any?]) async throws -> AdminStatus {
        var p = fields
        p["adminToken"] = adminToken
        return try await call("updateGroup", p)
    }

    func addMember(_ adminToken: String, name: String) async throws -> MemberLink {
        let r: AddedMember = try await call("addMember", ["adminToken": adminToken, "name": name])
        return r.member
    }

    func removeMember(_ adminToken: String, memberId: String) async throws -> AdminStatus {
        try await call("removeMember", ["adminToken": adminToken, "memberId": memberId])
    }

    func renewMemberLink(_ adminToken: String, memberId: String) async throws -> MemberLink {
        let r: AddedMember = try await call("renewMemberLink", ["adminToken": adminToken, "memberId": memberId])
        return r.member
    }

    func markLinkSent(_ adminToken: String, memberId: String) async throws {
        let _: OK = try await call("markLinkSent", ["adminToken": adminToken, "memberId": memberId])
    }

    func setExclusions(_ adminToken: String, _ pairs: [[String]]) async throws -> AdminStatus {
        try await call("setExclusions", ["adminToken": adminToken, "exclusions": pairs])
    }

    func draw(_ adminToken: String, redraw: Bool = false) async throws -> AdminStatus {
        try await call("draw", ["adminToken": adminToken, "redraw": redraw])
    }

    func nextYear(_ adminToken: String, eventDate: Date?) async throws -> CreatedGroup {
        try await call("nextYear", ["adminToken": adminToken, "eventDate": eventDate.map(DayFormat.string)])
    }

    func deleteGroup(_ adminToken: String) async throws {
        let _: OK = try await call("deleteGroup", ["adminToken": adminToken])
    }

    func groupByCode(_ code: String) async throws -> JoinPreview {
        try await call("groupByCode", ["joinCode": code])
    }

    func join(code: String, name: String) async throws -> JoinResult {
        try await call("join", ["joinCode": code, "name": name])
    }

    func me(_ token: String) async throws -> MeResponse {
        try await call("me", ["token": token])
    }

    func setWishlist(_ token: String, _ text: String) async throws {
        let _: OK = try await call("setWishlist", ["token": token, "wishlist": text])
    }

    func setGiftReady(_ token: String, _ ready: Bool) async throws {
        let _: OK = try await call("setGiftReady", ["token": token, "ready": ready])
    }

    func sendMessage(_ token: String, thread: ChatMessage.Thread, body: String) async throws {
        let _: OK = try await call("sendMessage", ["token": token, "thread": thread.rawValue, "body": body])
    }

    func leave(_ token: String) async throws {
        let _: OK = try await call("leave", ["token": token])
    }
}
