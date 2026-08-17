package org.juaco2r.histoannotator;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import android.system.Os;
import android.system.OsConstants;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.io.FileInputStream;
import java.io.ByteArrayOutputStream;
import java.io.FileOutputStream;
import java.io.File;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.channels.FileChannel;
import java.util.Arrays;
import android.util.Base64;
import java.security.MessageDigest;
import java.util.Locale;

@CapacitorPlugin(name = "LocalImage")
public class LocalImagePlugin extends Plugin {

    private static final String PREFS_NAME = "histoannotator_local_images_v1";
    private static final String CATALOG_KEY = "catalog";

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    private JSONArray readCatalog() {
        String raw = prefs().getString(CATALOG_KEY, "[]");
        try {
            return new JSONArray(raw == null ? "[]" : raw);
        } catch (JSONException error) {
            return new JSONArray();
        }
    }

    private void writeCatalog(JSONArray catalog) {
        prefs().edit().putString(CATALOG_KEY, catalog.toString()).apply();
    }

    private String stableId(Uri uri) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] bytes = digest.digest(uri.toString().getBytes(StandardCharsets.UTF_8));
            StringBuilder value = new StringBuilder("local-");
            for (int i = 0; i < 12 && i < bytes.length; i++) {
                value.append(String.format(Locale.US, "%02x", bytes[i]));
            }
            return value.toString();
        } catch (Exception error) {
            return "local-" + Integer.toHexString(uri.toString().hashCode());
        }
    }

    private String extensionFor(String name) {
        String lower = name == null ? "" : name.toLowerCase(Locale.US);
        if (lower.endsWith(".ome.tiff")) return ".ome.tiff";
        if (lower.endsWith(".ome.tif")) return ".ome.tif";
        int dot = lower.lastIndexOf('.');
        return dot >= 0 ? lower.substring(dot) : "";
    }

    private boolean isSupportedName(String name) {
        String ext = extensionFor(name);
        return ext.equals(".tif")
            || ext.equals(".tiff")
            || ext.equals(".ome.tif")
            || ext.equals(".ome.tiff")
            || ext.equals(".ndpi")
            || ext.equals(".svs")
            || ext.equals(".png")
            || ext.equals(".jpg")
            || ext.equals(".jpeg")
            || ext.equals(".webp");
    }

    private JSONObject queryMetadata(Uri uri) throws Exception {
        ContentResolver resolver = getContext().getContentResolver();
        String displayName = null;
        Long size = null;

        try (Cursor cursor = resolver.query(uri, null, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                int sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE);

                if (nameIndex >= 0 && !cursor.isNull(nameIndex)) {
                    displayName = cursor.getString(nameIndex);
                }
                if (sizeIndex >= 0 && !cursor.isNull(sizeIndex)) {
                    size = cursor.getLong(sizeIndex);
                }
            }
        }

        if (displayName == null || displayName.trim().isEmpty()) {
            displayName = uri.getLastPathSegment();
        }
        if (displayName == null || displayName.trim().isEmpty()) {
            displayName = "Local image";
        }

        String mimeType = resolver.getType(uri);
        String extension = extensionFor(displayName);

        JSONObject item = new JSONObject();
        item.put("id", stableId(uri));
        item.put("uri", uri.toString());
        item.put("name", displayName);
        item.put("relativePath", displayName);
        item.put("sizeBytes", size == null ? JSONObject.NULL : size);
        item.put("mimeType", mimeType == null ? JSONObject.NULL : mimeType);
        item.put("extension", extension);
        item.put("sourceKind", "android-local");
        item.put("localNative", true);
        item.put("supportedName", isSupportedName(displayName));
        return item;
    }

    private boolean canRead(Uri uri) {
        try (ParcelFileDescriptor descriptor =
                 getContext().getContentResolver().openFileDescriptor(uri, "r")) {
            return descriptor != null;
        } catch (Exception error) {
            return false;
        }
    }

    private boolean isSeekable(Uri uri) {
        try (ParcelFileDescriptor descriptor =
                 getContext().getContentResolver().openFileDescriptor(uri, "r")) {
            if (descriptor == null) return false;
            Os.lseek(descriptor.getFileDescriptor(), 0, OsConstants.SEEK_CUR);
            return true;
        } catch (Exception error) {
            return false;
        }
    }

    private JSONObject upsert(JSONObject item) throws JSONException {
        JSONArray source = readCatalog();
        JSONArray output = new JSONArray();
        String targetId = item.getString("id");
        boolean replaced = false;

        for (int i = 0; i < source.length(); i++) {
            JSONObject existing = source.optJSONObject(i);
            if (existing == null) continue;

            if (targetId.equals(existing.optString("id"))) {
                output.put(item);
                replaced = true;
            } else {
                output.put(existing);
            }
        }

        if (!replaced) output.put(item);
        writeCatalog(output);
        return item;
    }

    @PluginMethod
    public void getCapabilities(PluginCall call) {
        JSObject result = new JSObject();
        result.put("filePicker", true);
        result.put("persistedUri", true);
        result.put("probe", true);
        result.put("tileReader", "geotiffjs-range");
        result.put("rangeReader", true);
        result.put("persistentTileCache", true);
        result.put("uncompressedRgbFastPath", true);
        result.put("nativeTiffInspector", true);
        result.put("tileCacheMaxBytes", LOCAL_TILE_CACHE_MAX_BYTES);
        result.put("persistentPreview", true);
        JSONArray extensions = new JSONArray();
        extensions.put(".tif");
        extensions.put(".tiff");
        extensions.put(".ome.tif");
        extensions.put(".ome.tiff");
        extensions.put(".ndpi");
        extensions.put(".svs");
        extensions.put(".png");
        extensions.put(".jpg");
        extensions.put(".jpeg");
        extensions.put(".webp");
        result.put("extensions", extensions);
        call.resolve(result);
    }

    @PluginMethod
    public void pickImage(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION
                | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
        );
        startActivityForResult(call, intent, "pickImageResult");
    }

    @ActivityCallback
    private void pickImageResult(PluginCall call, ActivityResult result) {
        if (call == null) return;

        if (result.getResultCode() != Activity.RESULT_OK) {
            JSObject response = new JSObject();
            response.put("cancelled", true);
            call.resolve(response);
            return;
        }

        Intent data = result.getData();
        Uri uri = data == null ? null : data.getData();

        if (uri == null) {
            call.reject("No document URI was returned by Android");
            return;
        }

        try {
            JSONObject item = queryMetadata(uri);

            if (!item.optBoolean("supportedName", false)) {
                call.reject(
                    "Unsupported file type. Use TIFF/OME-TIFF, NDPI, SVS, PNG, JPEG or WebP."
                );
                return;
            }

            boolean persisted = false;
            try {
                int flags = data.getFlags()
                    & (Intent.FLAG_GRANT_READ_URI_PERMISSION
                        | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);

                if ((flags & Intent.FLAG_GRANT_READ_URI_PERMISSION) == 0) {
                    flags |= Intent.FLAG_GRANT_READ_URI_PERMISSION;
                }

                getContext()
                    .getContentResolver()
                    .takePersistableUriPermission(uri, flags);
                persisted = true;
            } catch (Exception ignored) {
                // Some providers may only grant session access.
            }

            item.put("persisted", persisted);
            item.put("accessible", canRead(uri));
            item.put("seekable", isSeekable(uri));
            item.put("lastOpened", System.currentTimeMillis());
            upsert(item);

            JSObject response = new JSObject();
            response.put("cancelled", false);
            response.put("image", item);
            call.resolve(response);
        } catch (Exception error) {
            call.reject(
                error.getMessage() == null
                    ? "Could not register local image"
                    : error.getMessage(),
                null,
                error
            );
        }
    }

    @PluginMethod
    public void listImages(PluginCall call) {
        try {
            JSONArray catalog = readCatalog();
            JSONArray output = new JSONArray();

            for (int i = 0; i < catalog.length(); i++) {
                JSONObject item = catalog.optJSONObject(i);
                if (item == null) continue;

                String rawUri = item.optString("uri", "");
                boolean accessible = false;
                boolean seekable = false;

                if (!rawUri.isEmpty()) {
                    Uri uri = Uri.parse(rawUri);
                    accessible = canRead(uri);
                    if (accessible) seekable = isSeekable(uri);
                }

                item.put("accessible", accessible);
                item.put("seekable", seekable);
                output.put(item);
            }

            JSObject response = new JSObject();
            response.put("images", output);
            response.put("count", output.length());
            call.resolve(response);
        } catch (Exception error) {
            call.reject(
                error.getMessage() == null
                    ? "Could not list local images"
                    : error.getMessage(),
                null,
                error
            );
        }
    }

    @PluginMethod
    public void probeImage(PluginCall call) {
        String rawUri = call.getString("uri");
        if (rawUri == null || rawUri.trim().isEmpty()) {
            call.reject("uri is required");
            return;
        }

        Uri uri = Uri.parse(rawUri);

        try {
            JSONObject item = queryMetadata(uri);
            item.put("accessible", canRead(uri));
            item.put("seekable", isSeekable(uri));

            try (ParcelFileDescriptor descriptor =
                     getContext().getContentResolver().openFileDescriptor(uri, "r")) {
                if (descriptor != null) {
                    long statSize = descriptor.getStatSize();
                    item.put(
                        "statSize",
                        statSize >= 0 ? statSize : JSONObject.NULL
                    );
                }
            }

            JSObject response = new JSObject();
            response.put("image", item);
            call.resolve(response);
        } catch (Exception error) {
            call.reject(
                error.getMessage() == null
                    ? "Could not inspect local image"
                    : error.getMessage(),
                null,
                error
            );
        }
    }


    @PluginMethod
    public void readRange(PluginCall call) {
        String rawUri = call.getString("uri");

        if (rawUri == null || rawUri.trim().isEmpty()) {
            call.reject("uri is required");
            return;
        }

        Object rawOffset = call.getData().opt("offset");
        Object rawLength = call.getData().opt("length");

        if (!(rawOffset instanceof Number) || !(rawLength instanceof Number)) {
            call.reject("offset and length must be numeric");
            return;
        }

        long offset = Math.max(0L, ((Number) rawOffset).longValue());
        long requestedLong = ((Number) rawLength).longValue();

        if (requestedLong <= 0L) {
            call.reject("length must be greater than zero");
            return;
        }

        final int maxRead = 16 * 1024 * 1024;
        if (requestedLong > maxRead) {
            call.reject("Requested TIFF range is too large");
            return;
        }

        int requested = (int) requestedLong;
        Uri uri = Uri.parse(rawUri);

        try (
            ParcelFileDescriptor descriptor =
                getContext().getContentResolver().openFileDescriptor(uri, "r");
            FileInputStream input =
                descriptor == null
                    ? null
                    : new FileInputStream(descriptor.getFileDescriptor())
        ) {
            if (descriptor == null || input == null) {
                call.reject("Could not open the local image");
                return;
            }

            FileChannel channel = input.getChannel();
            channel.position(offset);

            byte[] buffer = new byte[requested];
            ByteBuffer target = ByteBuffer.wrap(buffer);
            int totalRead = 0;

            while (target.hasRemaining()) {
                int count = channel.read(target);
                if (count < 0 || count == 0) break;
                totalRead += count;
            }

            byte[] payload =
                totalRead == buffer.length
                    ? buffer
                    : Arrays.copyOf(buffer, totalRead);

            long totalSize = descriptor.getStatSize();

            JSObject response = new JSObject();
            response.put("offset", offset);
            response.put("bytesRead", totalRead);
            response.put("totalSize", totalSize >= 0 ? totalSize : JSONObject.NULL);
            response.put(
                "dataBase64",
                Base64.encodeToString(payload, Base64.NO_WRAP)
            );
            call.resolve(response);

        } catch (Exception error) {
            call.reject(
                error.getMessage() == null
                    ? "Could not read the TIFF byte range"
                    : error.getMessage(),
                null,
                error
            );
        }
    }


    private File previewDirectory() {
        File directory = new File(
            getContext().getFilesDir(),
            "histoannotator-previews-v1"
        );

        if (!directory.exists()) {
            directory.mkdirs();
        }

        return directory;
    }

    private File previewFile(Uri uri) {
        return new File(
            previewDirectory(),
            stableId(uri) + ".jpg"
        );
    }

    private void prunePreviewCache() {
        final long maxBytes = 128L * 1024L * 1024L;
        final int maxFiles = 80;

        File[] files = previewDirectory().listFiles();

        if (files == null || files.length == 0) {
            return;
        }

        Arrays.sort(
            files,
            (a, b) ->
                Long.compare(
                    b.lastModified(),
                    a.lastModified()
                )
        );

        long total = 0L;

        for (int i = 0; i < files.length; i++) {
            File file = files[i];

            if (!file.isFile()) {
                continue;
            }

            long size = Math.max(
                0L,
                file.length()
            );

            boolean keep =
                i < maxFiles
                    && total + size <= maxBytes;

            if (keep) {
                total += size;
            } else {
                file.delete();
            }
        }
    }

    @PluginMethod
    public void getPreview(PluginCall call) {
        String rawUri = call.getString("uri");

        if (rawUri == null || rawUri.trim().isEmpty()) {
            call.reject("uri is required");
            return;
        }

        Uri uri = Uri.parse(rawUri);
        File file = previewFile(uri);

        JSObject response = new JSObject();

        if (!file.exists() || !file.isFile()) {
            response.put("exists", false);
            call.resolve(response);
            return;
        }

        try (
            FileInputStream input =
                new FileInputStream(file);
            ByteArrayOutputStream output =
                new ByteArrayOutputStream(
                    (int) Math.min(
                        Integer.MAX_VALUE,
                        Math.max(1024L, file.length())
                    )
                )
        ) {
            byte[] buffer =
                new byte[16 * 1024];

            int count;

            while (
                (count = input.read(buffer)) >= 0
            ) {
                if (count == 0) {
                    continue;
                }

                output.write(
                    buffer,
                    0,
                    count
                );
            }

            file.setLastModified(
                System.currentTimeMillis()
            );

            byte[] data =
                output.toByteArray();

            response.put("exists", true);
            response.put(
                "bytes",
                data.length
            );
            response.put(
                "dataBase64",
                Base64.encodeToString(
                    data,
                    Base64.NO_WRAP
                )
            );

            call.resolve(response);

        } catch (Exception error) {
            call.reject(
                error.getMessage() == null
                    ? "Could not read the local TIFF preview"
                    : error.getMessage(),
                null,
                error
            );
        }
    }

    @PluginMethod
    public void savePreview(PluginCall call) {
        String rawUri = call.getString("uri");
        String dataBase64 =
            call.getString("dataBase64");

        if (rawUri == null || rawUri.trim().isEmpty()) {
            call.reject("uri is required");
            return;
        }

        if (
            dataBase64 == null
                || dataBase64.trim().isEmpty()
        ) {
            call.reject("dataBase64 is required");
            return;
        }

        try {
            byte[] data =
                Base64.decode(
                    dataBase64,
                    Base64.DEFAULT
                );

            final int maxPreviewBytes =
                4 * 1024 * 1024;

            if (data.length > maxPreviewBytes) {
                call.reject(
                    "Preview exceeds the 4 MB safety limit"
                );
                return;
            }

            Uri uri = Uri.parse(rawUri);
            File file = previewFile(uri);

            try (
                FileOutputStream output =
                    new FileOutputStream(
                        file,
                        false
                    )
            ) {
                output.write(data);
                output.flush();
            }

            file.setLastModified(
                System.currentTimeMillis()
            );

            prunePreviewCache();

            JSObject response =
                new JSObject();

            response.put("saved", true);
            response.put(
                "bytes",
                data.length
            );

            call.resolve(response);

        } catch (Exception error) {
            call.reject(
                error.getMessage() == null
                    ? "Could not save the local TIFF preview"
                    : error.getMessage(),
                null,
                error
            );
        }
    }

    @PluginMethod
    public void deletePreview(PluginCall call) {
        String rawUri = call.getString("uri");

        if (rawUri == null || rawUri.trim().isEmpty()) {
            call.reject("uri is required");
            return;
        }

        Uri uri = Uri.parse(rawUri);
        File file = previewFile(uri);

        boolean deleted =
            !file.exists() || file.delete();

        JSObject response =
            new JSObject();

        response.put("deleted", deleted);

        call.resolve(response);
    }


    private static final long LOCAL_TILE_CACHE_MAX_BYTES =
        512L * 1024L * 1024L;

    private File localTileCacheRoot() {
        File base =
            getContext().getExternalFilesDir(null);

        if (base == null) {
            base = getContext().getFilesDir();
        }

        File root = new File(
            base,
            "histoannotator-tile-cache-v1"
        );

        if (!root.exists()) {
            root.mkdirs();
        }

        return root;
    }

    private SharedPreferences localTileCachePreferences() {
        return getContext().getSharedPreferences(
            "histoannotator_tile_cache_v1",
            Context.MODE_PRIVATE
        );
    }

    private String localTileCachePrefix(Uri uri) {
        return stableId(uri) + ":";
    }

    private File localTileImageDirectory(Uri uri) {
        File directory = new File(
            localTileCacheRoot(),
            stableId(uri)
        );

        if (!directory.exists()) {
            directory.mkdirs();
        }

        return directory;
    }

    private File localTileFile(
        Uri uri,
        int level,
        int x,
        int y
    ) {
        File levelDirectory = new File(
            localTileImageDirectory(uri),
            "L" + level
        );

        if (!levelDirectory.exists()) {
            levelDirectory.mkdirs();
        }

        return new File(
            levelDirectory,
            x + "_" + y + ".jpg"
        );
    }

    private void deleteRecursively(File file) {
        if (file == null || !file.exists()) {
            return;
        }

        if (file.isDirectory()) {
            File[] children = file.listFiles();

            if (children != null) {
                for (File child : children) {
                    deleteRecursively(child);
                }
            }
        }

        file.delete();
    }

    private void clearLocalTileCacheForUri(Uri uri) {
        deleteRecursively(
            new File(
                localTileCacheRoot(),
                stableId(uri)
            )
        );

        String prefix =
            localTileCachePrefix(uri);

        localTileCachePreferences()
            .edit()
            .remove(prefix + "tiles")
            .remove(prefix + "bytes")
            .apply();
    }



    private static long unsignedInt(int value) {
        return value & 0xffffffffL;
    }

    private static int tiffTypeSize(int type) {
        switch (type) {
            case 1:
            case 2:
            case 6:
            case 7:
                return 1;
            case 3:
            case 8:
                return 2;
            case 4:
            case 9:
            case 11:
                return 4;
            case 5:
            case 10:
            case 12:
                return 8;
            default:
                return 0;
        }
    }

    private static byte[] readChannelBytes(
        FileChannel channel,
        long offset,
        int length
    ) throws Exception {
        if (offset < 0L || length < 0) {
            throw new IllegalArgumentException(
                "Invalid TIFF byte-range"
            );
        }

        ByteBuffer buffer =
            ByteBuffer.allocate(length);

        channel.position(offset);

        while (buffer.hasRemaining()) {
            int count =
                channel.read(buffer);

            if (count < 0) {
                throw new java.io.EOFException(
                    "Unexpected end of TIFF file"
                );
            }

            if (count == 0) {
                throw new java.io.EOFException(
                    "Could not advance TIFF read"
                );
            }
        }

        return buffer.array();
    }

    private static long[] readClassicTiffValues(
        FileChannel channel,
        ByteOrder order,
        int type,
        long count,
        byte[] inlineValue,
        long valueOffset
    ) throws Exception {
        int typeSize =
            tiffTypeSize(type);

        if (
            typeSize <= 0
            || count <= 0L
            || count > 1000000L
        ) {
            return new long[0];
        }

        long totalBytesLong =
            count * (long) typeSize;

        if (
            totalBytesLong > Integer.MAX_VALUE
        ) {
            throw new IllegalArgumentException(
                "TIFF tag array is too large"
            );
        }

        int totalBytes =
            (int) totalBytesLong;

        byte[] raw;

        if (totalBytes <= 4) {
            raw =
                new byte[totalBytes];

            System.arraycopy(
                inlineValue,
                0,
                raw,
                0,
                totalBytes
            );
        } else {
            raw =
                readChannelBytes(
                    channel,
                    valueOffset,
                    totalBytes
                );
        }

        ByteBuffer values =
            ByteBuffer.wrap(raw)
                .order(order);

        long[] result =
            new long[(int) count];

        for (
            int index = 0;
            index < result.length;
            index += 1
        ) {
            switch (type) {
                case 1:
                case 2:
                case 6:
                case 7:
                    result[index] =
                        values.get() & 0xff;
                    break;
                case 3:
                case 8:
                    result[index] =
                        values.getShort() & 0xffff;
                    break;
                case 4:
                case 9:
                    result[index] =
                        unsignedInt(
                            values.getInt()
                        );
                    break;
                default:
                    return new long[0];
            }
        }

        return result;
    }

    private static JSONArray longsToJsonArray(
        long[] values
    ) {
        JSONArray array =
            new JSONArray();

        if (values == null) {
            return array;
        }

        for (long value : values) {
            array.put(value);
        }

        return array;
    }

    @PluginMethod
    public void inspectBasicTiff(PluginCall call) {
        String rawUri =
            call.getString("uri");

        if (
            rawUri == null
            || rawUri.trim().isEmpty()
        ) {
            call.reject("uri is required");
            return;
        }

        Uri uri =
            Uri.parse(rawUri);

        try (
            ParcelFileDescriptor descriptor =
                getContext()
                    .getContentResolver()
                    .openFileDescriptor(
                        uri,
                        "r"
                    )
        ) {
            if (descriptor == null) {
                call.reject(
                    "Could not open TIFF for native inspection"
                );
                return;
            }

            try (
                FileInputStream input =
                    new FileInputStream(
                        descriptor.getFileDescriptor()
                    )
            ) {
                FileChannel channel =
                    input.getChannel();

                long fileSize =
                    channel.size();

                if (fileSize < 8L) {
                    call.reject(
                        "File is too small to be a TIFF"
                    );
                    return;
                }

                byte[] headerBytes =
                    readChannelBytes(
                        channel,
                        0L,
                        8
                    );

                ByteOrder order;

                if (
                    headerBytes[0] == 'I'
                    && headerBytes[1] == 'I'
                ) {
                    order =
                        ByteOrder.LITTLE_ENDIAN;
                } else if (
                    headerBytes[0] == 'M'
                    && headerBytes[1] == 'M'
                ) {
                    order =
                        ByteOrder.BIG_ENDIAN;
                } else {
                    JSObject response =
                        new JSObject();

                    response.put(
                        "recognized",
                        false
                    );

                    response.put(
                        "reason",
                        "Not a TIFF byte-order signature"
                    );

                    call.resolve(response);
                    return;
                }

                ByteBuffer header =
                    ByteBuffer.wrap(
                        headerBytes
                    ).order(order);

                int magic =
                    header.getShort(
                        2
                    ) & 0xffff;

                JSObject response =
                    new JSObject();

                response.put(
                    "recognized",
                    true
                );

                response.put(
                    "byteOrder",
                    order
                        == ByteOrder.LITTLE_ENDIAN
                            ? "II"
                            : "MM"
                );

                response.put(
                    "fileSize",
                    fileSize
                );

                if (magic == 43) {
                    response.put(
                        "classicTiff",
                        false
                    );

                    response.put(
                        "bigTiff",
                        true
                    );

                    response.put(
                        "directRgbSupported",
                        false
                    );

                    response.put(
                        "reason",
                        "BigTIFF uses the general TIFF reader"
                    );

                    call.resolve(response);
                    return;
                }

                if (magic != 42) {
                    response.put(
                        "classicTiff",
                        false
                    );

                    response.put(
                        "directRgbSupported",
                        false
                    );

                    response.put(
                        "reason",
                        "Unsupported TIFF magic"
                    );

                    call.resolve(response);
                    return;
                }

                response.put(
                    "classicTiff",
                    true
                );

                response.put(
                    "bigTiff",
                    false
                );

                long ifdOffset =
                    unsignedInt(
                        header.getInt(4)
                    );

                if (
                    ifdOffset <= 0L
                    || ifdOffset + 2L > fileSize
                ) {
                    throw new IllegalArgumentException(
                        "Invalid first TIFF IFD offset"
                    );
                }

                byte[] countBytes =
                    readChannelBytes(
                        channel,
                        ifdOffset,
                        2
                    );

                int entryCount =
                    ByteBuffer.wrap(
                        countBytes
                    )
                        .order(order)
                        .getShort()
                        & 0xffff;

                if (
                    entryCount <= 0
                    || entryCount > 4096
                ) {
                    throw new IllegalArgumentException(
                        "Invalid TIFF IFD entry count"
                    );
                }

                byte[] entries =
                    readChannelBytes(
                        channel,
                        ifdOffset + 2L,
                        entryCount * 12
                    );

                long width = 0L;
                long height = 0L;
                long compression = 1L;
                long photometric = 0L;
                long samplesPerPixel = 1L;
                long rowsPerStrip = 0L;
                long planarConfiguration = 1L;
                long[] bitsPerSample =
                    new long[0];
                long[] stripOffsets =
                    new long[0];
                long[] stripByteCounts =
                    new long[0];

                for (
                    int index = 0;
                    index < entryCount;
                    index += 1
                ) {
                    int base =
                        index * 12;

                    ByteBuffer entry =
                        ByteBuffer.wrap(
                            entries,
                            base,
                            12
                        ).slice().order(order);

                    int tag =
                        entry.getShort(0)
                        & 0xffff;

                    int type =
                        entry.getShort(2)
                        & 0xffff;

                    long count =
                        unsignedInt(
                            entry.getInt(4)
                        );

                    byte[] inline =
                        new byte[4];

                    System.arraycopy(
                        entries,
                        base + 8,
                        inline,
                        0,
                        4
                    );

                    long valueOffset =
                        unsignedInt(
                            entry.getInt(8)
                        );

                    boolean wanted =
                        tag == 256
                        || tag == 257
                        || tag == 258
                        || tag == 259
                        || tag == 262
                        || tag == 273
                        || tag == 277
                        || tag == 278
                        || tag == 279
                        || tag == 284;

                    if (!wanted) {
                        continue;
                    }

                    long[] values =
                        readClassicTiffValues(
                            channel,
                            order,
                            type,
                            count,
                            inline,
                            valueOffset
                        );

                    if (values.length == 0) {
                        continue;
                    }

                    switch (tag) {
                        case 256:
                            width = values[0];
                            break;
                        case 257:
                            height = values[0];
                            break;
                        case 258:
                            bitsPerSample = values;
                            break;
                        case 259:
                            compression = values[0];
                            break;
                        case 262:
                            photometric = values[0];
                            break;
                        case 273:
                            stripOffsets = values;
                            break;
                        case 277:
                            samplesPerPixel = values[0];
                            break;
                        case 278:
                            rowsPerStrip = values[0];
                            break;
                        case 279:
                            stripByteCounts = values;
                            break;
                        case 284:
                            planarConfiguration = values[0];
                            break;
                        default:
                            break;
                    }
                }

                if (rowsPerStrip <= 0L) {
                    rowsPerStrip =
                        height;
                }

                boolean bitsEight =
                    bitsPerSample.length > 0;

                for (
                    long value
                    : bitsPerSample
                ) {
                    if (value != 8L) {
                        bitsEight = false;
                        break;
                    }
                }

                long expectedBytes =
                    width
                    * height
                    * 3L;

                long reportedStripBytes =
                    0L;

                for (
                    long value
                    : stripByteCounts
                ) {
                    reportedStripBytes +=
                        Math.max(
                            0L,
                            value
                        );
                }

                boolean stripShapeValid =
                    stripOffsets.length > 0
                    && (
                        stripByteCounts.length == 0
                        || stripByteCounts.length
                            == stripOffsets.length
                    );

                boolean byteCountValid =
                    stripByteCounts.length == 0
                    || reportedStripBytes
                        >= expectedBytes;

                boolean directRgbSupported =
                    width > 0L
                    && height > 0L
                    && width <= Integer.MAX_VALUE
                    && height <= Integer.MAX_VALUE
                    && compression == 1L
                    && photometric == 2L
                    && samplesPerPixel == 3L
                    && planarConfiguration == 1L
                    && bitsEight
                    && rowsPerStrip > 0L
                    && rowsPerStrip
                        <= Integer.MAX_VALUE
                    && stripShapeValid
                    && byteCountValid;

                response.put(
                    "width",
                    width
                );

                response.put(
                    "height",
                    height
                );

                response.put(
                    "compression",
                    compression
                );

                response.put(
                    "photometricInterpretation",
                    photometric
                );

                response.put(
                    "samplesPerPixel",
                    samplesPerPixel
                );

                response.put(
                    "planarConfiguration",
                    planarConfiguration
                );

                response.put(
                    "rowsPerStrip",
                    rowsPerStrip
                );

                response.put(
                    "bitsPerSample",
                    longsToJsonArray(
                        bitsPerSample
                    )
                );

                response.put(
                    "stripOffsets",
                    longsToJsonArray(
                        stripOffsets
                    )
                );

                response.put(
                    "stripByteCounts",
                    longsToJsonArray(
                        stripByteCounts
                    )
                );

                response.put(
                    "strips",
                    stripOffsets.length
                );

                response.put(
                    "directRgbSupported",
                    directRgbSupported
                );

                response.put(
                    "reason",
                    directRgbSupported
                        ? "Native classic TIFF RGB fast path"
                        : "TIFF requires the general reader"
                );

                call.resolve(response);
            }

        } catch (Exception error) {
            call.reject(
                error.getMessage() == null
                    ? "Could not inspect TIFF natively"
                    : error.getMessage(),
                null,
                error
            );
        }
    }

    @PluginMethod
    public void readUncompressedRgbTile(PluginCall call) {
        String rawUri = call.getString("uri");
        Integer imageWidth = call.getInt("imageWidth");
        Integer imageHeight = call.getInt("imageHeight");
        Integer sourceX = call.getInt("sourceX");
        Integer sourceY = call.getInt("sourceY");
        Integer sourceWidth = call.getInt("sourceWidth");
        Integer sourceHeight = call.getInt("sourceHeight");
        Integer downsample = call.getInt("downsample");
        Integer rowsPerStrip = call.getInt("rowsPerStrip");
        JSONArray stripOffsets = call.getData().optJSONArray("stripOffsets");

        if (
            rawUri == null
            || imageWidth == null
            || imageHeight == null
            || sourceX == null
            || sourceY == null
            || sourceWidth == null
            || sourceHeight == null
            || downsample == null
            || rowsPerStrip == null
            || stripOffsets == null
            || stripOffsets.length() == 0
        ) {
            call.reject("Missing uncompressed RGB tile parameters");
            return;
        }

        if (
            imageWidth <= 0
            || imageHeight <= 0
            || sourceWidth <= 0
            || sourceHeight <= 0
            || downsample <= 0
            || rowsPerStrip <= 0
            || sourceX < 0
            || sourceY < 0
            || sourceX + sourceWidth > imageWidth
            || sourceY + sourceHeight > imageHeight
        ) {
            call.reject("Invalid uncompressed RGB tile geometry");
            return;
        }

        final int outWidth =
            Math.max(1, (sourceWidth + downsample - 1) / downsample);

        final int outHeight =
            Math.max(1, (sourceHeight + downsample - 1) / downsample);

        final long outputPixels =
            (long) outWidth * (long) outHeight;

        if (outputPixels > 1024L * 1024L) {
            call.reject("Requested native RGB tile is too large");
            return;
        }

        final int sourceRowBytes = sourceWidth * 3;
        byte[] sourceRow = new byte[sourceRowBytes];
        int[] pixels = new int[outWidth * outHeight];
        Uri uri = Uri.parse(rawUri);

        try (
            ParcelFileDescriptor descriptor =
                getContext().getContentResolver().openFileDescriptor(uri, "r");
            FileInputStream input =
                descriptor == null
                    ? null
                    : new FileInputStream(descriptor.getFileDescriptor())
        ) {
            if (descriptor == null || input == null) {
                call.reject("Could not open the TIFF for native RGB reading");
                return;
            }

            FileChannel channel = input.getChannel();

            for (int outY = 0; outY < outHeight; outY += 1) {
                int relativeY =
                    Math.min(sourceHeight - 1, outY * downsample);

                int srcY = sourceY + relativeY;

                int stripIndex =
                    Math.min(
                        stripOffsets.length() - 1,
                        srcY / rowsPerStrip
                    );

                long stripOffset =
                    stripOffsets.optLong(stripIndex, -1L);

                if (stripOffset < 0L) {
                    call.reject("Invalid TIFF StripOffsets entry");
                    return;
                }

                int stripStartY = stripIndex * rowsPerStrip;
                int rowInStrip = srcY - stripStartY;

                long rowOffset =
                    stripOffset
                    + (
                        ((long) rowInStrip * (long) imageWidth)
                        + sourceX
                    ) * 3L;

                channel.position(rowOffset);

                ByteBuffer target = ByteBuffer.wrap(sourceRow);

                while (target.hasRemaining()) {
                    int count = channel.read(target);

                    if (count < 0) {
                        call.reject("Unexpected end of TIFF RGB strip");
                        return;
                    }

                    if (count == 0) {
                        call.reject("Could not advance while reading TIFF RGB strip");
                        return;
                    }
                }

                int pixelBase = outY * outWidth;

                for (int outX = 0; outX < outWidth; outX += 1) {
                    int relativeX =
                        Math.min(sourceWidth - 1, outX * downsample);

                    int byteIndex = relativeX * 3;
                    int red = sourceRow[byteIndex] & 0xff;
                    int green = sourceRow[byteIndex + 1] & 0xff;
                    int blue = sourceRow[byteIndex + 2] & 0xff;

                    pixels[pixelBase + outX] =
                        0xff000000
                        | (red << 16)
                        | (green << 8)
                        | blue;
                }
            }

            Bitmap bitmap =
                Bitmap.createBitmap(
                    outWidth,
                    outHeight,
                    Bitmap.Config.ARGB_8888
                );

            bitmap.setPixels(
                pixels,
                0,
                outWidth,
                0,
                0,
                outWidth,
                outHeight
            );

            ByteArrayOutputStream output =
                new ByteArrayOutputStream(
                    Math.max(8192, outWidth * outHeight)
                );

            boolean encoded =
                bitmap.compress(
                    Bitmap.CompressFormat.JPEG,
                    90,
                    output
                );

            bitmap.recycle();

            if (!encoded) {
                call.reject("Android could not encode native RGB tile");
                return;
            }

            byte[] jpeg = output.toByteArray();

            JSObject response = new JSObject();
            response.put("width", outWidth);
            response.put("height", outHeight);
            response.put("bytes", jpeg.length);
            response.put(
                "dataBase64",
                Base64.encodeToString(jpeg, Base64.NO_WRAP)
            );
            call.resolve(response);

        } catch (Exception error) {
            call.reject(
                error.getMessage() == null
                    ? "Could not read native uncompressed RGB tile"
                    : error.getMessage(),
                null,
                error
            );
        }
    }

    @PluginMethod
    public void getCachedTile(PluginCall call) {
        String rawUri =
            call.getString("uri");

        Integer level =
            call.getInt("level");

        Integer x =
            call.getInt("x");

        Integer y =
            call.getInt("y");

        if (
            rawUri == null
            || level == null
            || x == null
            || y == null
        ) {
            call.reject(
                "uri, level, x and y are required"
            );
            return;
        }

        Uri uri =
            Uri.parse(rawUri);

        File file =
            localTileFile(
                uri,
                level,
                x,
                y
            );

        JSObject response =
            new JSObject();

        if (!file.exists() || !file.isFile()) {
            response.put("hit", false);
            call.resolve(response);
            return;
        }

        try (
            FileInputStream input =
                new FileInputStream(file);
            ByteArrayOutputStream output =
                new ByteArrayOutputStream(
                    (int) Math.min(
                        1024L * 1024L,
                        Math.max(
                            4096L,
                            file.length()
                        )
                    )
                )
        ) {
            byte[] buffer =
                new byte[16 * 1024];

            int count;

            while (
                (count = input.read(buffer)) >= 0
            ) {
                if (count == 0) {
                    continue;
                }

                output.write(
                    buffer,
                    0,
                    count
                );
            }

            byte[] data =
                output.toByteArray();

            file.setLastModified(
                System.currentTimeMillis()
            );

            response.put("hit", true);
            response.put(
                "bytes",
                data.length
            );
            response.put(
                "dataBase64",
                Base64.encodeToString(
                    data,
                    Base64.NO_WRAP
                )
            );

            call.resolve(response);

        } catch (Exception error) {
            call.reject(
                error.getMessage() == null
                    ? "Could not read cached tile"
                    : error.getMessage(),
                null,
                error
            );
        }
    }

    @PluginMethod
    public void putCachedTile(PluginCall call) {
        String rawUri =
            call.getString("uri");

        Integer level =
            call.getInt("level");

        Integer x =
            call.getInt("x");

        Integer y =
            call.getInt("y");

        String dataBase64 =
            call.getString("dataBase64");

        if (
            rawUri == null
            || level == null
            || x == null
            || y == null
            || dataBase64 == null
            || dataBase64.isEmpty()
        ) {
            call.reject(
                "uri, level, x, y and dataBase64 are required"
            );
            return;
        }

        try {
            byte[] data =
                Base64.decode(
                    dataBase64,
                    Base64.DEFAULT
                );

            final int maxSingleTile =
                2 * 1024 * 1024;

            if (data.length > maxSingleTile) {
                call.reject(
                    "Cached tile exceeds 2 MB safety limit"
                );
                return;
            }

            Uri uri =
                Uri.parse(rawUri);

            String prefix =
                localTileCachePrefix(uri);

            SharedPreferences prefs =
                localTileCachePreferences();

            long currentBytes =
                prefs.getLong(
                    prefix + "bytes",
                    0L
                );

            File target =
                localTileFile(
                    uri,
                    level,
                    x,
                    y
                );

            boolean existed =
                target.exists();

            long previousBytes =
                existed
                    ? target.length()
                    : 0L;

            long projectedBytes =
                currentBytes
                - previousBytes
                + data.length;

            JSObject response =
                new JSObject();

            if (
                projectedBytes
                > LOCAL_TILE_CACHE_MAX_BYTES
            ) {
                response.put("saved", false);
                response.put(
                    "reason",
                    "per-image cache limit reached"
                );
                response.put(
                    "bytes",
                    currentBytes
                );
                call.resolve(response);
                return;
            }

            File temporary =
                new File(
                    target.getParentFile(),
                    target.getName() + ".tmp"
                );

            try (
                FileOutputStream output =
                    new FileOutputStream(
                        temporary,
                        false
                    )
            ) {
                output.write(data);
                output.flush();
            }

            if (target.exists()) {
                target.delete();
            }

            if (!temporary.renameTo(target)) {
                try (
                    FileInputStream input =
                        new FileInputStream(
                            temporary
                        );
                    FileOutputStream output =
                        new FileOutputStream(
                            target,
                            false
                        )
                ) {
                    byte[] buffer =
                        new byte[16 * 1024];

                    int count;

                    while (
                        (count = input.read(buffer)) >= 0
                    ) {
                        if (count == 0) {
                            continue;
                        }

                        output.write(
                            buffer,
                            0,
                            count
                        );
                    }

                    output.flush();
                }

                temporary.delete();
            }

            int tiles =
                prefs.getInt(
                    prefix + "tiles",
                    0
                );

            if (!existed) {
                tiles += 1;
            }

            prefs.edit()
                .putInt(
                    prefix + "tiles",
                    tiles
                )
                .putLong(
                    prefix + "bytes",
                    projectedBytes
                )
                .apply();

            response.put("saved", true);
            response.put(
                "tiles",
                tiles
            );
            response.put(
                "bytes",
                projectedBytes
            );

            call.resolve(response);

        } catch (Exception error) {
            call.reject(
                error.getMessage() == null
                    ? "Could not cache local tile"
                    : error.getMessage(),
                null,
                error
            );
        }
    }

    @PluginMethod
    public void getTileCacheInfo(PluginCall call) {
        String rawUri =
            call.getString("uri");

        if (
            rawUri == null
            || rawUri.trim().isEmpty()
        ) {
            call.reject("uri is required");
            return;
        }

        Uri uri =
            Uri.parse(rawUri);

        String prefix =
            localTileCachePrefix(uri);

        SharedPreferences prefs =
            localTileCachePreferences();

        JSObject response =
            new JSObject();

        response.put(
            "tiles",
            prefs.getInt(
                prefix + "tiles",
                0
            )
        );

        response.put(
            "bytes",
            prefs.getLong(
                prefix + "bytes",
                0L
            )
        );

        response.put(
            "limitBytes",
            LOCAL_TILE_CACHE_MAX_BYTES
        );

        call.resolve(response);
    }

    @PluginMethod
    public void clearTileCache(PluginCall call) {
        String rawUri =
            call.getString("uri");

        if (
            rawUri == null
            || rawUri.trim().isEmpty()
        ) {
            call.reject("uri is required");
            return;
        }

        try {
            Uri uri =
                Uri.parse(rawUri);

            clearLocalTileCacheForUri(uri);

            JSObject response =
                new JSObject();

            response.put("cleared", true);

            call.resolve(response);

        } catch (Exception error) {
            call.reject(
                error.getMessage() == null
                    ? "Could not clear local tile cache"
                    : error.getMessage(),
                null,
                error
            );
        }
    }

    @PluginMethod
    public void forgetImage(PluginCall call) {
        String id = call.getString("id");
        if (id == null || id.trim().isEmpty()) {
            call.reject("id is required");
            return;
        }

        try {
            JSONArray source = readCatalog();
            JSONArray output = new JSONArray();
            String uriToRelease = null;

            for (int i = 0; i < source.length(); i++) {
                JSONObject item = source.optJSONObject(i);
                if (item == null) continue;

                if (id.equals(item.optString("id"))) {
                    uriToRelease = item.optString("uri", null);
                } else {
                    output.put(item);
                }
            }

            writeCatalog(output);

            if (uriToRelease != null && !uriToRelease.isEmpty()) {
                try {
                    clearLocalTileCacheForUri(Uri.parse(uriToRelease));
                } catch (Exception ignored) {
                    // Best-effort prepared tile cleanup.
                }
                try {
                    previewFile(Uri.parse(uriToRelease)).delete();
                } catch (Exception ignored) {
                    // Best effort preview cleanup.
                }
                try {
                    getContext()
                        .getContentResolver()
                        .releasePersistableUriPermission(
                            Uri.parse(uriToRelease),
                            Intent.FLAG_GRANT_READ_URI_PERMISSION
                        );
                } catch (Exception ignored) {
                    // Best effort only.
                }
            }

            JSObject response = new JSObject();
            response.put("removed", true);
            response.put("id", id);
            call.resolve(response);
        } catch (Exception error) {
            call.reject(
                error.getMessage() == null
                    ? "Could not forget local image"
                    : error.getMessage(),
                null,
                error
            );
        }
    }
}
