package app.gymbuddyapp.gymbuddy;

import android.Manifest;
import android.os.Build;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/** JS bridge for {@link RestTimerService}: see src/lib/native-workout.ts. */
@CapacitorPlugin(
    name = "RestTimer",
    permissions = { @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }) }
)
public class RestTimerPlugin extends Plugin {

    /** Ask once for permission to show the countdown and the rest-over alert. */
    @PluginMethod
    public void ensurePermission(PluginCall call) {
        // Before Android 13 notifications need no runtime permission.
        if (Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED) {
            resolveGranted(call);
            return;
        }
        requestPermissionForAlias("notifications", call, "permissionCallback");
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        resolveGranted(call);
    }

    private void resolveGranted(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", NotificationManagerCompat.from(getContext()).areNotificationsEnabled());
        call.resolve(result);
    }

    @PluginMethod
    public void start(PluginCall call) {
        // Epoch milliseconds arrive as a JSON integer (Long), not a Double.
        long endsAt = call.getData().optLong("endsAt", 0);
        if (endsAt <= 0) {
            call.reject("endsAt is required");
            return;
        }
        try {
            RestTimerService.start(getContext(), endsAt);
            call.resolve();
        } catch (Exception e) {
            // e.g. the OS refused a foreground service; the in-app timer still works.
            call.reject("Could not start the rest timer", e);
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        RestTimerService.stop(getContext());
        call.resolve();
    }
}
