package com.serena.chess;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;

/** Fires the daily in-character reminder. */
public class NotifyReceiver extends BroadcastReceiver {

    static final String CHANNEL = "chess_daily";
    static final String PREFS = "chess_store";
    static final int REQ = 7301;
    static final int NOTE_ID = 1001;

    @Override
    public void onReceive(Context ctx, Intent intent) {
        show(ctx);
    }

    /* ─────────────────────────────────────────────────────── scheduling ── */
    private static PendingIntent pending(Context ctx) {
        Intent i = new Intent(ctx, NotifyReceiver.class);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return PendingIntent.getBroadcast(ctx, REQ, i, flags);
    }

    static void schedule(Context ctx) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (!p.getBoolean("notify_on", false)) { cancel(ctx); return; }

        int hour = p.getInt("notify_hour", 19);
        int min = p.getInt("notify_min", 0);

        Calendar c = Calendar.getInstance();
        c.set(Calendar.HOUR_OF_DAY, hour);
        c.set(Calendar.MINUTE, min);
        c.set(Calendar.SECOND, 0);
        c.set(Calendar.MILLISECOND, 0);
        if (c.getTimeInMillis() <= System.currentTimeMillis()) {
            c.add(Calendar.DAY_OF_YEAR, 1);
        }

        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        /* inexact repeating needs no special permission and survives Doze
           well enough for a once-a-day nudge */
        am.setInexactRepeating(AlarmManager.RTC_WAKEUP, c.getTimeInMillis(),
                AlarmManager.INTERVAL_DAY, pending(ctx));
    }

    static void cancel(Context ctx) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.cancel(pending(ctx));
    }

    /* ───────────────────────────────────────────────────── the notice ─── */
    static void ensureChannel(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm =
                (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        NotificationChannel ch = new NotificationChannel(
                CHANNEL, "Daily reminders", NotificationManager.IMPORTANCE_DEFAULT);
        ch.setDescription("A daily nudge from your chess opponents");
        nm.createNotificationChannel(ch);
    }

    static void show(Context ctx) {
        ensureChannel(ctx);
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);

        String title = "Chess";
        String text = "Time for a game?";
        try {
            String pool = p.getString("notify_pool", null);
            if (pool != null) {
                JSONArray arr = new JSONArray(pool);
                if (arr.length() > 0) {
                    JSONObject o = arr.getJSONObject((int) (Math.random() * arr.length()));
                    title = o.optString("title", title);
                    text = o.optString("text", text);
                }
            }
        } catch (Exception ignored) { }

        Intent open = new Intent(ctx, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pi = PendingIntent.getActivity(ctx, 0, open, flags);

        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            b = new Notification.Builder(ctx, CHANNEL);
        } else {
            b = new Notification.Builder(ctx);
        }
        b.setSmallIcon(R.drawable.ic_notify)
         .setContentTitle(title)
         .setContentText(text)
         .setAutoCancel(true)
         .setContentIntent(pi);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN) {
            b.setStyle(new Notification.BigTextStyle().bigText(text));
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            b.setColor(Color.parseColor("#81b64c"));
        }

        NotificationManager nm =
                (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(NOTE_ID, b.build());
    }
}
