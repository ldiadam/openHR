package id.openhr.ess.ui.components

import android.Manifest
import android.content.pm.PackageManager
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.google.zxing.BarcodeFormat
import com.google.zxing.BinaryBitmap
import com.google.zxing.DecodeHintType
import com.google.zxing.MultiFormatReader
import com.google.zxing.PlanarYUVLuminanceSource
import com.google.zxing.common.HybridBinarizer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.util.concurrent.Executors

data class ScannedServerConfig(
    val url: String,
    val email: String? = null
)

fun parseQrServerPayload(raw: String): ScannedServerConfig? {
    val trimmed = raw.trim()
    if (trimmed.isEmpty()) return null

    // 1. JSON payload: {"url":"https://...","email":"..."}
    if (trimmed.startsWith("{")) {
        val parsed = runCatching {
            val obj = Json.parseToJsonElement(trimmed).jsonObject
            val url = obj["url"]?.jsonPrimitive?.content
                ?: obj["server"]?.jsonPrimitive?.content
                ?: obj["baseUrl"]?.jsonPrimitive?.content
            val email = obj["email"]?.jsonPrimitive?.content
            if (!url.isNullOrBlank()) ScannedServerConfig(url.trim(), email?.trim()) else null
        }.getOrNull()
        if (parsed != null) return parsed
    }

    // 2. Custom scheme: openhr://connect?url=...&email=...
    if (trimmed.startsWith("openhr://", ignoreCase = true)) {
        val uri = runCatching { Uri.parse(trimmed) }.getOrNull()
        val url = uri?.getQueryParameter("url")
        val email = uri?.getQueryParameter("email")
        if (!url.isNullOrBlank()) {
            return ScannedServerConfig(url.trim(), email?.trim())
        }
    }

    // 3. Plain HTTP/HTTPS URL or host:port
    if (trimmed.startsWith("http://", ignoreCase = true) ||
        trimmed.startsWith("https://", ignoreCase = true) ||
        trimmed.contains(":") ||
        trimmed.contains(".")
    ) {
        return ScannedServerConfig(trimmed)
    }

    return null
}

@Composable
fun QrScannerDialog(
    lang: String = "id",
    onDismiss: () -> Unit,
    onScanned: (ScannedServerConfig) -> Unit
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    var hasCameraPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
                PackageManager.PERMISSION_GRANTED
        )
    }
    var scanError by remember { mutableStateOf<String?>(null) }
    var handled by remember { mutableStateOf(false) }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        hasCameraPermission = granted
    }

    LaunchedEffect(Unit) {
        if (!hasCameraPermission) {
            permissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    val analyzerExecutor = remember { Executors.newSingleThreadExecutor() }
    DisposableEffect(Unit) {
        onDispose { analyzerExecutor.shutdown() }
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Surface(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black),
            color = Color.Black
        ) {
            Column(modifier = Modifier.fillMaxSize()) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .statusBarsPadding()
                        .padding(16.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = tr(lang, "Scan QR Server openHR", "Scan openHR Server QR"),
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        fontSize = 15.sp
                    )
                    IconButton(onClick = onDismiss) {
                        Icon(Icons.Default.Close, contentDescription = "Close", tint = Color.White)
                    }
                }

                Box(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp)
                        .clip(RoundedCornerShape(24.dp))
                        .background(Color(0xFF0F172A)),
                    contentAlignment = Alignment.Center
                ) {
                    if (!hasCameraPermission) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                            modifier = Modifier.padding(24.dp)
                        ) {
                            Text(
                                text = tr(
                                    lang,
                                    "Izin kamera diperlukan untuk memindai QR Code.",
                                    "Camera permission is required to scan QR codes."
                                ),
                                color = Color.White,
                                textAlign = TextAlign.Center
                            )
                            Button(onClick = { permissionLauncher.launch(Manifest.permission.CAMERA) }) {
                                Text(tr(lang, "Izinkan Kamera", "Allow Camera"))
                            }
                        }
                    } else if (scanError != null) {
                        Text(scanError ?: "", color = Color(0xFFFCA5A5), modifier = Modifier.padding(24.dp))
                    } else {
                        AndroidView(
                            modifier = Modifier.fillMaxSize(),
                            factory = { ctx ->
                                val previewView = PreviewView(ctx)
                                val reader = MultiFormatReader().apply {
                                    setHints(
                                        mapOf(
                                            DecodeHintType.POSSIBLE_FORMATS to listOf(BarcodeFormat.QR_CODE),
                                            DecodeHintType.TRY_HARDER to true
                                        )
                                    )
                                }

                                val cameraProviderFuture = ProcessCameraProvider.getInstance(ctx)
                                cameraProviderFuture.addListener({
                                    runCatching {
                                        val provider = cameraProviderFuture.get()
                                        val preview = Preview.Builder().build().also {
                                            it.surfaceProvider = previewView.surfaceProvider
                                        }
                                        val analysis = ImageAnalysis.Builder()
                                            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                                            .build()
                                            .also { imageAnalysis ->
                                                imageAnalysis.setAnalyzer(analyzerExecutor) { image ->
                                                    if (handled) {
                                                        image.close()
                                                        return@setAnalyzer
                                                    }
                                                    try {
                                                        val plane = image.planes[0]
                                                        val buffer = plane.buffer
                                                        val bytes = ByteArray(buffer.remaining())
                                                        buffer.get(bytes)
                                                        val source = PlanarYUVLuminanceSource(
                                                            bytes,
                                                            plane.rowStride,
                                                            image.height,
                                                            0,
                                                            0,
                                                            image.width,
                                                            image.height,
                                                            false
                                                        )
                                                        val bitmap = BinaryBitmap(HybridBinarizer(source))
                                                        val result = reader.decodeWithState(bitmap)
                                                        val parsed = parseQrServerPayload(result.text)
                                                        if (parsed != null) {
                                                            handled = true
                                                            ContextCompat.getMainExecutor(ctx).execute {
                                                                onScanned(parsed)
                                                            }
                                                        }
                                                    } catch (_: Throwable) {
                                                        // Frame did not contain a readable QR code
                                                    } finally {
                                                        reader.reset()
                                                        image.close()
                                                    }
                                                }
                                            }

                                        provider.unbindAll()
                                        provider.bindToLifecycle(
                                            lifecycleOwner,
                                            CameraSelector.DEFAULT_BACK_CAMERA,
                                            preview,
                                            analysis
                                        )
                                    }.onFailure { err ->
                                        scanError = err.message ?: "Camera error"
                                    }
                                }, ContextCompat.getMainExecutor(ctx))
                                previewView
                            }
                        )

                        // Viewfinder frame
                        Box(
                            modifier = Modifier
                                .size(230.dp)
                                .border(2.5.dp, Color(0xFF38BDF8), RoundedCornerShape(20.dp))
                        )
                    }
                }

                Text(
                    text = tr(
                        lang,
                        "Arahkan kamera ke QR Code di halaman login / pengaturan web openHR.",
                        "Point the camera at the QR Code on the openHR web login or settings page."
                    ),
                    color = Color(0xFFCBD5E1),
                    fontSize = 12.sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier
                        .fillMaxWidth()
                        .navigationBarsPadding()
                        .padding(horizontal = 24.dp, vertical = 20.dp)
                )
            }
        }
    }
}
