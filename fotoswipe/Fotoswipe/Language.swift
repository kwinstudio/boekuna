import SwiftUI
import ObjectiveC

/// Languages the app ships with. "system" follows the iPhone's language (English when it is not one of these).
enum AppLanguage: String, CaseIterable, Identifiable {
    case system, en, nl, es, de, fr, ja
    var id: String { rawValue }
    /// Each language is shown in its own name, so anyone can find theirs.
    var nativeName: String {
        switch self {
        case .system: return String(localized: "Taal van je iPhone", bundle: .app)
        case .en: return "English"
        case .nl: return "Nederlands"
        case .es: return "Español"
        case .de: return "Deutsch"
        case .fr: return "Français"
        case .ja: return "日本語"
        }
    }
}

/// Switches the app's language at once, without a restart.
/// Text views follow the locale in the environment; String(localized:) calls pass `bundle: .app`;
/// everything else that reads Bundle.main is redirected by `SwitchingBundle`.
enum AppLocale {
    private static let key = "fotoswipe.language"
    nonisolated(unsafe) private(set) static var override: Bundle?
    nonisolated(unsafe) private(set) static var language: AppLanguage = .system

    static var bundle: Bundle { override ?? .main }
    /// The language actually used for text (system resolves to the best match among the shipped ones).
    static var code: String {
        if language != .system { return language.rawValue }
        return Bundle.preferredLocalizations(from: Bundle.main.localizations.filter { $0 != "Base" }).first ?? "en"
    }
    static var locale: Locale { language == .system ? .current : Locale(identifier: language.rawValue) }

    /// Call once at launch, before any text is shown.
    static func install() {
        object_setClass(Bundle.main, SwitchingBundle.self)
        #if DEBUG
        if let index = CommandLine.arguments.firstIndex(of: "-FSLanguage"), index + 1 < CommandLine.arguments.count,
           let forced = AppLanguage(rawValue: CommandLine.arguments[index + 1]) {
            UserDefaults.standard.set(forced.rawValue, forKey: key)
        }
        #endif
        load(AppLanguage(rawValue: UserDefaults.standard.string(forKey: key) ?? "") ?? .system)
    }

    static func set(_ language: AppLanguage) {
        let defaults = UserDefaults.standard
        defaults.set(language.rawValue, forKey: key)
        // System texts (permission prompts, the widget) follow from the next launch on.
        if language == .system { defaults.removeObject(forKey: "AppleLanguages") }
        else { defaults.set([language.rawValue], forKey: "AppleLanguages") }
        load(language)
    }

    private static func load(_ language: AppLanguage) {
        self.language = language
        if language != .system, let path = Bundle.main.path(forResource: language.rawValue, ofType: "lproj") {
            override = Bundle(path: path)
        } else {
            override = nil
        }
    }
}

private final class SwitchingBundle: Bundle, @unchecked Sendable {
    override func localizedString(forKey key: String, value: String?, table tableName: String?) -> String {
        if let bundle = AppLocale.override {
            return bundle.localizedString(forKey: key, value: value, table: tableName)
        }
        return super.localizedString(forKey: key, value: value, table: tableName)
    }
}

extension Bundle {
    /// The bundle for the language picked in the app.
    static var app: Bundle { AppLocale.bundle }
}

/// Publishes language changes so the whole view tree redraws in the new language.
@MainActor final class LanguageStore: ObservableObject {
    static let shared = LanguageStore()
    @Published private(set) var language = AppLocale.language
    func set(_ language: AppLanguage) {
        AppLocale.set(language)
        self.language = language
    }
}
