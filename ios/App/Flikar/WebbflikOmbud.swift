import Foundation
import UIKit
import WebKit

/// Navigerings- och UI-delegaten för en fliks webbvy. Ett eget NSObject, så att `Webbflik` kan vara `@Observable`.
/// Allt skickas vidare till fliken. Metoderna med svar använder WebKits async-varianter (Swift-namnen ur
/// `WK_SWIFT_ASYNC_NAME` i SDK:ts rubrikfiler för iOS 26.1).
@MainActor
final class WebbflikOmbud: NSObject, WKNavigationDelegate, WKUIDelegate {
    weak var flik: Webbflik?

    init(_ flik: Webbflik) {
        self.flik = flik
    }

    // MARK: - WKNavigationDelegate

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 preferences: WKWebpagePreferences) async -> (WKNavigationActionPolicy, WKWebpagePreferences) {
        guard let flik else { return (.cancel, preferences) }
        return flik.beslut(navigationAction, preferences)
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse) async -> WKNavigationResponsePolicy {
        flik?.svarsbeslut(navigationResponse) ?? .allow
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        flik?.borjade(webView, navigation)
    }

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        flik?.bekraftad(webView, navigation)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        flik?.klar(webView, navigation)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        flik?.misslyckades(webView, navigation, error, provisoriskt: false)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        flik?.misslyckades(webView, navigation, error, provisoriskt: true)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        flik?.processenDog(webView)
    }

    func webView(_ webView: WKWebView, respondTo challenge: URLAuthenticationChallenge) async
        -> (URLSession.AuthChallengeDisposition, URLCredential?) {
        guard let flik else { return (.performDefaultHandling, nil) }
        return await flik.autentisering(challenge)
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        flik?.blevNedladdning(download)
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        flik?.blevNedladdning(download)
    }

    // MARK: - WKUIDelegate

    /// target=_blank och window.open: en ny flik (eller inget, om skyddet säger nej).
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        guard let flik, let motor = flik.motor else { return nil }
        return motor.oppnaPopup(fran: flik, konfiguration: configuration, handling: navigationAction)
    }

    func webViewDidClose(_ webView: WKWebView) {
        guard let flik, let motor = flik.motor else { return }
        motor.stangFranSidan(flik)
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo) async {
        guard let flik else { return }
        _ = await flik.jsDialog(.meddelande(message), ram: frame)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo) async -> Bool {
        guard let flik else { return false }
        return await flik.jsDialog(.fraga(message), ram: frame).ok
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?,
                 initiatedByFrame frame: WKFrameInfo) async -> String? {
        guard let flik else { return nil }
        let svar = await flik.jsDialog(.textfraga(prompt, standard: defaultText), ram: frame)
        return svar.ok ? (svar.text ?? "") : nil
    }

    func webView(_ webView: WKWebView, decideMediaCapturePermissionsFor origin: WKSecurityOrigin,
                 initiatedBy frame: WKFrameInfo, type: WKMediaCaptureType) async -> WKPermissionDecision {
        guard let flik else { return .deny }
        return await flik.mediabehorighet(origin, typ: type)
    }

    /// Rörelsesensorerna. Metoden saknar async-variant i SDK:t (inget `WK_SWIFT_ASYNC`, och `decisionHandler` är
    /// inget namn som Swift gör async av), så den har kvar sitt svarsblock.
    func webView(_ webView: WKWebView, requestDeviceOrientationAndMotionPermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo, decisionHandler: @escaping @MainActor @Sendable (WKPermissionDecision) -> Void) {
        guard let flik else {
            decisionHandler(.deny)
            return
        }
        Task { @MainActor in decisionHandler(await flik.rorelsebehorighet(origin)) }
    }

    func webView(_ webView: WKWebView, contextMenuConfigurationFor elementInfo: WKContextMenuElementInfo) async
        -> UIContextMenuConfiguration? {
        guard let flik else { return nil }
        return await flik.kontextmeny(elementInfo)
    }

    /// Tryck på förhandsvisningen öppnar länken i samma flik (som Safari).
    func webView(_ webView: WKWebView, contextMenuForElement elementInfo: WKContextMenuElementInfo,
                 willCommitWithAnimator animator: UIContextMenuInteractionCommitAnimating) {
        guard let url = elementInfo.linkURL, let flik else { return }
        animator.addCompletion { [weak flik] in
            MainActor.assumeIsolated { flik?.ladda(url) }
        }
    }
}
