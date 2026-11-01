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

    struct SearchStatus: Codable { let available: Bool; let partnerLinks: Bool }

    func searchStatus() async throws -> SearchStatus {
        try await call("searchStatus")
    }

    func searchProducts(_ query: String) async throws -> ProductSearchResponse {
        try await call("searchProducts", ["query": query, "country": Locale.current.region?.identifier == "BE" ? "BE" : "NL"])
    }

    struct ItemResult<T: Codable>: Codable { let item: T }

    func wishAdd(_ token: String, _ d: WishDraft) async throws -> WishItem {
        let r: ItemResult<WishItem> = try await call("wishAdd", ["token": token, "title": d.title, "url": d.url, "imageUrl": d.imageUrl, "priceCents": d.priceCents, "note": d.note])
        return r.item
    }

    func wishUpdate(_ token: String, id: String, _ d: WishDraft) async throws -> WishItem {
        let r: ItemResult<WishItem> = try await call("wishUpdate", [
            "token": token, "id": id, "title": d.title,
            "url": d.url.map { $0 as Any } ?? NSNull(), "imageUrl": d.imageUrl.map { $0 as Any } ?? NSNull(),
            "priceCents": d.priceCents.map { $0 as Any } ?? NSNull(), "note": d.note.map { $0 as Any } ?? NSNull(),
        ])
        return r.item
    }

    func wishDelete(_ token: String, id: String) async throws {
        let _: OK = try await call("wishDelete", ["token": token, "id": id])
    }

    func wishReorder(_ token: String, ids: [String]) async throws {
        let _: OK = try await call("wishReorder", ["token": token, "ids": ids])
    }

    func shopAdd(_ token: String, title: String, priceCents: Int?, wishItemId: String?) async throws -> ShopItem {
        let r: ItemResult<ShopItem> = try await call("shopAdd", ["token": token, "title": title, "priceCents": priceCents, "wishItemId": wishItemId])
        return r.item
    }

    func shopUpdate(_ token: String, id: String, bought: Bool? = nil, title: String? = nil, priceCents: Int? = nil) async throws -> ShopItem {
        let r: ItemResult<ShopItem> = try await call("shopUpdate", ["token": token, "id": id, "bought": bought, "title": title, "priceCents": priceCents])
        return r.item
    }

    func shopDelete(_ token: String, id: String) async throws {
        let _: OK = try await call("shopDelete", ["token": token, "id": id])
    }

    func linkPreview(_ url: String) async throws -> LinkPreviewInfo {
        try await call("linkPreview", ["url": url])
    }

    func leave(_ token: String) async throws {
        let _: OK = try await call("leave", ["token": token])
    }
}
