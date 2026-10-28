import XCTest
@testable import Fotoswipe

final class SimilarPhotoTests: XCTestCase {
    private func sample(_ id: String, seconds: Double = 0, hash: UInt64 = 0x123456789abcdef0,
                        colors: [Double] = Array(repeating: 0.5, count: 48), contrast: Double = 0.2) -> SimilarPhotoDescriptor {
        SimilarPhotoDescriptor(id: id, date: Date(timeIntervalSince1970: seconds), hash: hash,
                               colors: colors, contrast: contrast, aspect: 0.75)
    }
    func testNearbySimilarFramesFormOneNonoverlappingGroup() {
        let groups = SimilarPhotoGrouping.groups([sample("c", seconds: 20), sample("a"), sample("b", seconds: 10)])
        XCTAssertEqual(groups, [["a", "b", "c"]])
    }
    func testSameHashDifferentColorSceneDoesNotMatch() {
        XCTAssertTrue(SimilarPhotoGrouping.groups([sample("a"), sample("b", colors: Array(repeating: 0.9, count: 48))]).isEmpty)
    }
    func testDistantDatesAndFlatImagesDoNotMatch() {
        XCTAssertTrue(SimilarPhotoGrouping.groups([sample("a"), sample("b", seconds: 121)]).isEmpty)
        XCTAssertTrue(SimilarPhotoGrouping.groups([sample("a", contrast: 0), sample("b", contrast: 0)]).isEmpty)
    }
    func testEveryMemberMustMatchPreventingTransitiveLookalikes() {
        // A-B and B-C are close, but A-C differ by twelve bits.
        let items = [sample("a", hash: 0), sample("b", seconds: 1, hash: 63), sample("c", seconds: 2, hash: 4095)]
        XCTAssertEqual(SimilarPhotoGrouping.groups(items), [["a", "b"]])
    }
    func testDissimilarEdgePatternsDoNotMatch() {
        XCTAssertTrue(SimilarPhotoGrouping.groups([sample("a", hash: 0), sample("b", hash: 127)]).isEmpty)
    }
    func testCancellationDiscardsPartialResults() {
        var checks = 0
        let result = SimilarPhotoGrouping.groups([sample("a"), sample("b"), sample("c")], isCancelled: {
            checks += 1
            return checks == 3
        })
        XCTAssertEqual(result, [])
    }
    func testRepeatedIdentifiersDoNotCreateDuplicateMembers() {
        XCTAssertEqual(SimilarPhotoGrouping.groups([sample("a"), sample("a"), sample("b")]), [["a", "b"]])
    }
    func testCancellationReturnsNoGroups() {
        XCTAssertEqual(SimilarPhotoGrouping.groups([sample("a"), sample("b")], isCancelled: { true }), [])
    }
    func testAtLeastOnePhotoMustRemainInEachGroup() {
        var selection = SimilarPhotoSelection()
        XCTAssertTrue(selection.toggle("a", in: ["a", "b"]))
        XCTAssertFalse(selection.toggle("b", in: ["a", "b"]))
        XCTAssertEqual(selection.rejected, ["a"])
        XCTAssertTrue(selection.toggle("a", in: ["a", "b"]))
        XCTAssertTrue(selection.rejected.isEmpty)
    }
    func testUnknownIDCannotBeSelected() {
        var selection = SimilarPhotoSelection()
        XCTAssertFalse(selection.toggle("c", in: ["a", "b"]))
    }
}
