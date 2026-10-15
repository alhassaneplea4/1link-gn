package gn.astronet.onelink;

import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.activity.OnBackPressedCallback;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
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
        // Affichage bord à bord (Android 15+) : le contenu du site commence sous la barre d'état et s'arrête au-dessus de la barre de gestes,
        // au lieu de passer dessous (chevauchement de l'heure/des notifications avec l'en-tête).
        View content = findViewById(android.R.id.content);
        ViewCompat.setOnApplyWindowInsetsListener(content, (v, windowInsets) -> {
            Insets bars = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return WindowInsetsCompat.CONSUMED;
        });
        getWindow().getDecorView().setBackgroundColor(Color.WHITE);
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.setAppearanceLightStatusBars(true);
        controller.setAppearanceLightNavigationBars(true);
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
