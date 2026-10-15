package gn.astronet.onelink;

import android.os.Bundle;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

/**
 * Bouton « Retour » d'Android. Le site (application React) connaît son historique interne : on lui demande donc d'abord
 * (`window.__onelinkBack()`), ce qui fonctionne même quand la WebView ne signale pas d'historique. S'il ne peut pas revenir
 * en arrière, on utilise l'historique de la WebView ; à la racine, un premier appui prévient et un second appui rapproché quitte.
 * Sans ce traitement, Capacitor laisse le système fermer l'application dès le premier appui.
 *
 * L'affichage sous la barre d'état est géré par le site (zones sûres CSS) et le plugin SystemBars de Capacitor.
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
                final WebView web = getBridge() != null ? getBridge().getWebView() : null;
                if (web == null) {
                    exitOrWarn();
                    return;
                }
                web.evaluateJavascript("(function(){try{return !!(window.__onelinkBack&&window.__onelinkBack());}catch(e){return false;}})()", value -> {
                    if ("true".equals(value)) return; // le site est revenu en arrière
                    if (web.canGoBack()) web.goBack();
                    else exitOrWarn();
                });
            }
        });
    }

    private void exitOrWarn() {
        long now = System.currentTimeMillis();
        if (now - lastBackPress < EXIT_WINDOW_MS) {
            finish();
            return;
        }
        lastBackPress = now;
        Toast.makeText(this, R.string.press_back_again, Toast.LENGTH_SHORT).show();
    }
}
