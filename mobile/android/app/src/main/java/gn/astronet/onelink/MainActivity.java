package gn.astronet.onelink;

import android.os.Bundle;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

/**
 * Bouton « Retour » d'Android : revient à la page précédente du site (historique de navigation de la WebView) ;
 * à la racine, un premier appui prévient, un second appui rapproché quitte l'application.
 * Sans ce traitement, Capacitor laisse le système fermer l'application dès le premier appui.
 */
public class MainActivity extends BridgeActivity {
    private static final long EXIT_WINDOW_MS = 2000;
    private long lastBackPress = 0;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(OneLinkSharePlugin.class); // partage natif lien + QR code (avant super.onCreate)
        super.onCreate(savedInstanceState);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView web = getBridge() != null ? getBridge().getWebView() : null;
                if (web != null && web.canGoBack()) {
                    web.goBack();
                    return;
                }
                long now = System.currentTimeMillis();
                if (now - lastBackPress < EXIT_WINDOW_MS) {
                    finish();
                    return;
                }
                lastBackPress = now;
                Toast.makeText(MainActivity.this, R.string.press_back_again, Toast.LENGTH_SHORT).show();
            }
        });
    }
}
