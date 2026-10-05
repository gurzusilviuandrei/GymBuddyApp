package app.gymbuddyapp.gymbuddy;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // App-specific native plugins must be registered before the bridge starts.
        registerPlugin(RestTimerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
