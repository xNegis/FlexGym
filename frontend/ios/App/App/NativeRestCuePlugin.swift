import AVFoundation
import Capacitor
import UserNotifications

private let restCueNotificationPrefix = "formcadence-rest-"
private let restCueSoundName = "rest-complete.wav"

private final class NativeRestCueAudioPlayer: NSObject, AVAudioPlayerDelegate {
    static let shared = NativeRestCueAudioPlayer()

    private var player: AVAudioPlayer?
    private var recentIdentifiers: [String: Date] = [:]

    func play(identifier: String) {
        DispatchQueue.main.async { [weak self] in
            self?.playOnMain(identifier: identifier)
        }
    }

    private func playOnMain(identifier: String) {
        let now = Date()
        recentIdentifiers = recentIdentifiers.filter { now.timeIntervalSince($0.value) < 5 }
        if let lastPlayed = recentIdentifiers[identifier], now.timeIntervalSince(lastPlayed) < 2 {
            return
        }
        recentIdentifiers[identifier] = now

        guard let soundURL = Bundle.main.url(forResource: "rest-complete", withExtension: "wav") else {
            deactivateAudioSession()
            return
        }

        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .default, options: [.duckOthers])
            try session.setActive(true)

            let nextPlayer = try AVAudioPlayer(contentsOf: soundURL)
            nextPlayer.delegate = self
            nextPlayer.numberOfLoops = 0
            nextPlayer.prepareToPlay()
            player = nextPlayer

            if !nextPlayer.play() {
                player = nil
                deactivateAudioSession()
            }
        } catch {
            player = nil
            deactivateAudioSession()
        }
    }

    func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        if self.player === player {
            self.player = nil
            deactivateAudioSession()
        }
    }

    func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) {
        if self.player === player {
            self.player = nil
            deactivateAudioSession()
        }
    }

    private func deactivateAudioSession() {
        try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
    }
}

@objc(NativeRestCuePlugin)
public final class NativeRestCuePlugin: CAPPlugin, CAPBridgedPlugin, NotificationHandlerProtocol {
    public let identifier = "NativeRestCuePlugin"
    public let jsName = "NativeRestCue"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "schedule", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "play", returnType: CAPPluginReturnPromise)
    ]

    @objc override public func load() {
        bridge?.notificationRouter.localNotificationHandler = self
        bridge?.notificationRouter.handleApplicationNotifications = true
    }

    @objc public func schedule(_ call: CAPPluginCall) {
        guard let identifier = call.getString("identifier"),
              identifier.hasPrefix(restCueNotificationPrefix),
              let delayMs = call.getDouble("delayMs"),
              delayMs > 0 else {
            call.reject("Invalid rest cue schedule")
            return
        }

        let title = call.getString("title") ?? "Rest complete"
        let body = call.getString("body") ?? "Your next set is ready."
        let center = UNUserNotificationCenter.current()
        let targetDate = Date().addingTimeInterval(delayMs / 1_000)

        center.getNotificationSettings { [weak self] settings in
            guard let self else {
                call.resolve(["scheduled": false])
                return
            }

            switch settings.authorizationStatus {
            case .notDetermined:
                center.requestAuthorization(options: [.alert, .sound]) { granted, _ in
                    guard granted else {
                        call.resolve(["scheduled": false])
                        return
                    }
                    self.addRequest(
                        center: center,
                        identifier: identifier,
                        targetDate: targetDate,
                        title: title,
                        body: body,
                        call: call
                    )
                }
            case .authorized, .provisional, .ephemeral:
                self.addRequest(
                    center: center,
                    identifier: identifier,
                    targetDate: targetDate,
                    title: title,
                    body: body,
                    call: call
                )
            case .denied:
                call.resolve(["scheduled": false])
            @unknown default:
                call.resolve(["scheduled": false])
            }
        }
    }

    @objc public func cancel(_ call: CAPPluginCall) {
        guard let identifier = call.getString("identifier"),
              identifier.hasPrefix(restCueNotificationPrefix) else {
            call.reject("Invalid rest cue identifier")
            return
        }

        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [identifier])
        center.removeDeliveredNotifications(withIdentifiers: [identifier])
        call.resolve()
    }

    @objc public func play(_ call: CAPPluginCall) {
        guard let identifier = call.getString("identifier"),
              identifier.hasPrefix(restCueNotificationPrefix) else {
            call.reject("Invalid rest cue identifier")
            return
        }

        NativeRestCueAudioPlayer.shared.play(identifier: identifier)
        call.resolve()
    }

    public func willPresent(notification: UNNotification) -> UNNotificationPresentationOptions {
        let identifier = notification.request.identifier
        guard identifier.hasPrefix(restCueNotificationPrefix) else {
            return [.banner, .list, .sound]
        }

        NativeRestCueAudioPlayer.shared.play(identifier: identifier)
        return []
    }

    public func didReceive(response: UNNotificationResponse) {
        // Opening a delivered notification follows the normal application launch
        // path. It does not mutate or auto-start the workout.
    }

    private func addRequest(
        center: UNUserNotificationCenter,
        identifier: String,
        targetDate: Date,
        title: String,
        body: String,
        call: CAPPluginCall
    ) {
        let remainingSeconds = targetDate.timeIntervalSinceNow
        guard remainingSeconds > 0 else {
            call.resolve(["scheduled": false])
            return
        }

        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = UNNotificationSound(
            named: UNNotificationSoundName(rawValue: restCueSoundName)
        )
        content.threadIdentifier = "formcadence-rest"
        content.interruptionLevel = .timeSensitive

        let trigger = UNTimeIntervalNotificationTrigger(
            timeInterval: max(1, remainingSeconds),
            repeats: false
        )
        let request = UNNotificationRequest(
            identifier: identifier,
            content: content,
            trigger: trigger
        )

        center.removePendingNotificationRequests(withIdentifiers: [identifier])
        center.removeDeliveredNotifications(withIdentifiers: [identifier])
        center.add(request) { error in
            call.resolve(["scheduled": error == nil])
        }
    }
}

final class FormCadenceBridgeViewController: CAPBridgeViewController {
    private let nativeRestCuePlugin = NativeRestCuePlugin()

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(nativeRestCuePlugin)
    }
}
