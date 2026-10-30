import XCTest
@testable import Lootjes

final class DrawEngineTests: XCTestCase {
    private func ids(_ n: Int) -> [UUID] { (0..<n).map { _ in UUID() } }

    func testValidForManySizesWithPartners() {
        var rng = SystemRandomNumberGenerator()
        for n in 4...40 {
            let p = ids(n)
            let excl: Set<Pair> = [Pair(p[0], p[1]), Pair(p[2], p[3])]
            for _ in 0..<20 {
                guard case .success(let r) = DrawEngine.draw(people: p, exclusions: excl, rng: &rng) else {
                    return XCTFail("draw failed for n=\(n)")
                }
                XCTAssertEqual(Set(r.pairs.keys), Set(p))
                XCTAssertEqual(Set(r.pairs.values), Set(p), "everyone receives exactly once")
                for (g, x) in r.pairs {
                    XCTAssertNotEqual(g, x)
                    XCTAssertFalse(excl.contains(Pair(g, x)))
                }
            }
        }
    }

    func testUniformOverAllDerangementsOfFour() {
        var rng = SystemRandomNumberGenerator()
        let p = ids(4)
        var counts: [String: Int] = [:]
        for _ in 0..<18_000 {
            guard case .success(let r) = DrawEngine.draw(people: p, exclusions: [], rng: &rng) else { return XCTFail() }
            counts[p.map { r.pairs[$0]!.uuidString }.joined(), default: 0] += 1
        }
        XCTAssertEqual(counts.count, 9, "4 people have 9 possible draws")
        for c in counts.values { XCTAssertTrue((1600...2400).contains(c), "not uniform: \(counts.values)") }
    }

    func testTooFew() {
        var rng = SystemRandomNumberGenerator()
        XCTAssertEqual(DrawEngine.draw(people: ids(2), exclusions: [], rng: &rng), .failure(.tooFewPeople))
    }

    func testNobodyLeftNamesThePerson() {
        var rng = SystemRandomNumberGenerator()
        let p = ids(3)
        let r = DrawEngine.draw(people: p, exclusions: [Pair(p[0], p[1]), Pair(p[0], p[2])], rng: &rng)
        XCTAssertEqual(r, .failure(.nobodyLeft(for: p[0])))
    }

    func testImpossibleIsDetectedNotLooped() {
        var rng = SystemRandomNumberGenerator()
        let p = ids(3)
        XCTAssertEqual(DrawEngine.draw(people: p, exclusions: [Pair(p[0], p[1])], rng: &rng), .failure(.impossible))
    }

    func testAvoidsLastYearWhenPossible() {
        var rng = SystemRandomNumberGenerator()
        let p = ids(5)
        let last = Dictionary(uniqueKeysWithValues: p.indices.map { (p[$0], p[($0 + 1) % p.count]) })
        for _ in 0..<200 {
            guard case .success(let r) = DrawEngine.draw(people: p, exclusions: [], lastYear: last, rng: &rng) else { return XCTFail() }
            XCTAssertFalse(r.repeatedLastYear)
            for (g, x) in r.pairs { XCTAssertNotEqual(last[g], x) }
        }
    }

    func testFallsBackWhenLastYearUnavoidable() {
        var rng = SystemRandomNumberGenerator()
        let p = ids(3)
        // Only two draws exist for 3 people; forbid one by exclusion-free last year of both cycles.
        let cycleA = [p[0]: p[1], p[1]: p[2], p[2]: p[0]]
        let r = DrawEngine.draw(people: p, exclusions: [], lastYear: cycleA, rng: &rng)
        guard case .success(let ok) = r else { return XCTFail() }
        XCTAssertFalse(ok.repeatedLastYear, "the other cycle avoids all of last year")
    }

    func testPairIsUnordered() {
        let a = UUID(), b = UUID()
        XCTAssertEqual(Pair(a, b), Pair(b, a))
    }
}

final class LinkParserTests: XCTestCase {
    func testJoinLinkAndCode() {
        XCTAssertEqual(LinkParser.parse("https://example.nl/j/k7m2qx9"), .join(code: "K7M2QX9"))
        XCTAssertEqual(LinkParser.parse("  k7m2 qx9 "), .join(code: "K7M2QX9"))
        XCTAssertEqual(LinkParser.parse("lootjes://j/K7M2QX9"), .join(code: "K7M2QX9"))
    }

    func testMemberLinkInsideMessage() {
        let token = "abcdefghijklmnopqrstuvwxyz012345"
        let msg = "Hoi Sanne! Je lootje staat klaar: https://example.nl/m/\(token)"
        XCTAssertEqual(LinkParser.parse(msg), .member(token: token))
        XCTAssertEqual(LinkParser.parse("lootjes://m/\(token)"), .member(token: token))
    }

    func testRejectsOtherText() {
        XCTAssertNil(LinkParser.parse("hallo"))
        XCTAssertNil(LinkParser.parse("https://example.nl/x/ABCDEFG"))
        XCTAssertNil(LinkParser.parse("https://example.nl/m/short"))
    }
}

final class OccasionTests: XCTestCase {
    private func date(_ y: Int, _ m: Int, _ d: Int) -> Date {
        Calendar.current.date(from: DateComponents(year: y, month: m, day: d))!
    }

    func testDefaultDates() {
        let cal = Calendar.current
        let s = Occasion.sinterklaas.defaultDate(now: date(2026, 10, 31))!
        XCTAssertEqual([cal.component(.year, from: s), cal.component(.month, from: s), cal.component(.day, from: s)], [2026, 12, 5])
        let afterSint = Occasion.sinterklaas.defaultDate(now: date(2026, 12, 6))!
        XCTAssertEqual(cal.component(.year, from: afterSint), 2027)
        let kerst = Occasion.kerst.defaultDate(now: date(2026, 12, 6))!
        XCTAssertEqual([cal.component(.year, from: kerst), cal.component(.month, from: kerst), cal.component(.day, from: kerst)], [2026, 12, 25])
        XCTAssertNil(Occasion.anders.defaultDate())
    }

    func testCountdown() {
        let now = date(2026, 12, 3)
        XCTAssertEqual(DayFormat.countdown(to: date(2026, 12, 5), now: now), "nog 2 dagen")
        XCTAssertEqual(DayFormat.countdown(to: date(2026, 12, 4), now: now), "morgen")
        XCTAssertEqual(DayFormat.countdown(to: now, now: now), "vandaag")
        XCTAssertNil(DayFormat.countdown(to: date(2026, 12, 1), now: now))
    }

    func testEuro() {
        XCTAssertTrue(2000.euroText.contains("20"))
        XCTAssertTrue(1250.euroText.contains("12,50"))
    }
}

final class RemindersTests: XCTestCase {
    func testPlansWeekAndEve() {
        let g = SavedGroup(id: "g1", name: "Familie", occasion: .sinterklaas, eventDate: "2026-12-05")
        let now = Calendar.current.date(from: DateComponents(year: 2026, month: 11, day: 1))!
        let plan = Reminders.plan(for: g, now: now)
        XCTAssertEqual(plan.map(\.id), ["g1.week", "g1.eve"])
        XCTAssertTrue(plan[1].body.contains("gedicht"))
    }

    func testNoPastReminders() {
        let g = SavedGroup(id: "g1", name: "Familie", occasion: .kerst, eventDate: "2026-12-25")
        let now = Calendar.current.date(from: DateComponents(year: 2026, month: 12, day: 24, hour: 20))!
        XCTAssertTrue(Reminders.plan(for: g, now: now).isEmpty)
    }
}

final class PoemHelperTests: XCTestCase {
    func testPoemsUseNameAndHint() {
        let poems = PoemHelper.poems(name: "Sanne", hint: "paardrijden")
        XCTAssertEqual(poems.count, 3)
        for p in poems {
            XCTAssertTrue(p.contains("Sanne"))
            XCTAssertTrue(p.contains("paardrijden"))
            XCTAssertFalse(p.contains("{"))
        }
    }

    func testRhymes() {
        XCTAssertEqual(PoemHelper.rhymeKey("boek"), "oek")
        XCTAssertEqual(PoemHelper.rhymeKey("blij"), "ij")
        XCTAssertTrue(PoemHelper.rhymes(for: "boek").contains("koek"))
        XCTAssertTrue(PoemHelper.rhymes(for: "Piet").contains("geniet"))
        XCTAssertTrue(PoemHelper.rhymes(for: "nacht").contains("gedacht"))
        XCTAssertFalse(PoemHelper.rhymes(for: "boek").contains("boek"))
    }
}

final class ContactNamesTests: XCTestCase {
    func testDisambiguatesSameFirstName() {
        let names = ContactNames.names(for: [("Anna", "Jansen", ""), ("Anna", "Bakker", ""), ("Tom", "Vries", ""), ("", "Smit", "Smitty")])
        XCTAssertEqual(names, ["Anna J.", "Anna B.", "Tom", "Smitty"])
    }
}

@MainActor
final class StoreTests: XCTestCase {
    func testUpsertKeepsTokens() {
        let box = KeychainBox(account: "test-\(UUID().uuidString)", synchronizable: false)
        defer { box.delete() }
        let store = Store(keychain: box, defaults: UserDefaults(suiteName: UUID().uuidString)!)
        store.upsert(SavedGroup(id: "g", name: "A", occasion: .kerst, adminToken: "admin", memberTokens: ["m1": "t1"]))
        store.upsert(SavedGroup(id: "g", name: "B", occasion: .kerst, myToken: "mine"))
        let g = store.group("g")!
        XCTAssertEqual(g.name, "B")
        XCTAssertEqual(g.adminToken, "admin")
        XCTAssertEqual(g.myToken, "mine")
        XCTAssertEqual(g.memberTokens["m1"], "t1")
    }
}
