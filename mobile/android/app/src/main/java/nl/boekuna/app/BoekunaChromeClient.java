package nl.boekuna.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Environment;
import android.provider.MediaStore;
import android.webkit.MimeTypeMap;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.FileProvider;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebChromeClient;
import com.getcapacitor.Logger;
import java.io.File;
import java.util.ArrayList;
import java.util.List;

/**
 * Capacitor's file chooser only offers the camera for inputs with a capture attribute.
 * Boekuna's upload buttons accept images without one, so this chooser shows
 * "Camera" next to the normal file picker, like Chrome on Android does.
 */
public class BoekunaChromeClient extends BridgeWebChromeClient {

    private final Bridge bridge;
    private final ActivityResultLauncher<Intent> chooserLauncher;
    private ValueCallback<Uri[]> pendingCallback;
    private Uri pendingPhotoUri;

    public BoekunaChromeClient(Bridge bridge) {
        super(bridge);
        this.bridge = bridge;
        this.chooserLauncher = bridge.registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), result -> {
            ValueCallback<Uri[]> callback = pendingCallback;
            Uri photoUri = pendingPhotoUri;
            pendingCallback = null;
            pendingPhotoUri = null;
            if (callback == null) return;
            if (result.getResultCode() != Activity.RESULT_OK) {
                callback.onReceiveValue(null);
                return;
            }
            Intent data = result.getData();
            Uri[] picked = null;
            if (data != null && data.getClipData() != null) {
                int count = data.getClipData().getItemCount();
                picked = new Uri[count];
                for (int i = 0; i < count; i++) picked[i] = data.getClipData().getItemAt(i).getUri();
            } else if (data != null && data.getData() != null) {
                picked = new Uri[] { data.getData() };
            } else if (photoUri != null) {
                picked = new Uri[] { photoUri };
            }
            callback.onReceiveValue(picked);
        });
    }

    @Override
    public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback, FileChooserParams params) {
        if (params.isCaptureEnabled() || !acceptsImages(params.getAcceptTypes())) {
            return super.onShowFileChooser(webView, filePathCallback, params);
        }
        if (pendingCallback != null) pendingCallback.onReceiveValue(null);

        Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
        pick.addCategory(Intent.CATEGORY_OPENABLE);
        String[] mimeTypes = mimeTypes(params.getAcceptTypes());
        pick.setType(mimeTypes.length == 1 ? mimeTypes[0] : "*/*");
        if (mimeTypes.length > 1) pick.putExtra(Intent.EXTRA_MIME_TYPES, mimeTypes);
        if (params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);

        Intent chooser = Intent.createChooser(pick, "Kies een bestand");
        Intent camera = cameraIntent();
        if (camera != null) chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[] { camera });

        pendingCallback = filePathCallback;
        try {
            chooserLauncher.launch(chooser);
        } catch (ActivityNotFoundException e) {
            pendingCallback = null;
            pendingPhotoUri = null;
            filePathCallback.onReceiveValue(null);
        }
        return true;
    }

    private Intent cameraIntent() {
        try {
            Activity activity = bridge.getActivity();
            File dir = activity.getExternalFilesDir(Environment.DIRECTORY_PICTURES);
            File photo = File.createTempFile("bon_" + System.currentTimeMillis() + "_", ".jpg", dir);
            pendingPhotoUri = FileProvider.getUriForFile(activity, activity.getPackageName() + ".fileprovider", photo);
            Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            intent.putExtra(MediaStore.EXTRA_OUTPUT, pendingPhotoUri);
            intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            return intent;
        } catch (Exception e) {
            Logger.warn("BoekunaChromeClient", "Camera not available: " + e.getMessage());
            pendingPhotoUri = null;
            return null;
        }
    }

    private static boolean acceptsImages(String[] acceptTypes) {
        if (acceptTypes == null || acceptTypes.length == 0) return true;
        for (String type : acceptTypes) {
            String t = type == null ? "" : type.trim().toLowerCase();
            if (t.isEmpty() || t.startsWith("image/") || t.equals(".jpg") || t.equals(".jpeg") || t.equals(".png")) return true;
        }
        return false;
    }

    private static String[] mimeTypes(String[] acceptTypes) {
        List<String> types = new ArrayList<>();
        MimeTypeMap map = MimeTypeMap.getSingleton();
        if (acceptTypes != null) {
            for (String raw : acceptTypes) {
                for (String part : (raw == null ? "" : raw).split(",")) {
                    String t = part.trim().toLowerCase();
                    if (t.isEmpty()) continue;
                    if (t.startsWith(".")) t = map.getMimeTypeFromExtension(t.substring(1));
                    if (t != null && !types.contains(t)) types.add(t);
                }
            }
        }
        if (types.isEmpty()) types.add("*/*");
        return types.toArray(new String[0]);
    }
}
