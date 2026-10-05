package app.gymbuddyapp.gymbuddy;

import android.app.ActivityManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import androidx.core.app.NotificationCompat;

/**
 * Rest timer that keeps working with the screen locked: a live countdown in the
 * notification shade / lock screen, then an alert exactly when rest is over.
 * Runs as a short foreground service (rest is at most a few minutes), so it needs
 * no exact-alarm permission.
 */
public class RestTimerService extends Service {

    static final String EXTRA_ENDS_AT = "endsAt";
    private static final String CHANNEL_COUNTDOWN = "rest-countdown";
    private static final String CHANNEL_ALERT = "rest-timer";
    private static final int COUNTDOWN_ID = 4201;
    private static final int ALERT_ID = 4202;
    private static final long MAX_REST_MS = 3 * 60 * 1000;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable finish = this::onRestOver;
    private PowerManager.WakeLock wakeLock;
    /** When the current rest ends; lets stop() tell "rest cut short" from "rest over". */
    private static volatile long currentEndsAt = 0;

    static void start(Context context, long endsAt) {
        currentEndsAt = endsAt;
        Intent intent = new Intent(context, RestTimerService.class).putExtra(EXTRA_ENDS_AT, endsAt);
        androidx.core.content.ContextCompat.startForegroundService(context, intent);
    }

    static void stop(Context context) {
        context.stopService(new Intent(context, RestTimerService.class));
        // Rest skipped or workout left: withdraw any alert. When rest simply ran out,
        // the app also calls stop() — the alert it just raised must stay visible.
        boolean cutShort = System.currentTimeMillis() < currentEndsAt - 1_000;
        NotificationManager nm = context.getSystemService(NotificationManager.class);
        if (cutShort && nm != null) nm.cancel(ALERT_ID);
        currentEndsAt = 0;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        long endsAt = intent != null ? intent.getLongExtra(EXTRA_ENDS_AT, 0) : 0;
        long remaining = endsAt - System.currentTimeMillis();
        createChannels();
        Notification countdown = buildCountdown(endsAt);
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(COUNTDOWN_ID, countdown, ServiceInfo.FOREGROUND_SERVICE_TYPE_SHORT_SERVICE);
        } else {
            startForeground(COUNTDOWN_ID, countdown);
        }
        if (remaining <= 0 || remaining > MAX_REST_MS) {
            stopSelf();
            return START_NOT_STICKY;
        }
        // Keep the CPU awake (screen may stay off) just long enough to alert on time.
        releaseWakeLock();
        PowerManager pm = getSystemService(PowerManager.class);
        if (pm != null) {
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "GymBuddy:RestTimer");
            wakeLock.acquire(remaining + 5_000);
        }
        handler.removeCallbacks(finish);
        handler.postDelayed(finish, remaining);
        return START_NOT_STICKY;
    }

    private void onRestOver() {
        // In the app the countdown screen plays its own chime; alert only when away.
        if (!isAppInForeground()) {
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.notify(ALERT_ID, buildAlert());
        }
        stopSelf();
    }

    @Override
    public void onTimeout(int startId) {
        // Android 14+ ends short services after ~3 minutes; rest never lasts that long.
        stopSelf();
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(finish);
        releaseWakeLock();
        stopForeground(STOP_FOREGROUND_REMOVE);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private Notification buildCountdown(long endsAt) {
        return new NotificationCompat.Builder(this, CHANNEL_COUNTDOWN)
            .setSmallIcon(R.drawable.ic_stat_gymbuddy)
            .setColor(0xFF39FF14)
            .setContentTitle("Resting")
            .setContentText("Next set is coming up, Bro.")
            .setWhen(endsAt)
            .setShowWhen(true)
            .setUsesChronometer(true)
            .setChronometerCountDown(true)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
            // Android otherwise holds service notifications back for up to 10 s.
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(openApp())
            .build();
    }

    private Notification buildAlert() {
        return new NotificationCompat.Builder(this, CHANNEL_ALERT)
            .setSmallIcon(R.drawable.ic_stat_gymbuddy)
            .setColor(0xFF39FF14)
            .setContentTitle("Rest over 💪")
            .setContentText("Time for your next set, Bro.")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setAutoCancel(true)
            .setTimeoutAfter(2 * 60 * 1000)
            .setContentIntent(openApp())
            .build();
    }

    private PendingIntent openApp() {
        Intent intent = new Intent(this, MainActivity.class)
            .setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private void createChannels() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm == null) return;
        NotificationChannel countdown = new NotificationChannel(CHANNEL_COUNTDOWN, "Rest countdown", NotificationManager.IMPORTANCE_LOW);
        countdown.setDescription("Shows the time left on your rest between sets.");
        countdown.setShowBadge(false);
        nm.createNotificationChannel(countdown);
        NotificationChannel alert = new NotificationChannel(CHANNEL_ALERT, "Rest over", NotificationManager.IMPORTANCE_HIGH);
        alert.setDescription("Tells you when your rest is over and the next set is due.");
        alert.enableVibration(true);
        alert.setVibrationPattern(new long[] { 0, 300, 150, 300 });
        alert.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(alert);
    }

    private boolean isAppInForeground() {
        ActivityManager.RunningAppProcessInfo info = new ActivityManager.RunningAppProcessInfo();
        ActivityManager.getMyMemoryState(info);
        PowerManager pm = getSystemService(PowerManager.class);
        boolean screenOn = pm == null || pm.isInteractive();
        return screenOn && info.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND;
    }

    private void releaseWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        wakeLock = null;
    }
}
