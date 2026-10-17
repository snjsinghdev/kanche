package com.jupiterlabtech.kanche.dev;

import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Draw behind the system bars on every Android version. The game keeps out of them with
        // the safe-area insets (SystemBars insetsHandling "css", src/safe-area.ts). Capacitor 9
        // makes this call itself; remove it then.
        //
        // It must come after super.onCreate: BridgeActivity switches to AppTheme.NoActionBar
        // there. Called earlier, it builds the window decor from the launch theme, and Android 15
        // then shows an action bar titled "Kanche" over the game (seen on a OnePlus CPH2467,
        // docs/evidence/phase-00/README.md).
        EdgeToEdge.enable(this);
    }
}
