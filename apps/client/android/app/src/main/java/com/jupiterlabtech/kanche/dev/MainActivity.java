package com.jupiterlabtech.kanche.dev;

import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Draw behind the system bars on every Android version. The game keeps out of them with
        // the safe-area insets (SystemBars insetsHandling "css", src/safe-area.ts). Capacitor 9
        // makes this call itself; remove it then.
        EdgeToEdge.enable(this);
        super.onCreate(savedInstanceState);
    }
}
