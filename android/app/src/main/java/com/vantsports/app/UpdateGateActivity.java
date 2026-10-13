package com.vantsports.app;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;

import com.google.android.play.core.appupdate.AppUpdateInfo;
import com.google.android.play.core.appupdate.AppUpdateManager;
import com.google.android.play.core.appupdate.AppUpdateManagerFactory;
import com.google.android.play.core.install.model.AppUpdateType;
import com.google.android.play.core.install.model.UpdateAvailability;
import com.google.androidbrowserhelper.trusted.LauncherActivity;

/**
 * Puerta de entrada de la app.
 *
 * 1. Pregunta a Google Play si hay una version nueva de la app y, si es urgente
 *    (prioridad >= 3 en Play Console, o lleva 2+ dias disponible), lanza la
 *    actualizacion inmediata de Play.
 * 2. En cualquier otro caso (o si Play tarda / falla / la app se instalo por APK)
 *    abre la web VANTS sin esperar mas de {@link #TIMEOUT_MS}.
 *
 * El contenido de la web (torneos, ranked, etc.) NO depende de esto: la web siempre se
 * carga en vivo desde el sitio, asi que se actualiza sola con cada push al repositorio.
 */
public class UpdateGateActivity extends Activity {

    private static final int UPDATE_REQUEST_CODE = 1003;
    private static final long TIMEOUT_MS = 2500L;
    private static final int URGENT_PRIORITY = 3;
    private static final int URGENT_STALENESS_DAYS = 2;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean proceeded = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Seguro anti-bloqueo: pase lo que pase, a los 2.5 s se abre la web.
        handler.postDelayed(this::proceed, TIMEOUT_MS);

        try {
            final AppUpdateManager manager = AppUpdateManagerFactory.create(this);
            manager.getAppUpdateInfo()
                    .addOnSuccessListener(info -> onUpdateInfo(manager, info))
                    .addOnFailureListener(e -> proceed());
        } catch (Exception e) {
            proceed();
        }
    }

    private void onUpdateInfo(AppUpdateManager manager, AppUpdateInfo info) {
        if (proceeded || isFinishing()) return;

        int availability = info.updateAvailability();
        boolean inProgress = availability == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS;
        boolean available = availability == UpdateAvailability.UPDATE_AVAILABLE;

        if (!(available || inProgress) || !info.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE)) {
            proceed();
            return;
        }

        Integer staleness = info.clientVersionStalenessDays();
        boolean urgent = inProgress
                || info.updatePriority() >= URGENT_PRIORITY
                || (staleness != null && staleness >= URGENT_STALENESS_DAYS);
        if (!urgent) {
            proceed();
            return;
        }

        // Play mostrara su propia pantalla; cancelamos el temporizador de seguridad.
        handler.removeCallbacksAndMessages(null);
        try {
            manager.startUpdateFlowForResult(info, AppUpdateType.IMMEDIATE, this, UPDATE_REQUEST_CODE);
        } catch (Exception e) {
            proceed();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == UPDATE_REQUEST_CODE) {
            // OK = Play reinicia la app sola; cancelado/fallo = seguimos a la web.
            proceed();
        }
    }

    private void proceed() {
        if (proceeded) return;
        proceeded = true;
        handler.removeCallbacksAndMessages(null);

        Intent intent = new Intent(this, LauncherActivity.class);
        startActivity(intent);
        finish();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        super.onDestroy();
    }
}
