package org.juaco2r.histoannotator;

import android.util.Base64;
import android.os.Build;
import android.security.NetworkSecurityPolicy;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

@CapacitorPlugin(name = "ServerHttp")
public class ServerHttpPlugin extends Plugin {

    @PluginMethod
    public void request(PluginCall call) {
        final String rawUrl = call.getString("url");
        final String method = valueOr(call.getString("method"), "GET").toUpperCase();

        final Integer requestedConnectTimeout = call.getInt("connectTimeout");
        final Integer requestedReadTimeout = call.getInt("readTimeout");

        final int connectTimeout = positiveOr(requestedConnectTimeout, 10000);
        final int readTimeout = positiveOr(requestedReadTimeout, 12000);

        final JSObject requestHeaders = call.getObject("headers");
        final String textBody = call.getString("body");
        final String base64Body = call.getString("bodyBase64");

        if (rawUrl == null || rawUrl.trim().isEmpty()) {
            call.reject("ServerHttp requires a URL");
            return;
        }

        final URL parsedUrl;

        try {
            parsedUrl = new URL(rawUrl.trim());
            final String protocol = parsedUrl.getProtocol().toLowerCase();

            if (!"http".equals(protocol) && !"https".equals(protocol)) {
                call.reject("ServerHttp only supports http:// and https://");
                return;
            }

            if (
                "http".equals(protocol)
                && !isHttpCleartextPermitted(parsedUrl)
            ) {
                call.reject(
                    "Android network policy blocks HTTP to "
                    + parsedUrl.getHost()
                    + ". HistoAnnotator must permit trusted-LAN cleartext traffic."
                );
                return;
            }
        } catch (Exception error) {
            call.reject("Invalid server URL: " + error.getMessage(), error);
            return;
        }

        new Thread(
            () -> executeRequest(
                call,
                parsedUrl,
                method,
                requestHeaders,
                textBody,
                base64Body,
                connectTimeout,
                readTimeout
            ),
            "HistoAnnotator-ServerHttp"
        ).start();
    }

    private void executeRequest(
        PluginCall call,
        URL url,
        String method,
        JSObject requestHeaders,
        String textBody,
        String base64Body,
        int connectTimeout,
        int readTimeout
    ) {
        HttpURLConnection connection = null;

        try {
            connection = (HttpURLConnection) url.openConnection();
            connection.setConnectTimeout(connectTimeout);
            connection.setReadTimeout(readTimeout);
            connection.setInstanceFollowRedirects(true);
            connection.setUseCaches(false);
            connection.setRequestMethod(method);
            connection.setRequestProperty("Accept", "*/*");

            if (requestHeaders != null) {
                final Iterator<String> keys = requestHeaders.keys();

                while (keys.hasNext()) {
                    final String key = keys.next();
                    final Object value = requestHeaders.opt(key);

                    if (value != null) {
                        connection.setRequestProperty(key, String.valueOf(value));
                    }
                }
            }

            byte[] requestBody = null;

            if (base64Body != null) {
                requestBody = Base64.decode(base64Body, Base64.DEFAULT);
            } else if (textBody != null) {
                requestBody = textBody.getBytes(StandardCharsets.UTF_8);
            }

            if (requestBody != null) {
                connection.setDoOutput(true);
                connection.setFixedLengthStreamingMode(requestBody.length);

                try (OutputStream output = connection.getOutputStream()) {
                    output.write(requestBody);
                }
            }

            final int status = connection.getResponseCode();
            InputStream stream = status >= 400
                ? connection.getErrorStream()
                : connection.getInputStream();

            final byte[] responseBytes = readAll(stream);
            final String contentType = valueOr(connection.getContentType(), "");
            final boolean binary = isBinaryContentType(contentType);

            final JSObject result = new JSObject();
            result.put("status", status);
            result.put("statusText", valueOr(connection.getResponseMessage(), ""));
            result.put("url", connection.getURL().toString());
            result.put("contentType", contentType);
            result.put("binary", binary);

            final JSObject responseHeaders = new JSObject();

            for (Map.Entry<String, List<String>> entry : connection.getHeaderFields().entrySet()) {
                final String key = entry.getKey();

                if (key == null || entry.getValue() == null) {
                    continue;
                }

                responseHeaders.put(key, String.join(", ", entry.getValue()));
            }

            result.put("headers", responseHeaders);

            if (binary) {
                result.put(
                    "bodyBase64",
                    Base64.encodeToString(responseBytes, Base64.NO_WRAP)
                );
            } else {
                result.put(
                    "body",
                    new String(responseBytes, StandardCharsets.UTF_8)
                );
            }

            call.resolve(result);

        } catch (Exception error) {
            call.reject(
                "Native server request failed: " + safeMessage(error),
                error
            );
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    private static byte[] readAll(InputStream stream) throws Exception {
        if (stream == null) {
            return new byte[0];
        }

        try (
            InputStream input = stream;
            ByteArrayOutputStream output = new ByteArrayOutputStream()
        ) {
            final byte[] buffer = new byte[64 * 1024];

            while (true) {
                final int read = input.read(buffer);

                if (read < 0) {
                    break;
                }

                if (read > 0) {
                    output.write(buffer, 0, read);
                }
            }

            return output.toByteArray();
        }
    }

    private static boolean isBinaryContentType(String value) {
        final String contentType = valueOr(value, "").toLowerCase();

        if (
            contentType.startsWith("text/")
            || contentType.contains("json")
            || contentType.contains("xml")
            || contentType.contains("javascript")
            || contentType.contains("geo+json")
            || contentType.contains("svg")
        ) {
            return false;
        }

        return (
            contentType.startsWith("image/")
            || contentType.startsWith("audio/")
            || contentType.startsWith("video/")
            || contentType.contains("octet-stream")
            || contentType.contains("application/pdf")
            || contentType.contains("application/zip")
        );
    }

    private static boolean isHttpCleartextPermitted(URL url) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            return true;
        }

        final NetworkSecurityPolicy policy =
            NetworkSecurityPolicy.getInstance();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            return policy.isCleartextTrafficPermitted(url.getHost());
        }

        return policy.isCleartextTrafficPermitted();
    }

    private static int positiveOr(Integer value, int fallback) {
        if (value == null || value <= 0) {
            return fallback;
        }
        return value;
    }

    private static String valueOr(String value, String fallback) {
        return value == null ? fallback : value;
    }

    private static String safeMessage(Throwable error) {
        if (error == null) {
            return "Unknown Android network error";
        }

        final String message = error.getMessage();

        if (message == null || message.trim().isEmpty()) {
            return error.getClass().getSimpleName();
        }

        return error.getClass().getSimpleName() + ": " + message;
    }
}
