package nl.boekuna.app;

import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(BoekunaNativePlugin.class);
        super.onCreate(savedInstanceState);

        WebView webView = bridge.getWebView();
        // Offers the camera next to the file picker when a page asks for images.
        webView.setWebChromeClient(new BoekunaChromeClient(bridge));

        // Android back goes back inside the app (closes viewers and previews) before leaving it.
        getOnBackPressedDispatcher().addCallback(
            this,
            new OnBackPressedCallback(true) {
                @Override
                public void handleOnBackPressed() {
                    if (webView.canGoBack()) {
                        webView.goBack();
                        return;
                    }
                    setEnabled(false);
                    getOnBackPressedDispatcher().onBackPressed();
                    setEnabled(true);
                }
            }
        );
    }
}
