import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var store: Store
    @Environment(\.dismiss) private var dismiss
    @AppStorage("haptics") private var haptics = true
    @AppStorage("reminders") private var reminders = true
    @AppStorage("myName") private var myName = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Jij") {
                    TextField("Je naam", text: $myName)
                        .textContentType(.givenName)
                }
                Section {
                    Toggle("Trillen bij acties", isOn: $haptics)
                    Toggle("Herinneringen", isOn: $reminders)
                        .onChange(of: reminders) { _, on in
                            if on { store.groups.forEach(Reminders.schedule) } else { Reminders.cancelAll() }
                        }
                } footer: {
                    Text("Herinneringen komen een week en een dag voor het feest. Ze worden op je telefoon ingepland.")
                }
                Section {
                    Label("Gratis, zonder reclame en zonder account", systemImage: "heart.fill")
                    Label("Niemand ziet wie wie heeft, ook de organisator niet", systemImage: "lock.fill")
                    Label("Je groepen staan veilig in je iCloud-sleutelhanger", systemImage: "key.fill")
                } header: {
                    Text("Over Lootjes")
                }
                Section {
                    Link(destination: AppConfig.privacyURL) { Label("Privacy", systemImage: "hand.raised") }
                    Link(destination: URL(string: "mailto:\(AppConfig.supportEmail)?subject=Lootjes")!) {
                        Label("Vraag of idee? Mail ons", systemImage: "envelope")
                    }
                } footer: {
                    Text("Versie \(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "") (\(Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? ""))")
                }
            }
            .navigationTitle("Instellingen")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Klaar") { dismiss() } } }
        }
    }
}
