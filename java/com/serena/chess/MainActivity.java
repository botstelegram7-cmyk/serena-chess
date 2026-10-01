package com.serena.chess;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class MainActivity extends Activity {

    private static final int BG = Color.parseColor("#312e2b");
    private static final String PREFS = "chess_store";

    private WebView web;
    private SharedPreferences prefs;

    /* ───────────────── window.AndroidStore — persistent key/value ───── */
    /** Share sheet + clipboard, used by invite codes and PGN export. */
    public class Share {
        @JavascriptInterface
        public void share(String text) {
            if (text == null || text.length() == 0) return;
            try {
                Intent i = new Intent(Intent.ACTION_SEND);
                i.setType("text/plain");
                i.putExtra(Intent.EXTRA_TEXT, text);
                Intent c = Intent.createChooser(i, "Share");
                c.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(c);
            } catch (Exception ignored) { }
        }

        @JavascriptInterface
        public void copy(String text) {
            if (text == null) return;
            try {
                ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                if (cm != null) cm.setPrimaryClip(ClipData.newPlainText("Chess", text));
            } catch (Exception ignored) { }
        }
    }

    public class Store {
        @JavascriptInterface
        public void save(String key, String value) { prefs.edit().putString(key, value).apply(); }

        @JavascriptInterface
        public String load(String key) { return prefs.getString(key, null); }

        @JavascriptInterface
        public void clear() { prefs.edit().clear().apply(); }
    }

    /* ─────── window.AndroidNet — HTTPS POST off the file:// origin ──── */
    /* Doing this natively avoids the CORS wall a file:// page would hit. */
    public class Net {
        @JavascriptInterface
        public void post(final String id, final String url, final String bearer, final String body) {
            new Thread(new Runnable() {
                @Override
                public void run() {
                    String out;
                    boolean ok = false;
                    HttpURLConnection c = null;
                    try {
                        c = (HttpURLConnection) new URL(url).openConnection();
                        c.setRequestMethod("POST");
                        c.setRequestProperty("Content-Type", "application/json");
                        c.setRequestProperty("Accept", "application/json");
                        if (bearer != null && bearer.length() > 0) {
                            c.setRequestProperty("Authorization", "Bearer " + bearer.trim());
                        }
                        c.setConnectTimeout(15000);
                        c.setReadTimeout(40000);
                        c.setDoOutput(true);

                        OutputStream os = c.getOutputStream();
                        os.write(body.getBytes("UTF-8"));
                        os.flush();
                        os.close();

                        int code = c.getResponseCode();
                        ok = code >= 200 && code < 300;
                        InputStream is = ok ? c.getInputStream() : c.getErrorStream();
                        StringBuilder sb = new StringBuilder();
                        if (is != null) {
                            BufferedReader r = new BufferedReader(new InputStreamReader(is, "UTF-8"));
                            String line;
                            while ((line = r.readLine()) != null) sb.append(line);
                            r.close();
                        }
                        out = sb.toString();
                    } catch (Exception e) {
                        out = "{\"error\":{\"message\":" + JSONObject.quote(String.valueOf(e)) + "}}";
                    } finally {
                        if (c != null) c.disconnect();
                    }
                    deliver(id, ok, out);
                }
            }).start();
        }
    }

    /* ────────── window.AndroidNotify — daily in-character reminders ──── */
    public class Notify {
        @JavascriptInterface
        public void enable(int hour, int minute, String poolJson) {
            prefs.edit()
                 .putBoolean("notify_on", true)
                 .putInt("notify_hour", hour)
                 .putInt("notify_min", minute)
                 .putString("notify_pool", poolJson)
                 .apply();
            NotifyReceiver.schedule(MainActivity.this);
        }

        @JavascriptInterface
        public void disable() {
            prefs.edit().putBoolean("notify_on", false).apply();
            NotifyReceiver.cancel(MainActivity.this);
        }

        @JavascriptInterface
        public void test(String poolJson) {
            prefs.edit().putString("notify_pool", poolJson).apply();
            NotifyReceiver.show(MainActivity.this);
        }

        @JavascriptInterface
        public void requestPermission() {
            if (Build.VERSION.SDK_INT < 33) return;
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        if (checkSelfPermission("android.permission.POST_NOTIFICATIONS")
                                != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                            requestPermissions(
                                new String[]{"android.permission.POST_NOTIFICATIONS"}, 91);
                        }
                    } catch (Exception ignored) { }
                }
            });
        }
    }

    private void deliver(final String id, final boolean ok, final String payload) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (web == null) return;
                String js = "window.__netDone(" + JSONObject.quote(id) + ","
                        + (ok ? "true" : "false") + "," + JSONObject.quote(payload) + ")";
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
                    web.evaluateJavascript(js, null);
                } else {
                    web.loadUrl("javascript:" + js);
                }
            }
        });
    }

    /* ─────────────────────────────────────────────────────── activity ── */
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE);

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setTextZoom(100);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN_MR1) {
            s.setMediaPlaybackRequiresUserGesture(false);
        }

        web.setBackgroundColor(BG);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setLongClickable(false);
        web.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        /* keep app pages inside the WebView, send real links to the OS
           (so the Telegram credits actually open Telegram)                */
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, String url) {
                return openExternally(url);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                return openExternally(req.getUrl().toString());
            }
        });

        web.addJavascriptInterface(new Store(), "AndroidStore");
        web.addJavascriptInterface(new Share(), "AndroidShare");
        web.addJavascriptInterface(new Net(), "AndroidNet");
        web.addJavascriptInterface(new Notify(), "AndroidNotify");
        web.loadUrl("file:///android_asset/index.html");

        setContentView(web);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            getWindow().setStatusBarColor(Color.parseColor("#262522"));
            getWindow().setNavigationBarColor(Color.parseColor("#262522"));
        }
    }

    private boolean openExternally(String url) {
        if (url == null) return false;
        if (url.startsWith("file://")) return false;      // our own pages
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        } catch (Exception ignored) { }
        return true;
    }

    @Override
    public void onBackPressed() {
        if (web == null) { super.onBackPressed(); return; }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            web.evaluateJavascript(
                "(function(){try{return window.appBack&&window.appBack()?'1':'0';}catch(e){return '0';}})()",
                new ValueCallback<String>() {
                    @Override
                    public void onReceiveValue(String value) {
                        if (value == null || value.indexOf('1') < 0) finish();
                    }
                });
        } else {
            super.onBackPressed();
        }
    }

    @Override protected void onPause()  { if (web != null) web.onPause();  super.onPause(); }
    @Override protected void onResume() { super.onResume(); if (web != null) web.onResume(); }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.removeJavascriptInterface("AndroidStore");
            web.removeJavascriptInterface("AndroidNet");
            web.removeJavascriptInterface("AndroidNotify");
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
