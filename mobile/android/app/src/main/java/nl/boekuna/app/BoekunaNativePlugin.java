package nl.boekuna.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import androidx.core.content.FileProvider;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.Logger;
import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

/**
 * Native help for the Boekuna web app inside the Android WebView:
 * saving and opening files (PDFs, exports), the Android share sheet, printing,
 * and keeping subscription checkout out of the Android app.
 */
@CapacitorPlugin(name = "BoekunaNative")
public class BoekunaNativePlugin extends Plugin {

    static final String APP_ORIGIN = "https://app.boekuna.nl";
    private static final String TAG = "BoekunaNative";
    private static final String SHARED_DIR = "boekuna-shared";
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private WebView printView;

    @Override
    public void load() {
        WebView webView = getBridge().getWebView();
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(webView, "BoekunaAndroid", Collections.singleton(APP_ORIGIN), (view, message, origin, isMainFrame, reply) -> {
                String data = message.getData();
                if (data != null) io.execute(() -> handle(data));
            });
        } else {
            Logger.warn(TAG, "WebView too old for file downloads; update Android System WebView.");
        }
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            String shim = readAsset("boekuna/android-shim.js");
            if (shim != null) WebViewCompat.addDocumentStartJavaScript(webView, shim, Collections.singleton(APP_ORIGIN));
        }
        // Real (non-blob) downloads go to the phone's browser, which handles them.
        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> openExternal(Uri.parse(url)));
        io.execute(this::cleanSharedFiles);
    }

    @Override
    public Boolean shouldOverrideLoad(Uri url) {
        String host = url.getHost();
        // Google Play does not allow paying for the subscription outside Play inside the app.
        if (host != null && (host.equals("stripe.com") || host.endsWith(".stripe.com"))) {
            toast("Je beheert je abonnement op boekuna.nl.");
            return true;
        }
        return null;
    }

    private void handle(String raw) {
        try {
            JSONObject msg = new JSONObject(raw);
            String action = msg.optString("action");
            String name = safeName(msg.optString("name", "bestand"));
            String mime = msg.optString("mime", "application/octet-stream");
            switch (action) {
                case "save":
                    save(decode(msg), name, mime);
                    break;
                case "open":
                    open(decode(msg), name, mime);
                    break;
                case "share":
                    share(decode(msg), name, mime, msg.optString("title"), msg.optString("text"));
                    break;
                case "shareText":
                    shareText(msg.optString("title"), msg.optString("text"));
                    break;
                case "print":
                    runOnUi(() -> printHtml(msg.optString("html"), name));
                    break;
                case "printPage":
                    runOnUi(() -> print(getBridge().getWebView(), name));
                    break;
                case "error":
                    toast(msg.optString("message", "Er ging iets mis."));
                    break;
                default:
                    Logger.warn(TAG, "Unknown action " + action);
            }
        } catch (Exception e) {
            Logger.error(TAG, "Native action failed", e);
            toast("Dat lukte niet. Probeer het opnieuw.");
        }
    }

    private static byte[] decode(JSONObject msg) {
        return Base64.decode(msg.optString("data", ""), Base64.DEFAULT);
    }

    /** Saves to Downloads/Boekuna. PDFs open straight away, other files show a short message. */
    private void save(byte[] bytes, String name, String mime) throws Exception {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            // Android 9 and older need a storage permission for Downloads; open the file instead.
            open(bytes, name, mime);
            return;
        }
        ContentResolver resolver = getContext().getContentResolver();
        ContentValues values = new ContentValues();
        values.put(MediaStore.Downloads.DISPLAY_NAME, name);
        values.put(MediaStore.Downloads.MIME_TYPE, mime);
        values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Boekuna");
        values.put(MediaStore.Downloads.IS_PENDING, 1);
        Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        if (uri == null) throw new IllegalStateException("No download location");
        try (OutputStream out = resolver.openOutputStream(uri)) {
            out.write(bytes);
        }
        values.clear();
        values.put(MediaStore.Downloads.IS_PENDING, 0);
        resolver.update(uri, values, null, null);
        toast("Opgeslagen in Downloads/Boekuna");
        if ("application/pdf".equals(mime)) view(uri, mime, false);
    }

    private void open(byte[] bytes, String name, String mime) throws Exception {
        Uri uri = sharedFile(bytes, name);
        if (!view(uri, mime, true) && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) save(bytes, name, mime);
    }

    private boolean view(Uri uri, String mime, boolean quiet) {
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(uri, mime);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(intent);
            return true;
        } catch (ActivityNotFoundException e) {
            if (!quiet) toast("Geen app gevonden om dit bestand te openen.");
            return false;
        }
    }

    private void share(byte[] bytes, String name, String mime, String title, String text) throws Exception {
        Uri uri = sharedFile(bytes, name);
        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType(mime);
        send.putExtra(Intent.EXTRA_STREAM, uri);
        if (!title.isEmpty()) send.putExtra(Intent.EXTRA_SUBJECT, title);
        if (!text.isEmpty()) send.putExtra(Intent.EXTRA_TEXT, text);
        send.setClipData(ClipData.newRawUri(name, uri));
        send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        startChooser(send, title.isEmpty() ? "Delen" : title);
    }

    private void shareText(String title, String text) {
        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType("text/plain");
        if (!title.isEmpty()) send.putExtra(Intent.EXTRA_SUBJECT, title);
        send.putExtra(Intent.EXTRA_TEXT, text);
        startChooser(send, title.isEmpty() ? "Delen" : title);
    }

    private void startChooser(Intent intent, String title) {
        Intent chooser = Intent.createChooser(intent, title);
        chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
        getContext().startActivity(chooser);
    }

    private void printHtml(String html, String name) {
        WebView view = new WebView(getActivity());
        view.getSettings().setJavaScriptEnabled(false);
        view.setWebViewClient(
            new WebViewClient() {
                @Override
                public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) {
                    return true;
                }

                @Override
                public void onPageFinished(WebView v, String url) {
                    print(v, name);
                }
            }
        );
        printView = view; // keep a reference until the print job has its content
        view.loadDataWithBaseURL(APP_ORIGIN + "/", html, "text/html", "UTF-8", null);
    }

    private void print(WebView view, String name) {
        Activity activity = getActivity();
        PrintManager printManager = (PrintManager) activity.getSystemService(Context.PRINT_SERVICE);
        String job = name == null || name.isEmpty() ? "Boekuna" : name;
        PrintAttributes attributes = new PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).build();
        printManager.print(job, view.createPrintDocumentAdapter(job), attributes);
    }

    private Uri sharedFile(byte[] bytes, String name) throws Exception {
        File dir = new File(getContext().getCacheDir(), SHARED_DIR);
        if (!dir.isDirectory() && !dir.mkdirs()) throw new IllegalStateException("No cache dir");
        File file = new File(dir, name);
        try (FileOutputStream out = new FileOutputStream(file)) {
            out.write(bytes);
        }
        return FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
    }

    private void cleanSharedFiles() {
        File[] files = new File(getContext().getCacheDir(), SHARED_DIR).listFiles();
        if (files == null) return;
        long cutoff = System.currentTimeMillis() - 24L * 60 * 60 * 1000;
        for (File f : files) if (f.lastModified() < cutoff) f.delete();
    }

    private void openExternal(Uri uri) {
        String scheme = uri.getScheme();
        if (!"https".equals(scheme) && !"http".equals(scheme)) return;
        try {
            getContext().startActivity(new Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        } catch (ActivityNotFoundException e) {
            toast("Geen browser gevonden.");
        }
    }

    static String safeName(String name) {
        String clean = name == null ? "" : name.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]+", "-").trim();
        if (clean.isEmpty() || clean.equals(".") || clean.equals("..")) clean = "bestand";
        return clean.length() > 120 ? clean.substring(clean.length() - 120) : clean;
    }

    private String readAsset(String path) {
        try (InputStream in = getContext().getAssets().open(path); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return out.toString(StandardCharsets.UTF_8.name());
        } catch (Exception e) {
            Logger.error(TAG, "Missing asset " + path, e);
            return null;
        }
    }

    private void runOnUi(Runnable r) {
        getActivity().runOnUiThread(r);
    }

    private void toast(String text) {
        runOnUi(() -> Toast.makeText(getContext(), text, Toast.LENGTH_SHORT).show());
    }
}
