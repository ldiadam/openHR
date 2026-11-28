package id.openhr.ess.ui.components

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Bitmap
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions
import java.util.concurrent.Executors
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import id.openhr.ess.ui.theme.LocalEssPalette
import id.openhr.ess.util.Formatters
import kotlin.math.roundToInt

@androidx.annotation.OptIn(androidx.camera.core.ExperimentalGetImage::class)
@Composable
fun CameraCaptureDialog(
    title: String,
    useFrontCamera: Boolean = true,
    lang: String = "id",
    attendanceTime: String? = null,
    distanceMeters: Double? = null,
    isOutsideOffice: Boolean = false,
    officeName: String? = null,
    coordsText: String? = null,
    onDismiss: () -> Unit,
    onCaptured: (String) -> Unit
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val palette = LocalEssPalette.current
    var hasCameraPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
                PackageManager.PERMISSION_GRANTED
        )
    }
    var capturing by remember { mutableStateOf(false) }
    var cameraError by remember { mutableStateOf<String?>(null) }
    var showCoords by remember { mutableStateOf(false) }
    var faceDetected by remember { mutableStateOf(false) }
    val analysisExecutor = remember { Executors.newSingleThreadExecutor() }
    val faceDetector = remember(useFrontCamera) {
        if (useFrontCamera) {
            FaceDetection.getClient(
                FaceDetectorOptions.Builder()
                    .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST)
                    .setMinFaceSize(0.2f)
                    .build()
            )
        } else {
            null
        }
    }
    DisposableEffect(Unit) {
        onDispose {
            faceDetector?.close()
            analysisExecutor.shutdown()
        }
    }
    val imageCapture = remember {
        ImageCapture.Builder()
            .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
            .build()
    }

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

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Surface(
            modifier = Modifier
                .fillMaxSize()
                .background(Color(0xFF1C1C1E)),
            color = Color(0xFF1C1C1E)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .statusBarsPadding()
                    .navigationBarsPadding(),
                verticalArrangement = Arrangement.SpaceBetween
            ) {
                // Top Bar
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    IconButton(
                        onClick = onDismiss,
                        modifier = Modifier
                            .size(38.dp)
                            .clip(CircleShape)
                            .background(Color.White.copy(alpha = 0.1f))
                    ) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Back",
                            tint = Color.White,
                            modifier = Modifier.size(20.dp)
                        )
                    }
                    Text(
                        text = title,
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        fontSize = 17.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }

                // Center Viewfinder (Circular for Face Selfie, Rounded for Receipt)
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth()
                        .padding(horizontal = 24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center
                ) {
                    Box(
                        modifier = Modifier.size(236.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        // Corner Brackets + Dashed Circle
                        Canvas(modifier = Modifier.fillMaxSize()) {
                            val bracket = 22.dp.toPx()
                            val strokeW = 2.dp.toPx()
                            val bracketColor = Color.White.copy(alpha = 0.85f)
                            // Top-left
                            drawLine(bracketColor, Offset(0f, 0f), Offset(bracket, 0f), strokeW)
                            drawLine(bracketColor, Offset(0f, 0f), Offset(0f, bracket), strokeW)
                            // Top-right
                            drawLine(bracketColor, Offset(size.width, 0f), Offset(size.width - bracket, 0f), strokeW)
                            drawLine(bracketColor, Offset(size.width, 0f), Offset(size.width, bracket), strokeW)
                            // Bottom-left
                            drawLine(bracketColor, Offset(0f, size.height), Offset(bracket, size.height), strokeW)
                            drawLine(bracketColor, Offset(0f, size.height), Offset(0f, size.height - bracket), strokeW)
                            // Bottom-right
                            drawLine(bracketColor, Offset(size.width, size.height), Offset(size.width - bracket, size.height), strokeW)
                            drawLine(bracketColor, Offset(size.width, size.height), Offset(size.width, size.height - bracket), strokeW)

                            if (useFrontCamera) {
                                drawCircle(
                                    color = if (faceDetected) {
                                        Color(0xFF34D399)
                                    } else {
                                        Color.White.copy(alpha = 0.85f)
                                    },
                                    radius = size.minDimension / 2f - 8.dp.toPx(),
                                    style = Stroke(
                                        width = if (faceDetected) 3.dp.toPx() else 2.dp.toPx(),
                                        pathEffect = PathEffect.dashPathEffect(floatArrayOf(14f, 10f), 0f)
                                    )
                                )
                            }
                        }

                        Box(
                            modifier = Modifier
                                .size(214.dp)
                                .clip(if (useFrontCamera) CircleShape else RoundedCornerShape(24.dp))
                                .background(Color(0xFF111827)),
                            contentAlignment = Alignment.Center
                        ) {
                            if (!hasCameraPermission) {
                                Column(
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                    verticalArrangement = Arrangement.spacedBy(10.dp),
                                    modifier = Modifier.padding(20.dp)
                                ) {
                                    Text(
                                        text = if (lang == "id") {
                                            "Izin kamera diperlukan."
                                        } else {
                                            "Camera permission required."
                                        },
                                        color = Color.White,
                                        fontSize = 12.sp
                                    )
                                    Button(
                                        onClick = { permissionLauncher.launch(Manifest.permission.CAMERA) },
                                        colors = ButtonDefaults.buttonColors(containerColor = palette.accent)
                                    ) {
                                        Text(if (lang == "id") "Izinkan Kamera" else "Allow Camera", fontSize = 12.sp)
                                    }
                                }
                            } else if (cameraError != null) {
                                Text(
                                    cameraError ?: "",
                                    color = Color(0xFFFCA5A5),
                                    fontSize = 12.sp,
                                    modifier = Modifier.padding(20.dp)
                                )
                            } else {
                                AndroidView(
                                    modifier = Modifier.fillMaxSize(),
                                    factory = { ctx ->
                                        val previewView = PreviewView(ctx)
                                        val cameraProviderFuture = ProcessCameraProvider.getInstance(ctx)
                                        cameraProviderFuture.addListener({
                                            runCatching {
                                                val provider = cameraProviderFuture.get()
                                                val preview = Preview.Builder().build().also {
                                                    it.surfaceProvider = previewView.surfaceProvider
                                                }
                                                val selector = if (useFrontCamera) {
                                                    CameraSelector.DEFAULT_FRONT_CAMERA
                                                } else {
                                                    CameraSelector.DEFAULT_BACK_CAMERA
                                                }
                                                provider.unbindAll()
                                                if (useFrontCamera && faceDetector != null) {
                                                    var lastAnalyzedAt = 0L
                                                    val analysis = ImageAnalysis.Builder()
                                                        .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                                                        .build()
                                                    analysis.setAnalyzer(analysisExecutor) { imageProxy ->
                                                        val now = System.currentTimeMillis()
                                                        val mediaImage = imageProxy.image
                                                        if (mediaImage != null && now - lastAnalyzedAt >= 250L) {
                                                            lastAnalyzedAt = now
                                                            val input = InputImage.fromMediaImage(
                                                                mediaImage,
                                                                imageProxy.imageInfo.rotationDegrees
                                                            )
                                                            faceDetector.process(input)
                                                                .addOnSuccessListener { faces ->
                                                                    faceDetected = faces.isNotEmpty()
                                                                }
                                                                .addOnCompleteListener {
                                                                    imageProxy.close()
                                                                }
                                                        } else {
                                                            imageProxy.close()
                                                        }
                                                    }
                                                    provider.bindToLifecycle(
                                                        lifecycleOwner,
                                                        selector,
                                                        preview,
                                                        imageCapture,
                                                        analysis
                                                    )
                                                } else {
                                                    provider.bindToLifecycle(lifecycleOwner, selector, preview, imageCapture)
                                                }
                                            }.onFailure { err ->
                                                cameraError = err.message ?: "Camera init failed"
                                            }
                                        }, ContextCompat.getMainExecutor(ctx))
                                        previewView
                                    }
                                )
                            }
                        }
                    }

                    if (useFrontCamera && hasCameraPermission && cameraError == null) {
                        Spacer(modifier = Modifier.height(10.dp))
                        Surface(
                            shape = RoundedCornerShape(999.dp),
                            color = if (faceDetected) {
                                Color(0xFF10B981).copy(alpha = 0.2f)
                            } else {
                                Color.White.copy(alpha = 0.1f)
                            }
                        ) {
                            Text(
                                text = if (faceDetected) {
                                    if (lang == "id") "Wajah terdeteksi" else "Face detected"
                                } else {
                                    if (lang == "id") "Posisikan wajah di lingkaran (opsional)" else "Align face in circle (optional)"
                                },
                                color = if (faceDetected) Color(0xFF6EE7B7) else Color(0xFFD4D4D8),
                                fontSize = 11.sp,
                                fontWeight = FontWeight.SemiBold,
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 5.dp)
                            )
                        }
                    }

                    // Bottom Info Cards (Attendance Time & GPS Radius)
                    if (!attendanceTime.isNullOrBlank() || distanceMeters != null) {
                        Spacer(modifier = Modifier.height(20.dp))
                        Column(
                            modifier = Modifier.fillMaxWidth(),
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            if (!attendanceTime.isNullOrBlank()) {
                                Surface(
                                    shape = RoundedCornerShape(14.dp),
                                    color = Color(0xFF27272A),
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Row(
                                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                                    ) {
                                        Box(
                                            modifier = Modifier
                                                .size(32.dp)
                                                .clip(RoundedCornerShape(8.dp))
                                                .background(Color(0xFF10B981).copy(alpha = 0.16f)),
                                            contentAlignment = Alignment.Center
                                        ) {
                                            Icon(
                                                Icons.Default.Schedule,
                                                contentDescription = null,
                                                tint = Color(0xFF34D399),
                                                modifier = Modifier.size(16.dp)
                                            )
                                        }
                                        Column {
                                            Text(
                                                text = if (lang == "id") "Waktu Kehadiran" else "Attendance Time",
                                                color = Color(0xFFA1A1AA),
                                                fontSize = 10.sp
                                            )
                                            Text(
                                                text = attendanceTime,
                                                color = Color.White,
                                                fontWeight = FontWeight.Bold,
                                                fontFamily = FontFamily.Monospace,
                                                fontSize = 12.sp
                                            )
                                        }
                                    }
                                }
                            }

                            if (distanceMeters != null) {
                                Surface(
                                    shape = RoundedCornerShape(14.dp),
                                    color = Color(0xFF27272A),
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Row(
                                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                                    ) {
                                        val pinColor = if (isOutsideOffice) Color(0xFFFB7185) else Color(0xFF34D399)
                                        Box(
                                            modifier = Modifier
                                                .size(32.dp)
                                                .clip(RoundedCornerShape(8.dp))
                                                .background(pinColor.copy(alpha = 0.16f)),
                                            contentAlignment = Alignment.Center
                                        ) {
                                            Icon(
                                                Icons.Default.LocationOn,
                                                contentDescription = null,
                                                tint = pinColor,
                                                modifier = Modifier.size(16.dp)
                                            )
                                        }
                                        Column(modifier = Modifier.weight(1f)) {
                                            Text(
                                                text = if (lang == "id") {
                                                    "Radius ${distanceMeters.roundToInt()} meter dari kantor (${if (isOutsideOffice) "di luar kantor" else "dalam area"})"
                                                } else {
                                                    "${distanceMeters.roundToInt()}m from ${officeName ?: "office"} (${if (isOutsideOffice) "outside" else "inside"})"
                                                },
                                                color = Color.White,
                                                fontWeight = FontWeight.SemiBold,
                                                fontSize = 12.sp,
                                                maxLines = 2,
                                                overflow = TextOverflow.Ellipsis
                                            )
                                            if (showCoords && !coordsText.isNullOrBlank()) {
                                                Text(
                                                    text = coordsText,
                                                    color = Color(0xFFA1A1AA),
                                                    fontFamily = FontFamily.Monospace,
                                                    fontSize = 10.sp
                                                )
                                            }
                                        }
                                        if (!coordsText.isNullOrBlank()) {
                                            IconButton(
                                                onClick = { showCoords = !showCoords },
                                                modifier = Modifier.size(32.dp)
                                            ) {
                                                Icon(
                                                    imageVector = if (showCoords) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                                                    contentDescription = null,
                                                    tint = Color(0xFFA1A1AA),
                                                    modifier = Modifier.size(17.dp)
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(28.dp))

                    // Capture Button (positioned comfortably in thumb reach below info cards)
                    Button(
                        enabled = hasCameraPermission && !capturing && cameraError == null,
                        onClick = {
                            capturing = true
                            imageCapture.takePicture(
                                ContextCompat.getMainExecutor(context),
                                object : ImageCapture.OnImageCapturedCallback() {
                                    override fun onCaptureSuccess(image: ImageProxy) {
                                        val bitmap: Bitmap = image.toBitmap()
                                        val rotation = image.imageInfo.rotationDegrees.toFloat()
                                        image.close()
                                        val dataUrl = Formatters.bitmapToBase64DataUrl(
                                            bitmap = bitmap,
                                            maxDimension = if (useFrontCamera) 640 else 960,
                                            quality = if (useFrontCamera) 60 else 68,
                                            rotationDegrees = rotation
                                        )
                                        capturing = false
                                        onCaptured(dataUrl)
                                    }

                                    override fun onError(exception: ImageCaptureException) {
                                        capturing = false
                                        cameraError = exception.message ?: "Capture failed"
                                    }
                                }
                            )
                        },
                        shape = CircleShape,
                        modifier = Modifier.size(68.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = palette.accent,
                            contentColor = palette.onHero
                        ),
                        contentPadding = PaddingValues(0.dp)
                    ) {
                        if (capturing) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(26.dp),
                                strokeWidth = 2.5.dp,
                                color = palette.onHero
                            )
                        } else {
                            Icon(Icons.Default.CameraAlt, contentDescription = "Capture", modifier = Modifier.size(28.dp))
                        }
                    }
                }
            }
        }
    }
}
