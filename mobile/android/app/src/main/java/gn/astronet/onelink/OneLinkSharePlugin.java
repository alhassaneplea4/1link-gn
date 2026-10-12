package gn.astronet.onelink;

import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import androidx.core.content.FileProvider;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;

/**
 * Partage natif : ouvre la feuille de partage d'Android (toutes les applications) avec le lien du profil et,
 * quand il est fourni, l'image PNG du QR code. Appelé par le site : window.Capacitor.Plugins.OneLinkShare.share({ title, text, url, image }).
 */
@CapacitorPlugin(name = "OneLinkShare")
public class OneLinkSharePlugin extends Plugin {
    @PluginMethod
    public void share(PluginCall call) {
        String title = call.getString("title", "1Link");
        String text = call.getString("text", "");
        String url = call.getString("url", "");
        String image = call.getString("image");
        if (url == null || url.isEmpty()) {
            call.reject("url manquante");
            return;
        }
        try {
            Intent send = new Intent(Intent.ACTION_SEND);
            send.putExtra(Intent.EXTRA_SUBJECT, title);
            send.putExtra(Intent.EXTRA_TEXT, (text == null || text.isEmpty() ? "" : text + "\n") + url);
            if (image != null && !image.isEmpty()) {
                File dir = new File(getContext().getCacheDir(), "shared");
                if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("cache indisponible");
                File file = new File(dir, "onelink-qr.png");
                try (FileOutputStream out = new FileOutputStream(file)) {
                    out.write(Base64.decode(image, Base64.DEFAULT));
                }
                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
                send.setType("image/png");
                send.putExtra(Intent.EXTRA_STREAM, uri);
                send.setClipData(ClipData.newRawUri("", uri));
                send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            } else {
                send.setType("text/plain");
            }
            getActivity().startActivity(Intent.createChooser(send, title));
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage() == null ? "partage impossible" : e.getMessage());
        }
    }
}
