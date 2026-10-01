package com.serena.chess;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Re-arms the daily reminder after a reboot. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        String a = intent != null ? intent.getAction() : null;
        if (a == null) return;
        if (a.equals(Intent.ACTION_BOOT_COMPLETED) || a.equals("android.intent.action.QUICKBOOT_POWERON")) {
            NotifyReceiver.schedule(ctx);
        }
    }
}
